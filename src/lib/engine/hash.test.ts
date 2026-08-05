import { describe, expect, it } from "vitest";
import {
	axisDistance,
	cellValue,
	hashStringToInteger,
	mirrorAxis,
	pickByWeight,
	symmetricDistance
} from "./hash.js";

const SEED = hashStringToInteger("eventual-mango");

function field(size: number): number[][] {
	return [...Array(size)].map((_, y) =>
		[...Array(size)].map((_, x) => cellValue(SEED, x, y))
	);
}

/** Pearson correlation between each cell and the cell (dx,dy) away from it. */
function correlation(grid: number[][], dx: number, dy: number): number {
	let sx = 0,
		sy = 0,
		sxy = 0,
		sxx = 0,
		syy = 0,
		n = 0;

	for (let y = 0; y + dy < grid.length; y++) {
		for (let x = 0; x + dx < grid.length; x++) {
			const a = grid[y][x];
			const b = grid[y + dy][x + dx];
			sx += a;
			sy += b;
			sxy += a * b;
			sxx += a * a;
			syy += b * b;
			n++;
		}
	}

	return (
		(n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
	);
}

describe("cellValue", () => {
	it("is deterministic and stays inside [0,1)", () => {
		for (const [x, y] of [
			[0, 0],
			[7, 3],
			[1000, 999]
		]) {
			const v = cellValue(SEED, x, y);
			expect(v).toBe(cellValue(SEED, x, y));
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it("distributes uniformly", () => {
		const grid = field(200);
		const buckets = new Array(10).fill(0);
		for (const row of grid) {
			for (const v of row) buckets[Math.min(9, Math.floor(v * 10))]++;
		}

		const expected = (200 * 200) / 10;
		const chiSquare = buckets.reduce(
			(acc, observed) => acc + (observed - expected) ** 2 / expected,
			0
		);

		// 9 degrees of freedom, p = 0.01 -> 21.7
		expect(chiSquare).toBeLessThan(21.7);
	});

	// THE test that matters. A single LCG step seeded on `seed + x + y` passes the
	// uniformity check above with chi-square ~4.5 while correlating neighbours at
	// 0.74, which renders as visible stripes. Only this catches it, so do not
	// relax it when "simplifying" the hash.
	it("leaves neighbouring cells uncorrelated", () => {
		const grid = field(200);

		for (const [dx, dy] of [
			[1, 0],
			[0, 1],
			[1, 1],
			[2, 0],
			[0, 2],
			[3, 7]
		]) {
			expect(Math.abs(correlation(grid, dx, dy))).toBeLessThan(0.02);
		}
	});

	it("decorrelates seeds that differ by one character", () => {
		const a = hashStringToInteger("seed-a");
		const b = hashStringToInteger("seed-b");
		let differing = 0;

		for (let i = 0; i < 400; i++) {
			if (
				cellValue(a, i % 20, Math.floor(i / 20)) !==
				cellValue(b, i % 20, Math.floor(i / 20))
			) {
				differing++;
			}
		}

		expect(differing).toBe(400);
	});
});

describe("axisDistance / mirrorAxis", () => {
	const coords = (size: number) =>
		[...Array(size)].map((_, i) => axisDistance(i, mirrorAxis(size)));

	it("keeps the axis between cells, so an odd size gains a column on the left", () => {
		expect(coords(1)).toEqual([0]);
		expect(coords(2)).toEqual([0, 0]);
		expect(coords(3)).toEqual([1, 0, 0]);
		expect(coords(4)).toEqual([1, 0, 0, 1]);
		expect(coords(5)).toEqual([2, 1, 0, 0, 1]);
	});

	it("puts index 0 against the axis at every size", () => {
		for (let size = 1; size <= 30; size++) {
			const axis = mirrorAxis(size);
			expect(axisDistance(axis - 1, axis)).toBe(0);
			if (axis < size) expect(axisDistance(axis, axis)).toBe(0);
		}
	});

	it("puts the largest index at the outer edges, so growth lands there", () => {
		for (const size of [4, 5, 8, 9, 30]) {
			const values = coords(size);
			expect(Math.max(...values)).toBe(Math.max(values[0], values[size - 1]));
		}
	});

	it("only ever appends as the size grows by one", () => {
		for (let size = 1; size < 40; size++) {
			const before = new Set(coords(size));
			const after = new Set(coords(size + 1));
			expect([...before].every((v) => after.has(v))).toBe(true);
		}
	});

	it("is right-aligned when the axis is the size (symetry: none)", () => {
		expect([...Array(3)].map((_, i) => axisDistance(i, 3))).toEqual([2, 1, 0]);
	});
});

describe("symmetricDistance", () => {
	it("mirrors exactly at every size, including odd ones", () => {
		for (const size of [2, 3, 4, 5, 10, 11, 30]) {
			for (let i = 0; i < size; i++) {
				expect(symmetricDistance(i, size)).toBe(
					symmetricDistance(size - 1 - i, size)
				);
			}
		}
	});
});

describe("pickByWeight", () => {
	it("splits the range by cumulative weight", () => {
		// Geometric weights: 0.5, 0.25, 0.125 -> total 0.875
		const weights = [0.5, 0.25, 0.125];
		const colors = ["a", "b", "c"];

		expect(pickByWeight(colors, weights, 0)).toBe("a");
		expect(pickByWeight(colors, weights, 0.49 / 0.875)).toBe("a");
		expect(pickByWeight(colors, weights, 0.6 / 0.875)).toBe("b");
		expect(pickByWeight(colors, weights, 0.8 / 0.875)).toBe("c");
	});

	it("returns the last choice rather than throwing at the top of the range", () => {
		expect(pickByWeight(["a", "b"], [0.5, 0.25], 1)).toBe("b");
	});
});
