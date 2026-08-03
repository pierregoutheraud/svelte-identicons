<script lang="ts">
	import Identicon from "$lib/components/Identicon/Identicon.svelte";

	let size = $state(400);
	let pixelSize = $state(10);
	let seed = $state("0");
	let colors = $state<string[]>([]);
	let numberOfColors = $state(3);
	let text = $state("");

	// let array = Array.from({ length: 101 }, (_, i) => i);
	// let array = [100];

	const height = $derived(Math.floor(size / pixelSize));
	const width = $derived(height);

	// Assigns `colors` unconditionally, which is only safe because `colors` is NOT
	// passed back into <Identicon> below. Pass it down and this becomes a write to
	// a prop the child's effect depends on: an infinite loop that throws
	// effect_update_depth_exceeded. The swatch strip is display-only on purpose.
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
			></div>
		{/each}
	</div>

	<form>
		<fieldset>
			<legend>seed</legend>
			<input bind:value={seed} />
			<button
				type="button"
				onclick={() => {
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
