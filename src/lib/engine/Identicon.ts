import {
	PIXEL_3x3_LETTERS,
	PIXEL_3x4_LETTERS
} from "$lib/constants/pixel-letters.js";
import { hslToHex } from "$lib/helpers/colors.helpers.js";
import {
	axisDistance,
	cellValue,
	columnDistance,
	hashStringToInteger,
	mirrorAxis,
	pickByWeight,
	symmetricDistance
} from "./hash.js";
import { Random } from "./Random.js";

// Keeps the per-cell shape draw on its own channel so it cannot correlate with
// the colour drawn at the same coordinate.
const SHAPE_SALT = 0x5bf03635;

export type TextFont = "3x3" | "3x4";

// 3x4 carries digits, punctuation and a space; 3x3 is letters only, and any
// character a font is missing is dropped from the overlay.
const TEXT_FONTS: Record<TextFont, Record<string, number[][] | undefined>> = {
	"3x3": PIXEL_3x3_LETTERS,
	"3x4": PIXEL_3x4_LETTERS
};

export interface IdenticonOptions {
	seed?: string; // seed used to generate icon data, default: random
	colors?: string[]; // array of colors
	height: number; // width/height of the icon in blocks, default: 10
	width: number; // width/height of the icon in blocks, default: 10
	pixelSize?: number; // width/height of each block in pixels, default: 5
	shape?: "circle" | "square" | "polygon";
	numberOfColors?: number;
	textBackgroundColor?: number | string;
	textColor?: number | string;
	symetry?: "axial" | "central" | "none";
	/**
	 * Where the mirror axis sits, default: "gap".
	 *
	 * A mirror axis can fall in the gap between two columns or on a column itself,
	 * and the choice is visible: in a gap the two middle columns pair up, on a
	 * column that column is unique. Whichever you pick, one parity of width has to
	 * carry an extra column — you cannot mirror both an even and an odd count
	 * exactly around the same kind of axis.
	 *
	 * - `"gap"` — axis between two columns. Even widths mirror exactly; odd widths
	 *   carry one extra column. Middle is a matched pair. Size-stable.
	 * - `"column"` — axis on a column, so the middle column is unique at every
	 *   width. Odd widths mirror exactly; even widths carry one extra column.
	 *   Size-stable.
	 * - `"exact"` — mirror exactly at *every* width. The axis then has to move
	 *   between a gap and a column as the width changes parity, so the pattern
	 *   shifts and resizing is no longer stable.
	 */
	symetryAxis?: "gap" | "column" | "exact";
	text?: string;
	textFont?: TextFont; // pixel font used for `text`, default: "3x4"
	textPadding?: number;
	textPosition?:
		| "top-center"
		| "top-left"
		| "top-right"
		| "bottom-center"
		| "bottom-left"
		| "bottom-right"
		| "center";
	onColors: ((colors: string[]) => void) | undefined;
}

export default class Identicon {
	canvas: HTMLCanvasElement;
	options: Required<Omit<IdenticonOptions, "textBackgroundColor" | "text">> & {
		textBackgroundColor?: string;
		text?: string;
	};
	rand: Random;
	/** Drives the positional hash, so the grid is independent of the PRNG state. */
	seedInt: number;
	public imageData: (string | undefined)[] = [];
	LETTER_PADDING_COLOR: string | undefined;
	LETTER_COLOR = "#fff";
	backgroundColor: string;

