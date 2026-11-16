import adapter from "@sveltejs/adapter-static";
import { withPwa } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ command }) => {
  const base = command === "serve" ? "" : "/Hoshiza";

  return {
    envPrefix: ["VITE_", "PUBLIC_"],
    plugins: withPwa(
      {
        adapter: adapter({ fallback: "404.html" }),
        paths: { base },
        alias: {
          $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
        },
      },
      {
        registerType: "autoUpdate",
        includeAssets: ["robots.txt"],
        manifest: {
          name: "Hoshiza",
          short_name: "Hoshiza",
          description: "A GitHub repo triage board and map",
          start_url: `${base}/`,
          scope: `${base}/`,
          display: "standalone",
          theme_color: "#ffffff",
          background_color: "#ffffff",
        },
      // pwaAssets uses transformIndexHtml which SvelteKit 3 build does not support;
      // icons are generated separately if needed.
        generateSW: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json,woff2}"],
        navigateFallback: `${base}/404.html`,
        navigateFallbackDenylist: [/^\/api\//],
      },
      },
    ),
  };
});
