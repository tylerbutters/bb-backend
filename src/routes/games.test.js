import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import app from "../app.js"
import { db } from "../db.js"
import { clearGameChallenges } from "../services/gameChallengeStore.js"
import { generateGamePrompt } from "../services/games.js"
import { SESSION_COOKIE_NAME, hashSessionToken } from "../services/sessions.js"

const originalDbQuery = db.query
const originalOpenAiApiKey = process.env.OPENAI_API_KEY
const originalConsoleLog = console.log

function createUser(overrides = {}) {
	return {
		id: 1,
		email: "tyler@example.com",
		displayName: "Tyler",
		plan: "free",
		role: "user",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	}
}

function createSessionRow(user) {
	return {
		sessionId: 7,
		...user,
	}
}

async function withServer(callback) {
	const server = await new Promise((resolve, reject) => {
		const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer))
		nextServer.on("error", reject)
	})

	try {
		const { port } = server.address()
		return await callback(`http://127.0.0.1:${port}`)
	} finally {
		await new Promise((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()))
		})
	}
}

async function readResponse(response) {
	return {
		status: response.status,
		body: await response.json(),
	}
}

function useLoggedInGameRouteQueryStub({ sessionToken }) {
	let hasRecordedResult = false
	const calls = []

	db.query = async (sql, params = []) => {
		calls.push({ sql, params })

		if (sql.includes("FROM user_sessions s")) {
			assert.deepEqual(params, [hashSessionToken(sessionToken)])
			return {
				rowCount: 1,
				rows: [createSessionRow(createUser())],
			}
		}

		if (sql.includes("UPDATE user_sessions")) {
			return { rowCount: 1, rows: [] }
		}

		if (sql.includes("SELECT 1") && sql.includes("FROM user_game_results")) {
			return {
				rowCount: hasRecordedResult ? 1 : 0,
				rows: hasRecordedResult ? [{}] : [],
			}
		}

		if (sql.includes("SELECT plan") && sql.includes("FROM users")) {
			return {
				rowCount: 1,
				rows: [{ plan: "free" }],
			}
		}

		if (sql.includes("COUNT(*) AS used")) {
			return {
				rowCount: 1,
				rows: [{ used: hasRecordedResult ? "1" : "0" }],
			}
		}

		if (sql.includes("INSERT INTO user_game_results")) {
			const inserted = !hasRecordedResult
			hasRecordedResult = true
			return { rowCount: inserted ? 1 : 0, rows: [] }
		}

		if (sql.includes("UPDATE user_game_results")) {
			return { rowCount: hasRecordedResult ? 1 : 0, rows: [] }
		}

		throw new Error(`Unexpected query in games route test: ${sql}`)
	}

	return calls
}

afterEach(() => {
	db.query = originalDbQuery
	console.log = originalConsoleLog
	if (originalOpenAiApiKey === undefined) {
		delete process.env.OPENAI_API_KEY
		return
	}

	process.env.OPENAI_API_KEY = originalOpenAiApiKey
})

describe("game routes", () => {
	it("requires login before returning generated check results", async () => {
		clearGameChallenges()
		const prompt = await generateGamePrompt({
			mode: "particles",
			difficulty: "easy",
			randomNumber: () => 0,
		})

		await withServer(async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/v1/games/check`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					mode: "particles",
					difficulty: "easy",
					prompt: prompt.prompt,
					answer: "私は寿司を食べる",
					challengeId: prompt.challengeId,
				}),
			})
			const result = await readResponse(response)

			assert.equal(result.status, 401)
			assert.equal(result.body.error.code, "LOGIN_REQUIRED_FOR_CHALLENGE_CHECKS")
		})
	})

	it("requires login when a challenge cannot be checked from a saved challenge", async () => {
		clearGameChallenges()
		delete process.env.OPENAI_API_KEY
		console.log = () => {}

		await withServer(async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/v1/games/check`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					mode: "translate",
					difficulty: "easy",
					prompt: "I eat sushi.",
					answer: "私は寿司を食べる",
					challengeId: "1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
				}),
			})
			const result = await readResponse(response)

			assert.equal(result.status, 401)
			assert.equal(result.body.error.code, "LOGIN_REQUIRED_FOR_CHALLENGE_CHECKS")
		})
	})

	it("requires login before loading generated challenge feedback", async () => {
		clearGameChallenges()
		delete process.env.OPENAI_API_KEY
		console.log = () => {}
		const prompt = await generateGamePrompt({
			mode: "conjugations",
			difficulty: "easy",
			randomNumber: () => 0,
		})
		const requestBody = {
			mode: "conjugations",
			difficulty: "easy",
			prompt: prompt.prompt,
			answer: "私は寿司を食べる",
			challengeId: prompt.challengeId,
		}

		await withServer(async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/v1/games/feedback`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify(requestBody),
			})
			const result = await readResponse(response)

			assert.equal(result.status, 401)
			assert.equal(result.body.error.code, "LOGIN_REQUIRED_FOR_CHALLENGE_CHECKS")
		})
	})

	it("returns incorrect generated results with quota and loads feedback separately", async () => {
		clearGameChallenges()
		delete process.env.OPENAI_API_KEY
		console.log = () => {}
		const sessionToken = "plain-session-token"
		const calls = useLoggedInGameRouteQueryStub({ sessionToken })
		const prompt = await generateGamePrompt({
			mode: "conjugations",
			difficulty: "easy",
			randomNumber: () => 0,
		})
		const requestBody = {
			mode: "conjugations",
			difficulty: "easy",
			prompt: prompt.prompt,
			answer: "私は寿司を食べる",
			challengeId: prompt.challengeId,
		}

		await withServer(async (baseUrl) => {
			const checkResponse = await fetch(`${baseUrl}/api/v1/games/check`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
				},
				body: JSON.stringify(requestBody),
			})
			const checkResult = await readResponse(checkResponse)

			assert.equal(checkResult.status, 200)
			assert.equal(checkResult.body.correct, false)
			assert.equal(checkResult.body.feedback, "")
			assert.equal(checkResult.body.feedbackPending, true)
			assert.equal(checkResult.body.quota.used, 1)
			assert.equal(
				checkResult.body.quota.remaining,
				checkResult.body.quota.limit - checkResult.body.quota.used,
			)

			const feedbackResponse = await fetch(`${baseUrl}/api/v1/games/feedback`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
				},
				body: JSON.stringify(requestBody),
			})
			const feedbackResult = await readResponse(feedbackResponse)

			assert.equal(feedbackResult.status, 200)
			assert.equal(feedbackResult.body.correct, false)
			assert.match(feedbackResult.body.feedback, /Correct sentence: 私は 寿司を 食べた/)
			assert.equal(feedbackResult.body.quota.used, 1)
		})

		assert.equal(
			calls.some((call) => call.sql.includes("UPDATE user_game_results")),
			true,
		)
	})
})
