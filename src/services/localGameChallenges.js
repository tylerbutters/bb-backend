const CHALLENGE_TTL_MS = 60 * 60 * 1000
const MAX_CHALLENGES = 1000

const localGameChallenges = new Map()

export function saveLocalGameChallenge({
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

	localGameChallenges.set(challengeId, challenge)
	trimOldestChallenges()

	return challenge
}

export function findLocalGameChallenge({ challengeId, mode, difficulty, prompt }) {
	if (!challengeId) return null

	const challenge = localGameChallenges.get(challengeId)
	if (!challenge) return null

	if (challenge.expiresAt <= Date.now()) {
		localGameChallenges.delete(challengeId)
		return null
	}

	if (challenge.mode !== mode) return null
	if (challenge.difficulty !== difficulty) return null
	if (challenge.prompt !== normalizePrompt(prompt)) return null

	return challenge
}

export function getCachedLocalGameChallengeResult(challenge, answerKey) {
	const cachedResult = challenge?.checkResultsByAnswer?.get(answerKey)
	if (!cachedResult) return null

	return { ...cachedResult }
}

export function cacheLocalGameChallengeResult(challenge, answerKey, result) {
	challenge?.checkResultsByAnswer?.set(answerKey, { ...result })
}

export function getCachedLocalGameChallengeFeedback(challenge, answerKey) {
	const cachedResult = challenge?.feedbackResultsByAnswer?.get(answerKey)
	if (!cachedResult) return null

	return { ...cachedResult }
}

export function cacheLocalGameChallengeFeedback(challenge, answerKey, result) {
	challenge?.feedbackResultsByAnswer?.set(answerKey, { ...result })
}

export function clearLocalGameChallenges() {
	localGameChallenges.clear()
}

function cleanupExpiredChallenges() {
	const now = Date.now()

	for (const [challengeId, challenge] of localGameChallenges) {
		if (challenge.expiresAt <= now) {
			localGameChallenges.delete(challengeId)
		}
	}
}

function trimOldestChallenges() {
	while (localGameChallenges.size > MAX_CHALLENGES) {
		const oldestChallengeId = localGameChallenges.keys().next().value
		localGameChallenges.delete(oldestChallengeId)
	}
}

function normalizePrompt(prompt) {
	return String(prompt || "").trim()
}
