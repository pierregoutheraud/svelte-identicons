<script lang="ts">
	import type { Params } from './IdenticonItem.svelte';

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
		window.alert('Code copied!');
	}
</script>

<div class="Code">
	<pre><code class="language-pascal">{code}</code></pre>
	<button on:click={handleClick}>Copy code</button>
</div>

<style>
	.Code {
		display: flex;
		gap: 0;
	}
	pre {
		height: fit-content;
		background: #22252b;
		color: #c6ccd7;
		padding: 20px;
		margin: 0;
	}
</style>
