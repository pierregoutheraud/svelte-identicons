<script lang="ts">
	import { untrack } from "svelte";
	import Identicon, { type IdenticonOptions } from "../../engine/Identicon.js";

	interface Props {
		height: number; // height in blocks
		width: number; // width in blocks
		pixelSize: number; // pixel size of 1 block
		seed: string;
		shape?: "square" | "circle";
		text?: string | undefined;
		numberOfColors?: number;
		canvasElement?: HTMLCanvasElement | undefined;
		colors?: string[] | undefined;
		symetry?: "axial" | "central" | "none" | undefined;
		textColor?: IdenticonOptions["textColor"];
		textBackgroundColor?: IdenticonOptions["textBackgroundColor"];
		textPosition?: IdenticonOptions["textPosition"];
		textFont?: IdenticonOptions["textFont"];
		textPadding?: number;
		/**
		 * Receives the palette the engine actually used, after it has drawn.
		 *
		 * Must be idempotent. It is called from inside this component's effect, so
		 * a callback that unconditionally assigns a prop this component reads (for
		 * example `colors`) re-triggers the effect forever and throws
		 * `effect_update_depth_exceeded`. Compare before assigning, or do not pass
		 * the value back down.
		 */
		onColors?: ((colors: string[]) => void) | undefined;
	}

	let {
		height,
		width,
		pixelSize,
		seed,
		shape = "square",
		text = undefined,
		numberOfColors = 2,
		// No fallback value: every parent binds a variable that starts undefined,
		// and $bindable(fallback) throws props_invalid_value in that case.
		canvasElement = $bindable(),
		colors = undefined,
		symetry = "axial",
		textColor = undefined,
		textBackgroundColor = undefined,
		textPosition = "bottom-right",
		textFont = "3x4",
		textPadding = 1,
		onColors = undefined
	}: Props = $props();

	const widthInPixels = $derived(width * pixelSize);
	const heightInPixels = $derived(height * pixelSize);

	$effect(() => {
		// Tracked prologue: the props read here, and only here, are this effect's
		// dependencies.
		const canvas = canvasElement;

		if (!canvas || !seed) {
			return;
		}

		const options: IdenticonOptions = {
			seed,
			height,
			width,
			pixelSize,
			shape,
			numberOfColors,
			// Spread rather than pass by reference: it registers a dependency on
			// each entry so an edited palette redraws, and it keeps the $state
			// proxy out of the engine.
			colors: colors ? [...colors] : undefined,
			symetry,
			text,
			textPosition,
			textFont,
			textColor,
			textBackgroundColor,
			textPadding,
			onColors: undefined
		};

		// Untracked epilogue: the engine calls back into consumer code, and without
		// this whatever that callback reads would silently become a dependency of
		// this effect.
		untrack(() => {
			const identicon = new Identicon(canvas, options);
			// Called here rather than handed to the engine (which fires it mid
			// construction) so the canvas is already drawn: a throwing callback no
			// longer leaves a blank canvas.
			onColors?.(identicon.options.colors);
		});
	});
</script>

<canvas
	class="Identicon"
	bind:this={canvasElement}
	style:height={`${heightInPixels}px`}
	style:width={`${widthInPixels}px`}
></canvas>

<style>
	.Identicon {
		display: block;
	}
</style>
