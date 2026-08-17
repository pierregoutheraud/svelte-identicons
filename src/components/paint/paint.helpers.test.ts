import { describe, expect, it } from "vitest";
import {
	buildPalette,
	buildTapePattern,
	colorCells,
	CUSTOM_PALETTE_STORAGE_KEY,
	createStubCanvas,
	effectiveColorCount,
	extractGrid,
	formatCell,
	generatePaintColorCombination,
	layoutKey,
	measure,
	parsePaintPaletteInput,
	parsePaintParams,
	parsePaintSurfaceParams,
	parseStoredPaintPalette,
	productionShareUrl,
	remapSelectedPaintColors,
	selectPaintColors,
	serializePaintParams,
	type PaintParams,
	type PaintSurfaceParams
} from "./paint.helpers.js";

const BASE: PaintParams = {
	seed: "eventual-mango",
	combinationSeed: "eventual-mango",
	width: 30,
	height: 30,
	symetry: "axial",
	symetryAxis: "gap",
	tileSize: 5,
	numberOfColors: 3,
	colorSource: "seed",
	colors: [],
	selectedColorIndices: [],
	text: "",
	textColor: "#ffffff",
	textPosition: "bottom-right",
	textFont: "3x4",
	pixelSize: 10
};

function grid(params: Partial<PaintParams> = {}) {
	return extractGrid({ ...BASE, ...params }, createStubCanvas()).grid;
}

// The grid pattern independent of which hex sits in each slot.
function pattern(colors: string[], cells: string[]) {
	return cells.map((cell) => colors.indexOf(cell));
}

describe("bulk custom-palette import", () => {
	it("uses a versioned local-storage key", () => {
		expect(CUSTOM_PALETTE_STORAGE_KEY).toBe("paint:custom-palette:v1");
	});

	it("parses the example palette in order and normalizes its case", () => {
		expect(
			parsePaintPaletteInput(`#CFBC9D
#7F0E43
#4DB5AF
#433175
#1F1F22
#A9192D`)
		).toEqual({
			colors: [
				"#CFBC9D",
				"#7F0E43",
				"#4DB5AF",
				"#433175",
				"#1F1F22",
				"#A9192D"
			],
			invalidTokens: [],
			duplicateCount: 0
		});
	});

	it("accepts whitespace, commas, and semicolons", () => {
		expect(
			parsePaintPaletteInput("#aabbcc #112233,\n#445566;\t#778899").colors
		).toEqual(["#AABBCC", "#112233", "#445566", "#778899"]);
	});

	it("reports invalid tokens and case-insensitive duplicates", () => {
		expect(
			parsePaintPaletteInput("#abcdef, nope; #ABCDEF #12345 #123456")
		).toEqual({
			colors: ["#ABCDEF", "#123456"],
			invalidTokens: ["nope", "#12345"],
			duplicateCount: 1
		});
	});

	it("returns no colors when every token is invalid", () => {
		expect(parsePaintPaletteInput("red #fff 112233")).toEqual({
			colors: [],
			invalidTokens: ["red", "#fff", "112233"],
			duplicateCount: 0
		});
	});

	it("recovers valid colors from local storage", () => {
		expect(
			parseStoredPaintPalette(
				JSON.stringify(["#aabbcc", "invalid", "#AABBCC", "#123456", 42])
			)
		).toEqual(["#AABBCC", "#123456"]);
	});

	it("ignores corrupt or non-array local-storage payloads", () => {
		expect(parseStoredPaintPalette("not json")).toEqual([]);
		expect(
			parseStoredPaintPalette(JSON.stringify({ color: "#123456" }))
		).toEqual([]);
		expect(parseStoredPaintPalette(null)).toEqual([]);
	});

	it("preserves matching selections in their previous order", () => {
		expect(
			remapSelectedPaintColors(
				{
					colors: ["#aa0000", "#00BB00", "#0000cc", "#ffffff"],
					selectedColorIndices: [2, 0, 1, 3]
				},
				["#00bb00", "#0000CC", "#123456", "#AA0000"]
			)
		).toEqual([1, 3, 0]);
	});

	it("maps a duplicated selected hex only once", () => {
		expect(
			remapSelectedPaintColors(
				{
					colors: ["#ABCDEF", "#abcdef", "#123456"],
					selectedColorIndices: [1, 0, 2]
				},
				["#ABCDEF", "#654321"]
			)
		).toEqual([0]);
	});
});

