<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { Updato } from '@nellowtcs/updato';
	import { UpdateNotification } from '@nellowtcs/updato/update-ui';
	import { COMMIT_SHA } from '$lib/config';
	import '../app.css';

	let { children } = $props();

	onMount(() => {
		if (!browser) return;
		// Self-update via the updato CDN, keyed by commit SHA so any push to
		// main ships an update (see .github/workflows/updato.yml).
		try {
			const updater = Updato.init(
				{ repo: 'NellowTCS/Hoshiza', mode: 'commit', current: COMMIT_SHA },
				{
					onUpdate: (info) => {
						new UpdateNotification(updater, { heading: `${info.latest.slice(0, 7)} ready` }).show(
							info
						);
					},
					onError: (err) => console.warn('Updato:', err.message),
					onProgress: (pct, file) => console.log(`Updato: ${pct}% - ${file}`)
				}
			);
		} catch (e) {
			console.warn('Updato init failed:', e);
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="Hoshiza" />
</svelte:head>

{@render children()}
