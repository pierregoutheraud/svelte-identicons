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
	import type { IdenticonOptions } from "$lib/components/Identicon/Identicon.js";
	import Identicon from "$lib/components/Identicon/Identicon.svelte";
	import Code from "./Code.svelte";

	export let createUrl: (params: Params) => string;
	export let params: Params;
	let canvasElement: HTMLCanvasElement;

	function handleDownload() {
		var link = document.createElement("a");
		link.download = "filename.png";
		link.href = canvasElement.toDataURL();
		link.click();
	}

	async function handleCopyLink(params: Params) {
		await navigator.clipboard.writeText(window.location.origin + "/" + createUrl(params));
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
		gap: 18px;
	}
</style>
