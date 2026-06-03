import { db } from "../db.js"
import { HttpError } from "../errors.js"
import { getUserGameStats, PREMIUM_STATS_VISIBILITY } from "./gameStats.js"

const adminUserFields = `
	id, email, plan, role, created_at AS "createdAt", updated_at AS "updatedAt"
`

function createUserNotFoundError() {
	return new HttpError(404, "User not found.", {
		code: "USER_NOT_FOUND",
	})
}

export async function listAdminUsers(
	{ query: searchQuery = "", limit = 25, offset = 0 } = {},
	{ query = db.query.bind(db) } = {},
) {
	const boundedLimit = Math.min(Math.max(Number(limit) || 25, 1), 100)
	const boundedOffset = Math.max(Number(offset) || 0, 0)
	const trimmedQuery = searchQuery.trim()
	const params = []
	let whereClause = ""

	if (trimmedQuery) {
		params.push(`%${trimmedQuery}%`)
		whereClause = `
		WHERE email ILIKE $1
		`
	}

	params.push(boundedLimit + 1, boundedOffset)

	const limitParam = `$${params.length - 1}`
	const offsetParam = `$${params.length}`
	const result = await query(
		`
		SELECT ${adminUserFields}
		FROM users
		${whereClause}
		ORDER BY created_at DESC, id DESC
		LIMIT ${limitParam}
		OFFSET ${offsetParam}
		`,
		params,
	)
	const rows = result.rows.slice(0, boundedLimit)
	const hasMore = result.rows.length > boundedLimit

	return {
		items: rows,
		hasMore,
		nextOffset: hasMore ? boundedOffset + boundedLimit : null,
	}
}

export async function getAdminUser(userId, { query = db.query.bind(db) } = {}) {
	const result = await query(
		`
		SELECT ${adminUserFields}
		FROM users
		WHERE id = $1
		`,
		[userId],
	)

	if (result.rowCount === 0) {
		throw createUserNotFoundError()
	}

	const stats = await getUserGameStats(userId, {
		visibility: PREMIUM_STATS_VISIBILITY,
		query,
	})

	return {
		user: result.rows[0],
		stats,
	}
}
