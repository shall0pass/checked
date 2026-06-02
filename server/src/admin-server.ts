import express from 'express'
import fs from 'fs'
import path from 'path'
import type { Repo } from '@automerge/automerge-repo'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { TrackingStorageAdapter } from './tracking-storage-adapter.js'
import { MetadataStore } from './metadata-store.js'

type AdminServerOptions = {
  port: number
  token: string
  baseDir: string
  repo: Repo
  storage: TrackingStorageAdapter
  metadata: MetadataStore
}

type DocumentStats = {
  sizeBytes: number
  updatedAt: string | null
  exists: boolean
}

type ListSummary = {
  documentId: string
  url: AutomergeUrl
  firstSeenAt: string | null
  lastAccessedAt: string | null
  lastModifiedAt: string | null
  sizeBytes: number | null
  storageUpdatedAt: string | null
  existsOnDisk: boolean
}

function getDocumentPath(baseDir: string, documentId: string): string {
  return path.join(baseDir, documentId.slice(0, 2), documentId.slice(2))
}

async function readDocumentStats(baseDir: string, documentId: string): Promise<DocumentStats> {
  const docPath = getDocumentPath(baseDir, documentId)

  try {
    const rootStats = await fs.promises.stat(docPath)
    if (!rootStats.isDirectory()) {
      return { sizeBytes: 0, updatedAt: null, exists: false }
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { sizeBytes: 0, updatedAt: null, exists: false }
    }
    throw error
  }

  let sizeBytes = 0
  let lastMtimeMs = 0
  const queue = [docPath]

  while (queue.length > 0) {
    const currentPath = queue.pop() as string
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        queue.push(fullPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const stats = await fs.promises.stat(fullPath)
      sizeBytes += stats.size
      if (stats.mtimeMs > lastMtimeMs) {
        lastMtimeMs = stats.mtimeMs
      }
    }
  }

  return {
    sizeBytes,
    updatedAt: lastMtimeMs > 0 ? new Date(lastMtimeMs).toISOString() : null,
    exists: true
  }
}

