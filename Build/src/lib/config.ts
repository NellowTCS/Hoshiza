/**
 * Public build-time configuration. Both values are baked in by Vite from
 * PUBLIC_WORKER_URL / PUBLIC_APP_URL (see .env.example and the Pages workflow).
 * The Worker origin defaults to the production deployment; point
 * PUBLIC_WORKER_URL at a local Worker during development to override it.
 */
export const WORKER_URL = (
  import.meta.env.PUBLIC_WORKER_URL ??
  "https://hoshiza.neeljaiswal23.workers.dev"
).replace(/\/+$/, "");
export const APP_URL = (
  import.meta.env.PUBLIC_APP_URL ?? "https://nellowtcs.me/Hoshiza"
).replace(/\/+$/, "");

/** The app cannot talk to GitHub until a Worker origin is configured. */
export const isConfigured = WORKER_URL.length > 0;

/**
 * Commit SHA this build was produced from, baked in by the updato workflow as
 * PUBLIC_COMMIT_SHA.
 */
export const COMMIT_SHA = import.meta.env.PUBLIC_COMMIT_SHA ?? "dev";

/**
 * OAuth scopes the app requests at login. `repo` is required, not optional: a
 * token with only `public_repo` cannot see private repos, so the board would
 * silently miss them and report them as "no longer appear on GitHub".
 */
export const READ_SCOPES = "read:user public_repo read:org repo";