	constructor(canvas: HTMLCanvasElement, options: IdenticonOptions) {
		this.canvas = canvas;

		const seed =
			options.seed || Math.floor(Math.random() * Math.pow(10, 16)).toString(16);
		this.rand = new Random(seed);
		this.seedInt = hashStringToInteger(seed);

		const numberOfColors = options.numberOfColors || 1;

		const defaultColors = [...new Array(numberOfColors)].map(() => {
			const hsl = this.createHslColor();
			const hex = hslToHex(hsl[0], hsl[1], hsl[2]);
			return hex;
		});
		const colors = options.colors?.length ? options.colors : defaultColors;

		this.backgroundColor = colors[0];

		const textBackgroundColor =
			typeof options.textBackgroundColor === "number"
				? colors[options.textBackgroundColor]
				: options.textBackgroundColor;

		const textColor =
			typeof options.textColor === "number"
				? colors[options.textColor]
				: options.textColor;

		this.options = {
			pixelSize: 4,
			shape: "square",
			symetry: "axial",
			symetryAxis: "gap",
			textPosition: "bottom-right",
			textFont: "3x4",
			textPadding: 1,
			...options,
			textBackgroundColor: textBackgroundColor ?? undefined,
			textColor: textColor ?? "#fff",
			text: options.text?.trim() || undefined,
			numberOfColors: colors.length,
			colors,
			seed
		};

		this.options.onColors?.(colors);

		this.render();
	}

	hslToString(hsl: number[]) {
		return `hsl(${hsl[0]},${hsl[1]}%,${hsl[2]}%)`;
	}

	createHslColor(): [number, number, number] {
		//saturation is the whole color spectrum
		const h = Math.floor(this.rand.next() * 360);
		//saturation goes from 40 to 100, it avoids greyish colors
		const s = this.rand.next() * 60 + 40;
		//lightness can be anything from 0 to 100, but probabilities are a bell curve around 50%
		const l =
			(this.rand.next() +
				this.rand.next() +
				this.rand.next() +
				this.rand.next()) *
			25;

		return [h, s, l];
	}

	calculateThresholds(numColors: number) {
		const thresholds = new Array(numColors);
		let total = 0;

		// Calculate initial probabilities using geometric progression
		// Each color gets half the probability of the previous color
		for (let i = 0; i < numColors; i++) {
			thresholds[i] = Math.pow(0.5, i);
			total += thresholds[i];
		}

		// Normalize probabilities to sum to 1
		let accumulator = 0;
		for (let i = 0; i < numColors; i++) {
			thresholds[i] = thresholds[i] / total;
			accumulator += thresholds[i];
			thresholds[i] = accumulator;
		}

		return thresholds;
	}

	// Alternative using arithmetic progression
	calculateThresholdsArithmetic(numColors: number) {
		const thresholds = new Array(numColors);
		let total = 0;

		// Calculate initial probabilities using arithmetic progression
		// Each color gets a linearly decreasing probability
		for (let i = 0; i < numColors; i++) {
			thresholds[i] = numColors - i;
			total += thresholds[i];
		}

		// Normalize probabilities to sum to 1
		let accumulator = 0;
		for (let i = 0; i < numColors; i++) {
			thresholds[i] = thresholds[i] / total;
			accumulator += thresholds[i];
			thresholds[i] = accumulator;
		}

		return thresholds;
	}

	calculateColorsWeights(colorsCount: number) {
		// Blockies original probabilities: 43.5% + 43.5% + 13% = 100%
		// New weights system = [0.5, 0.25, 0.125...]
		// The weights are not probabilities or percentage, they are the actual weights
		// then we pick a number between 0 and 0.875 (0.5+0.25+0.125)
		// if r < 0.5, we pick the first color,
		// if r < 0.75, we pick the second color
		// else we pick the third color (r < 0.875)
		//

		const value = 0.5;
		let n = 1;
		const weights = [...new Array(colorsCount)].reduce((acc) => {
			const p = n * value;
			n = n - p;
			return [...acc, p];
		}, []);

		return weights;
	}