describe("extractGrid", () => {
	it("is deterministic for the same params", () => {
		expect(grid()).toEqual(grid());
	});

	it("fills every cell of the grid", () => {
		const cells = grid();
		expect(cells).toHaveLength(900);
		expect(cells.every((c) => typeof c === "string" && c.length > 0)).toBe(
			true
		);
	});

	it("produces the same layout when only the hex values change", () => {
		// This is the assumption behind "use the paints you already own": you can
		// swap the palette for real tube colors without moving a single cell.
		const mine = ["#f4f2ec", "#c4452a", "#1b3a5c"];
		const theirs = ["#000000", "#123456", "#abcdef"];

		expect(
			pattern(
				mine,
				grid({
					colorSource: "custom",
					colors: mine,
					selectedColorIndices: [0, 1, 2]
				})
			)
		).toEqual(
			pattern(
				theirs,
				grid({
					colorSource: "custom",
					colors: theirs,
					selectedColorIndices: [0, 1, 2]
				})
			)
		);
	});

	it("changes the layout when the number of generated colors changes", () => {
		// With no explicit palette, numberOfColors decides how many colours exist,
		// and the palette size remaps value -> colour through the weights.
		expect(grid({ numberOfColors: 2 })).not.toEqual(
			grid({ numberOfColors: 3 })
		);
	});

	it("uses the explicitly selected colors from a larger owned palette", () => {
		const colors = ["#111111", "#222222", "#333333", "#444444", "#555555"];
		const two = extractGrid(
			{
				...BASE,
				colorSource: "custom",
				colors,
				selectedColorIndices: [1, 3]
			},
			createStubCanvas()
		);
		const three = extractGrid(
			{
				...BASE,
				colorSource: "custom",
				colors,
				selectedColorIndices: [1, 3, 4]
			},
			createStubCanvas()
		);

		expect(two.colors).toHaveLength(2);
		expect(two.colors.every((color) => colors.includes(color))).toBe(true);
		expect(three.colors).toHaveLength(3);
		expect(two.grid).not.toEqual(three.grid);
	});

	it("returns an empty pattern for an empty custom selection", () => {
		const extraction = extractGrid(
			{
				...BASE,
				colorSource: "custom",
				colors: ["#111111", "#222222"],
				selectedColorIndices: []
			},
			createStubCanvas()
		);

		expect(extraction).toEqual({
			grid: [],
			cellIds: [],
			backgroundColor: "transparent",
			colors: []
		});
	});

	it("resolves an empty textColor to the background instead of an empty cell", () => {
		const cells = grid({ text: "ab", textColor: "" });
		expect(cells.every((c) => c.length > 0)).toBe(true);
	});

	it("draws a different overlay for each pixel font", () => {
		const wide = grid({ text: "ab", textFont: "3x4" });
		const small = grid({ text: "ab", textFont: "3x3" });

		expect(small).not.toEqual(wide);
		// The overlay only overwrites cells, so both must still be complete grids
		// of the same size: the 3-row font must not leave holes.
		expect(small).toHaveLength(wide.length);
		expect(small.every((c) => typeof c === "string" && c.length > 0)).toBe(
			true
		);
	});

	it("keeps the underlying pattern identical when only the font changes", () => {
		// The overlay never consumes the PRNG, so everything outside the letters
		// must be untouched.
		const plain = grid({ text: "" });
		const small = grid({ text: "ab", textFont: "3x3" });
		const changed = plain.filter((c, i) => c !== small[i]).length;

		expect(changed).toBeGreaterThan(0);
		expect(changed).toBeLessThan(plain.length);
	});

	it("drops characters the 3x3 font does not have", () => {
		// 3x3 is A-Z only; 3x4 also has digits.
		expect(grid({ text: "a1", textFont: "3x3" })).toEqual(
			grid({ text: "a", textFont: "3x3" })
		);
		expect(grid({ text: "a1", textFont: "3x4" })).not.toEqual(
			grid({ text: "a", textFont: "3x4" })
		);
	});

	it("reproduces the same grid when the generated palette is fed back in", () => {
		// What "edit the palette" does: freeze the generated colors into editable
		// slots. It has to be a no-op for the pattern, and it only is because the
		// colors come back in engine order.
		const generated = extractGrid(BASE, createStubCanvas());
		const frozen = extractGrid(
			{
				...BASE,
				colorSource: "custom",
				colors: generated.colors,
				selectedColorIndices: generated.colors.map((_, index) => index)
			},
			createStubCanvas()
		);

		expect(frozen.grid).toEqual(generated.grid);
		expect(frozen.backgroundColor).toBe(generated.backgroundColor);
	});

	it("does not reproduce the grid if the palette is re-ordered", () => {
		// Guards the mistake of handing back buildPalette's display order.
		const generated = extractGrid(BASE, createStubCanvas());
		const shuffled = extractGrid(
			{
				...BASE,
				colorSource: "custom",
				colors: [...generated.colors].reverse(),
				selectedColorIndices: generated.colors.map((_, index) => index)
			},
			createStubCanvas()
		);

		expect(shuffled.grid).not.toEqual(generated.grid);
	});
});

