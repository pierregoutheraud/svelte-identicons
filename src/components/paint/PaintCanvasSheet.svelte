<script lang="ts">
	interface Props {
		widthPx: number;
		heightPx: number;
		color: string;
	}

	let { widthPx, heightPx, color }: Props = $props();
</script>

<div
	class="sheet"
	style="width:{widthPx}px; height:{heightPx}px; background:{color}"
	aria-hidden="true"
></div>

<style>
	.sheet {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
		/* Keep the canvas behind cells and label gutters without a new stacking context. */
		z-index: -1;
	}
</style>