	/**
	 * Maps a grid position to the coordinate its colour is looked up by.
	 *
	 * This is where both symmetry and size-independence come from. A mirrored
	 * identicon is one half-pattern (axial) or one quadrant (central) drawn
	 * repeatedly, so the coordinate indexes *that* unit rather than the grid.
	 * Mirrored cells resolve to the same coordinate and so share a colour for
	 * free — there is no mirroring step at all.
	 *
	 * One rule covers every case: measure outward from the mirror axis. Index 0
	 * always sits against the axis, so a resize appends cells at the outer edges and
	 * the middle never moves.
	 *
	 * The only difference between the modes is where the axis is. Mirrored axes put
	 * it in the middle; `none` puts it at the right edge, which right-aligns the
	 * pattern and grows it leftward — the same half-pattern an axial identicon
	 * mirrors, just shown once.
	 *
	 * `y` is used directly on axes with no mirror, so height grows downward and the
	 * top rows stay fixed.
	 */
	private cellCoordinate(x: number, y: number): [number, number] {
		const { width, height, symetry, symetryAxis } = this.options;

		const mirrored = (i: number, size: number) => {
			switch (symetryAxis) {
				case "column":
					return columnDistance(i, size);
				case "exact":
					return symmetricDistance(i, size);
				default:
					return axisDistance(i, mirrorAxis(size));
			}
		};

		switch (symetry) {
			case "axial":
				// Mirrored horizontally: columns grow out to the left and right of a
				// fixed middle, rows are appended at the bottom.
				return [mirrored(x, width), y];
			case "central":
				// Mirrored on both axes: one quadrant, growing out from a fixed centre.
				return [mirrored(x, width), mirrored(y, height)];
			default:
				// Axis at the right edge: not mirrored, so the whole width is the
				// pattern, right-aligned and growing leftward.
				return [axisDistance(x, width), y];
		}
	}

