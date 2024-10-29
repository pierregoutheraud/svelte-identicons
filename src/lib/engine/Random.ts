export class Random {
	private numberSeed: number;

	constructor(seed: string) {
		this.numberSeed = this.hashStringToInteger(seed);
	}

	private hashStringToInteger(seed: string): number {
		let hash = 0;
		for (let i = 0; i < seed.length; i++) {
			const char = seed.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			// hash = hash & hash; // Convert to 32bit integer
			hash = hash >>> 0; // Convert to 32bit unsigned integer
		}
		return hash;
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
		// Calculate the cumulative weights
		const cumulativeWeights: number[] = [];
		for (let i = 0; i < weights.length; i++) {
			cumulativeWeights[i] = weights[i] + (cumulativeWeights[i - 1] || 0);
		}
		// console.log("Random | weights", weights);
		// console.log("Random | cumulativeWeights", cumulativeWeights);

		// Generate a random number between 0 and the sum of weights
		const random =
			this.next() * cumulativeWeights[cumulativeWeights.length - 1];

		// Find the index where the random number fits in the cumulative weights
		for (let i = 0; i < cumulativeWeights.length; i++) {
			if (random < cumulativeWeights[i]) {
				return choices[i];
			}
		}

		// This should never happen if weights are properly set
		throw new Error("Failed to pick a choice.");
	}
}
