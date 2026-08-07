<script lang="ts">
	import type { IdenticonOptions } from "$lib/engine/Identicon.js";
	import type { TapeSegment } from "./paint.helpers.js";

	interface Props {
		grid: string[];
		width: number;
		height: number;
		baseColor: string;
		activeColor?: string | null;
		painted?: boolean[];
		focusRow?: number | null;
		/** Grid index of the square being painted right now. */
		focusIndex?: number | null;
		cellPx?: number;
		symetry?: IdenticonOptions["symetry"];
		/** The physical canvas, to the same scale as the squares. 0 hides it. */
		sheetWidthPx?: number;
		sheetHeightPx?: number;
		sheetColor?: string;
		tapeSegments?: TapeSegment[];
		showTape?: boolean;
		tapeSelectedCells?: number[];
		tapeSelectionMode?: boolean;
		/** False renders only the finished artwork, without painting guides. */
		showGuides?: boolean;
		onToggleCell?: (index: number) => void;
	}

	let {
		grid,
		width,
		height,
		baseColor,
		activeColor = null,
		painted = [],
		focusRow = null,
		focusIndex = null,
		cellPx = 20,
		symetry = "axial",
		sheetWidthPx = 0,
		sheetHeightPx = 0,
		sheetColor = "#ffffff",
		tapeSegments = [],
		showTape = false,
		tapeSelectedCells = [],
		tapeSelectionMode = false,
		showGuides = true,
		onToggleCell = () => undefined
	}: Props = $props();

	// The sheet is centred on the squares and can be larger than them, so the
	// container has to reserve the overhang or the scroll pane clips it.
	const padX = $derived(Math.max(0, (sheetWidthPx - width * cellPx) / 2));
	const padY = $derived(Math.max(0, (sheetHeightPx - height * cellPx) / 2));
	const showSheet = $derived(sheetWidthPx > 0 && sheetHeightPx > 0);

	const columns = $derived(Array.from({ length: width }, (_, i) => i + 1));
	const rows = $derived(Array.from({ length: height }, (_, i) => i + 1));
	const tapeOverlapCells = $derived(
		new Set(tapeSegments.flatMap((segment) => segment.overlapCells))
	);
	const tapeSelectedSet = $derived(new Set(tapeSelectedCells));
	// A final preview always shows the complete artwork, regardless of which
	// paint is isolated in the editor.
	const isolating = $derived(showGuides && activeColor !== null);
	// The fold is only meaningful for axial symmetry. "central" mirrors on a flat
	// index, which is a 180 degree rotation, not a line you can draw.
	const foldColumn = $derived(symetry === "axial" ? Math.ceil(width / 2) : 0);

	function tapeStyle(segment: TapeSegment): string {
		return `left:${segment.x * cellPx}px;top:${segment.y * cellPx}px;width:${segment.width * cellPx}px;height:${segment.height * cellPx}px`;
	}

	// One delegated listener rather than 900. As an action rather than an inline
	// handler, because the cells are real buttons and already handle the keyboard:
	// a click handler on the container would only ask for a redundant key handler.
	function delegateClick(node: HTMLElement, handler: (index: number) => void) {
		let current = handler;

		function onClick(event: MouseEvent) {
			const cell = (event.target as HTMLElement).closest(
				"[data-index]"
			) as HTMLElement | null;

			if (cell) {
				current(parseInt(cell.dataset.index || "", 10));
			}
		}

		node.addEventListener("click", onClick);

		return {
			update(next: (index: number) => void) {
				current = next;
			},
			destroy() {
				node.removeEventListener("click", onClick);
			}
		};
	}
</script>

<div
	class="PaintGrid"
	class:preview={!showGuides}
	style="--cell:{cellPx}px; --columns:{width}; --fold:{foldColumn}; --pad-x:{padX}px; --pad-y:{padY}px; --sheet-w:{sheetWidthPx}px; --sheet-h:{sheetHeightPx}px; --sheet-color:{sheetColor}"
