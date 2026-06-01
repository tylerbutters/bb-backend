import { randomUUID } from "node:crypto"
import { HttpError } from "../errors.js"
import { GAME_MODES } from "../gameModes.js"
import { generateLocalGamePrompt } from "./localGamePromptGeneration/localGamePromptGenerator.js"
import { checkJapaneseGameAnswer } from "./sentences.js"

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

export async function generateGamePrompt({ mode, difficulty = "easy" }) {
	const prompt = generateLocalGamePrompt({ mode, difficulty })
	if (!prompt) throw gameModeError(mode)

	return {
		...prompt,
		challengeId: randomUUID(),
	}
}

export async function checkGameAnswer({ mode, prompt, answer }) {
	const checkInstructions = getGameCheckInstructions(mode)

	return checkJapaneseGameAnswer({
		gameTitle: mode,
		prompt,
		answer,
		checkInstructions,
	})
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
