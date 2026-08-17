export interface SeedHistory {
	entries: string[];
	index: number;
}

export function createSeedHistory(seed: string): SeedHistory {
	return { entries: [seed], index: 0 };
}

/** Records a new seed at the cursor, following standard undo/redo semantics. */
export function recordSeed(history: SeedHistory, seed: string): SeedHistory {
	if (seed === history.entries[history.index]) return history;

	const entries = [...history.entries.slice(0, history.index + 1), seed];
	return { entries, index: entries.length - 1 };
}

/** Moves within the complete seed history without changing its entries. */
export function moveSeedHistory(
	history: SeedHistory,
	direction: -1 | 1
): SeedHistory {
	const index = Math.max(
		0,
		Math.min(history.entries.length - 1, history.index + direction)
	);

	return index === history.index ? history : { ...history, index };
}
