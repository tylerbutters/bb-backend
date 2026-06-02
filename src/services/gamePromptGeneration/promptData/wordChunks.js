import { getPromptVocabularyEntry } from "./promptVocabulary.js"

export function buildWordChunk(key, particle, data = {}) {
	const baseWord = getPromptVocabularyEntry(key)

	return {
		kanji: baseWord.kanji,
		kana: baseWord.kana,
		...data,
		...(particle ? { particle } : {}),
	}
}

export function buildConjugatedWordChunk(key, particle, form) {
	return buildWordChunk(key, particle, { conjugation: form })
}
