import { PIXEL_3x4_LETTERS } from '$lib/constants/pixel-letters.js';
import { Random } from '../../helpers/Random.js';

export interface IdenticonOptions {
	seed?: string; // seed used to generate icon data, default: random
	colors?: string[]; // array of colors
	height: number; // width/height of the icon in blocks, default: 10
	width: number; // width/height of the icon in blocks, default: 10
	pixelSize?: number; // width/height of each block in pixels, default: 5
	shape?: 'circle' | 'square';
	numberOfColors?: number;
	textBackgroundColor?: string;
	textColor?: string;
	symetry?: 'axial' | 'central' | 'none';
	text?: string;
	textPadding?: number;
	textPosition?:
		| 'top-center'
		| 'top-left'
		| 'top-right'
		| 'bottom-center'
		| 'bottom-left'
		| 'bottom-right'
		| 'center';
}

export default class Identicon {
	canvas: HTMLCanvasElement;
	options: Required<Omit<IdenticonOptions, 'textBackgroundColor' | 'text'>> & {
		textBackgroundColor?: string;
		text?: string;
	};
	rand: Random;
	public imageData: (string | undefined)[] = [];
	LETTER_PADDING_COLOR: string | undefined;
	LETTER_COLOR = '#fff';
	backgroundColor: string;

	constructor(canvas: HTMLCanvasElement, options: IdenticonOptions) {
		this.canvas = canvas;

		const seed = options.seed || Math.floor(Math.random() * Math.pow(10, 16)).toString(16);
		this.rand = new Random(seed);

		const numberOfColors = options.numberOfColors || 1;

		const defaultColors = [...new Array(numberOfColors)].map(() =>
			this.hslToString(this.createHslColor())
		);
		const colors = options.colors?.length ? options.colors : defaultColors;

		this.backgroundColor = colors[0];

		this.options = {
			pixelSize: 4,
			shape: 'square',
			textColor: '#fff',
			textBackgroundColor: undefined,
			symetry: 'axial',
			textPosition: 'bottom-right',
			textPadding: 1,
			...options,
			text: options.text?.trim() || undefined,
			numberOfColors: colors.length,
			colors,
			seed
		};

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
		const l = (this.rand.next() + this.rand.next() + this.rand.next() + this.rand.next()) * 25;

		return [h, s, l];
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

		// if 3 colors, probabilities will be:
		// 100 * 0.6 -> 60
		// 40 * 0.6 -> 24
		// Last value the rest (100 - (60+24)) = 16
		let n = 100;
		const probabilities = [...new Array(colors.length)]
			.reduce((acc, color, i) => {
				if (i === colors.length - 1) {
					return [...acc, n];
				}
				const p = n * 0.6;
				n -= p;
				return [...acc, p];
			}, [])
			// We start from the smallest probability
			.reverse();

		// Loop through each pixel row.
		for (let y = 0; y < height; y++) {
			// For each row, create a new array to store the pixel data.
			let row = [];

			for (let x = 0; x < dataWidth; x++) {
				if (symetry === 'axial' || symetry === 'central') {
					if (x >= halfWidth) {
						break;
					}
				}

				let color = undefined;

				for (let i = 0; i < colors.length; i++) {
					const proba = probabilities[i];
					color = colors[colors.length - 1 - i];
					if (this.rand.next() * 100 < proba) {
						break;
					}
				}

				row[x] = color;
			}

			if (symetry === 'axial' || symetry === 'central') {
				// Create the mirror part of the row by taking the original row data, slicing it,
				// and reversing the order. This creates the mirror effect.
				const r = row.slice(0, mirrorDataWidth).reverse();
				// Combine the original row data with the mirrored data to get the full row.
				row = [...row, ...r];
			}

			data = [...data, ...row];
		}

		if (symetry === 'central') {
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
			case 'top-left':
				top = 0;
				left = 0;
				break;
			case 'top-right':
				top = 0;
				left = width - textMatrix[0].length;
				break;
			case 'top-center':
				top = 0;
				left = Math.floor((width - textMatrix[0].length) / 2);
				break;
			case 'bottom-left':
				top = height - textMatrix.length;
				left = 0;
				break;
			case 'bottom-center':
				top = height - textMatrix.length;
				left = Math.floor((width - textMatrix[0].length) / 2);
				break;
			case 'bottom-right':
				top = height - textMatrix.length;
				left = width - textMatrix[0].length;
				break;
			case 'center':
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
			let textMatrix = text.split('').reduce<number[][]>(
				(acc, letter) => {
					const letterMatrix = PIXEL_3x4_LETTERS[letter.toUpperCase() as 'A'];

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
						if (textBackgroundColor) {
							this.imageData[imageDataIndex] =
								textBackgroundColor === 'main' ? colors[0] : textBackgroundColor;
						}
					} else {
						this.imageData[imageDataIndex] = textColor;
					}
				}
			}
		}

		this.canvas.width = width * pixelSize;
		this.canvas.height = height * pixelSize;

		const cc = this.canvas.getContext('2d');

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

			if (shape === 'square') {
				// Draw a square
				cc.fillRect(col * pixelSize, row * pixelSize, pixelSize, pixelSize);
			} else if (shape === 'circle') {
				// Draw a circle
				cc.beginPath();
				cc.arc(
					col * pixelSize + pixelSize / 2,
					row * pixelSize + pixelSize / 2,
					pixelSize / 2,
					0,
					2 * Math.PI
				);
				cc.fill();
			}
		}

		return this.imageData;
	}
}
