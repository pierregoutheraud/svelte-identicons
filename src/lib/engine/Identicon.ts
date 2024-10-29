import { PIXEL_3x4_LETTERS } from "$lib/constants/pixel-letters.js";
import { hslToHex } from "$lib/helpers/colors.helpers.js";
import { Random } from "./Random.js";

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
	text?: string;
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
	public imageData: (string | undefined)[] = [];
	LETTER_PADDING_COLOR: string | undefined;
	LETTER_COLOR = "#fff";
	backgroundColor: string;

	constructor(canvas: HTMLCanvasElement, options: IdenticonOptions) {
		this.canvas = canvas;

		const seed =
			options.seed || Math.floor(Math.random() * Math.pow(10, 16)).toString(16);
		this.rand = new Random(seed);

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
			textPosition: "bottom-right",
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

	// This function creates an array of data for an image, which should be displayed as a symmetric (mirrored) pattern.
	// This is especially useful for creating icons or patterns with symmetric characteristics.
	createImageData() {
		const { height, width, colors, symetry } = this.options;

		// The width of the image data that will be generated is half of the total width, rounded up.
		// This is because the image will be symmetric, so we only need to generate data for half of it.
		// const dataWidth = Math.ceil(width / 2);
		const dataWidth = width;
		const halfWidth = Math.ceil(width / 2);

		// The remaining width after generating the original data will be the mirror width.
		// This part of the image will be a mirror image of the first part.
		const mirrorDataWidth = width - halfWidth;

		// Initialize an empty array to store the image data.
		let data: (string | undefined)[] = [];

		const weights = this.calculateColorsWeights(colors.length);
		const thresholds = this.calculateThresholds(colors.length);
		console.log("Identicon | thresholds", thresholds);

		const colorsCount = Array(colors.length).fill(0);

		// Loop through each pixel row.
		for (let y = 0; y < height; y++) {
			// For each row, create a new array to store the pixel data.
			let row = [];

			for (let x = 0; x < dataWidth; x++) {
				if (symetry === "axial" || symetry === "central") {
					if (x >= halfWidth) {
						break;
					}
				}

				// With weights
				const color = this.rand.pickRandomChoice(colors, weights);

				// With thresholds
				// const r = this.rand.next();
				// // Find the appropriate color based on the random value
				// let color: string;
				// for (let i = 0; i < thresholds.length; i++) {
				// 	if (r <= thresholds[i]) {
				// 		color = colors[i];
				// 		break;
				// 	}
				// }

				row[x] = color;
				colorsCount[colors.indexOf(color)]++;
			}

			if (symetry === "axial" || symetry === "central") {
				// Create the mirror part of the row by taking the original row data, slicing it,
				// and reversing the order. This creates the mirror effect.
				const r = row.slice(0, mirrorDataWidth).reverse();
				// Combine the original row data with the mirrored data to get the full row.
				row = [...row, ...r];
			}

			data = [...data, ...row];
		}

		if (symetry === "central") {
			const halfHeight = Math.ceil(data.length / 2);
			const halfHeightData = data.slice(0, halfHeight);
			const mirrorHeight = data.length - halfHeight;
			const mirrorHeightData = data.slice(0, mirrorHeight);
			data = [...halfHeightData, ...mirrorHeightData.reverse()];
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
			textPadding
		} = this.options;

		this.imageData = this.createImageData();

		if (text) {
			// Add letter data to image data
			let textMatrix = text.split("").reduce<number[][]>(
				(acc, letter) => {
					const letterMatrix = PIXEL_3x4_LETTERS[letter.toUpperCase() as "A"];

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
				[[], [], [], []]
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
					this.rand.nextRange(3, 20)
				);
			}
		}

		return this.imageData;
	}
}
