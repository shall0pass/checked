import type { Chunk, StorageAdapterInterface, StorageKey } from '@automerge/automerge-repo/slim'
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs'
import { MetadataStore } from './metadata-store.js'

function getDocumentId(key: StorageKey): string | null {
  const [first] = key
  if (!first || typeof first !== 'string') {
    return null
  }

  return first
}

export class TrackingStorageAdapter implements StorageAdapterInterface {
  private inner: NodeFSStorageAdapter
  private metadata: MetadataStore

  constructor(baseDirectory: string, metadata: MetadataStore) {
    this.inner = new NodeFSStorageAdapter(baseDirectory)
    this.metadata = metadata
  }

  async load(key: StorageKey): Promise<Uint8Array | undefined> {
    const data = await this.inner.load(key)
    const documentId = getDocumentId(key)
    if (documentId) {
      this.metadata.touchAccess(documentId)
    }

    return data
  }

  async save(key: StorageKey, data: Uint8Array): Promise<void> {
    await this.inner.save(key, data)
    const documentId = getDocumentId(key)
    if (documentId) {
      this.metadata.touchWrite(documentId, data.byteLength)
    }
  }

  async remove(key: StorageKey): Promise<void> {
    await this.inner.remove(key)
  }

  async loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
    const chunks = await this.inner.loadRange(keyPrefix)
    const documentId = getDocumentId(keyPrefix)
    if (documentId) {
      this.metadata.touchAccess(documentId)
    }

    return chunks
  }

  async removeRange(keyPrefix: StorageKey): Promise<void> {
    await this.inner.removeRange(keyPrefix)
  }
}
