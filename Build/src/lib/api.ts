import type { GitHubUser, Repo } from "./types";
import { WORKER_URL, READ_SCOPES } from "./config";
import { base } from "$app/paths";

/**
 * App base path (`/Hoshiza` in production, empty in dev).
 */
const APP_BASE = base;

/** Thrown when the worker has no valid session (missing/expired cookie). */
export class GhAuthError extends Error {
  constructor() {
    super("not signed in");
    this.name = "GhAuthError";
  }
}

/** Any other non-2xx response from the GitHub API, proxied by the worker. */
export class GhError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(
      message ? `GitHub API ${status}: ${message}` : `GitHub API ${status}`,
    );
    this.name = "GhError";
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
  opts: RequestInit = {},
): Promise<{ data: T; scopes: string[] }> {
  const r = await fetch(
    `${WORKER_URL}/api/github?path=${encodeURIComponent(path)}`,
    {
      ...opts,
      credentials: "include",
    },
  );
  if (r.status === 401) throw new GhAuthError();
  if (!r.ok) throw new GhError(r.status, await apiMessage(r));
  const scopes = (r.headers.get("x-oauth-scopes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { data: (await r.json()) as T, scopes };
}

/**
 * Authenticated GitHub API call through the Worker proxy. The token lives only
 * in an httpOnly cookie; `credentials: "include"` ships it cross-origin.
 */
export async function gh<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  return (await ghWithMeta<T>(path, opts)).data;
}

async function apiMessage(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { message?: string; error?: string };
    return j.message ?? j.error ?? "";
  } catch {
    return "";
  }
}

/** Kick off the OAuth flow. The Worker handles the exchange and sets the cookie. */
export function login(next = "/", scope = READ_SCOPES): void {
  const origin = encodeURIComponent(location.origin + APP_BASE);
  location.href = `${WORKER_URL}/login?scope=${encodeURIComponent(scope)}&next=${encodeURIComponent(next)}&origin=${origin}`;
}

/** Clear the session cookie on the Worker and return to the app. */
export function logout(): void {
  const origin = encodeURIComponent(location.origin + APP_BASE);
  location.href = `${WORKER_URL}/logout?next=${encodeURIComponent("/")}&origin=${origin}`;
}

export interface SessionInfo {
  user: GitHubUser;
  scopes: string[];
}

/** Viewer profile plus the token's granted scopes, read off a single /user call. */
export async function fetchSessionInfo(): Promise<SessionInfo> {
  const meta = await ghWithMeta<GitHubUser>("/user");
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
      totalCount: number;
      pageInfo: PageInfo;
      nodes: Repo[];
    };
  };
}

interface OrgPayload {
  viewer: {
    organizations: {
      totalCount: number;
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
async function post<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await gh<GraphQLEnvelope<T>>("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (res.errors?.length) {
    throw new GhError(200, res.errors.map((e) => e.message).join("; "));
  }
  if (res.data === undefined)
    throw new GhError(200, "GraphQL response contained no data");
  return res.data;
}

/** One page of repos for a given owner (`viewer` or an org login). */
async function reposPage(
  owner: string,
  affiliations: string | null,
  after: string | null,
): Promise<{ nodes: Repo[]; pageInfo: PageInfo; totalCount: number }> {
  const ownerSel =
    owner === "viewer"
      ? "viewer"
      : `organization(login:${JSON.stringify(owner)})`;
  // Response keys use the field name, not the login: `viewer` or `organization`.
  const dataKey = owner === "viewer" ? "viewer" : "organization";
  const aff = affiliations ? `, affiliations:[${affiliations}]` : "";
  const query = `query($c:String){
		${ownerSel} {
			repositories(first:100, after:$c${aff}) {
				totalCount
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

/** Number of pagination passes for a connection before giving up on it. */
const RETRY_ATTEMPTS = 2;

/**
 * Fetch all repos visible under one owner, re-running the whole pagination if
 * GitHub skipped any
 */
async function allReposFor(
  owner: string,
  affiliations: string | null,
): Promise<{ repos: Repo[]; totalCount: number }> {
  let best: Repo[] = [];
  let total = 0;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const nodes: Repo[] = [];
    let cursor: string | null = null;
    do {
      const {
        nodes: page,
        pageInfo,
        totalCount,
      } = await reposPage(owner, affiliations, cursor);
      nodes.push(...page);
      total = totalCount;
      cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (cursor);
    best = nodes;
    if (nodes.length >= total) break;
  }
  return { repos: best, totalCount: total };
}

/** The logins of every org the viewer belongs to, retried if the list is short. */
async function allOrgLogins(): Promise<{
  logins: string[];
  totalCount: number;
}> {
  let best: string[] = [];
  let total = 0;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const logins: string[] = [];
    let cursor: string | null = null;
    let pageTotal = 0;
    do {
      const query = `query($c:String){
				viewer {
					organizations(first:100, after:$c) {
						totalCount
						pageInfo { hasNextPage endCursor }
						nodes { login }
					}
				}
			}`;
      // Explicit annotation avoids a TS circular-inference quirk (TS7022)
      // where `res` picks up type `any` inside this do/while.
      const res: OrgPayload = await post(query, { c: cursor });
      for (const o of res.viewer.organizations.nodes) logins.push(o.login);
      pageTotal = res.viewer.organizations.totalCount;
      cursor = res.viewer.organizations.pageInfo.hasNextPage
        ? res.viewer.organizations.pageInfo.endCursor
        : null;
    } while (cursor);
    best = logins;
    total = pageTotal;
    if (logins.length >= pageTotal) break;
  }
  return { logins: best, totalCount: total };
}

export interface OwnerHaul {
  name: string;
  fetched: number;
  total: number;
}

export interface FetchResult {
  repos: Repo[];
  // False when GitHub returned fewer repos than its own totalCount says exist
  complete: boolean;
  // Per-owner pagination outcome so a truncated fetch can name the culprit.
  owners: OwnerHaul[];
}

/**
 * Fetch every repo the viewer can see: their own, then one page set per org they
 * belong to.
 */
export async function fetchAllRepos(): Promise<FetchResult> {
  const byId = new Map<number, Repo>();
  const owners: OwnerHaul[] = [];

  const own = await allReposFor("viewer", "OWNER");
  owners.push({
    name: "viewer",
    fetched: own.repos.length,
    total: own.totalCount,
  });
  for (const r of own.repos) byId.set(r.databaseId, r);

  const orgs = await allOrgLogins();
  owners.push({
    name: "organizations",
    fetched: orgs.logins.length,
    total: orgs.totalCount,
  });
  let complete =
    own.repos.length >= own.totalCount && orgs.logins.length >= orgs.totalCount;
  let expected = own.totalCount;

  for (const login of orgs.logins) {
    const orgRepos = await allReposFor(login, null);
    owners.push({
      name: login,
      fetched: orgRepos.repos.length,
      total: orgRepos.totalCount,
    });
    if (orgRepos.repos.length < orgRepos.totalCount) complete = false;
    expected += orgRepos.totalCount;
    for (const r of orgRepos.repos) byId.set(r.databaseId, r);
  }

  if (byId.size < expected) complete = false;

  const list = [...byId.values()].sort(
    (a, b) => +new Date(b.pushedAt) - +new Date(a.pushedAt),
  );
  return { repos: list, complete, owners };
}
