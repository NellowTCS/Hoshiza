<script lang="ts">
	import { onMount } from 'svelte';
	import { isConfigured } from '$lib/config';
	import { init, session, ui, repos, store, sync, exportJson, importJson } from '$lib/state.svelte';
	import { initTheme, toggleTheme, theme } from '$lib/theme.svelte';
	import { logout } from '$lib/api';
	import { Columns3, Map, Settings2, RefreshCw, Download, Upload, LogOut, Sun, Moon, Loader2, CloudUpload } from 'lucide-svelte';
	import favicon from '$lib/assets/favicon.svg';
	import SignIn from '$lib/components/SignIn.svelte';
	import Board from '$lib/components/Board.svelte';
	import StatusMap from '$lib/components/StatusMap.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import StatusEditor from '$lib/components/StatusEditor.svelte';
	import SyncPanel from '$lib/components/SyncPanel.svelte';
	import RepoDetail from '$lib/components/RepoDetail.svelte';

	let importInput = $state<HTMLInputElement>();
	let importError = $state<string | null>(null);

	/** True when the board/map fills the viewport; column lists scroll internally. */
	const boardReady = $derived(
		isConfigured &&
			!session.pending &&
			!session.loading &&
			!session.error &&
			session.signedIn &&
			repos.length > 0
	);

	onMount(() => {
		initTheme();
		if (!isConfigured) return;
		void init();
	});

	function onImport(e: Event): void {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		file
			.text()
			.then((text) => {
				const err = importJson(text);
				importError = err ? `Import failed: ${err}` : 'Imported.';
			})
			.catch(() => (importError = 'Could not read file.'));
		input.value = '';
	}
</script>

<svelte:head>
	<title>Hoshiza</title>
</svelte:head>

