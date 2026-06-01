import { randomUUID } from "node:crypto"
import { HttpError } from "../errors.js"
import { GAME_MODES } from "../gameModes.js"
import { generateLocalGameChallenge } from "./localGamePromptGeneration/localGamePromptGenerator.js"
import {
	buildAcceptedJapaneseAnswerTexts,
	buildJapaneseAnswerFeedbackParts,
	buildJapaneseAnswerFeedbackText,
	normalizeJapaneseAnswerText,
} from "./localGamePromptGeneration/localAnswerText.js"
import {
	cacheLocalGameChallengeResult,
	findLocalGameChallenge,
	getCachedLocalGameChallengeResult,
	saveLocalGameChallenge,
} from "./localGameChallenges.js"
import { checkJapaneseGameAnswer, generateJapaneseGameFeedback } from "./sentences.js"

const LOCAL_CHECK_FEEDBACK_BY_MODE = {
	conjugations: (expectedAnswer) =>
		`Correct sentence: ${expectedAnswer}. Check the conjugation on the target word.`,
	"fix sentence": (expectedAnswer) =>
		`Correct sentence: ${expectedAnswer}. Compare it with the provided sentence and look for the changed word or particle.`,
	particles: (expectedAnswer) =>
		`Correct sentence: ${expectedAnswer}. Check which particles attach to each word.`,
	reorder: (expectedAnswer) =>
		`Correct order: ${expectedAnswer}. Keep the same chunks, but move them into this order.`,
}

const gameCheckInstructions = {
	translate: [
		"The prompt is an English sentence.",
		"The answer is the learner's Japanese sentence.",
		"Compare the English sentence with the learner's Japanese sentence.",
		"Mark correct when the Japanese naturally communicates the same meaning, even if wording differs.",
	].join(" "),
	conjugations: [
		"The prompt is an English sentence that requires a specific Japanese verb or adjective conjugation.",
		"The answer is the learner's Japanese sentence.",
		"This exercise is focused only on conjugation.",
		"Mark correct when the answer uses the required conjugation on the intended verb or adjective.",
		"Do not mark incorrect or give feedback about particles, word order, vocabulary, or other non-conjugation issues unless they make the target conjugation impossible to identify.",
	].join(" "),
	"fix sentence": [
		"The prompt is an English target meaning.",
		"The learner was given Japanese sentence elements in normal order with one or more wrong particles or words.",
		"The answer is the learner's corrected Japanese sentence.",
		"This exercise is focused only on fixing the wrong particles or words.",
		"Mark correct when the answer fixes those focused mistakes and still communicates the target meaning.",
		"Do not mark incorrect or give feedback about unrelated grammar, style, word order, or optional phrasing unless they prevent identifying the focused fixes.",
	].join(" "),
	particles: [
		"The prompt is an English target meaning for a Japanese sentence with missing particles.",
		"The answer is the learner's completed Japanese sentence.",
		"This exercise is focused only on particle choice.",
		"Mark correct when the learner chose fitting particles for the provided sentence elements.",
		"Do not mark incorrect or give feedback about conjugation, word order, vocabulary, or other non-particle issues unless they make the particle choices impossible to identify.",
	].join(" "),
	reorder: [
		"The prompt is an English target meaning.",
		"The learner was given the Japanese sentence elements in the wrong order.",
		"The answer is the learner's reordered Japanese sentence.",
		"This exercise is focused only on word order.",
		"Mark correct when the provided sentence elements are in a natural order for the target meaning.",
		"Do not mark incorrect or give feedback about particles, conjugation, vocabulary, or other non-order issues unless they make the word order impossible to identify.",
	].join(" "),
}

const ATTACHED_PARTICLES = new Set([
	"から",
	"は",
	"も",
	"が",
	"を",
	"に",
	"へ",
	"で",
	"と",
	"こそ",
	"さえ",
	"しか",
	"ばかり",
	"だけ",
	"のみ",
	"の",
	"な",
])

