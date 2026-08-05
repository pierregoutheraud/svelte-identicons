import { describe, expect, it } from "vitest";
import { axisDistance, mirrorAxis } from "./hash.js";
import Identicon, { type IdenticonOptions } from "./Identicon.js";

/**
 * The point of positional hashing: a seed identifies one pattern, and the
 * dimensions only decide how much of it you see. These tests pin down exactly
 * which resizes preserve the pattern and — just as importantly — which do not.
 */

// The engine fills imageData before it ever asks for a 2d context, so it runs
// headlessly against a stub.
const stubCanvas = () =>
	({
		width: 0,
		height: 0,
		getContext: () => null
	}) as unknown as HTMLCanvasElement;

type Symetry = IdenticonOptions["symetry"];

function grid(width: number, height: number, symetry: Symetry) {
	return new Identicon(stubCanvas(), {
		seed: "eventual-mango",
		width,
		height,
		symetry,
		numberOfColors: 3,
		pixelSize: 1,
		onColors: undefined
	}).imageData;
}

/**
 * The mirrored unit itself: coordinate -> colour, keyed by the same coordinate the
 * engine looks colours up by. This is the thing that must be a pure function of
 * the seed — grid dimensions may decide how much of it is on screen, never what
 * is in it.
 */
function halfPattern(width: number, height: number, symetry: Symetry) {
	const cells = grid(width, height, symetry);
	const unit = new Map<string, string | undefined>();

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const cx =
				symetry === "none"
					? axisDistance(x, width)
					: axisDistance(x, mirrorAxis(width));
			const cy =
				symetry === "central" ? axisDistance(y, mirrorAxis(height)) : y;
			unit.set(`${cx},${cy}`, cells[y * width + x]);
		}
	}

	return unit;
}

/**
 * Asserts the middle of the identicon is untouched by a resize.
 *
 * Mirrored axes count outward from the mirror axis, so index 0 is the middle and
 * growth appends at the outer edges. A same-parity resize therefore reproduces the
 * old grid exactly, shifted out by half the difference.
 */
function expectMiddleStable(
	symetry: Symetry,
	[oldW, oldH]: [number, number],
	[newW, newH]: [number, number]
) {
	const before = grid(oldW, oldH, symetry);
	const after = grid(newW, newH, symetry);

	// `none` is right-anchored, so the old grid reappears flush to the right edge.
	// The mirrored modes are anchored on an axis that sits between cells, so it
	// reappears offset by however far that axis moved.
	const offsetX =
		symetry === "none" ? newW - oldW : mirrorAxis(newW) - mirrorAxis(oldW);
	const offsetY =
		symetry === "central" ? mirrorAxis(newH) - mirrorAxis(oldH) : 0;

	for (let y = 0; y < oldH; y++) {
		for (let x = 0; x < oldW; x++) {
			expect(
				after[(y + offsetY) * newW + (x + offsetX)],
				`${symetry} ${oldW}x${oldH} -> ${newW}x${newH} at (${x},${y})`
			).toBe(before[y * oldW + x]);
		}
	}
}

/** The colour(s) of the cell(s) touching the mirror axis. */
function middleOfRow(cells: (string | undefined)[], width: number, y = 0) {
	const axis = mirrorAxis(width);
	const touching = [cells[y * width + axis - 1]];
	if (axis < width) touching.push(cells[y * width + axis]);
	return touching;
}

