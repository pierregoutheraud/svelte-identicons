import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

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
		// `runtime` is named rather than left to auto-detection so the deployed
		// function matches .nvmrc and the Vercel project setting no matter which
		// Node version the build machine happens to run.
		adapter: adapter({ runtime: "nodejs24.x" })
	}
};

export default config;
