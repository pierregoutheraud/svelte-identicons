import Identicon, { type IdenticonOptions } from "$lib/engine/Identicon.js";
import { generatePseudoWord } from "$lib/helpers/general.helpers.js";

export interface PaintParams {
	seed: string;
	width: number;
	height: number;
	symetry: IdenticonOptions["symetry"];
	// Kept verbatim: it drives 6 PRNG draws per color for the default palette,
	// even when custom colors are passed, so it is part of the layout identity.
	numberOfColors: number;
	// Empty array means "let the engine generate the palette".
	colors: string[];
	text: string;
	textColor: string;
	textPosition: IdenticonOptions["textPosition"];
	// Not part of the layout, only carried so we can link back to the playground.
	pixelSize: number;
}

// The engine only needs somewhere to draw. In node (tests) there is no canvas,
// and none is required: render() fills imageData and applies the text overlay
// before it ever asks for a 2d context, and bails out cleanly when it gets null.
export interface CanvasLike {
	width: number;
	height: number;
	getContext(id: string): unknown;
}

export function createStubCanvas(): CanvasLike {
	return { width: 0, height: 0, getContext: () => null };
}

export function generateSeed(): string {
	return generatePseudoWord(10);
}

export function randomHex(): string {
	// Not $lib's generateRandomHex: that one has no padStart and can emit
	// short, invalid hex like "#abc12", which breaks <input type="color">.
	return `#${Math.floor(Math.random() * 16777216)
		.toString(16)
		.padStart(6, "0")}`;
}

export const DEFAULT_PAINT_PARAMS: PaintParams = {
	// A constant, not a random word: parsePaintParams runs during SSR as well as
	// on the client, and a random default would not survive hydration.
	seed: "paint",
	width: 30,
	height: 30,
	symetry: "axial",
	numberOfColors: 3,
	colors: [],
	text: "",
	textColor: "#ffffff",
	textPosition: "bottom-right",
	pixelSize: 10
};

/**
 * Runs the real engine rather than reimplementing it, so what you paint is
 * exactly what the playground drew.
 */
export function extractGrid(
	params: PaintParams,
	canvas?: CanvasLike
): { grid: string[]; backgroundColor: string; colors: string[] } {
	const target =
		canvas ??
		(typeof document !== "undefined"
			? (document.createElement("canvas") as unknown as CanvasLike)
			: createStubCanvas());

	const identicon = new Identicon(target as unknown as HTMLCanvasElement, {
		seed: params.seed,
		width: params.width,
		height: params.height,
		symetry: params.symetry,
		numberOfColors: params.numberOfColors,
		colors: params.colors.length ? params.colors : undefined,
		text: params.text || undefined,
		textColor: params.textColor || undefined,
		textPosition: params.textPosition,
		pixelSize: 1,
		onColors: undefined
	});

	const backgroundColor = identicon.backgroundColor;

	// A cell can be undefined or "" (an empty textColor makes render() skip it),
	// and the engine draws the background through in both cases.
	const grid = identicon.imageData.map((color) => color || backgroundColor);

	// The resolved palette in *engine order*, which is what the weights are
	// assigned to. Handing this back verbatim as `colors` reproduces the exact
	// same layout; re-ordering it would not.
	return { grid, backgroundColor, colors: identicon.options.colors };
}

export interface PaletteEntry {
	color: string;
	count: number;
	pct: number;
	isBase: boolean;
	label: string;
}

const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Built from the values actually present in the grid, not from options.colors:
 * a text overlay can write colors that were never in the palette.
 */
export function buildPalette(
	grid: string[],
	backgroundColor: string
): PaletteEntry[] {
	const counts = new Map<string, number>();
	for (const color of grid) {
		counts.set(color, (counts.get(color) || 0) + 1);
	}

	const entries = [...counts.entries()].map(([color, count]) => ({
		color,
		count,
		pct: grid.length ? (count / grid.length) * 100 : 0,
		// The base coat is whatever the engine fills the canvas with. With a text
		// overlay that is not necessarily the first color of the palette.
		isBase: color === backgroundColor,
		label: ""
	}));

	entries.sort((a, b) => {
		if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
		return b.count - a.count;
	});

	return entries.map((entry, i) => ({
		...entry,
		label: LABELS[i] || `#${i + 1}`
	}));
}

export interface CellStep {
	index: number; // index into the grid
	row: number; // 1-indexed
	column: number; // 1-indexed
}

/**
 * Every cell of one color, in reading order: the exact sequence of squares to
 * work through, one at a time.
 */
export function colorCells(
	grid: string[],
	width: number,
	color: string
): CellStep[] {
	const steps: CellStep[] = [];

	for (let i = 0; i < grid.length; i++) {
		if (grid[i] === color) {
			steps.push({
				index: i,
				row: Math.floor(i / width) + 1,
				column: (i % width) + 1
			});
		}
	}

	return steps;
}

export function formatCell(step: CellStep): string {
	return `row ${step.row} column ${step.column}`;
}

export interface Measurements {
	cellWidthMm: number;
	cellHeightMm: number;
	blockWidthMm: number; // every 5th cell
	blockHeightMm: number;
	warnings: string[];
}