describe("size independence", () => {
	// The guarantee that matters: the mirrored unit is a pure function of the seed,
	// so stepping the size by one never re-maps it. This is what makes a seed name
	// a pattern rather than (seed, size) naming one.
	it("never changes the half-pattern, at any width, one step at a time", () => {
		for (const symetry of ["none", "axial", "central"] as const) {
			let previous = halfPattern(4, 6, symetry);

			for (let width = 5; width <= 24; width++) {
				const current = halfPattern(width, 6, symetry);

				for (const [key, colour] of previous) {
					expect(
						current.get(key),
						`${symetry} width ${width - 1} -> ${width} at ${key}`
					).toBe(colour);
				}

				previous = current;
			}
		}
	});

	it("never changes the half-pattern as height steps by one", () => {
		for (const symetry of ["none", "axial", "central"] as const) {
			let previous = halfPattern(10, 4, symetry);

			for (let height = 5; height <= 24; height++) {
				const current = halfPattern(10, height, symetry);

				for (const [key, colour] of previous) {
					expect(
						current.get(key),
						`${symetry} height ${height - 1} -> ${height} at ${key}`
					).toBe(colour);
				}

				previous = current;
			}
		}
	});

	it("keeps the middle colour fixed at every single width", () => {
		// The middle must never change colour as the grid grows — only its width, by
		// one cell, when the size crosses parity (mirroring an even number of columns
		// forces a two-cell middle).
		for (const symetry of ["axial", "central"] as const) {
			const reference = middleOfRow(grid(9, 6, symetry), 9)[0];

			for (let width = 2; width <= 30; width++) {
				for (const colour of middleOfRow(grid(width, 6, symetry), width)) {
					expect(colour, `${symetry} width ${width}`).toBe(reference);
				}
			}
		}
	});

	it("reproduces the whole grid, shifted outward, for same-parity growth", () => {
		expectMiddleStable("axial", [8, 6], [10, 6]);
		expectMiddleStable("axial", [10, 6], [12, 6]);
		expectMiddleStable("axial", [9, 6], [11, 6]);
		expectMiddleStable("axial", [10, 10], [30, 10]);
		expectMiddleStable("central", [10, 10], [30, 30]);
		expectMiddleStable("none", [1, 1], [30, 30]);
	});

	it("keeps the reported case exact: 2x2 -> 2x3 only adds a row", () => {
		const before = grid(2, 2, "axial");
		const after = grid(2, 3, "axial");
		expect(after.slice(0, 4)).toEqual(before);
	});

	it("grows only at the outer edges, never in the middle", () => {
		// Walk one step at a time and check the inner region is carried over intact.
		for (let width = 4; width < 24; width += 2) {
			const before = grid(width, 4, "axial");
			const after = grid(width + 2, 4, "axial");

			for (let y = 0; y < 4; y++) {
				for (let x = 0; x < width; x++) {
					const shift = mirrorAxis(width + 2) - mirrorAxis(width);
					expect(
						after[y * (width + 2) + x + shift],
						`width ${width} -> ${width + 2} at (${x},${y})`
					).toBe(before[y * width + x]);
				}
			}
		}
	});
});

describe("symmetry", () => {
	// Odd widths are deliberately NOT mirror-exact by default: the axis stays
	// between cells so the middle never moves, which means an odd width is an even
	// identicon plus one column. `symetryAxis: "column"` or `"exact"` are the opt-ins that trade
	// that back. See IdenticonOptions.symetryAxis.
	it("mirrors axial horizontally at even widths", () => {
		for (const width of [2, 4, 10, 30]) {
			const cells = grid(width, 4, "axial");
			for (let y = 0; y < 4; y++) {
				for (let x = 0; x < width; x++) {
					expect(cells[y * width + x]).toBe(cells[y * width + (width - 1 - x)]);
				}
			}
		}
	});

	it("mirrors central on both axes", () => {
		const width = 6;
		const height = 4;
		const cells = grid(width, height, "central");

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const value = cells[y * width + x];
				expect(cells[y * width + (width - 1 - x)]).toBe(value);
				expect(cells[(height - 1 - y) * width + x]).toBe(value);
			}
		}
	});

	it("does not mirror when symetry is none", () => {
		// Guards against the coordinate switch falling through to a mirrored case.
		const width = 12;
		const cells = grid(width, 6, "none");
		let mirrored = 0;

		for (let y = 0; y < 6; y++) {
			for (let x = 0; x < width; x++) {
				if (cells[y * width + x] === cells[y * width + (width - 1 - x)]) {
					mirrored++;
				}
			}
		}

		expect(mirrored).toBeLessThan(width * 6);
	});
});

describe("what the grid depends on", () => {
	it("no longer shifts when numberOfColors changes but the palette does not", () => {
		// Before positional hashing, numberOfColors burned PRNG draws ahead of the
		// grid, so it moved the pattern even with an explicit palette. It cannot now.
		const colors = ["#111111", "#222222", "#333333"];
		const base = { seed: "eventual-mango", width: 8, height: 8, pixelSize: 1 };

		const two = new Identicon(stubCanvas(), {
			...base,
			numberOfColors: 2,
			colors,
			onColors: undefined
		}).imageData;
		const five = new Identicon(stubCanvas(), {
			...base,
			numberOfColors: 5,
			colors,
			onColors: undefined
		}).imageData;

		expect(five).toEqual(two);
	});

	it("still changes when the palette size changes", () => {
		// colors.length feeds the cumulative weights, which remap value -> colour.
		const base = {
			seed: "eventual-mango",
			width: 8,
			height: 8,
			pixelSize: 1,
			onColors: undefined
		};
		const twoColors = new Identicon(stubCanvas(), {
			...base,
			colors: ["#111111", "#222222"]
		}).imageData;
		const threeColors = new Identicon(stubCanvas(), {
			...base,
			colors: ["#111111", "#222222", "#333333"]
		}).imageData;

		expect(threeColors).not.toEqual(twoColors);
	});

	it("fills every cell", () => {
		const cells = grid(30, 30, "axial");
		expect(cells).toHaveLength(900);
		expect(cells.every((c) => typeof c === "string" && c.length > 0)).toBe(
			true
		);
	});
});
