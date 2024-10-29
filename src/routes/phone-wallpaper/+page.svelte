<script lang="ts">
	import Identicon from "$lib/components/Identicon/Identicon.svelte";
	import { onMount } from "svelte";

	let canvasElement: HTMLCanvasElement;
	let seed = "Type anything here";
	let pixelSize = 10;
	let numberOfColors = 3;
	let width = 0;
	let height = 0;
	let colors = ["#000000", "#FFFFFF"];
	let symetry = "axial" as const;

	onMount(() => {
		width = Math.ceil(window.innerWidth / pixelSize);
		height = Math.ceil(window.innerHeight / pixelSize);
	});

	function handleDownload() {
		var link = document.createElement("a");
		link.download = "filename.png";
		link.href = canvasElement.toDataURL();
		link.click();
	}
</script>

<main>
	<div class="form">
		<input type="text" bind:value={seed} placeholder="Type anything here" />
		<input
			type="number"
			bind:value={numberOfColors}
			placeholder="Number of colors"
		/>
		<button class="download" on:click={handleDownload}>Download image</button>
	</div>

	<Identicon
		bind:canvasElement
		{seed}
		{height}
		{width}
		{pixelSize}
		{numberOfColors}
		{symetry}
		text={undefined}
		textColor={undefined}
		textPosition="center"
	/>
</main>

<style>
	main {
		margin: 0;
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
		gap: 4px;
	}

	.form input {
		width: 100%;
		font-size: 18px;
		padding: 12px 12px 10px;
		height: auto;
	}

	.form button {
		font-size: 18px;
		font-weight: 600;
		width: 100%;
		height: auto;
		padding: 12px 12px 10px;
	}

	main :global(.Identicon) {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}
</style>
