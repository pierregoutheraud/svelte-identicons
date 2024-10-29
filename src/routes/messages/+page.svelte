<script lang="ts">
	import Identicon from "$lib/components/Identicon/Identicon.svelte";

	let size = 1000;
	let url: string | null = null;
	let text = "your text";
	let textColor = 1;
	let numberOfColors = 2;

	// function handleKeydown(e) {
	// 	if (e.key === "Enter") {
	// 		const textEncoded = encodeURIComponent(text);
	// 		url = `http://localhost:3000/${textEncoded}?width=100&height=50&text=${textEncoded}`;
	// 		text = "";
	// 		console.log("+page | url", url);
	// 	}
	// }

	function handleChange(e) {
		console.log(text);
		const textEncoded = encodeURIComponent(text);
		url = `http://localhost:3000/${textEncoded}?width=${size}&height=${size}&text=${textEncoded}&textPosition=bottom-right&numberOfColors=3&pixelSize=10`;
		console.log("+page | url", url);
	}

	let params = {
		width: 140,
		height: 140,
		pixelSize: 10,
		textPosition: "bottom-right",
		numberOfColors: 3
	};
	const searchParams = new URLSearchParams(params);

	let letters = [
		"a",
		"b",
		"c",
		"d",
		"e",
		"f",
		"g",
		"h",
		"i",
		"j",
		"k",
		"l",
		"m",
		"n",
		"o",
		"p",
		"q",
		"r",
		"s",
		"t",
		"u",
		"v",
		"w",
		"x",
		"y",
		"z"
	];
</script>

<main>
	<!-- {#if url?.length} -->
	<!-- 	<img src={url} alt="kek" /> -->
	<!-- {/if} -->
	<!-- <input type="text" bind:value={text} on:input={handleChange} on:keydown={handleKeydown} /> -->

	<Identicon
		seed={text}
		height={50}
		width={100}
		pixelSize={10}
		{numberOfColors}
		symetry="central"
		{text}
		{textColor}
		textPadding={1}
		textBackgroundColor={0}
		textPosition="center"
		shape="square"
	/>

	<!-- <input type="text" bind:value={text} on:input={handleChange} /> -->

	<form>
		<fieldset>
			<legend>text</legend>
			<input type="text" bind:value={text} />
		</fieldset>

		<fieldset>
			<legend>textColor</legend>
			<input type="number" bind:value={textColor} />
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
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 50px;
	}

	form {
		display: flex;
	}
</style>
