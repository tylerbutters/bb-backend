import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
	assertCanUseChallengeCheck,
	getUserGameHistory,
	getUserGameQuota,
	getUserGameStats,
	recordGameResult,
	updateGameResultFeedback,
} from "./gameStats.js"

describe("recordGameResult", () => {
	it("records the first result for a challenge", async () => {
		const calls = []
		const inserted = await recordGameResult(
			{
				userId: 12,
				challengeId: "1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
				mode: "translate",
				difficulty: "medium",
				prompt: "I eat rice.",
				answer: "ご飯を食べます。",
				correct: true,
				feedback: "Good.",
			},
			{
				query: async (sql, params) => {
					calls.push({ sql, params })
					return { rowCount: 1 }
				},
			},
		)

		assert.equal(inserted, true)
		assert.equal(calls.length, 1)
		assert.match(calls[0].sql, /ON CONFLICT/)
		assert.deepEqual(calls[0].params, [
			12,
			"1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
			"translate",
			"medium",
			"I eat rice.",
			"ご飯を食べます。",
			true,
			"Good.",
		])
	})

	it("ignores duplicate results for the same challenge", async () => {
		const inserted = await recordGameResult(
			{
				userId: 12,
				challengeId: "1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
				mode: "particles",
				correct: false,
			},
			{
				query: async () => ({ rowCount: 0 }),
			},
		)

		assert.equal(inserted, false)
	})
})

describe("updateGameResultFeedback", () => {
	it("updates feedback for an already recorded challenge result", async () => {
		const calls = []
		const updated = await updateGameResultFeedback(
			{
				userId: 12,
				challengeId: "1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
				feedback: "Use 食べた for the past tense.",
			},
			{
				query: async (sql, params) => {
					calls.push({ sql, params })
					return { rowCount: 1 }
				},
			},
		)

		assert.equal(updated, true)
		assert.equal(calls.length, 1)
		assert.match(calls[0].sql, /UPDATE user_game_results/)
		assert.deepEqual(calls[0].params, [
			12,
			"1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
			"Use 食べた for the past tense.",
		])
	})
})

describe("getUserGameHistory", () => {
	it("returns paginated history filtered by game mode and difficulty", async () => {
		const history = await getUserGameHistory(
			12,
			{
				mode: "translate",
				difficulty: "easy",
				limit: 2,
				offset: 4,
			},
			{
				query: async (sql, params) => {
					assert.match(sql, /FROM user_game_results/)
					assert.match(sql, /mode = \$2/)
					assert.match(sql, /difficulty = \$3/)
					assert.match(sql, /ORDER BY created_at DESC, id DESC/)
					assert.deepEqual(params, [12, "translate", "easy", 3, 4])

					return {
						rows: [
							{
								id: "7",
								challenge_id: "1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
								mode: "translate",
								difficulty: "easy",
								prompt: "I eat rice.",
								answer: "ご飯を食べます。",
								correct: true,
								feedback: "Good.",
								created_at: "2026-05-28T10:00:00.000Z",
							},
							{
								id: "6",
								challenge_id: "2e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
								mode: "translate",
								difficulty: "easy",
								prompt: "I drink tea.",
								answer: "お茶を飲みます。",
								correct: false,
								feedback: "Missing subject.",
								created_at: "2026-05-27T10:00:00.000Z",
							},
							{
								id: "5",
								challenge_id: "3e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
								mode: "translate",
								difficulty: "easy",
								prompt: "Older row.",
								answer: "。",
								correct: false,
								feedback: "",
								created_at: "2026-05-26T10:00:00.000Z",
							},
						],
					}
				},
			},
		)

		assert.deepEqual(history, {
			items: [
				{
					id: 7,
					challengeId: "1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
					mode: "translate",
					label: "Translate",
					difficulty: "easy",
					prompt: "I eat rice.",
					answer: "ご飯を食べます。",
					correct: true,
					feedback: "Good.",
					createdAt: "2026-05-28T10:00:00.000Z",
				},
				{
					id: 6,
					challengeId: "2e5eb8e7-f91a-4c61-8f37-62b1a27ddf95",
					mode: "translate",
					label: "Translate",
					difficulty: "easy",
					prompt: "I drink tea.",
					answer: "お茶を飲みます。",
					correct: false,
					feedback: "Missing subject.",
					createdAt: "2026-05-27T10:00:00.000Z",
				},
			],
			hasMore: true,
			nextOffset: 6,
		})
	})

	it("loads all games and all difficulties by default", async () => {
		await getUserGameHistory(
			12,
			{},
			{
				query: async (sql, params) => {
					assert.doesNotMatch(sql, /mode =/)
					assert.doesNotMatch(sql, /difficulty =/)
					assert.deepEqual(params, [12, 51, 0])

					return { rows: [] }
				},
			},
		)
	})

	it("limits history to the current UTC day when requested", async () => {
		await getUserGameHistory(
			12,
			{},
			{
				visibility: "today",
				now: new Date("2026-05-28T13:15:00.000Z"),
				query: async (sql, params) => {
					assert.match(sql, /created_at >= \$2/)
					assert.match(sql, /created_at < \$3/)
					assert.deepEqual(params, [
						12,
						new Date("2026-05-28T00:00:00.000Z"),
						new Date("2026-05-29T00:00:00.000Z"),
						51,
						0,
					])

					return { rows: [] }
				},
			},
		)
	})
})

