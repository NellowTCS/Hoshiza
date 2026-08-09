<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Network } from 'vis-network';
	import type { Node as VisNode, Edge as VisEdge, Options } from 'vis-network';
	import type { Repo } from '$lib/types';
	import {
		store,
		ui,
		filteredRepos,
		sortedStatuses,
		statusById
	} from '$lib/state.svelte';
	import { mapOptions } from '$lib/mapOptions.svelte';
	import { monthsSincePush } from '$lib/suggest';
	import { formatStars, orgOf, timeAgo } from '$lib/format';
	import { theme } from '$lib/theme.svelte';

	const REPO_ID = 'r:';
	const HUB_ID = 'h:';

	let netEl = $state<HTMLDivElement>();
	let network: Network | undefined;

	const repoByNode = new Map<string, Repo>();

	const list = $derived(filteredRepos());

	function cssVar(name: string): string {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}

	function radiusOf(r: Repo): number {
		if (mapOptions.sizeBy === 'stars') {
			return Math.min(40, Math.max(15, 15 + 6 * Math.log10(r.stargazerCount + 1)));
		}
		const m = monthsSincePush(r);
		return Math.min(40, Math.max(15, 15 + 24 / (1 + m)));
	}

	function statusColor(r: Repo): string {
		const id = store.repos[String(r.databaseId)]?.status ?? 'todo';
		return statusById(id)?.color ?? '#818b98';
	}

	function groupOf(r: Repo): string | null {
		if (mapOptions.groupBy === 'none') return null;
		return mapOptions.groupBy === 'language'
			? (r.primaryLanguage?.name ?? 'no language')
			: orgOf(r);
	}

	function destroyNetwork(): void {
		network?.destroy();
		network = undefined;
	}

	function build(): void {
		if (!netEl) return;
		destroyNetwork();
		repoByNode.clear();

		const nodes: VisNode[] = [];
		const edges: VisEdge[] = [];
		const hubs = new Map<string, { id: string; count: number }>();

		const panel = cssVar('--panel');
		const text = cssVar('--text');
		const textDim = cssVar('--text-dim');
		const border = cssVar('--border');

		for (const r of list) {
			const id = `${REPO_ID}${r.databaseId}`;
			const c = statusColor(r);
			const size = radiusOf(r);
			repoByNode.set(id, r);
			nodes.push({
				id,
				shape: 'dot',
				size,
				// Larger nodes repel harder so big stars don't crowd out small ones.
				mass: Math.max(1.2, size / 8),
				label: r.name,
				color: {
					background: c,
					border: panel,
					highlight: { background: c, border: textDim }
				},
				title: `${r.nameWithOwner} · ${formatStars(r.stargazerCount)} · updated ${timeAgo(r.pushedAt)}`
			});

			const g = groupOf(r);
			if (g === null) continue;
			let hub = hubs.get(g);
			if (!hub) {
				hub = { id: `${HUB_ID}${g}`, count: 0 };
				hubs.set(g, hub);
				nodes.push({
					id: hub.id,
					shape: 'dot',
					size: 4,
					mass: 4,
					label: g,
					font: {
						color: textDim,
						size: 13,
						face: 'system-ui',
						bold: { size: 13 },
						vadjust: 6
					},
					color: {
						background: textDim,
						border: panel,
						highlight: { background: textDim, border: textDim }
					}
				});
			}
			hub.count += 1;
			edges.push({ from: id, to: hub.id });
		}

		const hubById = new Map([...hubs.values()].map((h) => [h.id, h]));
		for (const n of nodes) {
			const h = hubById.get(String(n.id));
			if (h) n.title = `${h.count} repo${h.count === 1 ? '' : 's'}`;
		}

		const options: Options = {
			autoResize: true,
			layout: {
				// Kamada-Kawai seeding gives sane initial clusters instead of a
				// random scatter, so stabilization converges faster and groups
				// (languages/orgs) stay visually distinct.
				improvedLayout: true
			},
			nodes: {
				shape: 'dot',
				borderWidth: 2,
				font: { color: text, size: 12, face: 'system-ui' },
				shadow: { enabled: true, size: 8, x: 0, y: 2, color: 'rgba(0,0,0,0.22)' }
			},
			edges: {
				color: { color: border, highlight: textDim },
				width: 1,
				smooth: false
			},
			interaction: {
				hover: true,
				tooltipDelay: 120,
				navigationButtons: false,
				multiselect: false,
				selectConnectedEdges: false,
				dragView: true,
				zoomView: true
			},
			physics: {
				enabled: true,
				solver: 'barnesHut',
				barnesHut: {
					// Light repulsion + strong central pull: nodes keep a gentle
					// space-drift without inflating away from the center.
					gravitationalConstant: -800,
					centralGravity: 0.5,
					springLength: 90,
					springConstant: 0.04,
					damping: 0.4,
					avoidOverlap: 0.2
				},
				stabilization: { iterations: 250, updateInterval: 30, fit: true },
				maxVelocity: 30,
				minVelocity: 0.1
			}
		};

		network = new Network(netEl, { nodes, edges }, options);
		// Don't let the auto-fit zoom so far out that nodes and labels turn into
		// specks, obviously :/
		network.once('stabilizationIterationsDone', () => {
			const scale = network?.getScale() ?? 1;
			if (scale < 0.55) network?.moveTo({ scale: 0.55 });
		});
		// Freeze physics while a node is being dragged so the solver doesn't
		// churn the cluster and make the edges flash; resume on release.
		network.on('dragStart', (params) => {
			if ((params.nodes?.length ?? 0) > 0) network?.setOptions({ physics: { enabled: false } });
		});
		network.on('dragEnd', () => {
			network?.setOptions({ physics: { enabled: true } });
		});
		network.on('click', (params) => {
			const id = params.nodes?.[0];
			if (typeof id === 'string' && id.startsWith(REPO_ID)) {
				const repo = repoByNode.get(id);
				if (repo) {
					network?.unselectAll();
					ui.selectedRepo = repo;
				}
			}
		});
	}

	$effect(() => {
		theme.value;
		mapOptions.groupBy;
		mapOptions.sizeBy;
		const hasRepos = list.length > 0;
		if (!hasRepos) {
			destroyNetwork();
			return;
		}
		if (netEl) build();
	});

	onDestroy(destroyNetwork);
</script>

<div class="wrap">
	<span class="legend">
		{#each sortedStatuses() as s (s.id)}
			<span class="leg"><i style={`background: ${s.color}`}></i>{s.label}</span>
		{/each}
	</span>

	<div class="map">
		{#if list.length === 0}
			<p class="none">No repos to map.</p>
		{:else}
			<div class="net" bind:this={netEl}></div>
		{/if}
	</div>
	<p class="caption">
		Each star is a repo, sized by {mapOptions.sizeBy === 'stars' ? 'stars' : 'how recently it was pushed'},
		colored by status.
	</p>
</div>

<style>
	.wrap {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.leg {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.leg i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.map {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 6px;
	}
	.net {
		flex: 1;
		min-height: 0;
		position: relative;
		user-select: none;
	}
	.none {
		margin: 0;
		padding: 60px 0;
		text-align: center;
		color: var(--text-dim);
	}
	.caption {
		margin: 0;
		color: var(--text-dim);
		font-size: 12px;
	}
	:global(.vis-tooltip) {
		position: absolute;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		padding: 5px 9px;
		font-size: 12px;
		line-height: 1.5;
		box-shadow: var(--shadow-lg);
		pointer-events: none;
		white-space: nowrap;
	}
</style>
