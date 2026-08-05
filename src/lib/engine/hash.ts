/**
 * Positional hashing, so a cell's colour is a pure function of (seed, x, y)
 * rather than of its position in a sequential random stream.
 *
 * That is the whole point: a running PRNG gives cell (x,y) the Nth draw, where N
 * depends on the grid width, so resizing an identicon redraws it. Hashing the
 * coordinates instead means a seed identifies one fixed pattern and the
 * dimensions only decide how much of it you see.
 */

/** Hashes a seed string to a 32-bit unsigned integer. */
export function hashStringToInteger(seed: string): number {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash << 5) - hash + seed.charCodeAt(i);
		hash = hash >>> 0;
	}
	return hash;
}

/** murmur3's 32-bit finalizer: the avalanche step that decorrelates neighbours. */
export function fmix32(h: number): number {
	h ^= h >>> 16;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 16;
	return h >>> 0;
}

/**
 * A deterministic value in [0,1) for one lattice point.
 *
 * Do not be tempted to replace this with a single step of the LCG in Random.ts
 * seeded on `seed + x + y`. It looks equivalent and passes a uniformity test,
 * but adjacent cells come out ~0.74 correlated, which renders as visible
 * stripes. The avalanche above is what makes neighbours independent
 * (measured |correlation| < 0.01 — see hash.test.ts, which guards this).
 */
export function cellValue(seedInt: number, x: number, y: number): number {
	let h = seedInt ^ 0x9e3779b9;
	h = Math.imul(h ^ (x + 0x7f4a7c15), 0x27d4eb2d);
	h = Math.imul(h ^ (y + 0x165667b1), 0x85ebca6b);
	return fmix32(h) / 4294967296;
}

/**
 * Where the mirror axis sits: immediately after this many cells.
 *
 * The axis is always *between* two cells, never on one. An odd size therefore
 * gives the left side one extra cell rather than placing a cell on the axis. That
 * is the trade that keeps the middle still: forcing perfect mirror symmetry at
 * every size means the axis has to move onto a cell at odd sizes, which drags the
 * whole pattern with it. Odd sizes here are simply an even identicon with one
 * extra column on the left, so they are not perfectly symmetric — deliberately.
 */
export function mirrorAxis(size: number): number {
	return Math.ceil(size / 2);
}

/**
 * Distance outward from a mirror axis placed immediately after cell `axis - 1`.
 *
 *   size 8, axis 4  ->  3 2 1 0 | 0 1 2 3
 *   size 7, axis 4  ->  3 2 1 0 | 0 1 2
 *   size 3, axis 2  ->      1 0 | 0
 *
 * A mirrored identicon is one half-pattern drawn outward from the axis, so this
 * indexes that half. Index 0 always sits against the axis, so growing the grid
 * only ever appends larger indices at the outer edges — the middle never changes.
 * Growth alternates sides: the new cell lands on the left when the size becomes
 * odd and on the right when it becomes even, and either way every existing cell
 * keeps its index.
 *
 * Pass `axis = size` for the un-mirrored case: the axis then sits at the right
 * edge, so the pattern is right-aligned and grows leftward. That makes
 * `symetry: "none"` at width N the left half of `axial` at width 2N.
 *
 * Anchorings that look equivalent and are not:
 *
 * - Outward from the outer edge (`min(i, size-1-i)`): symmetric and parity-clean,
 *   but new entries land next to the axis, so the *middle* changes on every resize.
 * - Outward from the centre in doubled units (`|2i - (size-1)|`): the axis lands
 *   between cells at even sizes and on a cell at odd ones, so even and odd sizes
 *   address disjoint halves of the hash space and the grid flip-flops between two
 *   unrelated patterns as the size steps by one.
 */
export function axisDistance(i: number, axis: number): number {
	return i < axis ? axis - 1 - i : i - axis;
}

/**
 * Distance outward from a mirror axis sitting ON a column, so that column is
 * unique instead of being half of a matched pair.
 *
 *   size 7  ->  3 2 1 0 1 2 3      <- exactly mirrored, single middle column
 *   size 6  ->  3 2 1 0 1 2        <- one extra column on the left
 *   size 3  ->  1 0 1
 *
 * `symetryAxis: "column"`. Index 0 occurs exactly once at every size, which reads
 * cleaner than a doubled middle. Odd sizes come out exactly mirrored; even sizes
 * carry one extra column on the left, the same trade `axisDistance` makes for odd
 * sizes. Still fully size-stable: `floor(size/2)` moves by one every other step,
 * so cells keep their distance as the grid grows.
 */
export function columnDistance(i: number, size: number): number {
	return Math.abs(i - Math.floor(size / 2));
}

/**
 * Distance outward from the centre, kept perfectly mirror-symmetric at every size.
 *
 *   size 8  ->  3 2 1 0 0 1 2 3
 *   size 7  ->  3 2 1 0 1 2 3
 *   size 3  ->  1 0 1
 *
 * `symetryAxis: "exact"`. The only option that guarantees
 * `c(i) === c(size-1-i)` at *every* size — the other two each give that up on one
 * parity. The cost is the one thing they both keep: the axis has to jump between
 * sitting on a column and sitting in a gap as the size changes parity, so the
 * pattern shifts and resizing is no longer stable.
 */
export function symmetricDistance(i: number, size: number): number {
	return Math.ceil(size / 2) - 1 - Math.min(i, size - 1 - i);
}

/**
 * Picks from `choices` using cumulative `weights` and an already-drawn value in
 * [0,1). Split out from Random.pickRandomChoice so the same weighting can be fed
 * either a stream draw or a positional hash.
 */
export function pickByWeight(
	choices: string[],
	weights: number[],
	value: number
): string {
	const cumulative: number[] = [];
	for (let i = 0; i < weights.length; i++) {
		cumulative[i] = weights[i] + (cumulative[i - 1] || 0);
	}

	const scaled = value * cumulative[cumulative.length - 1];

	for (let i = 0; i < cumulative.length; i++) {
		if (scaled < cumulative[i]) {
			return choices[i];
		}
	}

	// Only reachable on floating-point equality with the total weight.
	return choices[choices.length - 1];
}
