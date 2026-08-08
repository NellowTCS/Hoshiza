import type { AppState, Repo, RepoState, Status } from './types';
import { replaceState } from '$app/navigation';
import { gh, GhError, GhAuthError, fetchSessionInfo, fetchAllRepos } from './api';
import { suggestStatus } from './suggest';
import { orgOf } from './format';

export const KEY = 'hoshiza_state_v1';
export const DATA_REPO = 'hoshiza-data';
export const DATA_FILE = 'state.json';

const FALLBACK_COLORS = ['#6a9fff', '#8a6d3b', '#2f6d5b', '#6b655c', '#484f58', '#c8452f'];

export const DEFAULT_STATUSES: Status[] = [
	{ id: 'todo', label: 'Future', color: '#07a8d0', order: 0 },
	{ id: 'attention', label: 'Currently Working On', color: '#2ed558', order: 1 },
	{ id: 'living', label: 'Living', color: '#3a5a8c', order: 2 },
	{ id: 'done', label: 'Done', color: '#2f6d5b', order: 3 },
	{ id: 'dropped', label: 'Dropped', color: '#6b655c', order: 4 },
	{ id: 'archived', label: 'Fork / Archived', color: '#484f58', order: 5 }
];

function defaults(): AppState {
	return {
		schema: 1,
		updatedAt: new Date().toISOString(),
		storageMode: 'local',
		statuses: DEFAULT_STATUSES.map((s) => ({ ...s })),
		repos: {}
	};
}

function loadLocal(): AppState {
	if (typeof localStorage === 'undefined') return defaults(); // prerender-safe
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return defaults();
		const parsed = JSON.parse(raw) as AppState;
		if (parsed.schema !== 1) return defaults();
		return {
			schema: 1,
			updatedAt: parsed.updatedAt ?? defaults().updatedAt,
			storageMode: parsed.storageMode === 'github' ? 'github' : 'local',
			statuses: sanitizeStatuses(parsed.statuses),
			repos: sanitizeRepos(parsed.repos, parsed.statuses)
		};
	} catch {
		return defaults();
	}
}

function sanitizeStatuses(statuses: unknown): Status[] {
	if (!Array.isArray(statuses) || statuses.length === 0) return defaults().statuses;
	const out: Status[] = [];
	for (const s of statuses) {
		if (typeof s !== 'object' || s === null) continue;
		const st = s as Partial<Status>;
		if (typeof st.id !== 'string' || typeof st.label !== 'string') continue;
		const color =
			typeof st.color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(st.color)
				? st.color
				: FALLBACK_COLORS[out.length % FALLBACK_COLORS.length];
		out.push({ id: st.id, label: st.label, color, order: out.length });
	}
	return out.length ? out : defaults().statuses;
}

function sanitizeRepos(repos: unknown, statuses: unknown): Record<string, RepoState> {
	const out: Record<string, RepoState> = {};
	if (typeof repos !== 'object' || repos === null) return out;
	const valid = new Set<string>();
	if (Array.isArray(statuses)) {
		for (const s of statuses) {
			if (s && typeof s.id === 'string') valid.add(s.id);
		}
	}
	const fallback = Array.isArray(statuses) && statuses[0] && typeof statuses[0].id === 'string' ? statuses[0].id : 'todo';
	for (const [k, v] of Object.entries(repos)) {
		if (typeof v !== 'object' || v === null) continue;
		const r = v as Partial<RepoState>;
		out[k] = {
			status: typeof r.status === 'string' && valid.has(r.status) ? r.status : fallback,
			tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [],
			note: typeof r.note === 'string' ? r.note : '',
			order: typeof r.order === 'number' && Number.isFinite(r.order) ? r.order : 0
		};
	}
	return out;
}

// Svelte 5 runes: reactive state any component can import and mutate.
export const store = $state<AppState>(loadLocal());

export const session = $state<{
	viewer: { login: string; name: string | null; avatar: string } | null;
	// Scopes GitHub granted the current token, from the x-oauth-scopes header.
	scopes: string[];
	loading: boolean;
	// True until init() has probed the session, so the first paint never
	// flashes the sign-in screen at a returning user.
	pending: boolean;
	error: string | null;
	signedIn: boolean;
}>({ viewer: null, scopes: [], loading: false, pending: true, error: null, signedIn: false });

export const ui = $state<{
	view: 'board' | 'map';
	selectedRepo: Repo | null;
	showStatuses: boolean;
	showSync: boolean;
}>({ view: 'board', selectedRepo: null, showStatuses: false, showSync: false });

