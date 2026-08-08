import pkg from '../../package.json';

/**
 * Public build-time configuration. Both values are baked in by Vite from
 * PUBLIC_WORKER_URL / PUBLIC_APP_URL (see .env.example and the Pages workflow).
 * The Worker origin defaults to the production deployment; point
 * PUBLIC_WORKER_URL at a local Worker during development to override it.
 */
export const WORKER_URL = (
	import.meta.env.PUBLIC_WORKER_URL ?? 'https://hoshiza.neeljaiswal23.workers.dev'
).replace(/\/+$/, '');
export const APP_URL = (import.meta.env.PUBLIC_APP_URL ?? 'https://nellowtcs.me/Hoshiza').replace(
	/\/+$/,
	''
);

/** The app cannot talk to GitHub until a Worker origin is configured. */
export const isConfigured = WORKER_URL.length > 0;

/** App version, shared with the updato CDN manifest. */
export const VERSION = pkg.version;

/** Default read-only OAuth scopes: identity, public repos, org membership. */
export const READ_SCOPES = 'read:user public_repo read:org';
/** Escalated scope needed to create the private sync repo and push state. */
export const WRITE_SCOPES = 'repo';
/** Union of all scopes, used when escalating to write access. GitHub issues
 *  the token with exactly the requested scope set, so re-authorizing with
 *  `repo` alone would strip the read scopes and break org/identity calls. */
export const ALL_SCOPES = [
	...new Set([...READ_SCOPES.split(' '), ...WRITE_SCOPES.split(' ')])
].join(' ');
