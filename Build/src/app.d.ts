// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface ImportMetaEnv {
		/** Worker origin, e.g. https://hoshiza.neeljaiswal23.workers.dev. Empty = not configured. */
		readonly PUBLIC_WORKER_URL?: string;
		/** Canonical app origin, e.g. https://nellowtcs.me/Hoshiza. Empty = derived default. */
		readonly PUBLIC_APP_URL?: string;
	}

	interface ImportMeta {
		readonly env: ImportMetaEnv;
	}
}

export { };
