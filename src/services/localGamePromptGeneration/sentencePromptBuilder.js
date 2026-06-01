import { buildSentenceWithMistakes } from "./promptTransforms/fixSentenceMistakes.js"
import { removeInternalChunkMetadata } from "./promptTransforms/internalChunkMetadata.js"
import { scrambleSentenceChunks } from "./promptTransforms/reorder.js"
import {
	generateSentenceFromFrame,
	generateSentenceWithConjugationFromFrame,
} from "./sentenceFrames/index.js"

export function generateSentenceGamePrompt({
	mode,
	difficulty = "easy",
	gameProfile,
	randomNumber = Math.random,
}) {
	const generatedSentence =
		mode === "conjugations"
			? generateSentenceWithConjugationFromFrame({ difficulty, randomNumber })
			: generateSentenceFromFrame({ difficulty, randomNumber })
	const basePrompt = {
		prompt: generatedSentence.prompt,
		source: "local",
		templateId: generatedSentence.templateId,
		gameProfile,
	}

	switch (mode) {
		case "translate":
			return basePrompt

		case "conjugations":
			return {
				...basePrompt,
				japaneseTranslation: removeInternalChunkMetadata(
					removeGeneratedConjugations(generatedSentence.japaneseTranslation),
				),
			}

		case "particles":
			return {
				...basePrompt,
				japaneseTranslation: removeInternalChunkMetadata(
					generatedSentence.japaneseTranslation,
				).map(({ particle, ...wordData }) => wordData),
			}

		case "reorder":
			return {
				...basePrompt,
				japaneseTranslation: removeInternalChunkMetadata(
					scrambleSentenceChunks(generatedSentence.japaneseTranslation),
				),
			}

		case "fix sentence":
			return {
				...basePrompt,
				japaneseTranslation: removeInternalChunkMetadata(
					buildSentenceWithMistakes(
						generatedSentence.japaneseTranslation,
						difficulty,
						randomNumber,
					),
				),
			}

		default:
			return null
	}
}

function removeGeneratedConjugations(japaneseTranslation) {
	return japaneseTranslation.map(({ conjugation, ...wordData }) => wordData)
}
