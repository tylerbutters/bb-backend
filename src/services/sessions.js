import { createHash, randomBytes } from "node:crypto"
import { db } from "../db.js"

export const SESSION_COOKIE_NAME = "bb_session"
export const SESSION_TTL_DAYS = 30

const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
const publicUserFields = `
	u.id, u.email, u.plan, u.role, u.created_at AS "createdAt", u.updated_at AS "updatedAt"
`

function createToken() {
	return randomBytes(32).toString("base64url")
}

export function hashSessionToken(token) {
	return createHash("sha256").update(String(token)).digest("hex")
}

export function createSessionService({
	query = (sql, params) => db.query(sql, params),
	createRawToken = createToken,
	now = () => new Date(),
} = {}) {
	async function createUserSession(userId) {
		const token = createRawToken()
		const tokenHash = hashSessionToken(token)
		const expiresAt = new Date(now().getTime() + SESSION_TTL_MS)

		await query(
			`
			INSERT INTO user_sessions (user_id, token_hash, expires_at)
			VALUES ($1, $2, $3)
			`,
			[userId, tokenHash, expiresAt],
		)

		return {
			token,
			expiresAt,
		}
	}

	async function getSessionByToken(token) {
		if (!token) return null

		const tokenHash = hashSessionToken(token)
		const result = await query(
			`
			SELECT s.id AS "sessionId",
				${publicUserFields}
			FROM user_sessions s
			INNER JOIN users u ON u.id = s.user_id
			WHERE s.token_hash = $1
				AND s.revoked_at IS NULL
				AND s.expires_at > NOW()
			LIMIT 1
			`,
			[tokenHash],
		)

		if (result.rowCount === 0) return null

		await query(
			`
			UPDATE user_sessions
			SET last_used_at = NOW()
			WHERE id = $1
			`,
			[result.rows[0].sessionId],
		)

		const { sessionId, ...user } = result.rows[0]
		return {
			sessionId,
			user,
			tokenHash,
		}
	}

	async function revokeSessionToken(token) {
		if (!token) return

		await query(
			`
			UPDATE user_sessions
			SET revoked_at = NOW()
			WHERE token_hash = $1
				AND revoked_at IS NULL
			`,
			[hashSessionToken(token)],
		)
	}

	async function revokeUserSessions(userId, { exceptToken } = {}) {
		const exceptTokenHash = exceptToken ? hashSessionToken(exceptToken) : null

		await query(
			`
			UPDATE user_sessions
			SET revoked_at = NOW()
			WHERE user_id = $1
				AND revoked_at IS NULL
				AND ($2::text IS NULL OR token_hash <> $2)
			`,
			[userId, exceptTokenHash],
		)
	}

	return {
		createUserSession,
		getSessionByToken,
		revokeSessionToken,
		revokeUserSessions,
	}
}

const sessionService = createSessionService()

export function createUserSession(userId) {
	return sessionService.createUserSession(userId)
}

export function getSessionByToken(token) {
	return sessionService.getSessionByToken(token)
}

export function revokeSessionToken(token) {
	return sessionService.revokeSessionToken(token)
}

export function revokeUserSessions(userId, options) {
	return sessionService.revokeUserSessions(userId, options)
}
