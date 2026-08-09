<script lang="ts">
	interface Props {
		column: number;
		cellPx: number;
	}

	let { column, cellPx }: Props = $props();
</script>

<div class="fold" style="left:{column * cellPx}px" aria-hidden="true"></div>

<style>
	.fold {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 0;
		border-left: 1px dashed rgba(255, 215, 0, 0.8);
		pointer-events: none;
		z-index: 2;
	}
</style>
