import { describe, expect, it } from "vitest";
import {
	createSeedHistory,
	moveSeedHistory,
	recordSeed
} from "./seed-history.js";

describe("seed history", () => {
	it("keeps every recorded seed and traverses backward and forward", () => {
		let history = createSeedHistory("first");
		history = recordSeed(history, "second");
		history = recordSeed(history, "third");

		expect(history).toEqual({
			entries: ["first", "second", "third"],
			index: 2
		});

		history = moveSeedHistory(history, -1);
		expect(history.entries[history.index]).toBe("second");

		history = moveSeedHistory(history, -1);
		expect(history.entries[history.index]).toBe("first");

		history = moveSeedHistory(history, 1);
		expect(history.entries[history.index]).toBe("second");

		history = moveSeedHistory(history, 1);
		expect(history.entries[history.index]).toBe("third");
	});

	it("does not duplicate the seed at the current cursor", () => {
		const history = createSeedHistory("same");
		expect(recordSeed(history, "same")).toBe(history);
	});

	it("replaces the forward branch when a seed is recorded after going back", () => {
		let history = createSeedHistory("first");
		history = recordSeed(history, "second");
		history = recordSeed(history, "third");
		history = moveSeedHistory(history, -1);
		history = recordSeed(history, "replacement");

		expect(history).toEqual({
			entries: ["first", "second", "replacement"],
			index: 2
		});
	});

	it("does not cap the number of retained seeds", () => {
		let history = createSeedHistory("seed-0");
		for (let index = 1; index <= 1_000; index++) {
			history = recordSeed(history, `seed-${index}`);
		}

		expect(history.entries).toHaveLength(1_001);
		expect(history.index).toBe(1_000);
	});
});