describe("custom paint selection", () => {
	const colors = ["#111111", "#222222", "#333333", "#444444", "#555555"];

	it("generates one stable combination without duplicates", () => {
		const params = { ...BASE, numberOfColors: 3, colors };
		const selected = generatePaintColorCombination(params);

		expect(selected).toEqual(generatePaintColorCombination(params));
		expect(selected).toHaveLength(3);
		expect(new Set(selected.map((paint) => paint.sourceIndex)).size).toBe(3);
		expect(selected.every((paint) => colors.includes(paint.color))).toBe(true);
	});

	it("bases the choice on palette positions, not editable hex values", () => {
		const before = generatePaintColorCombination({
			...BASE,
			numberOfColors: 2,
			colors
		});
		const edited = colors.map((_, index) => `#00000${index}`);
		const after = generatePaintColorCombination({
			...BASE,
			numberOfColors: 2,
			colors: edited
		});

		expect(after.map((paint) => paint.sourceIndex)).toEqual(
			before.map((paint) => paint.sourceIndex)
		);
	});

	it("keeps the original order when the whole palette is used", () => {
		expect(
			generatePaintColorCombination({
				...BASE,
				numberOfColors: colors.length,
				colors
			})
		).toEqual(colors.map((color, sourceIndex) => ({ color, sourceIndex })));
	});

	it("uses an explicit manual selection in the chosen order", () => {
		expect(
			selectPaintColors({
				...BASE,
				colorSource: "custom",
				colors,
				selectedColorIndices: [4, 1]
			})
		).toEqual([
			{ color: colors[4], sourceIndex: 4 },
			{ color: colors[1], sourceIndex: 1 }
		]);
	});

	it("allows every custom paint to be unselected", () => {
		expect(
			selectPaintColors({
				...BASE,
				colorSource: "custom",
				colors,
				selectedColorIndices: []
			})
		).toEqual([]);
	});

	it("ignores the saved custom selection while seed colors are active", () => {
		expect(
			selectPaintColors({
				...BASE,
				colorSource: "seed",
				colors,
				selectedColorIndices: [4, 1]
			})
		).toEqual([]);
	});

	it("allows different combination seeds to choose different combinations", () => {
		const combinations = ["alpha", "bravo", "charlie", "delta"].map(
			(combinationSeed) =>
				generatePaintColorCombination({
					...BASE,
					combinationSeed,
					numberOfColors: 2,
					colors
				})
					.map((paint) => paint.sourceIndex)
					.sort((a, b) => a - b)
					.join(",")
		);

		expect(new Set(combinations).size).toBeGreaterThan(1);
	});

	it("does not change the combination when only the pattern seed changes", () => {
		const params: PaintParams = { ...BASE, numberOfColors: 2, colors };
		const anotherPattern: PaintParams = {
			...params,
			seed: "another-pattern"
		};

		expect(generatePaintColorCombination(anotherPattern)).toEqual(
			generatePaintColorCombination(params)
		);
	});
});

