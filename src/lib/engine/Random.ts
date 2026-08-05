import { hashStringToInteger, pickByWeight } from "./hash.js";

export class Random {
	private numberSeed: number;

	constructor(seed: string) {
		this.numberSeed = hashStringToInteger(seed);
	}

	// Generate number in range [0,1]
	public next(): number {
		// Parameters for a commonly used version of the LCG that generates a sequence of 32-bit integers
		const a = 1103515245;
		const c = 12345;
		const m = Math.pow(2, 31);

		this.numberSeed = (a * this.numberSeed + c) % m;

		// Subtracting from m - 1 to include 1 in the range
		const randomNumber = this.numberSeed / (m - 1);

		return Math.abs(randomNumber);
	}

	// Generate number in range [min, max]
	public nextRange(min: number, max: number): number {
		return Math.floor(this.next() * (max - min + 1) + min);
	}

	pickRandomChoice(choices: string[], weights: number[]): string {
		return pickByWeight(choices, weights, this.next());
	}
}
