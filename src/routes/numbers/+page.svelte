<script lang="ts">
	let url = `http://localhost:3000/e0rdc37je?width=100&height=100&text=`;

	let text = "";

	function handleKeydown(e) {
		if (e.key === "Enter") {
			const textEncoded = encodeURIComponent(text);
			url = `http://localhost:3000/${textEncoded}?width=100&height=50&text=${textEncoded}`;
			text = "";
			console.log("+page | url", url);
		}
	}

	function handleChange(e) {
		console.log(text);
		const textEncoded = encodeURIComponent(text);
		url = `http://localhost:3000/${textEncoded}?width=100&height=50&text=${textEncoded}`;
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
	<div class="container" style:width={`${params.width * 10}px`}>
		<!-- {#each letters as i} -->
		<!-- 	<img src={`http://localhost:3000/${i}?${searchParams.toString()}&text=${i}`} alt="kek" /> -->
		<!-- {/each} -->

		<!-- 		{#each Array.from({ length: 100 }, (_, i) => i) as i} -->
		<!-- 			<img src={`http://localhost:3000/${i}?${searchParams.toString()}&text=${i}`} alt="kek" /> -->
		<!-- 		{/each} -->

		<!-- <img src={`http://localhost:3000/stopeatinganimals?width=500&height=500`} alt="kek" /> -->
	</div>
</main>

<style>
	main {
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.container {
		display: flex;
		flex-wrap: wrap;
	}
</style>
