<script lang="ts">
	import type { Snippet } from "svelte";

	/**
	 * One control for both buttons and links that look like buttons.
	 *
	 * The reason this exists: "Paint this" and "Create favicon" were `<a>` tags
	 * restating the button styling by hand, and they kept a `height: 33px` from
	 * before the global height became 40px — so they sat 7px short of the real
	 * buttons beside them. Routing both element types through here means a
	 * link-button cannot drift from a button again.
	 *
	 * Height deliberately comes from global.css (`input, select, button`) rather
	 * than being restated here, so there is only ever one number to change.
	 */
	interface Props {
		/** Present => renders an <a>. Absent => renders a <button>. */
		href?: string;
		variant?: "solid" | "outline";
		disabled?: boolean;
		title?: string;
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
	}

	// Props are listed rather than spread with `...rest`: a rest element stops
	// Svelte inferring which properties to expose, which svelte/valid-compile
	// rejects. Add attributes here as they are actually needed.
	let {
		href = undefined,
		variant = "solid",
		disabled = false,
		title = undefined,
		onclick = undefined,
		children
	}: Props = $props();
</script>

{#if href}
	<a class="Button {variant}" {href} {title}>{@render children()}</a>
{:else}
	<button type="button" class="Button {variant}" {disabled} {title} {onclick}>
		{@render children()}
	</button>
{/if}

<style>
	.Button {
		/* Matches the global control metrics so an <a> lines up with a <button>. */
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 40px;
		padding: 0 12px;
		border: none;
		font-family: "Cousine", monospace;
		font-size: 16px;
		line-height: 1;
		text-decoration: none;
		cursor: pointer;
		transition: all 300ms ease;
	}

	.Button.solid {
		background: gold;
		color: black;
	}

	.Button.solid:hover {
		background: goldenrod;
	}

	.Button.outline {
		background: transparent;
		color: white;
		border: 1px solid white;
	}

	.Button.outline:hover {
		border-color: gold;
		color: gold;
	}

	.Button:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
