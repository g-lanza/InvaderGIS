/**
 * idbStore.ts — tiny zero-dependency IndexedDB persistence for user datasets.
 *
 * The headline feature stores the user's OWN data ONLY in their browser. This
 * module is the persistence seam: a promise-based wrapper over one IndexedDB
 * object store, exposed behind the `UserDatasetRepository` interface so a future
 * account-based backend can drop in without touching the Zustand store or UI.
 *
 * ── Why no `idb` npm package ────────────────────────────────────────────────────
 * The surface we need (open one store, get-all / put / delete / clear) is a few
 * dozen lines. Hand-rolling it avoids a new runtime dependency and keeps the
 * bundle lean (web/performance.md budget). The wrapper is fully typed, handles
 * errors explicitly, and never throws across the await boundary without context.
 *
 * ── Data-safety law ─────────────────────────────────────────────────────────────
 * Nothing here makes a network call. Datasets live in `indexedDB` on the user's
 * device. If IndexedDB is unavailable (private mode, disabled), the repository
 * degrades to an in-memory map so the app still works for the session — the user
 * is informed by the store's `persisted` flag rather than crashing.
 *
 * Phase: Wave2-A (additive — new store, no frozen stores touched).
 */

import type { UserDataset } from './types';

/** IndexedDB database name (namespaced to avoid clashes with other origins). */
const DB_NAME = 'invadergis-user-data';
/** Object store holding one record per `UserDataset`, keyed by `id`. */
const STORE_NAME = 'datasets';
/** Schema version; bump only if the object store layout changes. */
const DB_VERSION = 1;

/**
 * The persistence seam. Today only `IdbUserDatasetRepository` implements it; a
 * future account backend implements the same three async methods.
 */
export interface UserDatasetRepository {
  /** Load every persisted dataset (empty array if none / unavailable). */
  loadAll(): Promise<UserDataset[]>;
  /** Persist (insert or replace) one dataset by its id. */
  put(dataset: UserDataset): Promise<void>;
  /** Delete one dataset by id (no-op if absent). */
  remove(id: string): Promise<void>;
  /** Whether this repository is backed by durable storage (vs. in-memory). */
  readonly durable: boolean;
}

/**
 * Open (and lazily upgrade) the IndexedDB database, resolving the live handle.
 * Rejects with a contextual Error on failure so callers can fall back cleanly.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(new Error(`Failed to open IndexedDB: ${req.error?.message ?? 'unknown error'}`));
  });
}

/** Wrap an IDBRequest in a promise with a contextual error message. */
function promisifyRequest<T>(req: IDBRequest<T>, context: string): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(new Error(`${context}: ${req.error?.message ?? 'unknown error'}`));
  });
}

/** IndexedDB-backed repository — the production persistence implementation. */
class IdbUserDatasetRepository implements UserDatasetRepository {
  readonly durable = true;

  async loadAll(): Promise<UserDataset[]> {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const all = await promisifyRequest(store.getAll(), 'loadAll');
      return (all as UserDataset[]) ?? [];
    } finally {
      db.close();
    }
  }

  async put(dataset: UserDataset): Promise<void> {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await promisifyRequest(store.put(dataset), 'put');
    } finally {
      db.close();
    }
  }

  async remove(id: string): Promise<void> {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await promisifyRequest(store.delete(id), 'remove');
    } finally {
      db.close();
    }
  }
}

/**
 * In-memory fallback used when IndexedDB is unavailable (private browsing,
 * disabled storage). Keeps the app functional for the session; data is NOT
 * persisted across reloads — the store surfaces this via its `persisted` flag.
 */
class MemoryUserDatasetRepository implements UserDatasetRepository {
  readonly durable = false;
  private readonly map = new Map<string, UserDataset>();

  async loadAll(): Promise<UserDataset[]> {
    return [...this.map.values()];
  }
  async put(dataset: UserDataset): Promise<void> {
    this.map.set(dataset.id, dataset);
  }
  async remove(id: string): Promise<void> {
    this.map.delete(id);
  }
}

/**
 * Resolve the best available repository: IndexedDB if a probe open succeeds,
 * otherwise an in-memory fallback. Memoized so the probe runs at most once.
 */
let cachedRepo: UserDatasetRepository | null = null;

export async function getUserDatasetRepository(): Promise<UserDatasetRepository> {
  if (cachedRepo) return cachedRepo;
  try {
    const db = await openDb();
    db.close();
    cachedRepo = new IdbUserDatasetRepository();
  } catch (err) {
     
    console.warn(
      '[idbStore] IndexedDB unavailable — user datasets will not persist across reloads.' +
        ` Reason: ${err instanceof Error ? err.message : String(err)}`,
    );
    cachedRepo = new MemoryUserDatasetRepository();
  }
  return cachedRepo;
}
