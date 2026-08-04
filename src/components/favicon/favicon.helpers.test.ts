import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
	buildIco,
	createFaviconArchive,
	faviconReadme,
	parseFaviconParams,
	sanitizeSeed,
	serializeFaviconParams,
	type FaviconPngs
} from "./favicon.helpers.js";

const DEFAULT_SEED = () => "default-seed";

function fakePng(size: number): Uint8Array {
	return new Uint8Array([137, 80, 78, 71, size, size + 1]);
}

function fakePngs(): FaviconPngs {
	return {
		16: fakePng(16),
		32: fakePng(32),
		48: fakePng(48),
		180: fakePng(180),
		512: fakePng(255)
	};
}

describe("favicon params", () => {
	it("uses focused defaults when no query is present", () => {
		expect(parseFaviconParams(new URLSearchParams(), DEFAULT_SEED)).toEqual({
			seed: "default-seed",
			numberOfColors: 3,
			colors: [],
			symetry: "axial",
			shape: "square"
		});
	});

	it("round-trips every setting", () => {
		const params = {
			seed: "eventual-mango",
			numberOfColors: 4,
			colors: ["#112233", "#445566", "#778899", "#abcdef"],
			symetry: "central" as const,
			shape: "circle" as const
		};

		expect(
			parseFaviconParams(
				new URLSearchParams(serializeFaviconParams(params)),
				DEFAULT_SEED
			)
		).toEqual(params);
	});

	it("keeps an explicit empty seed invalid", () => {
		const parsed = parseFaviconParams(
			new URLSearchParams("seed="),
			DEFAULT_SEED
		);

		expect(parsed.seed).toBe("");
	});

	it("normalizes malformed options and incomplete palettes", () => {
		const parsed = parseFaviconParams(
			new URLSearchParams(
				"numberOfColors=nope&colors=%23abcdef,invalid&symetry=mirror&shape=triangle"
			),
			DEFAULT_SEED
		);

		expect(parsed).toEqual({
			seed: "default-seed",
			numberOfColors: 3,
			colors: [],
			symetry: "axial",
			shape: "square"
		});
	});

	it("clamps color counts and retains at most five valid colors", () => {
		const parsed = parseFaviconParams(
			new URLSearchParams({
				numberOfColors: "99",
				colors: [
					"#000000",
					"#111111",
					"#222222",
					"#333333",
					"#444444",
					"#555555"
				].join(",")
			}),
			DEFAULT_SEED
		);

		expect(parsed.numberOfColors).toBe(5);
		expect(parsed.colors).toEqual([
			"#000000",
			"#111111",
			"#222222",
			"#333333",
			"#444444"
		]);
	});

	it("sanitizes seeds for download filenames", () => {
		expect(sanitizeSeed("  My favorite / icon!  ")).toBe("my-favorite-icon");
		expect(sanitizeSeed("***")).toBe("favicon");
	});
});

describe("buildIco", () => {
	it("writes valid directory entries and image offsets", () => {
		const images = [
			{ size: 16, data: fakePng(16) },
			{ size: 32, data: fakePng(32) },
			{ size: 48, data: fakePng(48) }
		];
		const ico = buildIco(images);
		const view = new DataView(ico.buffer);

		expect(view.getUint16(0, true)).toBe(0);
		expect(view.getUint16(2, true)).toBe(1);
		expect(view.getUint16(4, true)).toBe(3);

		let expectedOffset = 6 + 16 * images.length;
		images.forEach((image, index) => {
			const entryOffset = 6 + index * 16;
			expect(view.getUint8(entryOffset)).toBe(image.size);
			expect(view.getUint8(entryOffset + 1)).toBe(image.size);
			expect(view.getUint16(entryOffset + 4, true)).toBe(1);
			expect(view.getUint16(entryOffset + 6, true)).toBe(32);
			expect(view.getUint32(entryOffset + 8, true)).toBe(image.data.length);
			expect(view.getUint32(entryOffset + 12, true)).toBe(expectedOffset);
			expect(
				ico.slice(expectedOffset, expectedOffset + image.data.length)
			).toEqual(image.data);
			expectedOffset += image.data.length;
		});
	});

	it("rejects empty or invalid image sets", () => {
		expect(() => buildIco([])).toThrow("at least one image");
		expect(() => buildIco([{ size: 0, data: fakePng(1) }])).toThrow(
			"between 1 and 256px"
		);
	});
});

describe("createFaviconArchive", () => {
	it("contains every browser asset and installation instructions", () => {
		const files = unzipSync(createFaviconArchive(fakePngs()));

		expect(Object.keys(files).sort()).toEqual(
			[
				"README.txt",
				"apple-touch-icon.png",
				"favicon-16x16.png",
				"favicon-32x32.png",
				"favicon.ico",
				"icon-512x512.png"
			].sort()
		);
		expect(files["favicon-16x16.png"]).toEqual(fakePng(16));
		expect(strFromU8(files["README.txt"])).toBe(faviconReadme());
		expect(strFromU8(files["README.txt"])).toContain(
			'<link rel="apple-touch-icon" sizes="180x180"'
		);
	});
});
