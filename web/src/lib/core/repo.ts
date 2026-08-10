import { Repo } from '@automerge/automerge-repo'
import { WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import { persistentAtom } from '@nanostores/persistent'
import type { Notebook } from './types'
import { defaultState } from '.'

export interface NotebookLink {
  name: string
  url: AutomergeUrl
}

// One-time migration: carry values saved under the old (pre-rename)
// localStorage keys forward to the new keys, so existing users don't lose
// their saved notebooks. Safe to remove once no meaningful population of
// users still has only the old keys set.
function migrateLegacyStorageKey(oldKey: string, newKey: string) {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(newKey) !== null) return
  const legacyValue = localStorage.getItem(oldKey)
  if (legacyValue === null) return
  localStorage.setItem(newKey, legacyValue)
}

migrateLegacyStorageKey('checked:rootDocUrl', 'checked:notebookUrl')
migrateLegacyStorageKey('checked:rootDocLinks', 'checked:notebookLinks')

export const syncServerUrl = persistentAtom<string>(
  'checked:syncServerUrl',
  // 'ws://localhost:8080?access-token=og'
  'wss://sync.automerge.org'
)

export const persistedNotebookUrl = persistentAtom<AutomergeUrl>(
  'checked:notebookUrl'
)

const notebookLinks = persistentAtom<string>('checked:notebookLinks', '[]')


let repoInstance: Repo | null = null

export function getRepo(): Repo {
  if (!repoInstance) {
    repoInstance = new Repo({
      storage: new IndexedDBStorageAdapter(),
      network: [new WebSocketClientAdapter(syncServerUrl.get())]
    })
  }
  return repoInstance
}

export function setRepoSyncServerUrl(url: string) {
  // Set the atom and re-instantiate the repo
  syncServerUrl.set(url)
  repoInstance = new Repo({
    storage: new IndexedDBStorageAdapter(),
    network: [new WebSocketClientAdapter(url)]
  })
}

export async function createNotebook(): Promise<AutomergeUrl> {
  const handle = getRepo().create<Notebook>(defaultState())
  await getRepo().find(handle.url, {
    allowableStates: ['ready']
  })
  return handle.url
}

function parseNotebookLinks(raw: string): NotebookLink[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (item): item is NotebookLink =>
        Boolean(item) &&
        typeof item.name === 'string' &&
        typeof item.url === 'string' &&
        item.url.startsWith('automerge:')
    )
  } catch {
    return []
  }
}

export function getNotebookLinks(): NotebookLink[] {
  return parseNotebookLinks(notebookLinks.get())
}

function setNotebookLinks(links: NotebookLink[]) {
  notebookLinks.set(JSON.stringify(links))
}

export function upsertNotebookLink(name: string, url: AutomergeUrl): NotebookLink[] {
  const trimmedName = name.trim() || 'Unnamed list'
  const links = getNotebookLinks()
  const index = links.findIndex(link => link.url === url)

  if (index >= 0) {
    links[index] = { ...links[index], name: trimmedName }
  } else {
    links.push({ name: trimmedName, url })
  }

  setNotebookLinks(links)
  return links
}

export function addNotebookLink(name: string, url: AutomergeUrl): NotebookLink[] {
  const trimmedName = name.trim() || 'Unnamed list'
  const links = getNotebookLinks()

  const alreadyExists = links.some(
    link => link.url === url && link.name === trimmedName
  )
  if (alreadyExists) {
    return links
  }

  const next = [...links, { name: trimmedName, url }]
  setNotebookLinks(next)
  return next
}

export function removeNotebookLink(name: string, url: AutomergeUrl): NotebookLink[] {
  const trimmedName = name.trim()
  const links = getNotebookLinks()
  const index = links.findIndex(
    link => link.url === url && link.name.trim() === trimmedName
  )

  if (index < 0) {
    return links
  }

  const next = [...links.slice(0, index), ...links.slice(index + 1)]
  setNotebookLinks(next)
  return next
}

export function replaceNotebookLinks(links: NotebookLink[]): NotebookLink[] {
  const next = links.filter(
    (link): link is NotebookLink =>
      Boolean(link) &&
      typeof link.name === 'string' &&
      typeof link.url === 'string' &&
      link.url.startsWith('automerge:')
  )

  setNotebookLinks(next)
  return next
}

export function ensureDefaultNotebookLink(url: AutomergeUrl): NotebookLink[] {
  const links = getNotebookLinks()

  if (links.length === 0) {
    const defaults = [{ name: 'default', url }]
    setNotebookLinks(defaults)
    return defaults
  }

  if (!links.some(link => link.url === url)) {
    const next = [...links, { name: `list ${links.length + 1}`, url }]
    setNotebookLinks(next)
    return next
  }

  return links
}

export async function getNotebookUrl(): Promise<AutomergeUrl> {
  let notebookUrl = persistedNotebookUrl.get()

  if (!notebookUrl) {
    notebookUrl = await createNotebook()
    persistedNotebookUrl.set(notebookUrl)
  }

  ensureDefaultNotebookLink(notebookUrl)

  return notebookUrl
}