export function measure({
	canvasWidthCm,
	canvasHeightCm,
	marginCm,
	width,
	height
}: {
	canvasWidthCm: number;
	canvasHeightCm: number;
	marginCm: number;
	width: number;
	height: number;
}): Measurements {
	const drawableWidthMm = Math.max(0, canvasWidthCm - marginCm * 2) * 10;
	const drawableHeightMm = Math.max(0, canvasHeightCm - marginCm * 2) * 10;

	const cellWidthMm = width > 0 ? drawableWidthMm / width : 0;
	const cellHeightMm = height > 0 ? drawableHeightMm / height : 0;

	const warnings: string[] = [];
	const smallest = Math.min(cellWidthMm, cellHeightMm);

	if (smallest > 0 && smallest < 15) {
		warnings.push(
			`Cells are ${round(smallest)}mm. Under 15mm you need a fine brush and the edges get fiddly.`
		);
	}

	if (Math.abs(cellWidthMm - cellHeightMm) > 0.05) {
		warnings.push(
			`Cells are not square (${round(cellWidthMm)} x ${round(cellHeightMm)}mm). Match the canvas ratio to the grid ratio, or accept rectangles.`
		);
	}

	// A tick that falls between millimetre marks has to be eyeballed 30 times,
	// and the error compounds along the edge.
	if (isAwkward(cellWidthMm) || isAwkward(cellHeightMm)) {
		warnings.push(
			`Cell size is not a round measurement. Mark every 5th cell instead of every cell, so the error cannot compound.`
		);
	}

	return {
		cellWidthMm,
		cellHeightMm,
		blockWidthMm: cellWidthMm * 5,
		blockHeightMm: cellHeightMm * 5,
		warnings
	};
}

function isAwkward(mm: number): boolean {
	if (mm <= 0) return false;
	// Round to the nearest half millimetre: anything else is hard to rule.
	return Math.abs(mm * 2 - Math.round(mm * 2)) > 0.01;
}

export function round(n: number, decimals = 2): number {
	const factor = Math.pow(10, decimals);
	return Math.round(n * factor) / factor;
}

/**
 * Complete and lossless, unlike createUrl() on the playground page, which drops
 * pixelSize and blanks numberOfColors when custom colors are set. numberOfColors
 * changes the layout, so a lossy round-trip means painting a different picture.
 */
export function serializePaintParams(params: PaintParams): string {
	const search = new URLSearchParams({
		seed: params.seed,
		width: String(params.width),
		height: String(params.height),
		symetry: String(params.symetry),
		// The engine reads it as `options.numberOfColors || 1`, so normalising a
		// NaN (which the playground URL can produce) to 1 keeps the same layout.
		numberOfColors: String(params.numberOfColors || 1),
		colors: params.colors.join(","),
		text: params.text,
		textColor: params.textColor,
		textPosition: String(params.textPosition),
		pixelSize: String(params.pixelSize || 10)
	});
	return `?${search.toString()}`;
}

export function parsePaintParams(search: URLSearchParams): PaintParams {
	const colors = search.get("colors");

	return {
		seed: search.get("seed") || generateSeed(),
		width: intOr(search.get("width"), DEFAULT_PAINT_PARAMS.width),
		height: intOr(search.get("height"), DEFAULT_PAINT_PARAMS.height),
		symetry: (search.get("symetry") ||
			DEFAULT_PAINT_PARAMS.symetry) as IdenticonOptions["symetry"],
		numberOfColors: intOr(
			search.get("numberOfColors"),
			DEFAULT_PAINT_PARAMS.numberOfColors
		),
		colors: colors ? colors.split(",").filter(Boolean) : [],
		text: search.get("text") || "",
		textColor: search.get("textColor") || DEFAULT_PAINT_PARAMS.textColor,
		textPosition: (search.get("textPosition") ||
			DEFAULT_PAINT_PARAMS.textPosition) as IdenticonOptions["textPosition"],
		pixelSize: intOr(search.get("pixelSize"), DEFAULT_PAINT_PARAMS.pixelSize)
	};
}

function intOr(value: string | null, fallback: number): number {
	const parsed = parseInt(value || "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Identity of the pattern itself. Hex values are deliberately excluded: swapping
 * in the colors of paints you own does not move a single cell, so your painting
 * progress must survive it. The color *count* does change the layout.
 */
export function layoutKey(params: PaintParams): string {
	return [
		params.seed,
		params.width,
		params.height,
		params.symetry,
		params.numberOfColors || 1,
		// The count the engine actually weights by: an empty `colors` means it
		// generated `numberOfColors` of them. Materialising the generated palette
		// into `colors` must not look like a different pattern.
		effectiveColorCount(params),
		params.text,
		params.textPosition
	].join("|");
}

export function effectiveColorCount(params: PaintParams): number {
	return params.colors.length || params.numberOfColors || 1;
}

export function findDuplicateColors(colors: string[]): string[] {
	const seen = new Set<string>();
	const duplicates = new Set<string>();

	for (const color of colors) {
		const key = color.toLowerCase();
		if (seen.has(key)) {
			duplicates.add(key);
		}
		seen.add(key);
	}

	return [...duplicates];
}