async function listDocumentIds(baseDir: string): Promise<string[]> {
  try {
    const levelOne = await fs.promises.readdir(baseDir, { withFileTypes: true })
    const ids = new Set<string>()

    for (const prefix of levelOne) {
      if (!prefix.isDirectory() || prefix.name.length !== 2) {
        continue
      }

      const prefixPath = path.join(baseDir, prefix.name)
      const levelTwo = await fs.promises.readdir(prefixPath, { withFileTypes: true })
      for (const suffix of levelTwo) {
        if (!suffix.isDirectory() || suffix.name.length === 0) {
          continue
        }

        ids.add(`${prefix.name}${suffix.name}`)
      }
    }

    return [...ids]
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

function parseAdminToken(req: express.Request): string {
  const authHeader = req.header('authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim()
  }

  return req.header('x-admin-token')?.trim() || ''
}

function jsonError(res: express.Response, status: number, message: string): void {
  res.status(status).json({ error: message })
}

function adminPortalHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Checked Admin</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }
      body {
        margin: 0;
        padding: 20px;
        background: #f5f7fb;
        color: #0f172a;
      }
      .card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
      }
      .row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      input, button {
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        padding: 8px 10px;
        font-size: 14px;
      }
      button {
        cursor: pointer;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }
      th, td {
        text-align: left;
        border-bottom: 1px solid #e2e8f0;
        padding: 8px;
        font-size: 13px;
        vertical-align: top;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        word-break: break-all;
      }
      dialog {
        width: min(900px, 95vw);
        max-height: 80vh;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 0;
      }
      dialog::backdrop {
        background: rgba(2, 6, 23, 0.5);
      }
      pre {
        margin: 0;
        padding: 16px;
        max-height: 70vh;
        overflow: auto;
        background: #0f172a;
        color: #e2e8f0;
      }
      .muted {
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 style="margin-top:0">Checked Admin Portal</h1>
      <p class="muted">Manage lists, inspect last access timestamps, and prune stale documents.</p>
      <div class="row">
        <input id="adminToken" type="password" placeholder="Admin token" style="min-width:280px" />
        <button id="refreshBtn">Refresh Lists</button>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Prune Old Lists</h2>
      <div class="row">
        <input id="inactiveDays" type="number" min="1" value="90" />
        <button id="dryRunBtn">Preview Prune</button>
        <button id="pruneBtn">Prune Now</button>
      </div>
      <p class="muted" id="pruneResult"></p>
    </div>

    <div class="card">
      <h2 style="margin-top:0">All Lists</h2>
      <div id="status" class="muted">Enter token and press Refresh Lists.</div>
      <table>
        <thead>
          <tr>
            <th>List ID</th>
            <th>Last Accessed</th>
            <th>Last Modified</th>
            <th>Size</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="listRows"></tbody>
      </table>
    </div>

    <dialog id="viewer">
      <div style="padding: 12px; border-bottom: 1px solid #cbd5e1; display:flex; justify-content: space-between; align-items:center;">
        <strong id="viewerTitle">List Content</strong>
        <button id="closeViewer">Close</button>
      </div>
      <pre id="viewerContent">Loading...</pre>
    </dialog>

    <script>
      const rowsEl = document.getElementById('listRows')
      const statusEl = document.getElementById('status')
      const pruneResultEl = document.getElementById('pruneResult')
      const viewer = document.getElementById('viewer')
      const viewerTitle = document.getElementById('viewerTitle')
      const viewerContent = document.getElementById('viewerContent')

      const tokenInput = document.getElementById('adminToken')
      tokenInput.value = localStorage.getItem('checked-admin-token') || ''

      function token() {
        const v = tokenInput.value.trim()
        localStorage.setItem('checked-admin-token', v)
        return v
      }

      async function api(path, options = {}) {
        const res = await fetch(path, {
          ...options,
          headers: {
            'content-type': 'application/json',
            'x-admin-token': token(),
            ...(options.headers || {})
          }
        })

        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(body.error || 'Request failed')
        }

        return body
      }

      function fmtDate(value) {
        if (!value) return 'N/A'
        const d = new Date(value)
        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString()
      }

      function fmtBytes(bytes) {
        if (bytes == null) return 'N/A'
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
      }

      async function loadLists() {
        try {
          statusEl.textContent = 'Loading lists...'
          const payload = await api('/api/lists')
          const lists = payload.lists || []

          rowsEl.innerHTML = ''
          for (const item of lists) {
            const tr = document.createElement('tr')
            tr.innerHTML = [
              '<td><code>' + item.documentId + '</code></td>',
              '<td>' + fmtDate(item.lastAccessedAt) + '</td>',
              '<td>' + fmtDate(item.lastModifiedAt) + '</td>',
              '<td>' + fmtBytes(item.sizeBytes) + '</td>',
              '<td>' +
                '<button data-view="' + item.documentId + '">View</button> ' +
                '<button data-delete="' + item.documentId + '">Delete</button>' +
              '</td>'
            ].join('')

            rowsEl.appendChild(tr)
          }

          statusEl.textContent = 'Loaded ' + lists.length + ' lists.'
        } catch (error) {
          statusEl.textContent = 'Error: ' + error.message
        }
      }

      async function viewList(id) {
        try {
          viewerTitle.textContent = 'List ' + id
          viewerContent.textContent = 'Loading...'
          viewer.showModal()
          const payload = await api('/api/lists/' + encodeURIComponent(id))
          viewerContent.textContent = JSON.stringify(payload, null, 2)
        } catch (error) {
          viewerContent.textContent = 'Error: ' + error.message
        }
      }

      async function deleteList(id) {
        if (!confirm('Delete list ' + id + '? This cannot be undone.')) {
          return
        }

        try {
          await api('/api/lists/' + encodeURIComponent(id), { method: 'DELETE' })
          await loadLists()
        } catch (error) {
          alert('Delete failed: ' + error.message)
        }
      }

      async function prune(dryRun) {
        try {
          const inactiveDays = Number(document.getElementById('inactiveDays').value)
          const payload = await api('/api/lists/prune', {
            method: 'POST',
            body: JSON.stringify({ inactiveDays, dryRun })
          })

          pruneResultEl.textContent =
            (dryRun ? 'Preview: ' : 'Pruned: ') +
            payload.candidateCount + ' candidates, ' +
            payload.prunedCount + ' removed.'

          await loadLists()
        } catch (error) {
          pruneResultEl.textContent = 'Error: ' + error.message
        }
      }

      document.getElementById('refreshBtn').addEventListener('click', loadLists)
      document.getElementById('dryRunBtn').addEventListener('click', () => prune(true))
      document.getElementById('pruneBtn').addEventListener('click', () => prune(false))
      document.getElementById('closeViewer').addEventListener('click', () => viewer.close())

      rowsEl.addEventListener('click', (event) => {
        const target = event.target
        if (!(target instanceof HTMLElement)) return

        const viewId = target.getAttribute('data-view')
        if (viewId) {
          void viewList(viewId)
          return
        }

        const deleteId = target.getAttribute('data-delete')
        if (deleteId) {
          void deleteList(deleteId)
        }
      })
    </script>
  </body>
