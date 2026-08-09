import type { GroupBy, SizeBy } from '$lib/types';

/**
 * Shared status-map options
 */
export const mapOptions = $state({
	groupBy: 'language' as GroupBy,
	sizeBy: 'stars' as SizeBy
});
