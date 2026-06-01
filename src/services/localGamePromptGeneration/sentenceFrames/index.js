import { EASY_SENTENCE_FRAMES } from "./easySentenceFrames.js"
import { createFrameContext, formatEnglishPrompt, pick } from "./frameHelpers.js"
import { HARD_SENTENCE_FRAMES } from "./hardSentenceFrames.js"
import { MEDIUM_SENTENCE_FRAMES } from "./mediumSentenceFrames.js"

const SENTENCE_FRAMES_BY_DIFFICULTY = {
	easy: EASY_SENTENCE_FRAMES,
	medium: MEDIUM_SENTENCE_FRAMES,
	hard: HARD_SENTENCE_FRAMES,
}

// Each sentence frame has three responsibilities:
// pick vocabulary/grammar parts, build the English prompt, and build Japanese chunks.
export function generateSentenceFromFrame({
	difficulty = "easy",
	randomNumber = Math.random,
} = {}) {
	return generateSentenceFromMatchingFrame({ difficulty, randomNumber })
}

export function generateSentenceWithConjugationFromFrame({
	difficulty = "easy",
	randomNumber = Math.random,
} = {}) {
	return generateSentenceFromMatchingFrame({
		difficulty,
		randomNumber,
		requireConjugationParts: true,
	})
}

function generateSentenceFromMatchingFrame({
	difficulty,
	randomNumber,
	requireConjugationParts = false,
}) {
	const resolvedDifficulty = resolveDifficulty(difficulty)
	const sentenceFrames = getMatchingSentenceFrames(resolvedDifficulty, requireConjugationParts)
	const sentenceFrame = pick(sentenceFrames, randomNumber)
	const frameContext = createFrameContext({ difficulty: resolvedDifficulty, randomNumber })
	const sentenceParts = pickSentenceParts(sentenceFrame, frameContext, requireConjugationParts)

	return buildGeneratedSentence(sentenceFrame, sentenceParts)
}

function getMatchingSentenceFrames(difficulty, requireConjugationParts) {
	const sentenceFrames = SENTENCE_FRAMES_BY_DIFFICULTY[difficulty]

	if (!requireConjugationParts) return sentenceFrames

	// Conjugation games need a sentence that already contains conjugated Japanese chunks.
	return sentenceFrames.filter((frame) => typeof frame.pickConjugationParts === "function")
}

function pickSentenceParts(sentenceFrame, frameContext, requireConjugationParts) {
	if (requireConjugationParts) return sentenceFrame.pickConjugationParts(frameContext)

	return sentenceFrame.pickParts(frameContext)
}

function buildGeneratedSentence(sentenceFrame, sentenceParts) {
	return {
		prompt: formatEnglishPrompt(sentenceFrame.buildEnglish(sentenceParts)),
		japaneseTranslation: sentenceFrame.buildJapanese(sentenceParts),
		templateId: sentenceFrame.id,
	}
}

function resolveDifficulty(difficulty) {
	return SENTENCE_FRAMES_BY_DIFFICULTY[difficulty] ? difficulty : "easy"
}
