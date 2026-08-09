<script lang="ts">
	import { store, session, sync, pushToGitHub, pullFromGitHub, disableGithubSync, exportJson, importFile } from '$lib/state.svelte';
	import { login } from '$lib/api';
	import { DATA_REPO } from '$lib/state.svelte';
	import { CloudUpload, CloudDownload, Loader2, X, Download, Upload } from 'lucide-svelte';

	let busy = $state(false);
	let msg = $state('');
	let err = $state('');
	let importMsg = $state('');
	let fileInput = $state<HTMLInputElement>();

	async function onImport(e: Event): Promise<void> {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const error = await importFile(file);
		importMsg = error ? `Import failed: ${error}` : 'Imported.';
		input.value = '';
	}

	const dataRepoUrl = $derived(
		session.viewer ? `https://github.com/${session.viewer.login}/${DATA_REPO}` : null
	);

	const lastSyncedLabel = $derived(
		sync.lastSyncedAt
			? new Date(sync.lastSyncedAt).toLocaleTimeString(undefined, {
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit'
				})
			: 'never'
	);

	async function run(fn: () => Promise<void>, done: string): Promise<void> {
		busy = true;
		msg = '';
		err = '';
		try {
			await fn();
			msg = done;
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function enable(): void {
		// The default login already carries the `repo` scope sync needs.
		// `next=/?sync=1` makes the page kick off sync on return.
		login('/?sync=1');
	}
</script>

<div class="sync">
	{#if store.storageMode === 'github'}
		<p class="mode">
			<span class="pill on">synced</span>
			State lives in
			{#if dataRepoUrl}
				<a href={dataRepoUrl} target="_blank" rel="noreferrer">{session.viewer?.login}/{DATA_REPO}</a>
			{/if}
			and in this browser.
		</p>
		<p class="autosync">
			Auto-sync is on: every change is pushed within seconds, once your edits settle.
			<span class="last">Last synced {lastSyncedLabel}</span>
		</p>
		{#if sync.dirty && sync.status !== 'syncing'}
			<p class="pending">
				<span class="pend-dot"></span>
				Changes are waiting to be pushed to GitHub.
			</p>
		{/if}
		<div class="row">
			<button onclick={() => run(() => pushToGitHub(), 'Pushed.')} disabled={busy}>
				<CloudUpload size={14} /> Push now
			</button>
			<button onclick={() => run(() => pullFromGitHub(), 'Pulled.')} disabled={busy}>
				<CloudDownload size={14} /> Pull now
			</button>
			<button class="danger" onclick={disableGithubSync} disabled={busy}>
				<X size={14} /> Disable sync
			</button>
		</div>
		{#if sync.status === 'syncing'}
			<p class="ok">
				<Loader2 class="spin" size={14} /> Syncing…
			</p>
		{/if}
		{#if sync.error}
			<p class="bad">Last auto-sync failed: {sync.error}</p>
		{/if}
	{:else}
		<p class="mode">
			<span class="pill">local</span>
			State is stored in this browser only.
		</p>
		<p>
			Enabling sync creates a private <code>{DATA_REPO}</code> repo on your account and pushes
			your board there. This needs a one-time GitHub authorization with write access.
		</p>
		<button class="primary" onclick={enable}>Enable GitHub sync</button>
	{/if}

	<p class="scopes">
		<span>Token scopes: {session.scopes.length ? session.scopes.join(', ') : 'unknown'}</span>
		{#if session.scopes.length && !session.scopes.includes('repo')}
			<button class="link" onclick={enable}>Re-authorize for write access</button>
		{/if}
	</p>

	{#if msg}
		<p class="ok">{msg}</p>
	{/if}
	{#if err}
		<p class="bad">{err}</p>
	{/if}

	<div class="backup">
		<p class="b-title">
			<Download size={13} /> Local backup
		</p>
		<div class="row">
			<button onclick={exportJson} disabled={busy}>
				<Download size={14} /> Export
			</button>
			<button onclick={() => fileInput?.click()} disabled={busy}>
				<Upload size={14} /> Import
			</button>
			<input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onImport} />
		</div>
		{#if importMsg}
			<p class="ok">{importMsg}</p>
		{/if}
	</div>
</div>

<style>
	.sync {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.mode {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0;
		color: var(--text-dim);
	}
	.autosync {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		color: var(--text-dim);
		font-size: 12.5px;
	}
	.autosync .last {
		color: var(--text-dim);
		font-size: 11.5px;
	}
	.pending {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		color: var(--attention);
		font-size: 12.5px;
	}
	.pend-dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--attention);
	}
	.pill {
		padding: 2px 8px;
		border-radius: var(--radius);
		font-size: 11px;
		font-weight: 500;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		color: var(--text-dim);
	}
	.pill.on {
		color: var(--ok);
		border-color: var(--ok);
		background: transparent;
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.row button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	code {
		background: var(--panel-2);
		padding: 1px 5px;
		border-radius: 4px;
	}
	.ok {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--ok);
		margin: 0;
	}
	.bad {
		color: var(--danger);
		margin: 0;
	}
	.scopes {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0;
		color: var(--text-dim);
		font-size: 12px;
	}
	.link {
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		color: var(--accent);
		font-size: 12px;
		text-decoration: underline;
	}
	.link:hover:not(:disabled) {
		background: none;
		border: none;
		color: var(--accent);
	}
	.backup {
		display: none;
	}
	.b-title {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 8px;
		font-size: 12px;
		font-weight: 600;
	}
	@media (max-width: 767px) {
		.backup {
			display: block;
			padding-top: 14px;
			border-top: 1px solid var(--border-muted);
		}
	}
</style>