</html>`
}

export function startAdminServer(options: AdminServerOptions) {
  const { port, token, baseDir, repo, storage, metadata } = options

  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  app.get('/', (_, res) => {
    res.type('html').send(adminPortalHtml())
  })

  app.get('/healthz', (_, res) => {
    res.json({ ok: true })
  })

  app.use('/api', (req, res, next) => {
    const providedToken = parseAdminToken(req)
    if (!token || providedToken !== token) {
      jsonError(res, 401, 'Unauthorized')
      return
    }

    next()
  })

  const buildListSummary = async (documentId: string): Promise<ListSummary> => {
    const stats = await readDocumentStats(baseDir, documentId)
    if (stats.exists) {
      metadata.updateSize(documentId, stats.sizeBytes)
    }

    const meta = metadata.get(documentId)

    return {
      documentId,
      url: `automerge:${documentId}` as AutomergeUrl,
      firstSeenAt: meta?.firstSeenAt || stats.updatedAt,
      lastAccessedAt: meta?.lastAccessedAt || stats.updatedAt,
      lastModifiedAt: meta?.lastModifiedAt || stats.updatedAt,
      sizeBytes: meta?.sizeBytes ?? (stats.exists ? stats.sizeBytes : null),
      storageUpdatedAt: stats.updatedAt,
      existsOnDisk: stats.exists
    }
  }

  app.get('/api/lists', async (_, res) => {
    try {
      const ids = new Set<string>(await listDocumentIds(baseDir))
      for (const item of metadata.list({ includeDeleted: false })) {
        ids.add(item.documentId)
      }

      const summaries = await Promise.all([...ids].map(documentId => buildListSummary(documentId)))
      summaries.sort((a, b) => {
        const left = new Date(a.lastAccessedAt || 0).getTime()
        const right = new Date(b.lastAccessedAt || 0).getTime()
        return right - left
      })

      res.json({ lists: summaries })
    } catch (error: unknown) {
      jsonError(res, 500, `Failed to list documents: ${(error as Error)?.message || 'Unknown error'}`)
    }
  })

  app.get('/api/lists/:documentId', async (req, res) => {
    try {
      const documentId = req.params.documentId
      const summary = await buildListSummary(documentId)
      if (!summary.existsOnDisk && !metadata.get(documentId)) {
        jsonError(res, 404, 'Document not found')
        return
      }

      const url = `automerge:${documentId}` as AutomergeUrl
      let content: unknown = null
      let contentError: string | null = null

      try {
        const handle = await repo.find<Record<string, unknown>>(url, {
          allowableStates: ['ready', 'unavailable']
        })

        if (handle.inState(['ready'])) {
          content = JSON.parse(JSON.stringify(handle.doc()))
          metadata.touchAccess(documentId)
        } else {
          contentError = 'Document is currently unavailable'
        }
      } catch (error: unknown) {
        contentError = (error as Error)?.message || 'Failed to load list content'
      }

      res.json({
        ...summary,
        content,
        contentError
      })
    } catch (error: unknown) {
      jsonError(
        res,
        500,
        `Failed to load document details: ${(error as Error)?.message || 'Unknown error'}`
      )
    }
  })

  app.delete('/api/lists/:documentId', async (req, res) => {
    try {
      const documentId = req.params.documentId
      await storage.removeRange([documentId])
      metadata.markDeleted(documentId)

      try {
        repo.delete(`automerge:${documentId}` as AutomergeUrl)
      } catch {
        // Ignore if not currently in handle cache.
      }

      res.json({ deleted: true, documentId })
    } catch (error: unknown) {
      jsonError(res, 500, `Delete failed: ${(error as Error)?.message || 'Unknown error'}`)
    }
  })

  app.post('/api/lists/prune', async (req, res) => {
    try {
      const inactiveDays = Number(req.body?.inactiveDays)
      if (!Number.isFinite(inactiveDays) || inactiveDays <= 0) {
        jsonError(res, 400, 'inactiveDays must be a positive number')
        return
      }

      const dryRun = req.body?.dryRun !== false
      const cutoffMs = Date.now() - inactiveDays * 24 * 60 * 60 * 1000

      const ids = new Set<string>(await listDocumentIds(baseDir))
      for (const item of metadata.list({ includeDeleted: false })) {
        ids.add(item.documentId)
      }

      const summaries = await Promise.all([...ids].map(documentId => buildListSummary(documentId)))
      const candidates = summaries.filter(summary => {
        const lastTouch = summary.lastAccessedAt || summary.lastModifiedAt || summary.firstSeenAt
        if (!lastTouch) {
          return false
        }

        const when = Date.parse(lastTouch)
        if (!Number.isFinite(when)) {
          return false
        }

        return when < cutoffMs
      })

      const prunedIds: string[] = []
      if (!dryRun) {
        for (const summary of candidates) {
          await storage.removeRange([summary.documentId])
          metadata.markDeleted(summary.documentId)
          prunedIds.push(summary.documentId)

          try {
            repo.delete(`automerge:${summary.documentId}` as AutomergeUrl)
          } catch {
            // Ignore if not currently in handle cache.
          }
        }
      }

      res.json({
        dryRun,
        inactiveDays,
        cutoffAt: new Date(cutoffMs).toISOString(),
        candidateCount: candidates.length,
        candidates: candidates.map(candidate => candidate.documentId),
        prunedCount: prunedIds.length,
        pruned: prunedIds
      })
    } catch (error: unknown) {
      jsonError(res, 500, `Prune failed: ${(error as Error)?.message || 'Unknown error'}`)
    }
  })

  return app.listen(port, () => {
    console.log(`admin server started at ${port}`)
  })
}
