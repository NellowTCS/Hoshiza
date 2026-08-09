<script lang="ts">
	import { ui } from '$lib/state.svelte';
	import { Columns3, Map } from 'lucide-svelte';
</script>

<nav class="bnav" aria-label="Views">
	<button class:on={ui.view === 'board'} onclick={() => (ui.view = 'board')}>
		<Columns3 size={18} />
		<span>Board</span>
	</button>
	<button class:on={ui.view === 'map'} onclick={() => (ui.view = 'map')}>
		<Map size={18} />
		<span>Map</span>
	</button>
</nav>

<style>
	.bnav {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		display: flex;
		height: calc(54px + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		background: var(--topbar);
		backdrop-filter: blur(8px);
		border-top: 1px solid var(--border-muted);
	}
	button {
		position: relative;
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--text-dim);
		font-size: 11px;
		font-weight: 500;
	}
	button:active:not(:disabled) {
		background: var(--btn-bg-hover);
		border: none;
		color: var(--text);
	}
	button.on {
		color: var(--text);
	}
	button.on::before {
		content: '';
		position: absolute;
		top: 0;
		width: 22px;
		height: 2px;
		border-radius: 0 0 2px 2px;
		background: var(--accent);
	}
	@media (min-width: 768px) {
		.bnav {
			display: none;
		}
	}
</style>
