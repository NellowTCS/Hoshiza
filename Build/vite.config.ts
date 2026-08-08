import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
	// Matches svelte.config.js: no base in dev, repo name as base for the Pages deploy.
	const base = command === 'serve' ? '' : '/Hoshiza';

	return {
		envPrefix: ['VITE_', 'PUBLIC_'],
		plugins: [
			sveltekit(),
			SvelteKitPWA({
				registerType: 'autoUpdate',
				includeAssets: ['robots.txt'],
				manifest: {
					name: 'Hoshiza',
					short_name: 'Hoshiza',
					description: 'A GitHub repo triage board and map',
					start_url: `${base}/`,
					scope: `${base}/`,
					display: 'standalone',
					theme_color: '#ffffff',
					background_color: '#ffffff'
				},
				pwaAssets: {
					image: 'static/favicon.png',
					preset: 'minimal-2023',
					includeHtmlHeadLinks: true
				},
				workbox: {
					globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
					navigateFallback: `${base}/404.html`,
					navigateFallbackDenylist: [/^\/api\//]
				}
			})
		]
	};
});