const CONJUGATION_HELPER_WORDS = new Set([
	"たい",
	"たかった",
	"ほしい",
	"欲しい",
	"ない",
	"なかった",
	"ません",
	"ました",
	"られる",
	"れる",
	"させる",
	"せる",
	"せられる",
])

function normalizeJapaneseTranslationWords(words) {
	if (!Array.isArray(words)) return []

	return words
		.map((word) => {
			const normalizedWord = {
				kanji: String(word?.kanji || "").trim(),
				kana: String(word?.kana || "").trim(),
			}
			const particle = String(word?.particle || "").trim()

			if (particle) normalizedWord.particle = particle

			return normalizedWord
		})
		.filter((word) => word.kanji && word.kana)
}

function hasStandaloneAttachedParticle(words) {
	return words.some(
		(word) => word.kanji === word.kana && ATTACHED_PARTICLES.has(word.kanji) && !word.particle,
	)
}

function hasConjugationHelperWord(words) {
	return words.some((word) => {
		const values = [word.kanji, word.kana]
		return values.some((value) => CONJUGATION_HELPER_WORDS.has(value))
	})
}

export function validateConjugationPrompt(data) {
	const prompt = String(data?.prompt || "").trim()
	const japaneseTranslation = normalizeJapaneseTranslationWords(data?.japaneseTranslation)

	if (
		!prompt ||
		japaneseTranslation.length === 0 ||
		hasConjugationMetadata(data?.japaneseTranslation) ||
		hasStandaloneAttachedParticle(japaneseTranslation) ||
		hasConjugationHelperWord(japaneseTranslation)
	) {
		throw new HttpError(502, "Prompt generator returned an invalid conjugation prompt.", {
			code: "AI_INVALID_RESPONSE",
			logMessage: `Invalid conjugation prompt: ${JSON.stringify(data)}`,
		})
	}

	return {
		prompt,
		japaneseTranslation,
	}
}

function hasConjugationMetadata(words) {
	if (!Array.isArray(words)) return false

	return words.some(
		(word) => word && typeof word === "object" && Object.hasOwn(word, "conjugation"),
	)
}

function gameModeError(mode) {
	return new HttpError(400, "Game mode is not supported.", {
		code: "UNSUPPORTED_GAME_MODE",
		details: {
			mode,
			supportedModes: GAME_MODES,
		},
	})
}

export function getGameCheckInstructions(mode) {
	const checkInstructions = gameCheckInstructions[mode]
	if (!checkInstructions) throw gameModeError(mode)

	return checkInstructions
}

export async function generateGamePrompt({
	mode,
	difficulty = "easy",
	randomNumber = Math.random,
}) {
	const localChallenge = generateLocalGameChallenge({ mode, difficulty, randomNumber })
	if (!localChallenge) throw gameModeError(mode)

	const challengeId = randomUUID()
	const prompt = localChallenge.prompt
	const expectedAnswers = buildAcceptedJapaneseAnswerTexts(
		localChallenge.expectedJapaneseTranslation,
	)
	const expectedAnswerFeedbackText = buildJapaneseAnswerFeedbackText(
		localChallenge.expectedJapaneseTranslation,
	)
	const expectedAnswerParts = buildJapaneseAnswerFeedbackParts(
		localChallenge.expectedJapaneseTranslation,
	)
	const expectedAnswerKanaParts = buildJapaneseAnswerFeedbackParts(
		localChallenge.expectedJapaneseTranslation,
		"kana",
	)
	saveLocalGameChallenge({
		challengeId,
		mode,
		difficulty,
		prompt: prompt.prompt,
		expectedAnswers,
		expectedAnswerFeedbackText,
		expectedAnswerParts,
		expectedAnswerKanaParts,
	})

	return {
		...prompt,
		challengeId,
	}
}

