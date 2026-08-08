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

/**
 * Authenticated GitHub API call through the Worker proxy. The token lives only
 * in an httpOnly cookie; `credentials: "include"` ships it cross-origin.
 */
export async function gh<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
	const r = await fetch(`${WORKER_URL}/api/github?path=${encodeURIComponent(path)}`, {
		...opts,
		credentials: 'include'
	});
	if (r.status === 401) throw new GhAuthError();
	if (!r.ok) throw new GhError(r.status, await apiMessage(r));
	return (await r.json()) as T;
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

export async function fetchUser(): Promise<GitHubUser> {
	return gh<GitHubUser>('/user');
}

const REPO_FIELDS = `
  id databaseId nameWithOwner name description url
  isFork isArchived isPrivate stargazerCount pushedAt updatedAt
  primaryLanguage { name color }
  parent { nameWithOwner url }
`;

interface RepoConnection {
	data: {
		viewer: {
			repositories: {
				pageInfo: { hasNextPage: boolean; endCursor: string };
				nodes: Repo[];
			};
		};
	};
}

/**
 * Fetch every repo the viewer owns or belongs to, paging through the GraphQL
 * cursor. `affiliations:[OWNER,ORGANIZATION_MEMBER]` pulls org repos alongside
 * personal ones in a single query.
 */
export async function fetchAllRepos(): Promise<Repo[]> {
	const repos: Repo[] = [];
	let cursor: string | null = null;
	do {
		const query = `query($c:String){
			viewer {
				repositories(first:100, after:$c, affiliations:[OWNER,ORGANIZATION_MEMBER],
				             orderBy:{field:PUSHED_AT, direction:DESC}) {
					pageInfo { hasNextPage endCursor }
					nodes { ${REPO_FIELDS} }
				}
			}
		}`;
		const res: RepoConnection = await gh<RepoConnection>('/graphql', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, variables: { c: cursor } })
		});
		const conn = res.data.viewer.repositories;
		repos.push(...conn.nodes);
		cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
	} while (cursor);
	return repos;
}
