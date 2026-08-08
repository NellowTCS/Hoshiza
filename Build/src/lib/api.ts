import type { GitHubUser, Repo } from './types';
import { WORKER_URL, READ_SCOPES } from './config';

/** App base path baked in by Vite (`/Hoshiza` in production, empty in dev). */
const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Thrown when the worker has no valid session (missing/expired cookie). */
export class GhAuthError extends Error {
	constructor() {
		super('not signed in');
		this.name = 'GhAuthError';
	}
}

/** Any other non-2xx response from the GitHub API, proxied by the worker. */
export class GhError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message ? `GitHub API ${status}: ${message}` : `GitHub API ${status}`);
		this.name = 'GhError';
		this.status = status;
	}
}

/** Response body plus the token scopes the worker forwarded from GitHub. */
export interface GhMeta {
	data: unknown;
	scopes: string[];
}

/** Authenticated GitHub API call through the Worker proxy, including headers. */
export async function ghWithMeta<T = unknown>(
	path: string,
	opts: RequestInit = {}
): Promise<{ data: T; scopes: string[] }> {
	const r = await fetch(`${WORKER_URL}/api/github?path=${encodeURIComponent(path)}`, {
		...opts,
		credentials: 'include'
	});
	if (r.status === 401) throw new GhAuthError();
	if (!r.ok) throw new GhError(r.status, await apiMessage(r));
	const scopes = (r.headers.get('x-oauth-scopes') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return { data: (await r.json()) as T, scopes };
}

/**
 * Authenticated GitHub API call through the Worker proxy. The token lives only
 * in an httpOnly cookie; `credentials: "include"` ships it cross-origin.
 */
export async function gh<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
	return (await ghWithMeta<T>(path, opts)).data;
}

async function apiMessage(r: Response): Promise<string> {
	try {
		const j = (await r.json()) as { message?: string; error?: string };
		return j.message ?? j.error ?? '';
	} catch {
		return '';
	}
}

/** Kick off the OAuth flow. The Worker handles the exchange and sets the cookie. */
export function login(scope = READ_SCOPES, next = '/'): void {
	const origin = encodeURIComponent(location.origin + APP_BASE);
	location.href = `${WORKER_URL}/login?scope=${encodeURIComponent(scope)}&next=${encodeURIComponent(next)}&origin=${origin}`;
}

/** Clear the session cookie on the Worker and return to the app. */
export function logout(): void {
	const origin = encodeURIComponent(location.origin + APP_BASE);
	location.href = `${WORKER_URL}/logout?next=${encodeURIComponent('/')}&origin=${origin}`;
}

export interface SessionInfo {
	user: GitHubUser;
	scopes: string[];
}

/** Viewer profile plus the token's granted scopes, read off a single /user call. */
export async function fetchSessionInfo(): Promise<SessionInfo> {
	const meta = await ghWithMeta<GitHubUser>('/user');
	return { user: meta.data, scopes: meta.scopes };
}

const REPO_FIELDS = `
  id databaseId nameWithOwner name description url
  isFork isArchived isPrivate stargazerCount pushedAt updatedAt
  primaryLanguage { name color }
  parent { nameWithOwner url }
`;

interface PageInfo {
	hasNextPage: boolean;
	endCursor: string | null;
}

interface ReposPayload {
	[key: string]: {
		repositories: {
			pageInfo: PageInfo;
			nodes: Repo[];
		};
	};
}

interface OrgPayload {
	viewer: {
		organizations: {
			pageInfo: PageInfo;
			nodes: { login: string }[];
		};
	};
}

interface GraphQLEnvelope<T> {
	data?: T;
	errors?: { message: string }[];
}

/**
 * GraphQL call against the worker proxy. GitHub returns HTTP 200 with an
 * `errors` array (and no `data`) for scope, validation, and rate-limit
 * failures, so those are turned into a thrown GhError here instead of
 * letting callers trip over `undefined` data.
 */
async function post<T = unknown>(query: string, variables: Record<string, unknown>): Promise<T> {
	const res = await gh<GraphQLEnvelope<T>>('/graphql', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables })
	});
	if (res.errors?.length) {
		throw new GhError(200, res.errors.map((e) => e.message).join('; '));
	}
	if (res.data === undefined) throw new GhError(200, 'GraphQL response contained no data');
	return res.data;
}

/** One page of repos for a given owner (`viewer` or an org login). */
async function reposPage(
	owner: string,
	affiliations: string | null,
	after: string | null
): Promise<{ nodes: Repo[]; pageInfo: PageInfo }> {
	const ownerSel = owner === 'viewer' ? 'viewer' : `organization(login:${JSON.stringify(owner)})`;
	// Response keys use the field name, not the login: `viewer` or `organization`.
	const dataKey = owner === 'viewer' ? 'viewer' : 'organization';
	const aff = affiliations ? `, affiliations:[${affiliations}]` : '';
	const query = `query($c:String){
		${ownerSel} {
			repositories(first:100, after:$c${aff}, orderBy:{field:PUSHED_AT, direction:DESC}) {
				pageInfo { hasNextPage endCursor }
				nodes { ${REPO_FIELDS} }
			}
		}
	}`;
	const res = await post<ReposPayload>(query, { c: after });
	const ownerData = res[dataKey];
	if (!ownerData) throw new GhError(200, `GraphQL response omitted "${owner}"`);
	return ownerData.repositories;
}

/**
 * Fetch every repo the viewer can see: their own, then one page set per org they
 * belong to. The `viewer.repositories` connection with mixed affiliations silently
 * omits repos from some orgs, so organizations are enumerated explicitly.
 */
export async function fetchAllRepos(): Promise<Repo[]> {
	const byId = new Map<number, Repo>();
	let cursor: string | null = null;
	do {
		const { nodes, pageInfo } = await reposPage('viewer', 'OWNER', cursor);
		for (const r of nodes) byId.set(r.databaseId, r);
		cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
	} while (cursor);

	const orgs: string[] = [];
	cursor = null;
	do {
		const query = `query($c:String){
			viewer {
				organizations(first:100, after:$c) {
					pageInfo { hasNextPage endCursor }
					nodes { login }
				}
			}
		}`;
		// Explicit annotation avoids a TS circular-inference quirk (TS7022)
		// where `res` picks up type `any` inside this do/while.
		const res: OrgPayload = await post(query, { c: cursor });
		for (const o of res.viewer.organizations.nodes) orgs.push(o.login);
		cursor = res.viewer.organizations.pageInfo.hasNextPage
			? res.viewer.organizations.pageInfo.endCursor
			: null;
	} while (cursor);

	for (const login of orgs) {
		cursor = null;
		do {
			const { nodes, pageInfo } = await reposPage(login, 'OWNER,ORGANIZATION_MEMBER', cursor);
			for (const r of nodes) byId.set(r.databaseId, r);
			cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
		} while (cursor);
	}

	return [...byId.values()].sort((a, b) => +new Date(b.pushedAt) - +new Date(a.pushedAt));
}