describe("getUserGameStats", () => {
	it("returns aggregate totals and zero-backgrounded game rows", async () => {
		const stats = await getUserGameStats(12, {
			query: async (sql, params) => {
				assert.match(sql, /FROM user_game_results/)
				assert.deepEqual(params, [12])
				return {
					rows: [
						{
							mode: "translate",
							difficulty: "easy",
							total_games: "2",
							correct: "1",
							incorrect: "1",
						},
						{
							mode: "translate",
							difficulty: "medium",
							total_games: "1",
							correct: "1",
							incorrect: "0",
						},
						{
							mode: "particles",
							difficulty: "hard",
							total_games: "1",
							correct: "0",
							incorrect: "1",
						},
						{
							mode: "reorder",
							difficulty: null,
							total_games: "1",
							correct: "1",
							incorrect: "0",
						},
					],
				}
			},
		})

		assert.deepEqual(stats.total, {
			totalGames: 5,
			correct: 3,
			incorrect: 2,
			accuracy: 60,
		})
		assert.deepEqual(stats.games, [
			{
				mode: "translate",
				label: "Translate",
				totalGames: 3,
				correct: 2,
				incorrect: 1,
				accuracy: 67,
			},
			{
				mode: "conjugations",
				label: "Conjugate",
				totalGames: 0,
				correct: 0,
				incorrect: 0,
				accuracy: 0,
			},
			{
				mode: "fix sentence",
				label: "Fix mistakes",
				totalGames: 0,
				correct: 0,
				incorrect: 0,
				accuracy: 0,
			},
			{
				mode: "particles",
				label: "Particles",
				totalGames: 1,
				correct: 0,
				incorrect: 1,
				accuracy: 0,
			},
			{
				mode: "reorder",
				label: "Word order",
				totalGames: 1,
				correct: 1,
				incorrect: 0,
				accuracy: 100,
			},
		])
		assert.deepEqual(stats.byDifficulty.easy.total, {
			totalGames: 2,
			correct: 1,
			incorrect: 1,
			accuracy: 50,
		})
		assert.deepEqual(stats.byDifficulty.medium.total, {
			totalGames: 1,
			correct: 1,
			incorrect: 0,
			accuracy: 100,
		})
		assert.deepEqual(stats.byDifficulty.hard.total, {
			totalGames: 1,
			correct: 0,
			incorrect: 1,
			accuracy: 0,
		})
		assert.deepEqual(
			stats.byDifficulty.easy.games.map(({ mode, totalGames }) => ({ mode, totalGames })),
			[
				{ mode: "translate", totalGames: 2 },
				{ mode: "conjugations", totalGames: 0 },
				{ mode: "fix sentence", totalGames: 0 },
				{ mode: "particles", totalGames: 0 },
				{ mode: "reorder", totalGames: 0 },
			],
		)
	})

	it("limits stats to the current UTC day when requested", async () => {
		await getUserGameStats(12, {
			visibility: "today",
			now: new Date("2026-05-28T13:15:00.000Z"),
			query: async (sql, params) => {
				assert.match(sql, /created_at >= \$2/)
				assert.match(sql, /created_at < \$3/)
				assert.deepEqual(params, [
					12,
					new Date("2026-05-28T00:00:00.000Z"),
					new Date("2026-05-29T00:00:00.000Z"),
				])

				return { rows: [] }
			},
		})
	})
})

