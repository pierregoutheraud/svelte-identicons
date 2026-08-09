import type { IdenticonOptions } from "$lib/engine/Identicon.js";

export interface PaintGridLayout {
	padX: number;
	padY: number;
	showSheet: boolean;
	foldColumn: number;
}

export interface PaintGridCellInfo {
	index: number;
	row: number;
	column: number;
	leftCm: number;
	topCm: number;
}

interface ZoomLimitInput {
	containerWidthPx: number;
	containerHeightPx?: number;
	gridWidth: number;
	gridHeight: number;
	squareCm: number;
	canvasWidthCm: number;
	canvasHeightCm: number;
	reservedWidthPx?: number;
	reservedHeightPx?: number;
	fallbackMaxCellPx?: number;
}

interface LayoutInput {
	width: number;
	height: number;
	cellPx: number;
	sheetWidthPx: number;
	sheetHeightPx: number;
	symetry: IdenticonOptions["symetry"];
}

export function getPaintGridLayout({
	width,
	height,
	cellPx,
	sheetWidthPx,
	sheetHeightPx,
	symetry
}: LayoutInput): PaintGridLayout {
	return {
		padX: Math.max(0, (sheetWidthPx - width * cellPx) / 2),
		padY: Math.max(0, (sheetHeightPx - height * cellPx) / 2),
		showSheet: sheetWidthPx > 0 && sheetHeightPx > 0,
		// Other symmetry modes do not describe a single vertical fold line.
		foldColumn: symetry === "axial" ? Math.ceil(width / 2) : 0
	};
}

export function getPaintGridCellInfo({
	index,
	cellCount,
	width,
	squareCm,
	canvasMarginXCm,
	canvasMarginYCm
}: {
	index: number | null;
	cellCount: number;
	width: number;
	squareCm: number;
	canvasMarginXCm: number;
	canvasMarginYCm: number;
}): PaintGridCellInfo | null {
	if (index === null || index < 0 || index >= cellCount || width <= 0) {
		return null;
	}

	const row = Math.floor(index / width);
	const column = index % width;

	return {
		index,
		row,
		column,
		leftCm: canvasMarginXCm + column * squareCm,
		topCm: canvasMarginYCm + row * squareCm
	};
}

export function formatCentimetres(value: number): string {
	return String(Math.round((value + Number.EPSILON) * 100) / 100);
}

/** Largest square size that keeps both the artwork and physical canvas visible. */
export function getPaintGridZoomMax({
	containerWidthPx,
	containerHeightPx = Number.POSITIVE_INFINITY,
	gridWidth,
	gridHeight,
	squareCm,
	canvasWidthCm,
	canvasHeightCm,
	reservedWidthPx = 0,
	reservedHeightPx = 0,
	fallbackMaxCellPx = 44
}: ZoomLimitInput): number {
	if (
		!Number.isFinite(containerWidthPx) ||
		containerWidthPx <= 0 ||
		Number.isNaN(containerHeightPx) ||
		containerHeightPx <= 0
	) {
		return fallbackMaxCellPx;
	}

	const canvasWidthInCells =
		squareCm > 0 && canvasWidthCm > 0 ? canvasWidthCm / squareCm : 0;
	const canvasHeightInCells =
		squareCm > 0 && canvasHeightCm > 0 ? canvasHeightCm / squareCm : 0;
	const widthInCells = Math.max(1, gridWidth, canvasWidthInCells);
	const heightInCells = Math.max(1, gridHeight, canvasHeightInCells);
	const maxByWidth =
		Math.max(0, containerWidthPx - reservedWidthPx) / widthInCells;
	const maxByHeight =
		Math.max(0, containerHeightPx - reservedHeightPx) / heightInCells;
	const fittedCellPx = Math.min(maxByWidth, maxByHeight);

	// Preserve fractional pixels below the normal 8px slider floor so even the
	// largest supported grids remain fully visible in a constrained pane.
	const precision = fittedCellPx < 8 ? 100 : 1;
	return Math.max(0.01, Math.floor(fittedCellPx * precision) / precision);
}
