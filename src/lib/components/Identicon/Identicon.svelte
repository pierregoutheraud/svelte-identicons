<script lang="ts">
	import Identicon, { type IdenticonOptions } from "./Identicon.js";

	export let height: number; // height in blocks
	export let width: number; // width in blocks
	export let pixelSize: number; // pixel size of 1 block
	export let seed: string;
	export let shape: "square" | "circle" = "square";
	export let text: string | undefined = undefined;
	export let numberOfColors = 1;
	export let canvasElement: HTMLCanvasElement | undefined = undefined;
	export let colors: string[] | undefined = undefined;
	export let symetry: "axial" | "central" | "none" | undefined = "axial";
	export let textColor: string | undefined;
	export let textBackgroundColor: string | undefined = undefined;
	export let textPosition: IdenticonOptions["textPosition"] = "bottom-right";
	export let textPadding: number = 1;

	let widthInPixels: number | undefined = undefined;
	let heightInPixels: number | undefined = undefined;

	$: widthInPixels = width * pixelSize;
	$: heightInPixels = height * pixelSize;

	$: if (canvasElement && seed) {
		new Identicon(canvasElement, {
			seed,
			height,
			width,
			pixelSize,
			shape,
			numberOfColors,
			colors,
			symetry,
			text,
			textPosition,
			textColor: textColor || "#ffffff",
			textBackgroundColor,
			textPadding
		});
	}
</script>

<canvas
	class="Identicon"
	bind:this={canvasElement}
	style:height={`${heightInPixels}px`}
	style:width={`${widthInPixels}px`}
/>

<style>
	.Identicon {
		display: block;
	}
</style>
