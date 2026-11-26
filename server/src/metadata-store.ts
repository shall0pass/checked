import fs from 'fs'
import path from 'path'

export type NotebookMetadata = {
  documentId: string
  firstSeenAt: string
  lastAccessedAt: string
  lastModifiedAt: string
  deletedAt?: string
  sizeBytes?: number
}

type MetadataFile = {
  version: 1
  notebooks: Record<string, NotebookMetadata>
}

export class MetadataStore {
  private filePath: string
  private data: MetadataFile = { version: 1, notebooks: {} }
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async init(): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true })

    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8')
      // Accept both the current field (`notebooks`) and the older field
      // name (`lists`) so metadata files written before this rename still
      // load correctly; going forward we always persist under `notebooks`.
      const parsed = JSON.parse(raw) as Partial<MetadataFile> & { lists?: unknown }
      const notebooks = parsed?.notebooks ?? parsed?.lists
      if (parsed?.version === 1 && notebooks && typeof notebooks === 'object') {
        this.data = {
          version: 1,
          notebooks: notebooks as Record<string, NotebookMetadata>
        }
      }
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code !== 'ENOENT') {
        throw error
      }
    }
  }

  touchAccess(documentId: string): void {
    const now = new Date().toISOString()
    const current = this.data.notebooks[documentId]

    if (!current) {
      this.data.notebooks[documentId] = {
        documentId,
        firstSeenAt: now,
        lastAccessedAt: now,
        lastModifiedAt: now
      }
    } else {
      current.lastAccessedAt = now
      if (!current.firstSeenAt) {
        current.firstSeenAt = now
      }
      if (!current.lastModifiedAt) {
        current.lastModifiedAt = now
      }
      delete current.deletedAt
    }

    this.schedulePersist()
  }

  touchWrite(documentId: string, sizeBytes?: number): void {
    const now = new Date().toISOString()
    const current = this.data.notebooks[documentId]

    if (!current) {
      this.data.notebooks[documentId] = {
        documentId,
        firstSeenAt: now,
        lastAccessedAt: now,
        lastModifiedAt: now,
        sizeBytes
      }
    } else {
      current.lastAccessedAt = now
      current.lastModifiedAt = now
      if (!current.firstSeenAt) {
        current.firstSeenAt = now
      }
      if (typeof sizeBytes === 'number') {
        current.sizeBytes = sizeBytes
      }
      delete current.deletedAt
    }

    this.schedulePersist()
  }

  updateSize(documentId: string, sizeBytes: number): void {
    const now = new Date().toISOString()
    const current = this.data.notebooks[documentId]

    if (!current) {
      this.data.notebooks[documentId] = {
        documentId,
        firstSeenAt: now,
        lastAccessedAt: now,
        lastModifiedAt: now,
        sizeBytes
      }
    } else {
      current.sizeBytes = sizeBytes
      if (!current.firstSeenAt) {
        current.firstSeenAt = now
      }
      if (!current.lastAccessedAt) {
        current.lastAccessedAt = now
      }
      if (!current.lastModifiedAt) {
        current.lastModifiedAt = now
      }
      delete current.deletedAt
    }

    this.schedulePersist()
  }

  markDeleted(documentId: string): void {
    const now = new Date().toISOString()
    const current = this.data.notebooks[documentId]

    if (!current) {
      this.data.notebooks[documentId] = {
        documentId,
        firstSeenAt: now,
        lastAccessedAt: now,
        lastModifiedAt: now,
        deletedAt: now
      }
    } else {
      current.deletedAt = now
    }

    this.schedulePersist()
  }

  get(documentId: string): NotebookMetadata | undefined {
    const item = this.data.notebooks[documentId]
    if (!item) return undefined
    return { ...item }
  }

  list(options?: { includeDeleted?: boolean }): NotebookMetadata[] {
    const includeDeleted = options?.includeDeleted ?? false
    return Object.values(this.data.notebooks)
      .filter(item => includeDeleted || !item.deletedAt)
      .map(item => ({ ...item }))
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }

    await this.persistNow()
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      return
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      void this.persistNow()
    }, 500)
  }

  private async persistNow(): Promise<void> {
    const tempPath = `${this.filePath}.tmp`
    const payload = JSON.stringify(this.data, null, 2)
    await fs.promises.writeFile(tempPath, payload, 'utf8')
    await fs.promises.rename(tempPath, this.filePath)
  }
}
