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
