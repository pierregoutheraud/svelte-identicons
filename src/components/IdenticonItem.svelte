<script context="module" lang="ts">
	export interface Params {
		seed: string;
		text: string;
		numberOfColors: number;
		height: number;
		width: number;
		pixelSize: number;
		symetry: IdenticonOptions["symetry"];
		colors: string[];
		textColor: string;
		textPosition: IdenticonOptions["textPosition"];
	}
</script>

<script lang="ts">
	import Identicon from "$lib/components/Identicon/Identicon.svelte";
	import { type IdenticonOptions } from "$lib/engine/Identicon.js";
	import { serializePaintParams } from "./paint/paint.helpers.js";
	import Code from "./Code.svelte";

	export let createUrl: (params: Params) => string;
	export let params: Params;
	let canvasElement: HTMLCanvasElement;

	// Deliberately not createUrl(): that one drops pixelSize and blanks
	// numberOfColors when custom colors are set, and numberOfColors changes the
	// layout. Painting the wrong pattern is expensive to discover.
	$: paintHref = `/paint${serializePaintParams({
		seed: params.seed,
		width: params.width,
		height: params.height,
		symetry: params.symetry,
		numberOfColors: params.numberOfColors,
		colors: params.colors,
		text: params.text,
		textColor: params.textColor,
		textPosition: params.textPosition,
		pixelSize: params.pixelSize
	})}`;

	function handleDownload() {
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
		text={params.text.length ? params.text : undefined}
		textColor={params.textColor}
		textPosition={params.textPosition}
		bind:canvasElement
	/>
	<div class="actions">
		<Code {params} />
		<button on:click={handleDownload}>Download image</button>
		<button on:click={() => handleCopyLink(params)}>Copy link</button>
		<a class="paint" href={paintHref}>Paint this</a>
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
	}

	.paint {
		display: flex;
		align-items: center;
		height: 33px;
		padding: 3px 12px 0;
		background: gold;
		color: black;
		text-decoration: none;
		transition: all 300ms ease;
	}

	.paint:hover {
		background: goldenrod;
	}
</style>
