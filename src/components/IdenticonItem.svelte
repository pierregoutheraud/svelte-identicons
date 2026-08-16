<script module lang="ts">
	export interface Params {
		seed: string;
		text: string;
		numberOfColors: number;
		height: number;
		width: number;
		pixelSize: number;
		symetry: IdenticonOptions["symetry"];
		symetryAxis: IdenticonOptions["symetryAxis"];
		tileSize: number;
		colors: string[];
		textColor: string;
		textPosition: IdenticonOptions["textPosition"];
		textFont: IdenticonOptions["textFont"];
	}
</script>

<script lang="ts">
	import Identicon from "$lib/components/Identicon/Identicon.svelte";
	import { type IdenticonOptions } from "$lib/engine/Identicon.js";
	import {
		serializeFaviconParams,
		toFaviconSymetry
	} from "./favicon/favicon.helpers.js";
	import { serializePaintParams } from "./paint/paint.helpers.js";
	import Button from "./Button.svelte";
	import Code from "./Code.svelte";

	interface Props {
		createUrl: (params: Params) => string;
		params: Params;
	}

	let { createUrl, params }: Props = $props();
	let canvasElement = $state<HTMLCanvasElement | undefined>();

	// Deliberately not createUrl(): that one drops pixelSize and blanks
	// numberOfColors when custom colors are set, and numberOfColors changes the
	// layout. Painting the wrong pattern is expensive to discover.
	const paintHref = $derived(
		`/paint${serializePaintParams({
			seed: params.seed,
			combinationSeed: params.seed,
			width: params.width,
			height: params.height,
			symetry: params.symetry,
			symetryAxis: params.symetryAxis,
			tileSize: params.tileSize,
			numberOfColors: params.numberOfColors,
			colorSource: params.colors.length ? "custom" : "seed",
			colors: params.colors,
			selectedColorIndices: params.colors.map((_, index) => index),
			text: params.text,
			textColor: params.textColor,
			textPosition: params.textPosition,
			textFont: params.textFont,
			pixelSize: params.pixelSize
		})}`
	);
	const faviconHref = $derived(
		`/favicon${serializeFaviconParams({
			seed: params.seed,
			numberOfColors: Math.min(5, Math.max(2, params.numberOfColors || 3)),
			colors: params.colors.slice(0, 5),
			symetry: toFaviconSymetry(params.symetry),
			shape: "square"
		})}`
	);

	function handleDownload() {
		if (!canvasElement) return;
		var link = document.createElement("a");
		link.download = "filename.png";
		link.href = canvasElement.toDataURL();
		link.click();
	}

	async function handleCopyLink(params: Params) {
		await navigator.clipboard.writeText(
			window.location.origin + "/" + createUrl(params)
		);
		window.alert("Url copied!");
	}
</script>

<div class="IdenticonItem">
	<Identicon
		seed={params.seed}
		height={params.height}
		width={params.width}
		pixelSize={params.pixelSize}
		numberOfColors={params.numberOfColors}
		colors={params.colors}
		symetry={params.symetry}
		symetryAxis={params.symetryAxis}
		tileSize={params.tileSize}
		text={params.text.length ? params.text : undefined}
		textColor={params.textColor}
		textPosition={params.textPosition}
		textFont={params.textFont}
		bind:canvasElement
	/>
	<div class="actions">
		<Code {params} />
		<Button onclick={handleDownload}>Download image</Button>
		<Button onclick={() => handleCopyLink(params)}>Copy link</Button>
		<Button href={paintHref}>Paint this</Button>
		<Button href={faviconHref} variant="outline">Create favicon</Button>
	</div>
</div>

<style>
	.IdenticonItem {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 18px;
		flex-wrap: wrap;
		justify-content: center;
	}
</style>