export async function checkGameAnswer(
	{ mode, prompt, answer, challengeId, difficulty = "easy" },
	{ checkAnswer = checkJapaneseGameAnswer } = {},
) {
	const checkInstructions = getGameCheckInstructions(mode)
	const localResult = checkGeneratedGameAnswerLocally({
		mode,
		prompt,
		answer,
		challengeId,
		difficulty,
	})
	if (localResult) return localResult

	const { challenge, answerKey } = getGeneratedChallengeCheckData({
		mode,
		prompt,
		answer,
		challengeId,
		difficulty,
	})
	const cachedResult = getCachedLocalGameChallengeResult(challenge, answerKey)
	if (cachedResult) return cachedResult

	const result = await checkAnswer({
		gameTitle: mode,
		prompt,
		answer,
		checkInstructions,
	})
	if (challenge) {
		cacheLocalGameChallengeResult(challenge, answerKey, result)
	}

	return result
}

export function checkGeneratedGameAnswerLocally({
	mode,
	prompt,
	answer,
	challengeId,
	difficulty = "easy",
}) {
	const { challenge, answerKey } = getGeneratedChallengeCheckData({
		mode,
		prompt,
		answer,
		challengeId,
		difficulty,
	})
	if (!challenge?.expectedAnswers?.length) return null

	const cachedResult = getCachedLocalGameChallengeResult(challenge, answerKey)
	if (cachedResult) return cachedResult

	const result = buildLocalGeneratedGameAnswerResult({ mode, answerKey, challenge })
	if (result.correct) {
		cacheLocalGameChallengeResult(challenge, answerKey, result)
	}

	return result
}

export async function generateLocalGameAnswerFeedback(
	{ mode, prompt, answer, challengeId, difficulty = "easy" },
	{ generateFeedback = generateJapaneseGameFeedback } = {},
) {
	const checkInstructions = getGameCheckInstructions(mode)
	const { challenge, answerKey } = getGeneratedChallengeCheckData({
		mode,
		prompt,
		answer,
		challengeId,
		difficulty,
	})
	if (!challenge?.expectedAnswers?.length) return null

	const localResult = buildLocalGeneratedGameAnswerResult({ mode, answerKey, challenge })
	if (localResult.correct) {
		cacheLocalGameChallengeResult(challenge, answerKey, localResult)
		return localResult
	}

	const fallbackFeedback = localGeneratedGameFeedback(mode, challenge)

	try {
		const feedback = await generateFeedback({
			gameTitle: mode,
			prompt,
			answer,
			expectedAnswer: challenge.expectedAnswerFeedbackText || challenge.expectedAnswers[0],
			answerDiff: buildLocalAnswerDiff({ answer, challenge }),
			checkInstructions,
		})
		const result = {
			correct: false,
			feedback: feedback || fallbackFeedback,
		}
		cacheLocalGameChallengeResult(challenge, answerKey, result)

		return result
	} catch (error) {
		console.log(error)
		return {
			correct: false,
			feedback: fallbackFeedback,
		}
	}
}

export async function checkSandboxSentence(
	{ answer },
	{ checkAnswer = checkJapaneseGameAnswer } = {},
) {
	return checkAnswer({
		gameTitle: "sandbox sentence check",
		prompt: "Evaluate the learner's standalone Japanese sentence.",
		answer,
		checkInstructions: [
			"The prompt is only context; there is no target translation.",
			"The answer is a standalone Japanese sentence built by a beginner learner.",
			"Mark correct when the sentence is grammatical, natural enough, and understandable Japanese.",
			"Do not mark incorrect only because punctuation is missing or because several natural phrasings are possible.",
			"If incorrect, explain the main grammar or word-choice issue and suggest a concise fix.",
		].join(" "),
	})
}

function buildLocalGeneratedGameAnswerResult({ mode, answerKey, challenge }) {
	const normalizedExpectedAnswers = challenge.expectedAnswers.map(normalizeJapaneseAnswerText)
	const correct = normalizedExpectedAnswers.includes(answerKey)

	return {
		correct,
		feedback: correct ? "" : localGeneratedGameFeedback(mode, challenge),
	}
}

function getGeneratedChallengeCheckData({ mode, prompt, answer, challengeId, difficulty }) {
	return {
		challenge: findLocalGameChallenge({ challengeId, mode, difficulty, prompt }),
		answerKey: normalizeJapaneseAnswerText(answer),
	}
}

