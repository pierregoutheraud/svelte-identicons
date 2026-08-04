<script module lang="ts">
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
		textFont: IdenticonOptions["textFont"];
	}
</script>

<script lang="ts">
	import Identicon from "$lib/components/Identicon/Identicon.svelte";
	import { type IdenticonOptions } from "$lib/engine/Identicon.js";
	import {
		serializeFaviconParams,
		type FaviconSymetry
	} from "./favicon/favicon.helpers.js";
	import { serializePaintParams } from "./paint/paint.helpers.js";
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
			width: params.width,
			height: params.height,
			symetry: params.symetry,
			numberOfColors: params.numberOfColors,
			colors: params.colors,
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
			symetry: (params.symetry || "axial") as FaviconSymetry,
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
		text={params.text.length ? params.text : undefined}
		textColor={params.textColor}
		textPosition={params.textPosition}
		textFont={params.textFont}
		bind:canvasElement
	/>
	<div class="actions">
		<Code {params} />
		<button onclick={handleDownload}>Download image</button>
		<button onclick={() => handleCopyLink(params)}>Copy link</button>
		<a class="paint" href={paintHref}>Paint this</a>
		<a class="favicon" href={faviconHref}>Create favicon</a>
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

	.paint,
	.favicon {
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

	.favicon {
		border: 1px solid white;
		background: transparent;
		color: white;
	}

	.favicon:hover {
		border-color: gold;
		color: gold;
	}
</style>
