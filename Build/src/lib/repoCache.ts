import type { Repo } from './types';

// Cache the repo list plus metadata in IndexedDB so a page load serves a local
// snapshot and only re-fetches when the snapshot goes stale.

const DB_NAME = 'hoshiza';
const DB_VERSION = 1;
const STORE = 'repoCache';
/** Serve the cached snapshot for this long before re-fetching from GitHub. */
const STALE_AFTER_MS = 60 * 60 * 1000;

export interface ReposSnapshot {
	repos: Repo[];
	cachedAt: number;
}

/** One record per viewer, so re-syncing a different account never reuses it. */
interface RepoCacheRecord extends ReposSnapshot {
	viewerLogin: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
	if (!('indexedDB' in globalThis)) {
		return Promise.reject(new Error('IndexedDB unavailable'));
	}
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) {
				req.result.createObjectStore(STORE, { keyPath: 'viewerLogin' });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => {
			dbPromise = null;
			reject(req.error ?? new Error('open failed'));
		};
	});
	return dbPromise;
}

function get<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
		req.onsuccess = () => resolve(req.result as T | undefined);
		req.onerror = () => reject(req.error ?? new Error('get failed'));
	});
}

function put(db: IDBDatabase, record: RepoCacheRecord): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(record);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error ?? new Error('put failed'));
	});
}

export function isReposCacheStale(cachedAt: number): boolean {
	return Date.now() - cachedAt > STALE_AFTER_MS;
}

/**
 * Load the last complete snapshot for this viewer. Returns null on a miss or
 * any IndexedDB failure, in which case the caller falls back to a live fetch.
 */
export async function loadRepos(viewerLogin: string): Promise<ReposSnapshot | null> {
	try {
		const db = await open();
		const rec = await get<RepoCacheRecord>(db, viewerLogin);
		return rec ? { repos: rec.repos, cachedAt: rec.cachedAt } : null;
	} catch {
		// Cache failure is a network-fetch fallback, so it is safe to ignore.
		return null;
	}
}

/** Store a complete snapshot for this viewer. Best-effort; never throws. */
export async function saveRepos(viewerLogin: string, repos: Repo[]): Promise<void> {
	try {
		const db = await open();
		await put(db, { viewerLogin, cachedAt: Date.now(), repos });
	} catch {
		// The app works without the cache; a failed write is not worth surfacing.
	}
}
