<script lang="ts">
	import type { Params } from "./IdenticonItem.svelte";

	export let params: Params;

	$: code = `<Identicon
  seed="${params.seed}"
  height={${params.height}}
  width={${params.width}}
  pixelSize={${params.pixelSize}}
  ${
		!params.colors.length
			? `numberOfColors={${params.numberOfColors}}`
			: `colors={[${params.colors}]}`
	}
  symetry="${params.symetry}"
  text=${params.text?.length ? `"${params.text.length}"` : `{undefined}`}
  textColor="${params.textColor}"
/>`;

	async function handleClick() {
		await navigator.clipboard.writeText(code);
		window.alert("Code copied!");
	}
</script>

<div class="Code">
	<button on:click={handleClick}>Copy code</button>
	<pre><code class="language-pascal">{code}</code></pre>
</div>

<style>
	.Code {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	pre {
		height: fit-content;
		background: black;
		padding: 10px 16px;
		color: #c6ccd7;
	}
</style>