export const repos = $state<Repo[]>([]);
/** databaseId keys present in the latest GitHub fetch. Object (not Set) for reliable reactivity. */
export const knownIds = $state<Record<string, boolean>>({});
export const filters = $state({
	query: '',
	includedLanguages: [] as string[],
	excludedLanguages: [] as string[],
	includedOrgs: [] as string[],
	excludedOrgs: [] as string[],
	hideForks: false,
	hideArchived: false
});

/** Live sync status for the header indicator and the sync panel. */
export const sync = $state<{
	status: 'idle' | 'syncing';
	lastSyncedAt: number | null;
	error: string | null;
}>({ status: 'idle', lastSyncedAt: null, error: null });

// Non-reactive lookup cache kept in sync with `repos` by mergeRepos.
const repoIndex = new Map<number, Repo>();

export function saveLocal(): void {
	store.updatedAt = new Date().toISOString();
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(KEY, JSON.stringify(store));
	}
	scheduleAutosync();
}

// Auto-sync

const AUTOSYNC_DELAY = 5000;

let autosyncTimer: ReturnType<typeof setTimeout> | undefined;
let autosyncDirty = false;
let autosyncPushing = false;
let lastPushedSignature = '';

// Session caches so routine syncs stay cheap on GitHub
let dataRepoExists = false;
let cachedSha: string | undefined;