describe("serializePaintParams / parsePaintParams", () => {
	it("builds share links with the production origin", () => {
		expect(
			productionShareUrl(
				new URL("http://127.0.0.1:5192/paint?seed=abc&width=16#preview")
			)
		).toBe(
			"https://svelte-identicons.vercel.app/paint?seed=abc&width=16#preview"
		);
	});

	it("round-trips physical square and canvas settings", () => {
		const surface: PaintSurfaceParams = {
			squareCm: 1.25,
			canvasWidthCm: 42.5,
			canvasHeightCm: 59.4,
			canvasColor: "#203040",
			tapeWidthCm: 1.9
		};
		const search = new URLSearchParams(serializePaintParams(BASE, surface));

		expect(parsePaintSurfaceParams(search)).toEqual(surface);
	});

	it("uses safe defaults for invalid physical settings", () => {
		const parsed = parsePaintSurfaceParams(
			new URLSearchParams(
				"?squareCm=0&canvasWidthCm=nope&canvasHeightCm=-1&canvasColor=red&tapeWidthCm=0"
			)
		);

		expect(parsed).toEqual({
			squareCm: 2.5,
			canvasWidthCm: 40,
			canvasHeightCm: 40,
			canvasColor: "#ffffff",
			tapeWidthCm: 2.5
		});
	});

	it("defaults tape to 2.5 cm and preserves widths smaller than a square", () => {
		expect(
			parsePaintSurfaceParams(new URLSearchParams("?squareCm=4")).tapeWidthCm
		).toBe(2.5);
		expect(
			parsePaintSurfaceParams(
				new URLSearchParams("?squareCm=4&tapeWidthCm=1.5")
			).tapeWidthCm
		).toBe(1.5);
	});

	it("round-trips every parameter available on the playground", () => {
		const params: PaintParams = {
			seed: "all-options",
			combinationSeed: "color-options",
			width: 17,
			height: 19,
			symetry: "tile",
			symetryAxis: "column",
			tileSize: 7,
			numberOfColors: 4,
			colorSource: "custom",
			colors: ["#112233", "#445566", "#778899", "#aabbcc"],
			selectedColorIndices: [3, 1, 2, 0],
			text: "Codex 5",
			textColor: "#fedcba",
			textPosition: "top-left",
			textFont: "3x3",
			pixelSize: 13
		};

		expect(
			parsePaintParams(new URLSearchParams(serializePaintParams(params)))
		).toEqual(params);
	});

	it("round-trips a params set whose color count disagrees with numberOfColors", () => {
		const params: PaintParams = {
			...BASE,
			numberOfColors: 2,
			colors: ["#111111", "#222222", "#333333"]
		};

		const parsed = parsePaintParams(
			new URLSearchParams(serializePaintParams(params))
		);

		expect(parsed).toEqual(params);
		expect(extractGrid(parsed, createStubCanvas()).grid).toEqual(
			extractGrid(params, createStubCanvas()).grid
		);
	});

	it("uses every custom color for legacy links with a blank count", () => {
		const parsed = parsePaintParams(
			new URLSearchParams(
				"colors=%23111111,%23222222,%23333333&numberOfColors="
			)
		);

		expect(parsed.numberOfColors).toBe(3);
		expect(parsed.colorSource).toBe("custom");
		expect(parsed.combinationSeed).toBe(parsed.seed);
		expect(parsed.selectedColorIndices).toEqual([0, 1, 2]);
		expect(extractGrid(parsed, createStubCanvas()).colors).toHaveLength(3);
	});

	it("preserves the seed color count independently of the custom palette", () => {
		const parsed = parsePaintParams(
			new URLSearchParams(
				"colors=%23111111,%23222222,%23333333&numberOfColors=8"
			)
		);

		expect(parsed.numberOfColors).toBe(8);
		expect(parsed.selectedColorIndices).toHaveLength(3);
	});

	it("round-trips a custom palette with every paint unselected", () => {
		const params: PaintParams = {
			...BASE,
			colorSource: "custom",
			colors: ["#111111", "#222222"],
			selectedColorIndices: []
		};
		const parsed = parsePaintParams(
			new URLSearchParams(serializePaintParams(params))
		);

		expect(parsed).toEqual(params);
		expect(extractGrid(parsed, createStubCanvas()).grid).toEqual([]);
	});

	it("normalises an invalid requested color count", () => {
		const params: PaintParams = {
			...BASE,
			numberOfColors: NaN,
			colors: ["#fff"]
		};
		const parsed = parsePaintParams(
			new URLSearchParams(serializePaintParams(params))
		);

		expect(parsed.numberOfColors).toBe(1);
		expect(extractGrid(parsed, createStubCanvas()).grid).toEqual(
			extractGrid(params, createStubCanvas()).grid
		);
	});

	it("defaults to a 16x16 grid", () => {
		const parsed = parsePaintParams(new URLSearchParams("?seed=abc"));
		expect(parsed.width).toBe(16);
		expect(parsed.height).toBe(16);
	});
});

