<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';

	let {
		title,
		onclose,
		children
	}: {
		title: string;
		onclose: () => void;
		children: Snippet;
	} = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div
	class="overlay"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
>
	<div class="modal" role="dialog" aria-modal="true" aria-label={title}>
		<span class="handle" aria-hidden="true"></span>
		<header class="head">
			<h2>{title}</h2>
			<button class="close" onclick={onclose} aria-label="Close">
				<X size={18} />
			</button>
		</header>
		<div class="body">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: var(--overlay);
		display: grid;
		place-items: center;
		padding: 24px;
		animation: fade 0.12s ease-out;
	}
	.modal {
		width: min(620px, 100%);
		max-height: min(80vh, 720px);
		display: flex;
		flex-direction: column;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		animation: pop 0.14s ease-out;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 24px;
		border-bottom: 1px solid var(--border-muted);
	}
	.handle {
		display: none;
	}
	.head h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		color: var(--text-dim);
	}
	.body {
		padding: 24px;
		overflow-y: auto;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			transform: translateY(6px) scale(0.99);
			opacity: 0;
		}
	}
	@keyframes sheet {
		from {
			transform: translateY(32px);
			opacity: 0;
		}
	}
	@media (max-width: 767px) {
		.overlay {
			display: flex;
			align-items: flex-end;
			justify-content: center;
			padding: 0;
		}
		.modal {
			width: 100%;
			max-height: min(88dvh, 88vh);
			border-radius: 16px 16px 0 0;
			animation: sheet 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
		}
		.handle {
			display: block;
			flex: none;
			width: 40px;
			height: 4px;
			margin: 8px auto 0;
			border-radius: 2px;
			background: var(--border);
		}
		.head {
			padding: 12px 20px 16px;
		}
		.body {
			padding: 20px;
			padding-bottom: calc(24px + env(safe-area-inset-bottom));
		}
	}
</style>