<header class="topbar">
	<div class="brand">
		<img class="logo" src={favicon} alt="" />
		<h1>Hoshiza</h1>
	</div>
	{#if session.signedIn}
		<nav class="tabs" aria-label="Views">
			<button class="tab" class:active={ui.view === 'board'} onclick={() => (ui.view = 'board')}>
				<Columns3 size={15} /> Board
			</button>
			<button class="tab" class:active={ui.view === 'map'} onclick={() => (ui.view = 'map')}>
				<Map size={15} /> Map
			</button>
		</nav>
	{/if}
	<div class="right">
		{#if session.signedIn}
			{#if store.storageMode === 'github'}
				<button
					class="icon-btn"
					class:syncing={sync.status === 'syncing'}
					class:pending={sync.dirty && sync.status !== 'syncing'}
					title={
						sync.status === 'syncing'
							? 'Syncing to GitHub…'
							: sync.dirty
								? 'Changes waiting to be pushed to GitHub'
								: 'Synced to GitHub'
					}
					aria-label="Sync status"
					onclick={() => (ui.showSync = true)}
				>
					<span class="sync-icon">
						{#if sync.status === 'syncing'}
							<Loader2 class="spin" size={16} />
						{:else}
							<CloudUpload size={16} />
						{/if}
						{#if sync.dirty && sync.status !== 'syncing'}
							<span class="pending-dot"></span>
						{/if}
					</span>
				</button>
			{/if}
			<button
				class="icon-btn"
				onclick={() => (ui.showStatuses = true)}
				title="Edit statuses"
				aria-label="Edit statuses"
			>
				<Settings2 size={16} />
			</button>
			<button
				class="icon-btn"
				onclick={() => (ui.showSync = true)}
				title="Sync"
				aria-label="Sync"
			>
				<RefreshCw size={16} />
			</button>
			<button
				class="icon-btn"
				onclick={exportJson}
				title="Export state"
				aria-label="Export state"
			>
				<Download size={16} />
			</button>
			<button
				class="icon-btn"
				onclick={() => importInput?.click()}
				title="Import state"
				aria-label="Import state"
			>
				<Upload size={16} />
			</button>
			<input
				bind:this={importInput}
				type="file"
				accept="application/json,.json"
				hidden
				onchange={onImport}
			/>
			{#if session.viewer}
				<div class="user" title={session.viewer.login}>
					<img src={session.viewer.avatar} alt="" />
					<span>{session.viewer.name ?? session.viewer.login}</span>
				</div>
			{/if}
			<button
				class="icon-btn danger"
				onclick={logout}
				title="Sign out"
				aria-label="Sign out"
			>
				<LogOut size={16} />
			</button>
		{/if}
		<button
			class="icon-btn"
			onclick={toggleTheme}
			title={theme.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
			aria-label="Toggle theme"
		>
			{#if theme.value === 'dark'}
				<Sun size={16} />
			{:else}
				<Moon size={16} />
			{/if}
		</button>
	</div>
</header>

<main class="content" class:board={boardReady}>
	{#if !isConfigured}
		<section class="notice">
			<h2>Not configured yet</h2>
			<p>
				Set <code>PUBLIC_WORKER_URL</code> to your Cloudflare Worker origin and rebuild.
				See <code>Build/.env.example</code>.
			</p>
		</section>
	{:else if session.pending || session.loading}
		<p class="center">Pulling your repos from GitHub…</p>
	{:else if session.error}
		<section class="notice bad">
			<h2>Something went wrong</h2>
			<p>{session.error}</p>
			<button class="primary" onclick={() => {
				session.error = null;
				init();
			}}>
				Retry
			</button>
		</section>
	{:else if !session.signedIn}
		<SignIn />
	{:else if repos.length === 0}
		<section class="notice">
			<h2>No repos found</h2>
			<p>Give your GitHub account at least one repo to triage, then reload.</p>
			<button onclick={() => init()}>Reload</button>
		</section>
	{:else}
		<FilterBar />
		{#if ui.view === 'board'}
			<Board />
		{:else}
			<StatusMap />
		{/if}
	{/if}

	{#if importError}
		<p class="toast" role="status">{importError}</p>
	{/if}
</main>

{#if ui.showStatuses}
	<Modal title="Statuses" onclose={() => (ui.showStatuses = false)}>
		<StatusEditor />
	</Modal>
{/if}

{#if ui.showSync}
	<Modal title="Sync" onclose={() => (ui.showSync = false)}>
		<SyncPanel />
	</Modal>
{/if}

{#if ui.selectedRepo}
	<Modal title="Repo" onclose={() => (ui.selectedRepo = null)}>
		<RepoDetail repo={ui.selectedRepo} />
	</Modal>
{/if}

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 16px;
		height: 56px;
		padding: 0 20px;
		background: var(--topbar);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--border-muted);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		flex: none;
	}
	.logo {
		width: 24px;
		height: 24px;
	}
	.brand h1 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		letter-spacing: 0;
	}
	.tabs {
		display: flex;
		gap: 2px;
		padding: 3px;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 14px;
		border: 1px solid transparent;
		border-radius: 4px;
		background: transparent;
		color: var(--text-dim);
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
	}
	.tab:hover:not(:disabled) {
		background: transparent;
		border-color: transparent;
		color: var(--text);
	}
	.tab.active {
		background: var(--panel);
		border-color: var(--border);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}
	.right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
	}
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-dim);
	}
	.icon-btn:hover:not(:disabled) {
		background: var(--btn-bg-hover);
		border-color: var(--border);
		color: var(--text);
	}
	.icon-btn.syncing {
		color: var(--accent);
	}
	.icon-btn.pending {
		color: var(--attention);
	}
	.sync-icon {
		position: relative;
		display: inline-flex;
	}
	.pending-dot {
		position: absolute;
		top: -3px;
		right: -3px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--attention);
		border: 2px solid var(--topbar);
	}
	.icon-btn.danger:hover:not(:disabled) {
		color: var(--danger);
		border-color: var(--danger);
		background: transparent;
	}
	.user {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-left: 4px;
		padding: 3px 10px 3px 3px;
		border: 1px solid transparent;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-dim);
		font-size: 12.5px;
	}
	.user:hover {
		background: var(--btn-bg-hover);
		border-color: var(--border);
	}
	.user img {
		width: 22px;
		height: 22px;
		border-radius: 50%;
	}
	.content {
		padding: 16px 16px 56px;
	}
	.content.board {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 56px);
		min-height: 0;
		padding: 16px 16px 0;
	}
	.center {
		text-align: center;
		color: var(--text-dim);
		padding: 60px 0;
	}
	.notice {
		max-width: 480px;
		margin: 12vh auto 0;
		padding: 40px 32px;
		text-align: center;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}
	.notice h2 {
		margin: 0 0 8px;
		font-size: 20px;
		font-weight: 600;
	}
	.notice p {
		color: var(--text-dim);
		margin: 0 0 20px;
		overflow-wrap: anywhere;
	}
	.notice.bad {
		border-color: var(--danger);
	}
	.notice code {
		background: var(--panel-2);
		padding: 1px 5px;
		border-radius: 4px;
	}
	.toast {
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 60;
		margin: 0;
		padding: 8px 16px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		font-size: 13px;
		box-shadow: var(--shadow-lg);
	}
</style>