describe("layoutKey", () => {
	it("separates the two pixel fonts", () => {
		// Different squares to paint, so progress must not carry across.
		expect(layoutKey({ ...BASE, text: "ab", textFont: "3x3" })).not.toBe(
			layoutKey({ ...BASE, text: "ab", textFont: "3x4" })
		);
	});

	it("ignores a saved custom palette while seed colors are active", () => {
		const two = ["#000000", "#ffffff"];
		const twoOther = ["#123456", "#abcdef"];

		expect(layoutKey({ ...BASE, colors: two })).toBe(
			layoutKey({ ...BASE, colors: twoOther })
		);
		expect(layoutKey({ ...BASE, colors: two })).toBe(
			layoutKey({ ...BASE, colors: [...two, "#ff0000"] })
		);
		expect(layoutKey({ ...BASE, numberOfColors: 2 })).not.toBe(
			layoutKey({ ...BASE, numberOfColors: 3 })
		);
	});

	it("ignores unused paints but tracks the custom selection size", () => {
		const fullPalette = ["#111111", "#222222", "#333333", "#444444", "#555555"];
		const withAnotherPaint = [...fullPalette, "#666666"];
		const customPair = {
			...BASE,
			colorSource: "custom" as const,
			selectedColorIndices: [0, 1]
		};

		expect(layoutKey({ ...customPair, colors: fullPalette })).toBe(
			layoutKey({ ...customPair, colors: withAnotherPaint })
		);
		expect(layoutKey({ ...customPair, colors: fullPalette })).not.toBe(
			layoutKey({
				...customPair,
				colors: fullPalette,
				selectedColorIndices: [0, 1, 2]
			})
		);
		expect(
			effectiveColorCount({
				...customPair,
				numberOfColors: 8,
				colors: fullPalette
			})
		).toBe(2);
	});

	it("ignores the combination seed because it does not move cells", () => {
		expect(layoutKey(BASE)).toBe(
			layoutKey({ ...BASE, combinationSeed: "another-combination" })
		);
	});

	it("tracks manual selection size but not which paints are selected", () => {
		const colors = ["#111111", "#222222", "#333333", "#444444"];
		const firstPair = {
			...BASE,
			colorSource: "custom" as const,
			colors,
			selectedColorIndices: [0, 1]
		};

		expect(layoutKey(firstPair)).toBe(
			layoutKey({ ...firstPair, selectedColorIndices: [2, 3] })
		);
		expect(layoutKey(firstPair)).not.toBe(
			layoutKey({ ...firstPair, selectedColorIndices: [0, 1, 2] })
		);
	});

	it("treats a generated palette and the same palette made editable as one pattern", () => {
		// Freezing the generated colors into slots must not wipe your progress.
		const generated: PaintParams = { ...BASE, numberOfColors: 3, colors: [] };
		const frozen: PaintParams = {
			...generated,
			colorSource: "custom",
			colors: extractGrid(generated, createStubCanvas()).colors,
			selectedColorIndices: [0, 1, 2]
		};

		expect(layoutKey(frozen)).toBe(layoutKey(generated));
	});
});

