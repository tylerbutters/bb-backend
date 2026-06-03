import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { HttpError } from "../errors.js"
import { getAdminUser, listAdminUsers } from "./admin.js"

function createAdminUser(overrides = {}) {
	return {
		id: 1,
		email: "tyler@example.com",
		plan: "free",
		role: "user",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	}
}

describe("admin service", () => {
	it("lists users by email with pagination", async () => {
		const users = [
			createAdminUser({ id: 3, email: "three@example.com" }),
			createAdminUser({ id: 2, email: "two@example.com" }),
			createAdminUser({ id: 1, email: "one@example.com" }),
		]

		const result = await listAdminUsers(
			{ query: "tyler", limit: 2, offset: 4 },
			{
				query: async (sql, params) => {
					assert.match(sql, /FROM users/)
					assert.match(sql, /email ILIKE \$1/)
					assert.doesNotMatch(sql, /display_name/)
					assert.match(sql, /ORDER BY created_at DESC, id DESC/)
					assert.deepEqual(params, ["%tyler%", 3, 4])

					return {
						rowCount: users.length,
						rows: users,
					}
				},
			},
		)

		assert.deepEqual(result, {
			items: users.slice(0, 2),
			hasMore: true,
			nextOffset: 6,
		})
	})

	it("loads a user profile with aggregate stats", async () => {
		const user = createAdminUser({ id: 12 })
		const calls = []
		const result = await getAdminUser(12, {
			query: async (sql, params) => {
				calls.push({ sql, params })

				if (sql.includes("FROM users")) {
					assert.deepEqual(params, [12])
					return {
						rowCount: 1,
						rows: [user],
					}
				}

				if (sql.includes("FROM user_game_results")) {
					assert.deepEqual(params, [12])
					return {
						rowCount: 1,
						rows: [
							{
								mode: "translate",
								difficulty: "easy",
								total_games: "2",
								correct: "1",
								incorrect: "1",
							},
						],
					}
				}

				return { rowCount: 0, rows: [] }
			},
		})

		assert.equal(calls.length, 2)
		assert.deepEqual(result.user, user)
		assert.deepEqual(result.stats.total, {
			totalGames: 2,
			correct: 1,
			incorrect: 1,
			accuracy: 50,
		})
	})

	it("throws a 404 when the selected user does not exist", async () => {
		await assert.rejects(
			() =>
				getAdminUser(99, {
					query: async () => ({ rowCount: 0, rows: [] }),
				}),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 404)
				assert.equal(error.code, "USER_NOT_FOUND")
				return true
			},
		)
	})
})
