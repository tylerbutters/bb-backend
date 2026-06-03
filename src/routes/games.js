import { Router } from "express"
import { HttpError, asyncHandler } from "../errors.js"
import { clearSessionCookie, getSessionToken } from "../middleware/auth.js"
import { validateBody, validateQuery } from "../middleware/validate.js"
import {
	gameCheckSchema,
	gamePromptQuerySchema,
	sandboxCheckSchema,
	translateSchema,
} from "../schemas/games.js"
import {
	assertCanUseChallengeCheck,
	getUserGameQuota,
	recordGameResult,
	updateGameResultFeedback,
} from "../services/gameStats.js"
import {
	checkGameAnswer,
	checkGeneratedGameAnswer,
	checkSandboxSentence,
	generateGamePrompt,
	generateChallengeAnswerFeedback,
} from "../services/games.js"
import { getSessionByToken } from "../services/sessions.js"
import { translateJapanese } from "../services/translate.js"

const router = Router()

async function sendJapaneseTranslation(req, res) {
	const translation = await translateJapanese(req.validated.body.text)

	res.status(200).send({
		translation,
	})
}

async function getOptionalCurrentUser(req, res) {
	const token = getSessionToken(req)
	if (!token) return null

	try {
		const session = await getSessionByToken(token)
		if (!session) {
			if (res && !res.headersSent) {
				clearSessionCookie(res)
			}
			return null
		}

		return session.user
	} catch (error) {
		console.log(error)
		return null
	}
}

function createLoginRequiredForChallengeChecksError() {
	return new HttpError(401, "Log in to check challenge answers.", {
		code: "LOGIN_REQUIRED_FOR_CHALLENGE_CHECKS",
	})
}

router.get(
	"/prompt",
	validateQuery(gamePromptQuerySchema),
	asyncHandler(async (req, res) => {
		const { mode, difficulty } = req.validated.query
		const promptResult = await generateGamePrompt({ mode, difficulty })
		const promptData =
			typeof promptResult === "string"
				? {
						prompt: promptResult,
					}
				: promptResult

		res.status(200).json({
			mode,
			difficulty,
			...promptData,
		})
	}),
)

router.post(
	"/check",
	validateBody(gameCheckSchema),
	asyncHandler(async (req, res) => {
		const { answer, challengeId, difficulty, mode, prompt } = req.validated.body
		const currentUser = await getOptionalCurrentUser(req, res)
		if (!currentUser) {
			throw createLoginRequiredForChallengeChecksError()
		}

		await assertCanUseChallengeCheck(currentUser.id, challengeId)

		const generatedResult = checkGeneratedGameAnswer(req.validated.body)

		if (generatedResult) {
			const quota = await recordResultAndGetQuota(currentUser.id, {
				challengeId,
				mode,
				difficulty,
				prompt,
				answer,
				result: generatedResult,
			})

			res.status(200).send(
				generatedResult.correct
					? {
							...generatedResult,
							quota,
						}
					: {
							...generatedResult,
							feedback: "",
							feedbackPending: true,
							quota,
						},
			)
			return
		}

		const result = await checkGameAnswer(req.validated.body)
		const quota = await recordResultAndGetQuota(currentUser.id, {
			challengeId,
			mode,
			difficulty,
			prompt,
			answer,
			result,
		})

		res.status(200).send({
			...result,
			quota,
		})
	}),
)

router.post(
	"/feedback",
	validateBody(gameCheckSchema),
	asyncHandler(async (req, res) => {
		const { answer, challengeId, difficulty, mode, prompt } = req.validated.body
		const currentUser = await getOptionalCurrentUser(req, res)
		if (!currentUser) {
			throw createLoginRequiredForChallengeChecksError()
		}

		await assertCanUseChallengeCheck(currentUser.id, challengeId)

		const result = await generateChallengeAnswerFeedback(req.validated.body)
		if (!result) {
			throw new HttpError(404, "Feedback is not available for this challenge.", {
				code: "CHALLENGE_FEEDBACK_NOT_AVAILABLE",
			})
		}

		const quota = await recordResultAndGetQuota(currentUser.id, {
			challengeId,
			mode,
			difficulty,
			prompt,
			answer,
			result,
		})
		await updateGameResultFeedback({
			userId: currentUser.id,
			challengeId,
			feedback: result.feedback,
		})

		res.status(200).send({
			...result,
			quota,
		})
	}),
)

async function recordResultAndGetQuota(
	userId,
	{ challengeId, mode, difficulty, prompt, answer, result },
) {
	await recordGameResult({
		userId,
		challengeId,
		mode,
		difficulty,
		prompt,
		answer,
		correct: result.correct,
		feedback: result.feedback,
	})

	return getUserGameQuota(userId)
}

router.post(
	"/sandbox/check-japanese",
	validateBody(sandboxCheckSchema),
	asyncHandler(async (req, res) => {
		const result = await checkSandboxSentence(req.validated.body)

		res.status(200).send(result)
	}),
)

router.post(
	"/sandbox/translate-japanese",
	validateBody(translateSchema),
	asyncHandler(sendJapaneseTranslation),
)

router.post("/translate", validateBody(translateSchema), asyncHandler(sendJapaneseTranslation))

export default router