describe("buildPalette", () => {
	it("counts every cell and puts the base coat first", () => {
		const extraction = extractGrid(BASE, createStubCanvas());
		const palette = buildPalette(extraction.grid, extraction.cellIds);

		expect(palette.reduce((acc, p) => acc + p.count, 0)).toBe(
			extraction.grid.length
		);
		expect(palette[0].isBase).toBe(true);
		expect(palette[0].color).toBe(extraction.backgroundColor);
		expect(palette.filter((p) => p.isBase)).toHaveLength(1);
		expect(palette.map((p) => p.label).slice(0, 3)).toEqual(["A", "B", "C"]);
	});

	it("leaves most of the grid unpainted, since the base coat covers it", () => {
		const extraction = extractGrid(BASE, createStubCanvas());
		const palette = buildPalette(extraction.grid, extraction.cellIds);
		const toPaint = palette
			.filter((p) => !p.isBase)
			.reduce((acc, p) => acc + p.count, 0);

		// Geometric weights give colors[0] 0.5/0.875 of a 3-color grid.
		expect(toPaint).toBeLessThan(extraction.grid.length / 2);
	});

	it("orders the non-base colors by descending count", () => {
		const extraction = extractGrid(BASE, createStubCanvas());
		const counts = buildPalette(extraction.grid, extraction.cellIds)
			.filter((p) => !p.isBase)
			.map((p) => p.count);

		expect([...counts].sort((a, b) => b - a)).toEqual(counts);
	});

	it("keeps duplicate hex values as separate paint slots", () => {
		const duplicate = "#aabbcc";
		const extraction = extractGrid(
			{
				...BASE,
				colorSource: "custom",
				colors: [duplicate, duplicate, "#112233"],
				selectedColorIndices: [0, 1, 2]
			},
			createStubCanvas()
		);
		const matching = buildPalette(extraction.grid, extraction.cellIds).filter(
			(entry) => entry.color === duplicate
		);

		expect(matching).toHaveLength(2);
		expect(matching.map((entry) => entry.sourceIndex).sort()).toEqual([0, 1]);
		expect(matching.every((entry) => entry.count > 0)).toBe(true);
		expect(matching[0].id).not.toBe(matching[1].id);
	});
});

describe("colorCells", () => {
	it("lists squares in reading order with 1-indexed coordinates", () => {
		// prettier-ignore
		const cells = [
			"a", "a", "b", "a",
			"b", "b", "b", "b"
		];

		expect(colorCells(cells, 4, "a")).toEqual([
			{ index: 0, row: 1, column: 1 },
			{ index: 1, row: 1, column: 2 },
			{ index: 3, row: 1, column: 4 }
		]);
		expect(colorCells(cells, 4, "b")).toEqual([
			{ index: 2, row: 1, column: 3 },
			{ index: 4, row: 2, column: 1 },
			{ index: 5, row: 2, column: 2 },
			{ index: 6, row: 2, column: 3 },
			{ index: 7, row: 2, column: 4 }
		]);
	});

	it("covers every cell exactly once across the whole palette", () => {
		const extraction = extractGrid(BASE, createStubCanvas());
		const palette = buildPalette(extraction.grid, extraction.cellIds);
		const rebuilt: string[] = new Array(extraction.grid.length).fill("");

		for (const entry of palette) {
			const steps = colorCells(extraction.cellIds, BASE.width, entry.id);
			expect(steps).toHaveLength(entry.count);

			for (const step of steps) {
				// The coordinates must agree with the index they claim to describe.
				expect(step.index).toBe(
					(step.row - 1) * BASE.width + (step.column - 1)
				);
				rebuilt[step.index] = entry.color;
			}
		}

		expect(rebuilt).toEqual(extraction.grid);
	});

	it("formats a step the way the guide reads it out", () => {
		expect(formatCell({ index: 64, row: 3, column: 5 })).toBe("row 3 column 5");
	});
});