	/**
	 * Builds the grid by hashing each cell's coordinate, so the pattern is decided
	 * by the seed alone. Resizing reveals or hides cells rather than redrawing
	 * them: see hash.ts for why, and identicon.stability.test.ts for exactly which
	 * resizes are guaranteed.
	 */
	createImageData() {
		const { height, width, colors } = this.options;

		const weights = this.calculateColorsWeights(colors.length);
		const data: (string | undefined)[] = new Array(width * height);

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const [cx, cy] = this.cellCoordinate(x, y);
				const value = cellValue(this.seedInt, cx, cy);
				data[y * width + x] = pickByWeight(colors, weights, value);
			}
		}

		return data;
	}

	getTextPosition(textMatrix: number[][]) {
		const { width, height, textPosition } = this.options;
		let top = 0;
		let left = 0;
		switch (textPosition) {
			case "top-left":
				top = 0;
				left = 0;
				break;
			case "top-right":
				top = 0;
				left = width - textMatrix[0].length;
				break;
			case "top-center":
				top = 0;
				left = Math.floor((width - textMatrix[0].length) / 2);
				break;
			case "bottom-left":
				top = height - textMatrix.length;
				left = 0;
				break;
			case "bottom-center":
				top = height - textMatrix.length;
				left = Math.floor((width - textMatrix[0].length) / 2);
				break;
			case "bottom-right":
				top = height - textMatrix.length;
				left = width - textMatrix[0].length;
				break;
			case "center":
				top = Math.floor((height - textMatrix.length) / 2);
				left = Math.floor((width - textMatrix[0].length) / 2);
				break;
		}
		return { top, left };
	}

	addZerosAroundMatrix(matrix: number[][], padding = 1) {
		const paddingZeroes = Array(padding).fill(0);

		// prettier-ignore
		return [
			...paddingZeroes.map(() => [
				...paddingZeroes,
				...new Array(matrix[0].length).fill(0),
				...paddingZeroes
			]),
			...matrix.map((row) => [...paddingZeroes, ...row, ...paddingZeroes]),
			...paddingZeroes.map(() => [
				...paddingZeroes,
				...new Array(matrix[0].length).fill(0),
				...paddingZeroes
			])
		];
	}

	drawPolygon(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		radius: number,
		sides: number
	) {
		if (sides < 3) return; // Polygon must have at least 3 sides

		ctx.beginPath();
		const angleStep = (2 * Math.PI) / sides;

		for (let i = 0; i < sides; i++) {
			const angle = i * angleStep;
			const dx = x + radius * Math.cos(angle);
			const dy = y + radius * Math.sin(angle);
			if (i === 0) {
				ctx.moveTo(dx, dy);
			} else {
				ctx.lineTo(dx, dy);
			}
		}

		ctx.closePath();
		ctx.fill();
	}

	render() {
		const {
			height,
			width,
			pixelSize,
			shape,
			colors,
			textColor,
			textBackgroundColor,
			text,
			textFont,
			textPadding
		} = this.options;

		this.imageData = this.createImageData();

		if (text) {
			const font = TEXT_FONTS[textFont] ?? TEXT_FONTS["3x4"];
			// Taken from the glyphs themselves so the accumulator always has
			// exactly one row per row of the font.
			const fontHeight = font.A?.length ?? 4;

			// Add letter data to image data
			let textMatrix = text.split("").reduce<number[][]>(
				(acc, letter) => {
					const letterMatrix = font[letter.toUpperCase()];

					if (!letterMatrix) {
						return acc;
					}

					const textMatrixNewWidth = acc[0].length + letterMatrix[0].length;

					// Too many letter, it won't fit
					if (textMatrixNewWidth >= width) {
						return acc;
					}

					acc = acc.map((row, y) => {
						return [
							...row,
							...(row.length ? [0] : []), // add 1 pixel between letters
							...letterMatrix[y]
						];
					});

					return acc;
				},
				Array.from({ length: fontHeight }, () => [] as number[])
			);

			textMatrix = this.addZerosAroundMatrix(textMatrix, textPadding);

			const { top, left } = this.getTextPosition(textMatrix);

			for (let letterY = 0; letterY < textMatrix.length; letterY++) {
				for (let letterX = 0; letterX < textMatrix[0].length; letterX++) {
					const imageDataIndex = (top + letterY) * width + left + letterX;
					const letterValue = textMatrix[letterY][letterX];

					if (letterValue === 0) {
						if (textBackgroundColor !== undefined) {
							this.imageData[imageDataIndex] = textBackgroundColor;
						}
					} else {
						const color =
							typeof textColor === "number" ? colors[textColor] : textColor;
						this.imageData[imageDataIndex] = color;
					}
				}
			}
		}

		this.canvas.width = width * pixelSize;
		this.canvas.height = height * pixelSize;

		const cc = this.canvas.getContext("2d");

		if (!cc) {
			return;
		}

		cc.fillStyle = colors[0];
		cc.fillRect(0, 0, this.canvas.width, this.canvas.height);

		for (let i = 0; i < this.imageData.length; i++) {
			const color = this.imageData[i];

			// if color index is 0, leave the background
			if (!color) {
				continue;
			}

			const row = Math.floor(i / width);
			const col = i % width;

			cc.fillStyle = color;

			if (shape === "square") {
				// Draw a square
				cc.fillRect(col * pixelSize, row * pixelSize, pixelSize, pixelSize);
			} else if (shape === "circle") {
				// Draw a circle
				cc.beginPath();
				// const radius = this.rand.nextRange(0.1, pixelSize / 2);
				const radius = pixelSize / 2;
				cc.arc(
					col * pixelSize + pixelSize / 2,
					row * pixelSize + pixelSize / 2,
					radius,
					0,
					2 * Math.PI
				);
				cc.fill();
			} else if (shape === "polygon") {
				this.drawPolygon(
					cc,
					col * pixelSize + pixelSize / 2,
					row * pixelSize + pixelSize / 2,
					pixelSize / 2,
					// Positional, like the colour, so the side count of a given cell does
					// not shift when the grid is resized. Its own salt keeps it
					// uncorrelated with the colour drawn at the same coordinate.
					3 + Math.floor(cellValue(this.seedInt ^ SHAPE_SALT, col, row) * 18)
				);
			}
		}

		return this.imageData;
	}
}
