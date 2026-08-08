import type { Repo } from './types';

/** Milliseconds per month used by the staleness heuristic. */
const MS_PER_MONTH = 2.6e9;

/**
 * Suggest a status for a repo based on activity, without touching user state.
 * Returns a status id from the default set; custom statuses are never suggested.
 */
export function suggestStatus(repo: Repo): string {
	const months = (Date.now() - new Date(repo.pushedAt).getTime()) / MS_PER_MONTH;
	if (repo.isFork || repo.isArchived) return 'archived';
	if (months > 12) return 'dropped';
	if (months > 6) return 'attention';
	return 'todo';
}

/** How many months (at least 0) since the repo was last pushed to. */
export function monthsSincePush(repo: Repo): number {
	return Math.max(0, (Date.now() - new Date(repo.pushedAt).getTime()) / MS_PER_MONTH);
}