>
	{#if showGuides}
		<div class="corner"></div>

		<div class="labels-x">
			{#each columns as column}
				<span class="label" class:strong={column % 5 === 0}>
					{column % 5 === 0 || column === 1 ? column : ""}
				</span>
			{/each}
		</div>

		<div class="labels-y">
			{#each rows as row}
				<span
					class="label"
					class:strong={row % 5 === 0}
					class:focused={focusRow === row}
				>
					{row % 5 === 0 || row === 1 ? row : ""}
				</span>
			{/each}
		</div>
	{/if}

	<div
		class="cells"
		aria-hidden={showGuides ? undefined : "true"}
		use:delegateClick={onToggleCell}
	>
		{#if showSheet}
			<div class="sheet"></div>
		{/if}

		{#each grid as color, index}
			{@const row = Math.floor(index / width)}
			{@const column = index % width}
			{@const isBase = color === baseColor}
			{@const isActive = isolating && color === activeColor}
			<button
				type="button"
				class="cell"
				class:dim={isolating && !isActive}
				class:active={isActive}
				class:painted={painted[index]}
				class:tape-unselected={showGuides &&
					tapeSelectionMode &&
					isActive &&
					!tapeSelectedSet.has(index)}
				class:current={showGuides && focusIndex === index}
				class:outside={showGuides && focusRow !== null && focusRow !== row + 1}
				class:edge-x={showGuides &&
					(column + 1) % 5 === 0 &&
					column + 1 !== width}
				class:edge-y={showGuides && (row + 1) % 5 === 0 && row + 1 !== height}
				class:tape-overlap={showTape && tapeOverlapCells.has(index)}
				style={isolating && !isActive ? "" : `background:${color}`}
				data-index={index}
				disabled={!showGuides || isBase || (isolating && !isActive)}
				title={showGuides ? `row ${row + 1}, column ${column + 1}` : undefined}
			>
				{#if painted[index] && isActive}
					<svg viewBox="0 0 10 10" aria-hidden="true">
						<path d="M1.5 5.2 L4 7.7 L8.5 2.5" />
					</svg>
				{/if}
			</button>
		{/each}

		{#if showTape && showGuides && showSheet && tapeSegments.length}
			<div
				class="tape-clip"
				style="width:{sheetWidthPx}px;height:{sheetHeightPx}px"
				aria-hidden="true"
			>
				<div class="tape-layer" style="left:{padX}px;top:{padY}px">
					{#each tapeSegments as segment, index}
						<span
							class="tape-strip {segment.orientation}"
							class:overlap={segment.overlapCells.length > 0}
							style={tapeStyle(segment)}
							data-tape-index={index}
							data-orientation={segment.orientation}
						></span>
					{/each}
				</div>
			</div>
		{/if}

		{#if showGuides && foldColumn > 0}
			<div class="fold"></div>
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
		padding: var(--pad-y) var(--pad-x);
	}

	.PaintGrid.preview {
		display: block;
	}

	/* The physical canvas, drawn to the same scale as the squares. */
	.sheet {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: var(--sheet-w);
		height: var(--sheet-h);
		background: var(--sheet-color);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
		/* Behind everything, so the label gutters do not need a z-index of their
		   own: that would make them a stacking context and cut their blend mode
		   off from the sheet they sit on. */
		z-index: -1;
	}

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
		/* The gutters can sit over the dark page or over the white canvas
		   depending on its size, so let the labels invert against whatever is
		   behind them rather than picking one background and losing the other. */
		color: #c8ced8;
		mix-blend-mode: difference;
	}

	.labels-y .label {
		justify-content: flex-end;
		padding-right: 4px;
		min-width: 22px;
	}

	.label.strong {
		color: #ffffff;
		font-weight: 700;
	}

	/* Gold would invert to blue over white, so this one keeps its own chip. */
	.label.focused {
		mix-blend-mode: normal;
		color: #22252b;
		background: gold;
		font-weight: 700;
	}

	.cells {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--columns), var(--cell));
		background: #14161a;
		outline: 1px solid #3a3f47;
	}

	.preview .cells {
		background: transparent;
		outline: none;
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

	/* Everything that is not the color being painted right now. */
	.cell.dim {
		background: #23262c;
		border-right-color: #191b1f;
		border-bottom-color: #191b1f;
	}

	.cell.dim.edge-x {
		border-right-color: #0d0e11;
	}

	.cell.dim.edge-y {
		border-bottom-color: #0d0e11;
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

	.cell.active.tape-unselected,
	.cell.active.painted.tape-unselected,
	.cell.active.outside.tape-unselected {
		opacity: 0.25;
	}

	/* The one square to paint next. Listed after .painted and .outside, and at
	   matching specificity, so it always wins the ring and full opacity. */
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

	.tape-clip {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		overflow: hidden;
		pointer-events: none;
		z-index: 3;
	}

	.tape-layer {
		position: absolute;
	}

	.tape-strip {
		position: absolute;
		box-sizing: border-box;
		background: repeating-linear-gradient(
			135deg,
			rgba(135, 206, 235, 0.92) 0 5px,
			rgba(82, 157, 194, 0.92) 5px 10px
		);
		border: 1px solid #000;
	}

	.tape-strip.overlap {
		background: repeating-linear-gradient(
			135deg,
			rgba(255, 98, 95, 0.95) 0 5px,
			rgba(158, 39, 46, 0.95) 5px 10px
		);
	}

	/* Axial symmetry means you only have to read half the columns. */
	.fold {
		position: absolute;
		top: 0;
		bottom: 0;
		left: calc(var(--fold) * var(--cell));
		width: 0;
		border-left: 1px dashed rgba(255, 215, 0, 0.8);
		pointer-events: none;
		z-index: 2;
	}
</style>
