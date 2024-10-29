<script lang="ts">
	import Identicon from "$lib/components/Identicon/Identicon.svelte";

	let size = 400;
	let pixelSize = 10;
	let seed = "0";
	let colors: string[] = [];
	let numberOfColors = 3;
	let text = "";

	// let array = Array.from({ length: 101 }, (_, i) => i);
	// let array = [100];

	$: height = Math.floor(size / pixelSize);
	$: width = height;

	function handleColors(newColors: string[]) {
		colors = newColors;
	}
</script>

<main>
	<!-- {#each array as i} -->
	<!-- 	<Identicon -->
	<!-- 		seed={"" + i} -->
	<!-- 		text={"" + i} -->
	<!-- 		{height} -->
	<!-- 		{width} -->
	<!-- 		{pixelSize} -->
	<!-- 		numberOfColors={3} -->
	<!-- 		symetry="axial" -->
	<!-- 		textBackgroundColor={0} -->
	<!-- 		textColor={"white"} -->
	<!-- 		textPadding={1} -->
	<!-- 		shape="circle" -->
	<!-- 		textPosition="bottom-right" -->
	<!-- 	/> -->
	<!-- {/each} -->

	<div class="identicons">
		<Identicon
			{seed}
			{text}
			{height}
			{width}
			{pixelSize}
			{numberOfColors}
			symetry="axial"
			textBackgroundColor={0}
			textColor={"white"}
			textPadding={1}
			shape="square"
			textPosition="bottom-right"
			onColors={handleColors}
		/>
	</div>

	<div class="colors">
		{#each colors as color}
			<div
				style:background-color={color}
				style:width="20px"
				style:height="20px"
			/>
		{/each}
	</div>

	<form>
		<fieldset>
			<legend>seed</legend>
			<input bind:value={seed} />
			<button
				type="button"
				on:click={() => {
					// Generate a uniq random id seed
					seed = Math.random().toString(36).substring(2);
				}}>random</button
			>
		</fieldset>

		<fieldset>
			<legend>text</legend>
			<input type="text" bind:value={text} />
		</fieldset>

		<fieldset>
			<legend>size in pixels</legend>
			<input type="number" bind:value={size} />
		</fieldset>

		<fieldset>
			<legend>pixel size</legend>
			<input type="number" bind:value={pixelSize} />
		</fieldset>

		<fieldset>
			<legend>numberOfColors</legend>
			<input type="number" bind:value={numberOfColors} />
		</fieldset>
	</form>
</main>

<style>
	main {
		display: flex;
		align-items: center;
		flex-direction: column;
		gap: 30px;
		margin: 40px auto;
	}

	.identicons {
		display: flex;
		gap: 40px;
	}

	.colors {
		display: flex;
	}

	form {
		display: flex;
	}
</style>