describe("buildTapePattern", () => {
	function tape(
		cells: string[],
		width: number,
		height: number,
		overrides: Partial<{
			squareCm: number;
			canvasWidthCm: number;
			canvasHeightCm: number;
			tapeWidthCm: number;
			targetCells: number[];
		}> = {}
	) {
		const squareCm = overrides.squareCm ?? 1;
		return buildTapePattern({
			grid: cells,
			width,
			height,
			targetColor: "x",
			targetCells: overrides.targetCells,
			squareCm,
			canvasWidthCm: overrides.canvasWidthCm ?? width * squareCm + squareCm * 2,
			canvasHeightCm:
				overrides.canvasHeightCm ?? height * squareCm + squareCm * 2,
			tapeWidthCm: overrides.tapeWidthCm ?? 0.5
		});
	}

	function side(
		pattern: ReturnType<typeof tape>,
		name: "top" | "right" | "bottom" | "left"
	) {
		const segment = pattern.segments.find(
			(candidate) => candidate.side === name
		);
		if (!segment) throw new Error(`Missing ${name} tape segment`);
		return segment;
	}

	it("outlines one square with four strips and 1 cm past every cut end", () => {
		const pattern = tape(["x"], 1, 1);
		const top = side(pattern, "top");
		const right = side(pattern, "right");
		const bottom = side(pattern, "bottom");
		const left = side(pattern, "left");

		expect(pattern.segments).toHaveLength(4);
		expect(top).toMatchObject({
			orientation: "horizontal",
			x: -1,
			y: -0.5,
			width: 3,
			height: 0.5,
			lengthCm: 3,
			edgeCm: 1
		});
		expect(bottom.y).toBe(1);
		expect(left).toMatchObject({
			orientation: "vertical",
			x: -0.5,
			y: -1,
			width: 0.5,
			height: 3
		});
		expect(right.x).toBe(1);
		expect(pattern.totalLengthCm).toBeCloseTo(12);
	});

	it("extends scissor-cut ends past corners so perpendicular strips overlap", () => {
		const pattern = tape(["x"], 1, 1);
		const top = side(pattern, "top");
		const left = side(pattern, "left");
		const overlapWidth =
			Math.min(top.x + top.width, left.x + left.width) -
			Math.max(top.x, left.x);
		const overlapHeight =
			Math.min(top.y + top.height, left.y + left.height) -
			Math.max(top.y, left.y);

		expect(overlapWidth).toBeCloseTo(0.5);
		expect(overlapHeight).toBeCloseTo(0.5);
	});

	it("merges adjacent target squares into minimum straight perimeter runs", () => {
		const pattern = tape(["x", "x"], 2, 1);

		expect(pattern.segments).toHaveLength(4);
		expect(
			pattern.segments
				.filter((segment) => segment.orientation === "horizontal")
				.map((segment) => segment.lengthCm)
		).toEqual([4, 4]);
		expect(pattern.totalLengthCm).toBeCloseTo(14);
	});

	it("reuses two vertical strips across aligned separated squares", () => {
		const pattern = tape(["x", "b", "x"], 1, 3);
		const vertical = pattern.segments.filter(
			(segment) => segment.orientation === "vertical"
		);

		expect(pattern.segments).toHaveLength(6);
		expect(vertical).toHaveLength(2);
		expect(vertical.map((segment) => segment.lengthCm)).toEqual([5, 5]);
	});

	it("reuses one full-square-width strip between staggered squares", () => {
		const pattern = tape(["x", "b", "b", "b", "b", "x"], 2, 3, {
			tapeWidthCm: 1
		});
		const sharedLane = pattern.segments.filter(
			(segment) => segment.orientation === "horizontal" && segment.y === 1
		);

		expect(sharedLane).toHaveLength(1);
		expect(sharedLane[0]).toMatchObject({ x: -1, width: 4, height: 1 });
	});

	it("does not merge across a gap when the longer strip would cover paint", () => {
		const pattern = tape(
			["b", "b", "x", "b", "b", "x", "b", "b", "b", "x"],
			5,
			2
		);
		const separatedTopEdges = pattern.segments.filter(
			(segment) =>
				segment.orientation === "horizontal" &&
				segment.side === "top" &&
				segment.edgeCm === 2
		);

		expect(separatedTopEdges).toHaveLength(2);
		expect(separatedTopEdges.map((segment) => segment.lengthCm)).toEqual([
			3, 3
		]);
	});

	it("uses the physical canvas edge instead of redundant tape", () => {
		expect(
			tape(["x"], 1, 1, { canvasWidthCm: 1, canvasHeightCm: 1 }).segments
		).toEqual([]);
	});

	it("keeps tape width independent from square size", () => {
		const pattern = tape(["x"], 1, 1, {
			squareCm: 2.5,
			tapeWidthCm: 1,
			canvasWidthCm: 7.5,
			canvasHeightCm: 7.5
		});

		expect(
			pattern.segments.find((segment) => segment.side === "top")
		).toMatchObject({
			heightCm: 1,
			lengthCm: 4.5,
			edgeCm: 2.5
		});
	});

	it("uses the 5% extension when it exceeds the 1 cm minimum", () => {
		const pattern = tape(["x"], 1, 1, {
			squareCm: 40,
			tapeWidthCm: 2.5,
			canvasWidthCm: 120,
			canvasHeightCm: 120
		});

		expect(side(pattern, "top").lengthCm).toBe(44);
	});

	it("generates tape for only the selected target squares", () => {
		const pattern = tape(["x", "x"], 2, 1, { targetCells: [0, 0] });

		expect(pattern.segments).toHaveLength(4);
		expect(side(pattern, "right").x).toBe(1);
		expect(pattern.totalLengthCm).toBe(12);
	});

	it("returns no tape for an empty or invalid square selection", () => {
		expect(tape(["x", "b"], 2, 1, { targetCells: [] }).segments).toEqual([]);
		expect(
			tape(["x", "b"], 2, 1, {
				targetCells: [-1, 1, 2, Number.NaN]
			}).segments
		).toEqual([]);
	});

	it("allows a reused strip to cover unchecked squares of the same colour", () => {
		const pattern = tape(
			["b", "b", "x", "b", "b", "x", "b", "b", "b", "x"],
			5,
			2,
			{ targetCells: [5, 9] }
		);
		const selectedTopEdges = pattern.segments.filter(
			(segment) =>
				segment.orientation === "horizontal" &&
				segment.side === "top" &&
				segment.edgeCm === 2
		);

		expect(selectedTopEdges).toHaveLength(1);
		expect(selectedTopEdges[0]?.lengthCm).toBe(7);
	});

	it("reports target cells reached by wide tape or inside-corner overlap", () => {
		const pattern = tape(["x", "b", "x"], 1, 3, {
			squareCm: 2,
			tapeWidthCm: 2.5,
			canvasWidthCm: 4,
			canvasHeightCm: 8
		});

		expect(pattern.overlapCells).toEqual([0, 2]);
	});

	it("returns no instructions when the artwork does not fit", () => {
		expect(
			tape(["x", "x"], 2, 1, {
				squareCm: 2,
				canvasWidthCm: 3,
				canvasHeightCm: 2
			}).segments
		).toEqual([]);
	});
});

