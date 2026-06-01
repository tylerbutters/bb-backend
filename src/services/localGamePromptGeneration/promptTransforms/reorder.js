export function scrambleSentenceChunks(sentenceChunks) {
	// Keep scrambling deterministic so tests can assert exact prompts for each sentence size.
	const indexesByLength = {
		3: [1, 2, 0],
		4: [1, 3, 0, 2],
		5: [1, 3, 4, 0, 2],
		6: [1, 2, 5, 0, 3, 4],
	}
	const indexes =
		indexesByLength[sentenceChunks.length] ||
		sentenceChunks.map((_, index) => (index + 1) % sentenceChunks.length)

	return indexes.map((index) => ({ ...sentenceChunks[index] }))
}
