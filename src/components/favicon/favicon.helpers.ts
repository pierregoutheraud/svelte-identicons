import { strToU8, zipSync } from "fflate";

export const MIN_FAVICON_COLORS = 2;
export const MAX_FAVICON_COLORS = 5;
export const DEFAULT_FAVICON_COLORS = 3;

export type FaviconSymetry = "axial" | "central" | "none";
export type FaviconShape = "square" | "circle";

export interface FaviconParams {
	seed: string;
	numberOfColors: number;
	colors: string[];
	symetry: FaviconSymetry;
	shape: FaviconShape;
}

export interface FaviconPngs {
	16: Uint8Array;
	32: Uint8Array;
	48: Uint8Array;
	180: Uint8Array;
	512: Uint8Array;
}

export interface IcoImage {
	size: number;
	data: Uint8Array;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SYMETRIES: FaviconSymetry[] = ["axial", "central", "none"];
const SHAPES: FaviconShape[] = ["square", "circle"];

export function parseFaviconParams(
	search: URLSearchParams,
	generateSeed: () => string
): FaviconParams {
	const rawColors = (search.get("colors") || "")
		.split(",")
		.map((color) => color.trim())
		.filter((color) => HEX_COLOR.test(color))
		.slice(0, MAX_FAVICON_COLORS);
	const colors =
		rawColors.length >= MIN_FAVICON_COLORS ? rawColors : ([] as string[]);

	return {
		// An explicit empty seed is kept invalid so a shared URL represents the
		// same screen. Only a missing parameter gets a generated default.
		seed: search.has("seed") ? (search.get("seed") ?? "") : generateSeed(),
		numberOfColors: clampColorCount(search.get("numberOfColors")),
		colors,
		symetry: allowedValue(search.get("symetry"), SYMETRIES, "axial"),
		shape: allowedValue(search.get("shape"), SHAPES, "square")
	};
}

export function serializeFaviconParams(params: FaviconParams): string {
	const search = new URLSearchParams({
		seed: params.seed,
		numberOfColors: String(
			Math.min(
				MAX_FAVICON_COLORS,
				Math.max(MIN_FAVICON_COLORS, params.numberOfColors)
			)
		),
		colors: params.colors.slice(0, MAX_FAVICON_COLORS).join(","),
		symetry: params.symetry,
		shape: params.shape
	});

	return `?${search.toString()}`;
}

export function sameColors(left: string[], right: string[]): boolean {
	return (
		left.length === right.length &&
		left.every((color, index) => color === right[index])
	);
}

export function sanitizeSeed(seed: string): string {
	return (
		seed
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48) || "favicon"
	);
}

export function buildIco(images: IcoImage[]): Uint8Array {
	if (!images.length) {
		throw new Error("An ICO file needs at least one image.");
	}

	for (const image of images) {
		if (
			!Number.isInteger(image.size) ||
			image.size < 1 ||
			image.size > 256 ||
			!image.data.length
		) {
			throw new Error("ICO images must be non-empty and between 1 and 256px.");
		}
	}

	const headerSize = 6;
	const entrySize = 16;
	const dataOffset = headerSize + entrySize * images.length;
	const dataSize = images.reduce(
		(total, image) => total + image.data.length,
		0
	);
	const result = new Uint8Array(dataOffset + dataSize);
	const view = new DataView(result.buffer);

	view.setUint16(0, 0, true);
	view.setUint16(2, 1, true);
	view.setUint16(4, images.length, true);

	let imageOffset = dataOffset;
	images.forEach((image, index) => {
		const entryOffset = headerSize + index * entrySize;
		const encodedSize = image.size === 256 ? 0 : image.size;

		view.setUint8(entryOffset, encodedSize);
		view.setUint8(entryOffset + 1, encodedSize);
		view.setUint8(entryOffset + 2, 0);
		view.setUint8(entryOffset + 3, 0);
		view.setUint16(entryOffset + 4, 1, true);
		view.setUint16(entryOffset + 6, 32, true);
		view.setUint32(entryOffset + 8, image.data.length, true);
		view.setUint32(entryOffset + 12, imageOffset, true);
		result.set(image.data, imageOffset);
		imageOffset += image.data.length;
	});

	return result;
}

export function faviconReadme(): string {
	return `FAVICON INSTALLATION

Copy the image files to your site's public root, then add these lines inside <head>:

<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">

icon-512x512.png is included for platforms or profiles that request a large square icon.
`;
}

export function createFaviconArchive(pngs: FaviconPngs): Uint8Array {
	const ico = buildIco([
		{ size: 16, data: pngs[16] },
		{ size: 32, data: pngs[32] },
		{ size: 48, data: pngs[48] }
	]);

	return zipSync(
		{
			"favicon.ico": [ico, { level: 0 }],
			"favicon-16x16.png": [pngs[16], { level: 0 }],
			"favicon-32x32.png": [pngs[32], { level: 0 }],
			"apple-touch-icon.png": [pngs[180], { level: 0 }],
			"icon-512x512.png": [pngs[512], { level: 0 }],
			"README.txt": strToU8(faviconReadme())
		},
		{ level: 6 }
	);
}

export async function renderFaviconPngs(
	masterCanvas: HTMLCanvasElement
): Promise<FaviconPngs> {
	const sizes = [16, 32, 48, 180, 512] as const;
	const entries = await Promise.all(
		sizes.map(
			async (size) => [size, await resizeCanvas(masterCanvas, size)] as const
		)
	);

	return Object.fromEntries(entries) as unknown as FaviconPngs;
}

async function resizeCanvas(
	masterCanvas: HTMLCanvasElement,
	size: number
): Promise<Uint8Array> {
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext("2d");

	if (!context) {
		throw new Error("This browser cannot create a 2D canvas.");
	}

	context.imageSmoothingEnabled = false;
	context.drawImage(masterCanvas, 0, 0, size, size);

	const blob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, "image/png");
	});

	if (!blob) {
		throw new Error("This browser could not encode the favicon as PNG.");
	}

	return new Uint8Array(await blob.arrayBuffer());
}

function clampColorCount(raw: string | null): number {
	const parsed = Number.parseInt(raw || "", 10);
	if (!Number.isFinite(parsed)) return DEFAULT_FAVICON_COLORS;
	return Math.min(MAX_FAVICON_COLORS, Math.max(MIN_FAVICON_COLORS, parsed));
}

function allowedValue<T extends string>(
	value: string | null,
	allowed: readonly T[],
	fallback: T
): T {
	return allowed.includes(value as T) ? (value as T) : fallback;
}
