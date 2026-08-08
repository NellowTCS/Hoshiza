/** A GitHub repository, as returned by the GraphQL query in api.ts. */
export interface Repo {
	id: string;
	/** Stable numeric id, the key repo state is stored by. */
	databaseId: number;
	nameWithOwner: string;
	name: string;
	description: string | null;
	url: string;
	isFork: boolean;
	isArchived: boolean;
	isPrivate: boolean;
	stargazerCount: number;
	pushedAt: string;
	updatedAt: string;
	primaryLanguage: { name: string; color: string } | null;
	parent: { nameWithOwner: string; url: string } | null;
}

/** A user-defined triage status. `order` drives column ordering on the board. */
export interface Status {
	id: string;
	label: string;
	color: string;
	order: number;
}

/** Per-repo assignment. Keyed by String(databaseId) in AppState.repos. */
export interface RepoState {
	status: string;
	tags: string[];
	note: string;
	order: number;
}

export type StorageMode = 'local' | 'github' | 'cloudflare';

/** The single versioned JSON document the whole app reads and writes. */
export interface AppState {
	schema: 1;
	updatedAt: string;
	storageMode: StorageMode;
	statuses: Status[];
	repos: Record<string, RepoState>;
}

/** The /user endpoint shape the app uses to identify the signed-in user. */
export interface GitHubUser {
	login: string;
	name: string | null;
	avatar_url: string;
	html_url: string;
}

/** Options for the status map clustering. */
export type GroupBy = 'language' | 'org' | 'none';
/** Options for the status map bubble sizing. */
export type SizeBy = 'stars' | 'recency';
