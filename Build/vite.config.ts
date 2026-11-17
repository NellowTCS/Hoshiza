import adapter from "@sveltejs/adapter-static";
import { withPwa } from "@vite-pwa/sveltekit";
import { defineConfig, type Plugin } from "vite";

export default defineConfig(({ command }) => {
  const base = command === "serve" ? "" : "/Hoshiza";

  const [kitPlugins, pwaPlugins] = withPwa(
    {
      adapter: adapter({ fallback: "404.html" }),
      paths: { base },
    },
    {
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["robots.txt"],
      pwaAssets: { config: true },
      manifest: {
        id: `${base}/`,
        name: "Hoshiza",
        short_name: "Hoshiza",
        description: "A GitHub repo triage board and map",
        start_url: `${base}/`,
        scope: `${base}/`,
        display: "standalone",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        screenshots: [
          {
            src: `${base}/screenshots/main.png`,
            sizes: "1677x932",
            form_factor: "wide",
            type: "image/png",
            label: "Repo triage board",
          },
          {
            src: `${base}/screenshots/map-view.png`,
            sizes: "1677x932",
            form_factor: "wide",
            type: "image/png",
            label: "Status map",
          },
          {
            src: `${base}/screenshots/main-mobile.png`,
            sizes: "392x857",
            form_factor: "narrow",
            type: "image/png",
            label: "Repo triage board on mobile",
          },
          {
            src: `${base}/screenshots/map-view-mobile.png`,
            sizes: "392x857",
            form_factor: "narrow",
            type: "image/png",
            label: "Status map on mobile",
          },
        ],
      },
      generateSW: {
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}/`,
        navigateFallbackDenylist: [/^\/api\//],
      },
    },
  );

  const plugins = Array.isArray(pwaPlugins)
    ? pwaPlugins.filter((plugin: Plugin) => !plugin.transformIndexHtml)
    : pwaPlugins;

  return {
    envPrefix: ["VITE_", "PUBLIC_"],
    plugins: [kitPlugins, plugins],
  };
});