function stateSignature(): string {
	return JSON.stringify([store.statuses, store.repos]);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleAutosync(): void {
	if (store.storageMode !== 'github') return;
	autosyncDirty = true;
	if (autosyncTimer || autosyncPushing) return;
	autosyncTimer = setTimeout(() => {
		autosyncTimer = undefined;
		void autosyncFlush();
	}, AUTOSYNC_DELAY);
}

async function autosyncFlush(): Promise<void> {
	autosyncPushing = true;
	try {
		do {
			autosyncDirty = false;
			if (stateSignature() === lastPushedSignature) return;
			sync.status = 'syncing';
			try {
				await pushToGitHub();
			} catch (e) {
				sync.status = 'idle';
				sync.error = e instanceof Error ? e.message : String(e);
				return;
			}
			// The push just re-marked dirty (its own saveLocal) and the user may
			// have edited mid-push. Either way, wait out a full quiet window before
			// the next push so active editing stays coalesced into single commits.
			if (autosyncDirty) {
				autosyncDirty = false;
				await sleep(AUTOSYNC_DELAY);
			}
		} while (autosyncDirty);
	} finally {
		autosyncPushing = false;
		sync.status = 'idle';
	}
}

// Statuses

export function statusById(id: string): Status | undefined {
	return store.statuses.find((s) => s.id === id);
}

export function statusLabel(id: string): string {
	return statusById(id)?.label ?? id;
}

export function sortedStatuses(): Status[] {
	return [...store.statuses].sort((a, b) => a.order - b.order);
}

export function addStatus(label: string, color: string): void {
	const base = slugify(label) || `s_${Date.now().toString(36)}`;
	let id = base;
	let n = 2;
	while (store.statuses.some((s) => s.id === id)) id = `${base}_${n++}`;
	const order = store.statuses.length ? Math.max(...store.statuses.map((s) => s.order)) + 1 : 0;
	store.statuses.push({ id, label, color, order });
	saveLocal();
}

export function updateStatus(id: string, patch: Partial<Pick<Status, 'label' | 'color'>>): void {
	const s = statusById(id);
	if (!s) return;
	if (patch.label !== undefined) s.label = patch.label;
	if (patch.color !== undefined) s.color = patch.color;
	saveLocal();
}

export function removeStatus(id: string): void {
	if (store.statuses.length <= 1) return;
	const idx = store.statuses.findIndex((s) => s.id === id);
	if (idx === -1) return;
	const fallback = sortedStatuses().find((s) => s.id !== id);
	if (!fallback) return;
	const moved = Object.keys(store.repos).filter((k) => store.repos[k].status === id);
	store.statuses.splice(idx, 1);
	for (const k of moved) store.repos[k].status = fallback.id;
	renumberColumn(fallback.id);
	saveLocal();
}

export function moveStatus(id: string, dir: -1 | 1): void {
	const list = sortedStatuses();
	const idx = list.findIndex((s) => s.id === id);
	if (idx === -1) return;
	const j = idx + dir;
	if (j < 0 || j >= list.length) return;
	const a = list[idx];
	const b = list[j];
	const tmp = a.order;
	a.order = b.order;
	b.order = tmp;
	saveLocal();
}

export function resetStatuses(): void {
	const keep = new Set(DEFAULT_STATUSES.map((s) => s.id));
	const fallback = DEFAULT_STATUSES[0].id;
	for (const k of Object.keys(store.repos)) {
		if (!keep.has(store.repos[k].status)) store.repos[k].status = fallback;
	}
	store.statuses = DEFAULT_STATUSES.map((s) => ({ ...s }));
	renumberColumn(fallback);
	saveLocal();
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// Board / repo state

function nameOf(key: string): string {
	const r = repoIndex.get(Number(key));
	return r ? r.nameWithOwner : key;
}

function columnKeys(statusId: string, exclude?: string): string[] {
	return Object.keys(store.repos)
		.filter((k) => k !== exclude && store.repos[k].status === statusId)
		.sort(
			(a, b) =>
				store.repos[a].order - store.repos[b].order || nameOf(a).localeCompare(nameOf(b))
		);
}

function renumberColumn(statusId: string): void {
	columnKeys(statusId).forEach((k, idx) => {
		store.repos[k].order = idx;
	});
}

/**
 * Move a repo into a column, optionally at a specific index. Both the source and
 * target columns are renumbered so `order` stays dense and sortable.
 */
export function moveRepo(repoId: string, toStatus: string, index?: number): void {
	const rs = store.repos[repoId];
	if (!rs) return;
	const fromStatus = rs.status;
	if (fromStatus !== toStatus) {
		rs.status = toStatus;
		renumberColumn(fromStatus);
	}
	const keys = columnKeys(toStatus, repoId);
	const i = index === undefined ? keys.length : Math.max(0, Math.min(index, keys.length));
	keys.splice(i, 0, repoId);
	keys.forEach((k, idx) => {
		store.repos[k].order = idx;
	});
	saveLocal();
}

export function assignStatus(repoId: string, statusId: string): void {
	moveRepo(repoId, statusId);
}

export function toggleTag(repoId: string, tag: string): void {
	const rs = store.repos[repoId];
	if (!rs) return;
	const i = rs.tags.indexOf(tag);
	if (i >= 0) rs.tags.splice(i, 1);
	else rs.tags.push(tag);
	saveLocal();
}

export function addTag(repoId: string, tag: string): void {
	const t = tag.trim();
	if (!t) return;
	const rs = store.repos[repoId];
	if (!rs || rs.tags.includes(t)) return;
	rs.tags.push(t);
	saveLocal();
}

export function setNote(repoId: string, note: string): void {
	const rs = store.repos[repoId];
	if (!rs) return;
	rs.note = note;
	saveLocal();
}

// Suggestions

export function suggestedFor(repo: Repo): string {
	return suggestStatus(repo);
}

export function applySuggestion(repo: Repo): void {
	const key = String(repo.databaseId);
	if (!store.repos[key]) {
		store.repos[key] = { status: suggestStatus(repo), tags: [], note: '', order: 0 };
		renumberColumn(store.repos[key].status);
		saveLocal();
		return;
	}
	moveRepo(key, suggestStatus(repo));
}

export function applyAllSuggestions(): void {
	for (const r of repos) {
		const key = String(r.databaseId);
		if (store.repos[key]?.status !== suggestStatus(r)) applySuggestion(r);
	}
	saveLocal();
}

/** Repos whose current assignment differs from the heuristic, respecting filters. */
export function suggestedRepos(): Repo[] {
	return filteredRepos().filter((r) => {
		const key = String(r.databaseId);
		return store.repos[key]?.status !== suggestStatus(r);
	});
}

// Merge rule

/**
 * Merge a fresh fetch into local state. Existing assignments are NEVER touched;
 * unknown repos are seeded with a suggestion. State for repos that vanished from
 * GitHub is kept (not deleted) so it survives if the repo returns.
 */
export function mergeRepos(fetched: Repo[]): void {
	repos.splice(0, repos.length, ...fetched);
	repoIndex.clear();
	const seen: Record<string, boolean> = {};
	const newKeys: string[] = [];
	for (const r of fetched) {
		repoIndex.set(r.databaseId, r);
		const key = String(r.databaseId);
		seen[key] = true;
		if (!store.repos[key]) {
			store.repos[key] = { status: suggestStatus(r), tags: [], note: '', order: 0 };
			newKeys.push(key);
		}
	}
	for (const k of Object.keys(knownIds)) delete knownIds[k];
	for (const k of Object.keys(seen)) knownIds[k] = true;
	for (const key of newKeys) renumberColumn(store.repos[key].status);
	saveLocal();
}

export function vanishedIds(): string[] {
	return Object.keys(store.repos).filter((k) => !knownIds[k]);
}

// Filtering

export function filteredRepos(): Repo[] {
	const q = filters.query.trim().toLowerCase();
	return repos.filter((r) => {
		const lang = r.primaryLanguage?.name ?? 'none';
		if (filters.excludedLanguages.includes(lang)) return false;
		if (filters.includedLanguages.length && !filters.includedLanguages.includes(lang)) return false;
		const org = orgOf(r);
		if (filters.excludedOrgs.includes(org)) return false;
		if (filters.includedOrgs.length && !filters.includedOrgs.includes(org)) return false;
		if (filters.hideForks && r.isFork) return false;
		if (filters.hideArchived && r.isArchived) return false;
		if (q) {
			const hay = `${r.nameWithOwner} ${r.name} ${r.description ?? ''}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});
}

export function languageOptions(): string[] {
	const s = new Set<string>();
	for (const r of repos) s.add(r.primaryLanguage?.name ?? 'none');
	return [...s].sort();
}

export function orgOptions(): string[] {
	const s = new Set<string>();
	for (const r of repos) s.add(orgOf(r));
	return [...s].sort();
}

// Export / import

export function exportJson(): void {
	saveLocal();
	const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `hoshiza-state-${new Date().toISOString().slice(0, 10)}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

/** Returns a human-readable error string, or null on success. */
export function importJson(text: string): string | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return 'not valid JSON';
	}
	const err = validateState(parsed);
	if (err) return err;
	const p = parsed as AppState;
	store.statuses = p.statuses;
	store.repos = p.repos;
	store.storageMode = p.storageMode;
	saveLocal();
	return null;
}

function validateState(v: unknown): string | null {
	if (typeof v !== 'object' || v === null) return 'state must be a JSON object';
	const s = v as Partial<AppState>;
	if (s.schema !== 1) return `unsupported schema ${String(s.schema)} (expected 1)`;
	if (!Array.isArray(s.statuses) || s.statuses.length === 0) return 'no statuses in file';
	if (typeof s.repos !== 'object' || s.repos === null) return 'no repos map in file';
	return null;
}

// Session / init

export async function init(): Promise<void> {
	if (session.loading) return;
	session.pending = false;
	session.loading = true;
	session.error = null;
	try {
		const { user, scopes } = await fetchSessionInfo();
		session.viewer = { login: user.login, name: user.name, avatar: user.avatar_url };
		session.scopes = scopes;
		session.signedIn = true;
		await refreshRepos();
		// Pick up changes from another device before the user starts editing.
		if (store.storageMode === 'github') await pullFromGitHub();
		await completeSyncOptIn();
	} catch (e) {
		if (e instanceof GhAuthError) {
			session.signedIn = false;
			session.viewer = null;
			session.scopes = [];
		} else {
			session.error = e instanceof Error ? e.message : String(e);
		}
	} finally {
		session.loading = false;
	}
}

export async function refreshRepos(): Promise<void> {
	mergeRepos(await fetchAllRepos());
}

export function signOut(): void {
	session.viewer = null;
	session.scopes = [];
	session.signedIn = false;
	repos.splice(0);
	repoIndex.clear();
	for (const k of Object.keys(knownIds)) delete knownIds[k];
	// The data repo and blob sha are per-account; drop the caches on sign-out.
	dataRepoExists = false;
	cachedSha = undefined;
}

/**
 * Handles the return from a write-scope OAuth flow (`/login?scope=repo&next=/?sync=1`).
 * Cleans the query string and kicks off sync.
 */
async function completeSyncOptIn(): Promise<void> {
	if (typeof window === 'undefined') return;
	const wantSync = window.location.search.includes('sync=1');
	await replaceState(window.location.pathname, {});
	if (!wantSync || store.storageMode === 'github') return;
	try {
		await enableGithubSync();
	} catch (e) {
		session.error = `Sync setup failed: ${e instanceof Error ? e.message : String(e)}`;
	}
}

// GitHub sync

interface ContentsResponse {
	sha?: string;
	content?: string;
}

/** Create the private data repo if it does not exist. Requires the `repo` scope. */
export async function ensureDataRepo(): Promise<void> {
	const login = session.viewer?.login;
	if (!login) throw new Error('not signed in');
	if (dataRepoExists) return;
	const path = `/repos/${login}/${DATA_REPO}`;
	let exists = true;
	try {
		await gh(path);
	} catch (e) {
		if (e instanceof GhError && e.status === 404) exists = false;
		else throw e;
	}
	if (!exists) {
		await gh('/user/repos', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: DATA_REPO,
				description: 'Hoshiza triage state, auto-generated',
				private: true,
				auto_init: true
			})
		});
	}
	dataRepoExists = true;
}

interface PutResponse {
	content?: { sha?: string };
}

/** Read the current blob sha of state.json; undefined when the file does not exist yet. */
async function readRemoteSha(path: string): Promise<string | undefined> {
	try {
		const existing = await gh<ContentsResponse>(path);
		cachedSha = existing.sha;
		return existing.sha;
	} catch (e) {
		if (e instanceof GhError && e.status === 404) return undefined;
		throw e;
	}
}

/** PUT state.json, retrying once when our cached sha is stale (another device pushed). */
async function putState(path: string, sha: string | undefined): Promise<void> {
	const body = JSON.stringify({
		message: 'chore: update triage state',
		content: base64Encode(JSON.stringify(store, null, 2)),
		sha
	});
	let res: PutResponse;
	try {
		res = await gh<PutResponse>(path, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body
		});
	} catch (e) {
		if (!(e instanceof GhError && e.status === 422)) throw e;
		// Stale sha: the file changed on GitHub since we last read it. Refresh and retry once.
		const fresh = await readRemoteSha(path);
		res = await gh<PutResponse>(path, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				message: 'chore: update triage state',
				content: base64Encode(JSON.stringify(store, null, 2)),
				sha: fresh
			})
		});
	}
	if (res.content?.sha) cachedSha = res.content.sha;
}

