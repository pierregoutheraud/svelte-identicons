<script lang="ts">
	import { delegateIndexedClick } from "./paint-grid.dom.js";
	import { PaintGridInspector } from "./paint-grid-inspector.svelte.js";
	import { getPaintGridCellInfo } from "./paint-grid.model.js";
	import PaintGridTooltip from "./PaintGridTooltip.svelte";

	interface Props {
		grid: string[];
		cellIds: string[];
		width: number;
		height: number;
		baseCellId: string;
		activeCellId?: string | null;
		painted?: boolean[];
		focusRow?: number | null;
		focusIndex?: number | null;
		cellPx: number;
		squareCm: number;
		canvasMarginXCm: number;
		canvasMarginYCm: number;
		sheetColor: string;
		showGuides?: boolean;
		guideInterval?: number;
		highlightedCells?: ReadonlySet<number>;
		onToggleCell?: (index: number) => void;
	}

	let {
		grid,
		cellIds,
		width,
		height,
		baseCellId,
		activeCellId = null,
		painted = [],
		focusRow = null,
		focusIndex = null,
		cellPx,
		squareCm,
		canvasMarginXCm,
		canvasMarginYCm,
		sheetColor,
		showGuides = true,
		guideInterval = 5,
		highlightedCells = new Set<number>(),
		onToggleCell = () => undefined
	}: Props = $props();

	const inspector = new PaintGridInspector();
	const isolating = $derived(showGuides && activeCellId !== null);
	const inspectedCell = $derived(
		getPaintGridCellInfo({
			index: inspector.index,
			cellCount: grid.length,
			width,
			squareCm,
			canvasMarginXCm,
			canvasMarginYCm
		})
	);
</script>

<div
	class="cell-layer"
	class:preview={!showGuides}
	style="--cell:{cellPx}px; --columns:{width}; --sheet-color:{sheetColor}"
	aria-hidden={showGuides ? undefined : "true"}
	use:delegateIndexedClick={onToggleCell}
	onpointerover={inspector.handlePointerOver}
	onpointerleave={inspector.handlePointerLeave}
	onfocusin={inspector.handleFocusIn}
	onfocusout={inspector.handleFocusOut}
>
	{#each grid as color, index}
		{@const row = Math.floor(index / width)}
		{@const column = index % width}
		{@const cellId = cellIds[index]}
		{@const isBase = cellId === baseCellId}
		{@const isActive = isolating && cellId === activeCellId}
		<button
			type="button"
			class="cell"
			class:dim={isolating && !isActive}
			class:active={isActive}
			class:painted={painted[index]}
			class:current={showGuides && focusIndex === index}
			class:outside={showGuides && focusRow !== null && focusRow !== row + 1}
			class:edge-x={showGuides &&
				(column + 1) % guideInterval === 0 &&
				column + 1 !== width}
			class:edge-y={showGuides &&
				(row + 1) % guideInterval === 0 &&
				row + 1 !== height}
			class:tape-overlap={highlightedCells.has(index)}
			style={isolating && !isActive ? "" : `background:${color}`}
			data-index={index}
			disabled={!showGuides ||
				(isBase && !isActive) ||
				(isolating && !isActive)}
			aria-label={showGuides
				? `Row ${row + 1}, column ${column + 1}`
				: undefined}
			aria-describedby={showGuides && inspector.index === index
				? "square-info-tooltip"
				: undefined}
		>
			{#if painted[index] && isActive}
				<svg viewBox="0 0 10 10" aria-hidden="true">
					<path d="M1.5 5.2 L4 7.7 L8.5 2.5" />
				</svg>
			{/if}
		</button>
	{/each}

	{#if showGuides && inspectedCell}
		<PaintGridTooltip cell={inspectedCell} columnCount={width} {cellPx} />
	{/if}
</div>

<style>
	.cell-layer {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--columns), var(--cell));
	}

	.cell {
		/* The global stylesheet makes every button a gold 33px pill. */
		all: unset;
		display: block;
		box-sizing: border-box;
		position: relative;
		width: var(--cell);
		height: var(--cell);
		border-right: 1px solid rgba(0, 0, 0, 0.22);
		border-bottom: 1px solid rgba(0, 0, 0, 0.22);
		cursor: pointer;
		z-index: 1;
	}

	.preview .cell {
		border: none;
		cursor: default;
	}

	.cell:disabled {
		cursor: default;
	}

	.cell.edge-x {
		border-right: 1px solid rgba(0, 0, 0, 0.75);
	}

	.cell.edge-y {
		border-bottom: 1px solid rgba(0, 0, 0, 0.75);
	}

	.cell.dim {
		background: var(--sheet-color);
	}

	.cell.active:hover {
		box-shadow: inset 0 0 0 2px gold;
	}

	.cell.active.painted {
		opacity: 0.4;
		box-shadow: none;
	}

	.cell.outside {
		opacity: 0.18;
	}

	.cell.active.outside {
		opacity: 0.3;
	}

	.cell.active.current,
	.cell.active.painted.current,
	.cell.active.outside.current {
		opacity: 1;
		box-shadow:
			inset 0 0 0 3px gold,
			0 0 6px 1px rgba(255, 215, 0, 0.6);
		z-index: 1;
	}

	.cell.active.tape-overlap,
	.cell.active.painted.tape-overlap,
	.cell.active.outside.tape-overlap,
	.cell.active.current.tape-overlap {
		opacity: 1;
		box-shadow:
			inset 0 0 0 3px #ff625f,
			0 0 7px 1px rgba(255, 98, 95, 0.72);
	}

	.cell svg {
		position: absolute;
		inset: 12%;
		width: 76%;
		height: 76%;
		fill: none;
		stroke: #ffffff;
		stroke-width: 1.8;
		stroke-linecap: square;
		mix-blend-mode: difference;
	}
</style>
