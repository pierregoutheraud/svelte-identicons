import { describe, expect, it } from "vitest";
import {
	buildPalette,
	colorCells,
	createStubCanvas,
	extractGrid,
	findDuplicateColors,
	formatCell,
	layoutKey,
	measure,
	parsePaintParams,
	serializePaintParams,
	type PaintParams
} from "./paint.helpers.js";

const BASE: PaintParams = {
	seed: "eventual-mango",
	width: 30,
	height: 30,
	symetry: "axial",
	numberOfColors: 3,
	colors: [],
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

		expect(pattern(mine, grid({ colors: mine }))).toEqual(
			pattern(theirs, grid({ colors: theirs }))
		);
	});

	it("changes the layout when the number of colors changes", () => {
		// Why numberOfColors has to survive the URL round-trip verbatim.
		expect(grid({ numberOfColors: 2 })).not.toEqual(
			grid({ numberOfColors: 3 })
		);
	});

	it("changes the layout when numberOfColors disagrees with colors.length", () => {
		// The playground can emit exactly this pair, and the engine burns PRNG
		// draws on a default palette it then discards.
		const colors = ["#111111", "#222222", "#333333"];
		expect(grid({ numberOfColors: 2, colors })).not.toEqual(
			grid({ numberOfColors: 3, colors })
		);
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
			{ ...BASE, colors: generated.colors },
			createStubCanvas()
		);

		expect(frozen.grid).toEqual(generated.grid);
		expect(frozen.backgroundColor).toBe(generated.backgroundColor);
	});

	it("does not reproduce the grid if the palette is re-ordered", () => {
		// Guards the mistake of handing back buildPalette's display order.
		const generated = extractGrid(BASE, createStubCanvas());
		const shuffled = extractGrid(
			{ ...BASE, colors: [...generated.colors].reverse() },
			createStubCanvas()
		);

		expect(shuffled.grid).not.toEqual(generated.grid);
	});
});

describe("serializePaintParams / parsePaintParams", () => {
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

	it("normalises a NaN numberOfColors the same way the engine does", () => {
		// The playground writes numberOfColors="" when custom colors are set,
		// which parses to NaN; the engine reads that as `|| 1`.
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

	it("defaults to a 30x30 grid", () => {
		const parsed = parsePaintParams(new URLSearchParams("?seed=abc"));
		expect(parsed.width).toBe(30);
		expect(parsed.height).toBe(30);
	});
});

describe("layoutKey", () => {
	it("separates the two pixel fonts", () => {
		// Different squares to paint, so progress must not carry across.
		expect(layoutKey({ ...BASE, text: "ab", textFont: "3x3" })).not.toBe(
			layoutKey({ ...BASE, text: "ab", textFont: "3x4" })
		);
	});

	it("ignores hex values but not the color count", () => {
		const two = ["#000000", "#ffffff"];
		const twoOther = ["#123456", "#abcdef"];

		expect(layoutKey({ ...BASE, colors: two })).toBe(
			layoutKey({ ...BASE, colors: twoOther })
		);
		expect(layoutKey({ ...BASE, colors: two })).not.toBe(
			layoutKey({ ...BASE, colors: [...two, "#ff0000"] })
		);
	});

	it("treats a generated palette and the same palette made editable as one pattern", () => {
		// Freezing the generated colors into slots must not wipe your progress.
		const generated: PaintParams = { ...BASE, numberOfColors: 3, colors: [] };
		const frozen: PaintParams = {
			...generated,
			colors: extractGrid(generated, createStubCanvas()).colors
		};

		expect(layoutKey(frozen)).toBe(layoutKey(generated));
	});
});

describe("buildPalette", () => {
	it("counts every cell and puts the base coat first", () => {
		const { grid: cells, backgroundColor } = extractGrid(
			BASE,
			createStubCanvas()
		);
		const palette = buildPalette(cells, backgroundColor);

		expect(palette.reduce((acc, p) => acc + p.count, 0)).toBe(cells.length);
		expect(palette[0].isBase).toBe(true);
		expect(palette[0].color).toBe(backgroundColor);
		expect(palette.filter((p) => p.isBase)).toHaveLength(1);
		expect(palette.map((p) => p.label).slice(0, 3)).toEqual(["A", "B", "C"]);
	});

	it("leaves most of the grid unpainted, since the base coat covers it", () => {
		const { grid: cells, backgroundColor } = extractGrid(
			BASE,
			createStubCanvas()
		);
		const palette = buildPalette(cells, backgroundColor);
		const toPaint = palette
			.filter((p) => !p.isBase)
			.reduce((acc, p) => acc + p.count, 0);

		// Geometric weights give colors[0] 0.5/0.875 of a 3-color grid.
		expect(toPaint).toBeLessThan(cells.length / 2);
	});

	it("orders the non-base colors by descending count", () => {
		const { grid: cells, backgroundColor } = extractGrid(
			BASE,
			createStubCanvas()
		);
		const counts = buildPalette(cells, backgroundColor)
			.filter((p) => !p.isBase)
			.map((p) => p.count);

		expect([...counts].sort((a, b) => b - a)).toEqual(counts);
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
		const { grid: cells, backgroundColor } = extractGrid(
			BASE,
			createStubCanvas()
		);
		const palette = buildPalette(cells, backgroundColor);
		const rebuilt: string[] = new Array(cells.length).fill("");

		for (const entry of palette) {
			const steps = colorCells(cells, BASE.width, entry.color);
			expect(steps).toHaveLength(entry.count);

			for (const step of steps) {
				// The coordinates must agree with the index they claim to describe.
				expect(step.index).toBe(
					(step.row - 1) * BASE.width + (step.column - 1)
				);
				rebuilt[step.index] = entry.color;
			}
		}

		expect(rebuilt).toEqual(cells);
	});

	it("formats a step the way the guide reads it out", () => {
		expect(formatCell({ index: 64, row: 3, column: 5 })).toBe("row 3 column 5");
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

describe("findDuplicateColors", () => {
	it("catches two tubes set to the same hex, case-insensitively", () => {
		expect(findDuplicateColors(["#AABBCC", "#111111", "#aabbcc"])).toEqual([
			"#aabbcc"
		]);
		expect(findDuplicateColors(["#aabbcc", "#111111"])).toEqual([]);
	});
});
