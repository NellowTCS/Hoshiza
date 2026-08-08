import type { Repo } from './types';

/** Compact human duration, e.g. "3h ago", "5d ago", "2mo ago". */
export function timeAgo(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(ms / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}

/** Compact star count, e.g. "1.2k", "15k". */
export function formatStars(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
	return String(n);
}

/** The owner/org part of `owner/name`. */
export function orgOf(repo: Repo): string {
	return repo.nameWithOwner.split('/')[0];
}
