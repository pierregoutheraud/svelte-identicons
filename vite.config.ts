import fs from "node:fs";
import path from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

// vitest 0.25 imports its own dependencies (tinyspy, local-pkg, chai...) as bare
// specifiers from its dist bundle, and vite resolves those from the project
// root, where pnpm's strict node_modules layout does not expose them. Without
// this, every test file fails to load. Only applied in test mode so the app
// build is untouched.
function vitestDependencyAliases(): Record<string, string> {
	const store = path.resolve("node_modules/.pnpm");

	if (!fs.existsSync(store)) {
		return {};
	}

	const vitest = fs.readdirSync(store).find((name) => name.startsWith("vitest@"));

	if (!vitest) {
		return {};
	}

	const dependencies = path.join(store, vitest, "node_modules");

	return Object.fromEntries(
		fs
			.readdirSync(dependencies)
			.filter((name) => !name.startsWith("@") && name !== "vitest" && name !== "vite")
			.map((name) => [name, path.join(dependencies, name)])
	);
}

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	server: {
		port: 5190
	},
	resolve: {
		alias: mode === "test" ? vitestDependencyAliases() : {}
	},
	test: {
		include: ["src/**/*.{test,spec}.{js,ts}"]
	}
}));
