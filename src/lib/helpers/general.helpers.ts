export function generateUniqId() {
	return Math.floor(Math.random() * Math.pow(10, 16)).toString(16);
}

function dec2hex(dec: any) {
	return dec.toString(16).padStart(2, "0");
}

// generateId :: Integer -> String
export function generateId(len: number) {
	const arr = new Uint8Array((len || 40) / 2);
	window.crypto.getRandomValues(arr);
	return Array.from(arr, dec2hex).join("");
}

export function generatePseudoWord(length: number): string {
	// English letter frequency from most common to least common
	const letters =
		"eeeeeeeeeeeeaaaaaaaaaiiiiiioooooonnnnrrrtttllssuuuuuuuuuddddddgggbbbbccmmppffhhvvwwyykjxqz";

	let word = "";
	for (let i = 0; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * letters.length);
		word += letters[randomIndex];
	}

	return word;
}