describe("getUserGameQuota", () => {
	it("returns unlimited quota fields while premium limits are disabled", async () => {
		const quota = await getUserGameQuota(12, {
			now: new Date("2026-05-28T13:15:00.000Z"),
			query: async (sql, params) => {
				if (sql.includes("SELECT plan")) {
					assert.deepEqual(params, [12])
					return { rowCount: 1, rows: [{ plan: "free" }] }
				}

				assert.match(sql, /COUNT\(\*\) AS used/)
				assert.deepEqual(params, [
					12,
					new Date("2026-05-28T00:00:00.000Z"),
					new Date("2026-05-29T00:00:00.000Z"),
				])
				return { rowCount: 1, rows: [{ used: "1" }] }
			},
		})

		assert.deepEqual(quota, {
			plan: "free",
			limit: null,
			used: 1,
			remaining: null,
			resetsAt: "2026-05-29T00:00:00.000Z",
			canPlay: true,
		})
	})

	it("returns unlimited quota fields for premium users", async () => {
		const quota = await getUserGameQuota(12, {
			now: new Date("2026-05-28T13:15:00.000Z"),
			query: async (sql) => {
				if (sql.includes("SELECT plan")) {
					return { rowCount: 1, rows: [{ plan: "premium" }] }
				}

				return { rowCount: 1, rows: [{ used: "20" }] }
			},
		})

		assert.deepEqual(quota, {
			plan: "premium",
			limit: null,
			used: 20,
			remaining: null,
			resetsAt: "2026-05-29T00:00:00.000Z",
			canPlay: true,
		})
	})
})

describe("assertCanUseChallengeCheck", () => {
	it("allows new free checks after the old daily limit while premium limits are disabled", async () => {
		const quota = await assertCanUseChallengeCheck(12, "1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95", {
			now: new Date("2026-05-28T13:15:00.000Z"),
			query: async (sql) => {
				if (sql.includes("FROM user_game_results") && sql.includes("LIMIT 1")) {
					return { rowCount: 0, rows: [] }
				}

				if (sql.includes("SELECT plan")) {
					return { rowCount: 1, rows: [{ plan: "free" }] }
				}

				return { rowCount: 1, rows: [{ used: "3" }] }
			},
		})

		assert.deepEqual(quota, {
			plan: "free",
			limit: null,
			used: 3,
			remaining: null,
			resetsAt: "2026-05-29T00:00:00.000Z",
			canPlay: true,
		})
	})

	it("allows duplicate checks without consuming another quota slot", async () => {
		const quota = await assertCanUseChallengeCheck(12, "1e5eb8e7-f91a-4c61-8f37-62b1a27ddf95", {
			now: new Date("2026-05-28T13:15:00.000Z"),
			query: async (sql) => {
				if (sql.includes("FROM user_game_results") && sql.includes("LIMIT 1")) {
					return { rowCount: 1, rows: [{ "?column?": 1 }] }
				}

				if (sql.includes("SELECT plan")) {
					return { rowCount: 1, rows: [{ plan: "free" }] }
				}

				return { rowCount: 1, rows: [{ used: "3" }] }
			},
		})

		assert.equal(quota.canPlay, true)
		assert.equal(quota.remaining, null)
	})
})
