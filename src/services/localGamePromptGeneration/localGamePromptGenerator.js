import {
	generateSentenceGameChallenge,
	generateSentenceGamePrompt,
} from "./sentencePromptBuilder.js"

const SENTENCE_FRAME_GAME_MODES = new Set([
	"translate",
	"conjugations",
	"fix sentence",
	"particles",
	"reorder",
])

// gameProfile describes the local content range used to build the prompt. It is returned
// with each prompt so callers can understand what vocabulary and grammar level was selected.
export const GAME_CONTENT_PROFILES = {
	translate: {
		easy: {
			vocabLevel: "easy",
			grammarLevel: "easy",
			sentenceComplexity: "simple",
		},
		medium: {
			vocabLevel: "easy",
			grammarLevel: "medium",
			sentenceComplexity: "detailed",
		},
		hard: {
			vocabLevel: "medium",
			grammarLevel: "medium",
			sentenceComplexity: "complex",
		},
	},
	conjugations: {
		easy: {
			vocabLevel: "easy",
			sentenceComplexity: "simple",
			conjugationLevel: "easy",
		},
		medium: {
			vocabLevel: "easy",
			sentenceComplexity: "detailed",
			conjugationLevel: "medium",
		},
		hard: {
			vocabLevel: "medium",
			sentenceComplexity: "complex",
			conjugationLevel: "hard",
		},
	},
	"fix sentence": {
		easy: {
			vocabLevel: "easy",
			sentenceComplexity: "simple",
			errorLevel: "easy",
		},
		medium: {
			vocabLevel: "easy",
			sentenceComplexity: "detailed",
			errorLevel: "medium",
		},
		hard: {
			vocabLevel: "medium",
			sentenceComplexity: "complex",
			errorLevel: "hard",
		},
	},
	particles: {
		easy: {
			vocabLevel: "easy",
			sentenceComplexity: "simple",
			particleLevel: "easy",
		},
		medium: {
			vocabLevel: "easy",
			sentenceComplexity: "detailed",
			particleLevel: "medium",
		},
		hard: {
			vocabLevel: "medium",
			sentenceComplexity: "complex",
			particleLevel: "hard",
		},
	},
	reorder: {
		easy: {
			vocabLevel: "easy",
			sentenceComplexity: "simple",
			wordOrderLevel: "easy",
		},
		medium: {
			vocabLevel: "easy",
			sentenceComplexity: "detailed",
			wordOrderLevel: "medium",
		},
		hard: {
			vocabLevel: "medium",
			sentenceComplexity: "complex",
			wordOrderLevel: "hard",
		},
	},
}

export function generateLocalGamePrompt({
	mode,
	difficulty = "easy",
	randomNumber = Math.random,
}) {
	if (SENTENCE_FRAME_GAME_MODES.has(mode)) {
		return generateSentenceGamePrompt({
			mode,
			difficulty,
			gameProfile: getGameProfile(mode, difficulty),
			randomNumber,
		})
	}

	return null
}

// Includes server-only expected answer data. Routes should send only challenge.prompt
// to the client and keep the expected answer data in backend storage.
export function generateLocalGameChallenge({
	mode,
	difficulty = "easy",
	randomNumber = Math.random,
}) {
	if (SENTENCE_FRAME_GAME_MODES.has(mode)) {
		return generateSentenceGameChallenge({
			mode,
			difficulty,
			gameProfile: getGameProfile(mode, difficulty),
			randomNumber,
		})
	}

	return null
}

function getGameProfile(mode, difficulty) {
	const gameProfiles = GAME_CONTENT_PROFILES[mode]

	return gameProfiles[difficulty] || gameProfiles.easy
}
