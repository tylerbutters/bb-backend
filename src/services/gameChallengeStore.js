const CHALLENGE_TTL_MS = 60 * 60 * 1000
const MAX_CHALLENGES = 1000

const gameChallengeStore = new Map()

export function saveGameChallenge({
	challengeId,
	mode,
	difficulty,
	prompt,
	expectedAnswers = [],
	expectedAnswerFeedbackText = "",
	expectedAnswerParts = [],
	expectedAnswerKanaParts = [],
}) {
	if (!challengeId) return null

	cleanupExpiredChallenges()

	const challenge = {
		challengeId,
		mode,
		difficulty,
		prompt: normalizePrompt(prompt),
		expectedAnswers,
		expectedAnswerFeedbackText,
		expectedAnswerParts,
		expectedAnswerKanaParts,
		checkResultsByAnswer: new Map(),
		feedbackResultsByAnswer: new Map(),
		expiresAt: Date.now() + CHALLENGE_TTL_MS,
	}

	gameChallengeStore.set(challengeId, challenge)
	trimOldestChallenges()

	return challenge
}

export function findGameChallenge({ challengeId, mode, difficulty, prompt }) {
	if (!challengeId) return null

	const challenge = gameChallengeStore.get(challengeId)
	if (!challenge) return null

	if (challenge.expiresAt <= Date.now()) {
		gameChallengeStore.delete(challengeId)
		return null
	}

	if (challenge.mode !== mode) return null
	if (challenge.difficulty !== difficulty) return null
	if (challenge.prompt !== normalizePrompt(prompt)) return null

	return challenge
}

export function getCachedGameChallengeResult(challenge, answerKey) {
	const cachedResult = challenge?.checkResultsByAnswer?.get(answerKey)
	if (!cachedResult) return null

	return { ...cachedResult }
}

export function cacheGameChallengeResult(challenge, answerKey, result) {
	challenge?.checkResultsByAnswer?.set(answerKey, { ...result })
}

export function getCachedGameChallengeFeedback(challenge, answerKey) {
	const cachedResult = challenge?.feedbackResultsByAnswer?.get(answerKey)
	if (!cachedResult) return null

	return { ...cachedResult }
}

export function cacheGameChallengeFeedback(challenge, answerKey, result) {
	challenge?.feedbackResultsByAnswer?.set(answerKey, { ...result })
}

export function clearGameChallenges() {
	gameChallengeStore.clear()
}

function cleanupExpiredChallenges() {
	const now = Date.now()

	for (const [challengeId, challenge] of gameChallengeStore) {
		if (challenge.expiresAt <= now) {
			gameChallengeStore.delete(challengeId)
		}
	}
}

function trimOldestChallenges() {
	while (gameChallengeStore.size > MAX_CHALLENGES) {
		const oldestChallengeId = gameChallengeStore.keys().next().value
		gameChallengeStore.delete(oldestChallengeId)
	}
}

function normalizePrompt(prompt) {
	return String(prompt || "").trim()
}
