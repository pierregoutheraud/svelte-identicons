import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/kit/vite";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// The Vercel adapter is named explicitly rather than using adapter-auto,
		// which resolves the adapter by shelling out to a package manager during
		// the build. That install runs on Vercel's machine, picks its package
		// manager from whichever lockfile it finds, and fails the whole build if
		// the network call does.
		//
		// `runtime` must be set explicitly: adapter-vercel 3 (the last release
		// compatible with SvelteKit 1) only auto-detects Node 16/18/20 and throws
		// on anything newer. Naming it skips that detection entirely, so Node 24
		// builds fine and the function matches .nvmrc and the Vercel setting.
		adapter: adapter({ runtime: "nodejs24.x" })
	}
};

export default config;
