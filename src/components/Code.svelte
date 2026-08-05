<script lang="ts">
	import type { Params } from "./IdenticonItem.svelte";
	import Button from "./Button.svelte";

	interface Props {
		params: Params;
	}

	let { params }: Props = $props();

	const code = $derived(`<Identicon
  seed="${params.seed}"
  height={${params.height}}
  width={${params.width}}
  pixelSize={${params.pixelSize}}
  ${
		!params.colors.length
			? `numberOfColors={${params.numberOfColors}}`
			: `colors={[${params.colors}]}`
	}
  symetry="${params.symetry}"${
		params.symetry !== "none" &&
		params.symetry !== "tile" &&
		params.symetryAxis !== "gap"
			? `\n  symetryAxis="${params.symetryAxis}"`
			: ``
	}${params.symetry === "tile" ? `\n  tileSize={${params.tileSize}}` : ``}
  text=${params.text?.length ? `"${params.text}"` : `{undefined}`}${
		params.text?.length ? `\n  textFont="${params.textFont}"` : ``
	}
  textColor="${params.textColor}"
/>`);

	async function handleClick() {
		await navigator.clipboard.writeText(code);
		window.alert("Code copied!");
	}
</script>

<div class="Code">
	<Button onclick={handleClick}>Copy code</Button>
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