export async function pushToGitHub(): Promise<void> {
	const login = session.viewer?.login;
	if (!login) throw new Error('not signed in');
	await ensureDataRepo();
	saveLocal();
	const path = `/repos/${login}/${DATA_REPO}/contents/${DATA_FILE}`;
	await putState(path, cachedSha);
	store.storageMode = 'github';
	saveLocal();
	lastPushedSignature = stateSignature();
	sync.lastSyncedAt = Date.now();
	sync.error = null;
}

/** True for GitHub 403s caused by an insufficient token scope. */
function isScopeError(e: unknown): boolean {
	return e instanceof GhError && e.status === 403 && /scope/i.test(e.message);
}

export async function pullFromGitHub(): Promise<void> {
	const login = session.viewer?.login;
	if (!login) return;
	try {
		await ensureDataRepo();
	} catch (e) {
		if (isScopeError(e)) {
			store.storageMode = 'local';
			saveLocal();
			sync.error = 'GitHub sync needs the repo scope. Re-enable sync to re-authorize.';
			return;
		}
		throw e;
	}
	const path = `/repos/${login}/${DATA_REPO}/contents/${DATA_FILE}`;
	let res: ContentsResponse;
	try {
		res = await gh<ContentsResponse>(path);
	} catch (e) {
		if (e instanceof GhError && e.status === 404) return;
		throw e;
	}
	cachedSha = res.sha;
	if (!res.content) return;
	const remote = parseState(base64Decode(res.content));
	if (!remote) return;
	// Last-writer-wins: remote wins per repo, local keeps repos the remote lacks.
	store.repos = { ...store.repos, ...remote.repos };
	store.statuses = remote.statuses;
	store.updatedAt = remote.updatedAt;
	store.storageMode = 'github';
	saveLocal();
	lastPushedSignature = stateSignature();
	sync.lastSyncedAt = Date.now();
	sync.error = null;
}

export async function enableGithubSync(): Promise<void> {
	await pushToGitHub();
}

export function disableGithubSync(): void {
	store.storageMode = 'local';
	saveLocal();
}

function parseState(s: string): AppState | null {
	try {
		const v = JSON.parse(s) as AppState;
		if (v.schema !== 1 || !Array.isArray(v.statuses) || typeof v.repos !== 'object') return null;
		return v;
	} catch {
		return null;
	}
}

function base64Encode(s: string): string {
	return btoa(unescape(encodeURIComponent(s)));
}

function base64Decode(s: string): string {
	return decodeURIComponent(escape(atob(s)));
}
