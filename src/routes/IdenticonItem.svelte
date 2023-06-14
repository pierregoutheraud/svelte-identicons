<script context="module" lang="ts">
	export interface Params {
		seed: string;
		text: string;
		numberOfColors: number;
		height: number;
		width: number;
		pixelSize: number;
		symetry: IdenticonOptions['symetry'];
		colors: string[];
		textColor: string;
	}
</script>

<script lang="ts">
	import type { IdenticonOptions } from '$lib/components/Identicon/Identicon.js';
	import Identicon from '$lib/components/Identicon/Identicon.svelte';
	import Code from './Code.svelte';

	export let params: Params;
	let canvasElement: HTMLCanvasElement;

	function handleDownload() {
		var link = document.createElement('a');
		link.download = 'filename.png';
		link.href = canvasElement.toDataURL();
		link.click();
	}

	function createUrl(params: Params): string {
		const newQueryParams = new URLSearchParams({
			seed: params.seed,
			text: params.text,
			numberOfColors: params.colors.length ? '' : params.numberOfColors.toString(),
			height: params.height?.toString() || '1',
			width: params.width?.toString() || '1',
			symetry: params.symetry as string,
			colors: params.colors.join(','),
			textColor: params.textColor
		});
		return `?${newQueryParams.toString()}`;
	}

	async function handleCopyLink(params: Params) {
		await navigator.clipboard.writeText(window.location.origin + '/' + createUrl(params));
		window.alert('Url copied!');
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
		bind:canvasElement
	/>
	<Code {params} />
	<button on:click={handleDownload}>Download image</button>
	<button on:click={() => handleCopyLink(params)}>Copy link</button>
</div>

<style>
	.IdenticonItem {
		display: flex;
		gap: 10px;
	}
</style>