function localGeneratedGameFeedback(mode, challenge) {
	const expectedAnswer = challenge.expectedAnswerFeedbackText || challenge.expectedAnswers[0]
	const feedbackBuilder = LOCAL_CHECK_FEEDBACK_BY_MODE[mode]

	if (expectedAnswer && feedbackBuilder) return feedbackBuilder(expectedAnswer)
	if (expectedAnswer) return `Correct sentence: ${expectedAnswer}. Try again.`

	return "Try again."
}

function buildLocalAnswerDiff({ answer, challenge }) {
	const answerKey = normalizeJapaneseAnswerText(answer)
	const expectedPartSet = selectExpectedPartSetForAnswer(answerKey, challenge)
	const expectedParts = expectedPartSet.parts
	const expectedAnswer = (challenge.expectedAnswerParts || []).join(" ")

	if (!expectedParts.length) {
		return {
			expectedAnswer,
			submittedAnswer: answer,
		}
	}

	const matchedParts = []
	let answerCursor = 0

	for (let index = 0; index < expectedParts.length; index += 1) {
		const expectedPart = expectedParts[index]
		const expectedPartKey = normalizeJapaneseAnswerText(expectedPart)

		if (expectedPartKey && answerKey.startsWith(expectedPartKey, answerCursor)) {
			matchedParts.push(expectedPart)
			answerCursor += expectedPartKey.length
			continue
		}

		return {
			expectedAnswer,
			submittedAnswer: answer,
			matchedPrefix: matchedParts.join(" "),
			expectedChunk: displayExpectedChunk(challenge, index, expectedPart),
			submittedChunk: submittedChunkBeforeNextExpectedPart({
				answerKey,
				answerCursor,
				remainingExpectedParts: expectedParts.slice(index + 1),
			}),
		}
	}

	const extraText = answerKey.slice(answerCursor)
	if (extraText) {
		return {
			expectedAnswer,
			submittedAnswer: answer,
			matchedPrefix: matchedParts.join(" "),
			expectedChunk: "",
			submittedChunk: extraText,
			extraText,
		}
	}

	return {
		expectedAnswer,
		submittedAnswer: answer,
		matchedPrefix: matchedParts.join(" "),
	}
}

function selectExpectedPartSetForAnswer(answerKey, challenge) {
	const expectedPartSets = [
		{ parts: challenge.expectedAnswerParts || [] },
		{ parts: challenge.expectedAnswerKanaParts || [] },
	].filter((partSet) => partSet.parts.length > 0)

	return expectedPartSets.reduce(
		(bestPartSet, partSet) =>
			countMatchingPrefixParts(answerKey, partSet.parts) >
			countMatchingPrefixParts(answerKey, bestPartSet.parts)
				? partSet
				: bestPartSet,
		expectedPartSets[0] || { parts: [] },
	)
}

function countMatchingPrefixParts(answerKey, expectedParts) {
	let answerCursor = 0
	let matchingParts = 0

	for (const expectedPart of expectedParts) {
		const expectedPartKey = normalizeJapaneseAnswerText(expectedPart)
		if (!expectedPartKey || !answerKey.startsWith(expectedPartKey, answerCursor)) break

		answerCursor += expectedPartKey.length
		matchingParts += 1
	}

	return matchingParts
}

function displayExpectedChunk(challenge, index, fallbackChunk) {
	return challenge.expectedAnswerParts?.[index] || fallbackChunk
}

function submittedChunkBeforeNextExpectedPart({
	answerKey,
	answerCursor,
	remainingExpectedParts,
}) {
	const remainingAnswer = answerKey.slice(answerCursor)
	if (!remainingAnswer) return "(missing)"

	const nextExpectedPartPosition = remainingExpectedParts
		.map((part) => remainingAnswer.indexOf(normalizeJapaneseAnswerText(part)))
		.filter((position) => position > -1)
		.sort((left, right) => left - right)[0]

	if (nextExpectedPartPosition === undefined) return remainingAnswer

	return remainingAnswer.slice(0, nextExpectedPartPosition) || "(missing)"
}
