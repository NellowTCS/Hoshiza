import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const dev = process.argv.includes("dev");

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // SPA-style fallback so GitHub Pages serves the shell for client-side routes.
    adapter: adapter({ fallback: "404.html" }),
    paths: {
      // Repo is served at nellowtcs.me/Hoshiza -> base must match repo name.
      base: dev ? "" : "/Hoshiza",
    },
  },
};

export default config;
