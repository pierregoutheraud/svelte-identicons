<script lang="ts">
	import {
		formatCentimetres,
		type PaintGridCellInfo
	} from "./paint-grid.model.js";

	interface Props {
		cell: PaintGridCellInfo;
		columnCount: number;
		cellPx: number;
		id?: string;
	}

	let {
		cell,
		columnCount,
		cellPx,
		id = "square-info-tooltip"
	}: Props = $props();
</script>

<div
	{id}
	class="tooltip"
	class:below={cell.row < 2}
	class:align-left={cell.column < 2 && cell.column < columnCount / 2}
	class:align-right={cell.column >= columnCount - 2 &&
		cell.column >= columnCount / 2}
	style="--cell:{cellPx}px; --tooltip-row:{cell.row}; --tooltip-column:{cell.column}"
	role="tooltip"
>
	<strong>Row {cell.row + 1}</strong>
	<strong>Column {cell.column + 1}</strong>
	<span>
		Top: {formatCentimetres(cell.topCm)} cm
	</span>
	<span>
		Left: {formatCentimetres(cell.leftCm)} cm
	</span>
</div>

<style>
	.tooltip {
		--tooltip-x: -50%;
		--tooltip-y: -100%;
		position: absolute;
		left: calc((var(--tooltip-column) + 0.5) * var(--cell));
		top: calc(var(--tooltip-row) * var(--cell) - 7px);
		transform: translate(var(--tooltip-x), var(--tooltip-y));
		display: flex;
		flex-direction: column;
		gap: 2px;
		box-sizing: border-box;
		padding: 10px;
		white-space: nowrap;
		color: #ffffff;
		background: #000000;
		font-size: 12px;
		line-height: 1.35;
		pointer-events: none;
		z-index: 10;
	}

	.tooltip strong {
		color: #ffffff;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.tooltip.below {
		--tooltip-y: 0;
		top: calc((var(--tooltip-row) + 1) * var(--cell) + 7px);
	}

	.tooltip.align-left {
		--tooltip-x: 0;
		left: calc(var(--tooltip-column) * var(--cell));
	}

	.tooltip.align-right {
		--tooltip-x: -100%;
		left: calc((var(--tooltip-column) + 1) * var(--cell));
	}
</style>
