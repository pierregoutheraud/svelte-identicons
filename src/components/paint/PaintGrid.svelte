<script lang="ts">
	import type { IdenticonOptions } from "$lib/engine/Identicon.js";
	import PaintCanvasSheet from "./PaintCanvasSheet.svelte";
	import PaintFoldGuide from "./PaintFoldGuide.svelte";
	import PaintGridCellLayer from "./PaintGridCellLayer.svelte";
	import PaintGridLabels from "./PaintGridLabels.svelte";
	import { getPaintGridLayout } from "./paint-grid.model.js";
	import type { TapeSegment } from "./paint.helpers.js";
	import PaintTapeOverlay from "./PaintTapeOverlay.svelte";

	interface Props {
		grid: string[];
		cellIds: string[];
		width: number;
		height: number;
		baseCellId: string;
		activeCellId?: string | null;
		painted?: boolean[];
		focusRow?: number | null;
		/** Grid index of the square being painted right now. */
		focusIndex?: number | null;
		cellPx?: number;
		/** Physical size of one grid square. */
		squareCm?: number;
		/** Bare canvas between the canvas' left edge and the first grid column. */
		canvasMarginXCm?: number;
		/** Bare canvas between the canvas' top edge and the first grid row. */
		canvasMarginYCm?: number;
		symetry?: IdenticonOptions["symetry"];
		/** The physical canvas, to the same scale as the squares. 0 hides it. */
		sheetWidthPx?: number;
		sheetHeightPx?: number;
		sheetColor?: string;
		tapeSegments?: TapeSegment[];
		showTape?: boolean;
		/** Generated tape strip to emphasize while following the placement guide. */
		tapeGuideIndex?: number | null;
		/** False renders only the finished artwork, without painting guides. */
		showGuides?: boolean;
		/** Interval used by numbered labels and stronger grid lines. */
		guideInterval?: number;
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
		cellPx = 20,
		squareCm = 0,
		canvasMarginXCm = 0,
		canvasMarginYCm = 0,
		symetry = "axial",
		sheetWidthPx = 0,
		sheetHeightPx = 0,
		sheetColor = "#ffffff",
		tapeSegments = [],
		showTape = false,
		tapeGuideIndex = null,
		showGuides = true,
		guideInterval = 5,
		onToggleCell = () => undefined
	}: Props = $props();

	const layout = $derived(
		getPaintGridLayout({
			width,
			height,
			cellPx,
			sheetWidthPx,
			sheetHeightPx,
			symetry
		})
	);
	const tapeOverlapCells = $derived(
		showTape
			? new Set(tapeSegments.flatMap((segment) => segment.overlapCells))
			: new Set<number>()
	);
</script>

<div
	class="PaintGrid"
	class:preview={!showGuides}
	style="padding:{layout.padY}px {layout.padX}px"
>
	{#if showGuides}
		<PaintGridLabels
			{width}
			{height}
			{cellPx}
			{focusRow}
			labelInterval={guideInterval}
		/>
	{/if}

	<div class="cells" class:preview={!showGuides}>
		{#if layout.showSheet}
			<PaintCanvasSheet
				widthPx={sheetWidthPx}
				heightPx={sheetHeightPx}
				color={sheetColor}
			/>
		{/if}

		<PaintGridCellLayer
			{grid}
			{cellIds}
			{width}
			{height}
			{baseCellId}
			{activeCellId}
			{painted}
			{focusRow}
			{focusIndex}
			{cellPx}
			{squareCm}
			{canvasMarginXCm}
			{canvasMarginYCm}
			{sheetColor}
			{showGuides}
			{guideInterval}
			highlightedCells={tapeOverlapCells}
			{onToggleCell}
		/>

		{#if showTape && showGuides && layout.showSheet && tapeSegments.length}
			<PaintTapeOverlay
				segments={tapeSegments}
				{cellPx}
				widthPx={sheetWidthPx}
				heightPx={sheetHeightPx}
				offsetXPx={layout.padX}
				offsetYPx={layout.padY}
				guideIndex={tapeGuideIndex}
			/>
		{/if}

		{#if showGuides && layout.foldColumn > 0}
			<PaintFoldGuide column={layout.foldColumn} {cellPx} />
		{/if}
	</div>
</div>

<style>
	.PaintGrid {
		display: grid;
		grid-template-columns: auto auto;
		grid-template-rows: auto auto;
		gap: 4px;
		width: max-content;
	}

	.PaintGrid.preview {
		display: block;
	}

	.cells {
		position: relative;
		background: #14161a;
		outline: 1px solid #3a3f47;
	}

	.cells.preview {
		background: transparent;
		outline: none;
	}
</style>
