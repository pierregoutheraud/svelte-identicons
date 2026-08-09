<script lang="ts">
	interface Props {
		width: number;
		height: number;
		cellPx: number;
		focusRow?: number | null;
		labelInterval?: number;
	}

	let {
		width,
		height,
		cellPx,
		focusRow = null,
		labelInterval = 5
	}: Props = $props();

	const columns = $derived(
		Array.from({ length: width }, (_, index) => index + 1)
	);
	const rows = $derived(
		Array.from({ length: height }, (_, index) => index + 1)
	);

	function showsNumber(position: number): boolean {
		return position === 1 || position % labelInterval === 0;
	}
</script>

<div class="corner"></div>

<div
	class="labels-x"
	style="--cell:{cellPx}px; --columns:{width}"
	aria-hidden="true"
>
	{#each columns as column}
		<span class="label" class:strong={column % labelInterval === 0}>
			{showsNumber(column) ? column : ""}
		</span>
	{/each}
</div>

<div class="labels-y" style="--cell:{cellPx}px" aria-hidden="true">
	{#each rows as row}
		<span
			class="label"
			class:strong={row % labelInterval === 0}
			class:focused={focusRow === row}
		>
			{showsNumber(row) ? row : ""}
		</span>
	{/each}
</div>

<style>
	.corner {
		width: 100%;
	}

	.labels-x {
		display: grid;
		grid-template-columns: repeat(var(--columns), var(--cell));
	}

	.labels-y {
		display: grid;
		grid-auto-rows: var(--cell);
	}

	.label {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: min(11px, calc(var(--cell) * 0.6));
		line-height: 1;
		/* The gutters may sit over either the page or the physical canvas. */
		color: #c8ced8;
		mix-blend-mode: difference;
	}

	.labels-y .label {
		justify-content: flex-end;
		min-width: 22px;
		padding-right: 4px;
	}

	.label.strong {
		color: #ffffff;
		font-weight: 700;
	}

	.label.focused {
		color: #22252b;
		background: gold;
		font-weight: 700;
		mix-blend-mode: normal;
	}
</style>