describe("measure", () => {
	const grid = { width: 30, height: 30 };

	it("derives the identicon size from the squares, not from the canvas", () => {
		const m = measure({
			...grid,
			squareCm: 2,
			canvasWidthCm: 60,
			canvasHeightCm: 60
		});

		expect(m.identiconWidthCm).toBe(60);
		expect(m.identiconHeightCm).toBe(60);
		expect(m.squareMm).toBe(20);
		expect(m.blockCm).toBe(10);
		expect(m.warnings).toHaveLength(0);
	});

	it("leaves the canvas free to be a different size than the identicon", () => {
		const m = measure({
			...grid,
			squareCm: 1.5,
			canvasWidthCm: 60,
			canvasHeightCm: 80
		});

		// 30 x 1.5cm = 45cm of identicon on a 60 x 80cm canvas.
		expect(m.identiconWidthCm).toBe(45);
		expect(m.identiconHeightCm).toBe(45);
		expect(m.marginXCm).toBe(7.5);
		expect(m.marginYCm).toBe(17.5);
		expect(m.fits).toBe(true);
		expect(m.warnings).toHaveLength(0);
	});

	it("flags squares too small to brush comfortably", () => {
		const m = measure({
			...grid,
			squareCm: 1,
			canvasWidthCm: 60,
			canvasHeightCm: 60
		});

		expect(m.squareMm).toBe(10);
		expect(m.warnings.join(" ")).toMatch(/Under 15mm/);
	});

	it("flags an identicon that overflows the canvas, and by how much", () => {
		const m = measure({
			...grid,
			squareCm: 2.5,
			canvasWidthCm: 60,
			canvasHeightCm: 90
		});

		// 75cm wide on a 60cm canvas: 15cm over. Height fits.
		expect(m.identiconWidthCm).toBe(75);
		expect(m.fits).toBe(false);
		expect(m.marginXCm).toBe(-7.5);
		expect(m.warnings.join(" ")).toMatch(/15cm too wide/);
		expect(m.warnings.join(" ")).not.toMatch(/too tall/);
	});

	it("survives a cleared input without emitting NaN", () => {
		const m = measure({
			...grid,
			squareCm: NaN,
			canvasWidthCm: NaN,
			canvasHeightCm: 60
		});

		for (const value of [
			m.squareMm,
			m.identiconWidthCm,
			m.identiconHeightCm,
			m.blockCm,
			m.marginXCm,
			m.marginYCm
		]) {
			expect(Number.isNaN(value)).toBe(false);
		}
	});
});
