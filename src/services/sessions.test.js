import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createSessionService, hashSessionToken } from "./sessions.js"

function createQueryStub({ sessionUser } = {}) {
	const calls = []
	const query = async (sql, params = []) => {
		calls.push({ sql, params })

		if (sql.includes("FROM user_sessions s")) {
			return {
				rowCount: sessionUser ? 1 : 0,
				rows: sessionUser ? [{ sessionId: 7, ...sessionUser }] : [],
			}
		}

		return { rowCount: 1, rows: [] }
	}

	return { calls, query }
}

describe("session service", () => {
	it("stores only a hash of a new session token", async () => {
		const { calls, query } = createQueryStub()
		const service = createSessionService({
			query,
			createRawToken: () => "plain-session-token",
			now: () => new Date("2026-01-01T00:00:00.000Z"),
		})

		const session = await service.createUserSession(12)

		assert.equal(session.token, "plain-session-token")
		assert.equal(session.expiresAt.toISOString(), "2026-01-31T00:00:00.000Z")
		assert.equal(calls[0].sql.includes("INSERT INTO user_sessions"), true)
		assert.deepEqual(calls[0].params, [
			12,
			hashSessionToken("plain-session-token"),
			new Date("2026-01-31T00:00:00.000Z"),
		])
		assert.equal(calls[0].params.includes("plain-session-token"), false)
	})

	it("loads a user from an active session and updates last_used_at", async () => {
		const sessionUser = {
			id: 12,
			email: "user@example.com",
			plan: "free",
			role: "user",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		}
		const { calls, query } = createQueryStub({ sessionUser })
		const service = createSessionService({ query })

		assert.deepEqual(await service.getSessionByToken("plain-session-token"), {
			sessionId: 7,
			tokenHash: hashSessionToken("plain-session-token"),
			user: sessionUser,
		})
		assert.equal(
			calls.some(
				(call) => call.sql.includes("UPDATE user_sessions") && call.params[0] === 7,
			),
			true,
		)
	})

	it("revokes a session by token hash", async () => {
		const { calls, query } = createQueryStub()
		const service = createSessionService({ query })

		await service.revokeSessionToken("plain-session-token")

		assert.equal(calls[0].sql.includes("SET revoked_at = NOW()"), true)
		assert.deepEqual(calls[0].params, [hashSessionToken("plain-session-token")])
	})
})
