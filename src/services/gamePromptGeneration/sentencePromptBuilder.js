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
	const generatedChallenge = generateSentenceGameChallenge({
		mode,
		difficulty,
		gameProfile,
		randomNumber,
	})

	return generatedChallenge?.prompt || null
}

export function generateSentenceGameChallenge({
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
		source: "generated",
		templateId: generatedSentence.templateId,
		gameProfile,
	}
	const expectedJapaneseTranslation =
		mode === "translate"
			? null
			: generatedSentence.japaneseTranslation
	const prompt = buildPromptForMode({
		mode,
		difficulty,
		randomNumber,
		generatedSentence,
		basePrompt,
	})

	if (!prompt) return null

	return {
		prompt,
		expectedJapaneseTranslation,
	}
}

function buildPromptForMode({ mode, difficulty, randomNumber, generatedSentence, basePrompt }) {
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
