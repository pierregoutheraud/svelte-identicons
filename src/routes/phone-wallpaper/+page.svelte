<script lang="ts">
	import Identicon from "$lib/components/Identicon/Identicon.svelte";
	import { generateRandomHex } from "$lib/helpers/colors.helpers.js";
	import { generatePseudoWord } from "$lib/helpers/general.helpers.js";
	import { onMount } from "svelte";

	let canvasElement: HTMLCanvasElement;
	let seed = generatePseudoWord(10);
	let pixelSize = 10;
	let width = 0;
	let height = 0;
	let symetry = "axial" as const;

	let numberOfColors = 2;
	let colors: string[] | undefined = undefined;

	onMount(() => {
		width = Math.ceil(screen.width / pixelSize);
		height = Math.ceil(screen.height / pixelSize);
	});

	function handleDownload() {
		var link = document.createElement("a");
		link.download = "filename.png";
		link.href = canvasElement.toDataURL();
		link.click();
	}

	function handleClickCustomColors() {
		colors = [generateRandomHex(), generateRandomHex()];
	}

	function handleIdenticonColors(c: string[]) {
		// console.log("handleIdenticonColors", c);
		// // if (colors === undefined || colors?.toString() !== c.toString()) {
		// // 	colors = c;
		// // }
		// currentColors = c;
	}

	function handleClickDecrementColor() {
		colors = colors?.slice(0, -1) ?? [];
	}
	function handleClickIncrementColor() {
		colors = [...(colors ?? []), generateRandomHex()];
	}

	function handleChangeColor(index: number, e: any) {
		const value = e.target.value;
		colors = colors?.map((c, i) => (i === index ? value : c)) ?? [];
	}

	function generateSeed() {
		colors = undefined;
		seed = generatePseudoWord(10);
	}
</script>

<main class="main">
	<div class="form">
		<div class="row">
			<p class="label">Seed</p>
			<input type="text" bind:value={seed} placeholder="Type anything here" />
			<button on:click={generateSeed}>Generate</button>
		</div>

		{#if !colors}
			<div class="row">
				<p class="label">Number of colors</p>
				<input
					type="number"
					bind:value={numberOfColors}
					placeholder="Number of colors"
				/>
				<button on:click={handleClickCustomColors}>Custom colors</button>
			</div>
		{/if}

		{#if colors}
			<div class="colors">
				<p class="label">Colors</p>
				<button
					on:click={handleClickDecrementColor}
					disabled={colors.length <= 2}>-</button
				>
				{#each colors as color, i}
					<input
						type="color"
						id="head"
						name="head"
						value={color}
						on:change={(e) => handleChangeColor(i, e)}
					/>
				{/each}
				<button on:click={handleClickIncrementColor}>+</button>
			</div>
		{/if}

		<button class="download" on:click={handleDownload}>Download image</button>
	</div>

	<Identicon
		bind:canvasElement
		{seed}
		{height}
		{width}
		{pixelSize}
		{symetry}
		{numberOfColors}
		{colors}
		text={undefined}
		textColor={undefined}
		textPosition="center"
		onColors={handleIdenticonColors}
	/>
</main>

<style>
	:global(html, body) {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.main {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden !important;
	}

	.form {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 10;
		padding: 10px;

		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form input,
	.form button {
		height: 46px;
		font-size: 18px;
		padding: 3px 12px 0px;
	}

	.form input {
		width: 100%;
		font-size: 18px;
		padding: 0 12px 0px;
	}

	.row {
		display: flex;
	}

	.label {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3px 16px 0;
		background: black;
		font-weight: 600;
		flex-shrink: 0;
	}

	.colors {
		display: flex;
	}

	.form input[type="color"] {
		padding: 0;
		border: 6px solid white;
	}
	input[type="color"]::-webkit-color-swatch {
		border: none;
	}
	input[type="color"]::-webkit-color-swatch-wrapper {
		padding: 0;
		border-radius: 0;
	}

	.form button {
		font-size: 18px;
		font-weight: 600;
		width: 100%;
		padding-right: 12px;
		padding-left: 12px;
	}

	main :global(.Identicon) {
		position: absolute;
		top: 100px;
		left: 0;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}
</style>
