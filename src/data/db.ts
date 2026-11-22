// IndexedDB 轻封装：款式持久化
import type { Design } from '../types'

const DB_NAME = 'mortise_tenon_workbench'
const STORE = 'designs'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const tx = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, mode).objectStore(STORE)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const db = {
  async all(): Promise<Design[]> {
    return tx('readonly', (s) => s.getAll() as IDBRequest<Design[]>)
  },
  async get(id: string): Promise<Design | undefined> {
    return tx('readonly', (s) => s.get(id) as IDBRequest<Design | undefined>)
  },
  async put(design: Design): Promise<void> {
    await tx('readwrite', (s) => s.put(design))
  },
  async remove(id: string): Promise<void> {
    await tx('readwrite', (s) => s.delete(id))
  },
  async clear(): Promise<void> {
    await tx('readwrite', (s) => s.clear())
  }
}
