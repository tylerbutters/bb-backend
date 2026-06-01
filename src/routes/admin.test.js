import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import app from "../app.js"
import { db } from "../db.js"
import { SESSION_COOKIE_NAME, hashSessionToken } from "../services/sessions.js"

const originalDbQuery = db.query
const originalAdminEmails = process.env.ADMIN_EMAILS

function createUser(overrides = {}) {
	return {
		id: 1,
		email: "admin@example.com",
		displayName: "Admin",
		plan: "free",
		role: "admin",
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

afterEach(() => {
	db.query = originalDbQuery
	if (originalAdminEmails === undefined) {
		delete process.env.ADMIN_EMAILS
		return
	}

	process.env.ADMIN_EMAILS = originalAdminEmails
})

describe("admin routes", () => {
	it("rejects logged-out users", async () => {
		await withServer(async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/v1/admin/users`)
			const result = await readResponse(response)

			assert.equal(result.status, 401)
			assert.equal(result.body.error.code, "AUTHENTICATION_REQUIRED")
		})
	})

	it("rejects authenticated non-admin users", async () => {
		process.env.ADMIN_EMAILS = ""
		const sessionToken = "plain-session-token"
		db.query = async (sql, params = []) => {
			if (sql.includes("FROM user_sessions s")) {
				assert.deepEqual(params, [hashSessionToken(sessionToken)])
				return {
					rowCount: 1,
					rows: [createSessionRow(createUser({ role: "user" }))],
				}
			}

			return { rowCount: 1, rows: [] }
		}

		await withServer(async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/v1/admin/users`, {
				headers: {
					cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
				},
			})
			const result = await readResponse(response)

			assert.equal(result.status, 403)
			assert.equal(result.body.error.code, "ADMIN_ACCESS_FORBIDDEN")
		})
	})

	it("promotes allowlisted session users and returns user search results", async () => {
		process.env.ADMIN_EMAILS = "admin@example.com"
		const sessionToken = "plain-session-token"
		const listedUser = createUser({
			id: 2,
			email: "tyler@example.com",
			displayName: "Tyler",
			role: "user",
		})
		const calls = []

		db.query = async (sql, params = []) => {
			calls.push({ sql, params })

			if (sql.includes("FROM user_sessions s")) {
				return {
					rowCount: 1,
					rows: [createSessionRow(createUser({ role: "user" }))],
				}
			}

			if (sql.includes("UPDATE user_sessions")) {
				return { rowCount: 1, rows: [] }
			}

			if (sql.includes("UPDATE users") && sql.includes("SET role = 'admin'")) {
				return {
					rowCount: 1,
					rows: [createUser({ role: "admin" })],
				}
			}

			if (sql.includes("FROM users") && sql.includes("ILIKE")) {
				assert.deepEqual(params, ["%tyler%", 2, 0])
				return {
					rowCount: 1,
					rows: [listedUser],
				}
			}

			return { rowCount: 0, rows: [] }
		}

		await withServer(async (baseUrl) => {
			const response = await fetch(
				`${baseUrl}/api/v1/admin/users?query=tyler&limit=1&offset=0`,
				{
					headers: {
						cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
					},
				},
			)
			const result = await readResponse(response)

			assert.equal(result.status, 200)
			assert.deepEqual(result.body, {
				items: [listedUser],
				hasMore: false,
				nextOffset: null,
			})
			assert.equal(
				calls.some((call) => call.sql.includes("SET role = 'admin'")),
				true,
			)
		})
	})

	it("returns selected user game history with admin visibility", async () => {
		const sessionToken = "plain-session-token"
		db.query = async (sql, params = []) => {
			if (sql.includes("FROM user_sessions s")) {
				return {
					rowCount: 1,
					rows: [createSessionRow(createUser())],
				}
			}

			if (sql.includes("UPDATE user_sessions")) {
				return { rowCount: 1, rows: [] }
			}

			if (sql.includes("FROM user_game_results")) {
				assert.doesNotMatch(sql, /created_at >=/)
				assert.deepEqual(params, [2, "conjugations", 2, 0])
				return {
					rowCount: 2,
					rows: [
						{
							id: "9",
							challenge_id: "1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
							mode: "conjugations",
							difficulty: "hard",
							prompt: "Conjugate 食べる.",
							answer: "食べます",
							correct: true,
							feedback: "",
							created_at: "2026-05-28T10:00:00.000Z",
						},
						{
							id: "8",
							challenge_id: "2e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
							mode: "conjugations",
							difficulty: "hard",
							prompt: "Conjugate 飲む.",
							answer: "飲みる",
							correct: false,
							feedback: "Use 飲みます.",
							created_at: "2026-05-27T10:00:00.000Z",
						},
					],
				}
			}

			return { rowCount: 1, rows: [] }
		}

		await withServer(async (baseUrl) => {
			const response = await fetch(
				`${baseUrl}/api/v1/admin/users/2/game-history?mode=conjugations&difficulty=all&limit=1&offset=0`,
				{
					headers: {
						cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
					},
				},
			)
			const result = await readResponse(response)

			assert.equal(result.status, 200)
			assert.equal(result.body.items.length, 1)
			assert.deepEqual(result.body.items[0], {
				id: 9,
				challengeId: "1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
				mode: "conjugations",
				label: "Conjugations",
				difficulty: "hard",
				prompt: "Conjugate 食べる.",
				answer: "食べます",
				correct: true,
				feedback: "",
				createdAt: "2026-05-28T10:00:00.000Z",
			})
			assert.equal(result.body.hasMore, true)
			assert.equal(result.body.nextOffset, 1)
		})
	})
})
