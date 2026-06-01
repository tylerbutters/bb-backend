import { db } from "../db.js"
import { HttpError } from "../errors.js"

export const TRACKED_GAME_MODES = [
	{ mode: "translate", label: "Translate" },
	{ mode: "conjugations", label: "Conjugations" },
	{ mode: "fix sentence", label: "Fix sentence" },
	{ mode: "particles", label: "Particles" },
	{ mode: "reorder", label: "Reorder" },
]
export const GAME_DIFFICULTIES = ["easy", "medium", "hard"]
export const GAME_STAT_FILTERS = ["all", ...GAME_DIFFICULTIES]
export const FREE_DAILY_CHALLENGE_LIMIT = 3
export const FREE_STATS_VISIBILITY = "today"
export const PREMIUM_STATS_VISIBILITY = "all"

const trackedModeLabels = new Map(
	TRACKED_GAME_MODES.map((gameMode) => [gameMode.mode, gameMode.label]),
)
const validDifficulties = new Set(GAME_DIFFICULTIES)
const PREMIUM_PLAN = "premium"

function createUserNotFoundError() {
	return new HttpError(404, "User not found.", {
		code: "USER_NOT_FOUND",
	})
}

function createDailyLimitReachedError(quota) {
	return new HttpError(
		403,
		`You've used today's ${FREE_DAILY_CHALLENGE_LIMIT} free challenge checks.`,
		{
			code: "DAILY_GAME_LIMIT_REACHED",
			details: {
				quota,
			},
		},
	)
}

function createChallengeIdRequiredError() {
	return new HttpError(400, "Challenge ID is required for challenge checks.", {
		code: "CHALLENGE_ID_REQUIRED_FOR_CHALLENGE_CHECKS",
	})
}

function normalizePlan(plan) {
	return plan === PREMIUM_PLAN ? PREMIUM_PLAN : "free"
}

function utcDayRange(now = new Date()) {
	const start = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	)
	const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

	return { start, end }
}

function statsVisibilityRange({ visibility = PREMIUM_STATS_VISIBILITY, now = new Date() } = {}) {
	return visibility === FREE_STATS_VISIBILITY ? utcDayRange(now) : null
}

function createQuota({ plan, used, resetsAt }) {
	const normalizedPlan = normalizePlan(plan)
	const normalizedUsed = normalizeCount(used)

	/*
	TODO(premium): Re-enable finite free quotas when premium is live.
	const isPremium = normalizedPlan === PREMIUM_PLAN
	const remaining = isPremium
		? null
		: Math.max(FREE_DAILY_CHALLENGE_LIMIT - normalizedUsed, 0)
	const limit = isPremium ? null : FREE_DAILY_CHALLENGE_LIMIT
	const canPlay = isPremium || remaining > 0
	*/

	return {
		plan: normalizedPlan,
		limit: null,
		used: normalizedUsed,
		remaining: null,
		resetsAt: resetsAt.toISOString(),
		canPlay: true,
	}
}

function calculateAccuracy(correct, totalGames) {
	if (!totalGames) return 0
	return Math.round((correct / totalGames) * 100)
}

function createStats({
	mode,
	label,
	totalGames = 0,
	correct = 0,
	incorrect = 0,
} = {}) {
	return {
		...(mode ? { mode } : {}),
		...(label ? { label } : {}),
		totalGames,
		correct,
		incorrect,
		accuracy: calculateAccuracy(correct, totalGames),
	}
}

function normalizeCount(value) {
	return Number(value || 0)
}

async function getUserPlan(
	userId,
	{ query = (sql, params) => db.query(sql, params) } = {},
) {
	const result = await query(
		`
		SELECT plan
		FROM users
		WHERE id = $1
		`,
		[userId],
	)

	if (result.rowCount === 0) throw createUserNotFoundError()

	return normalizePlan(result.rows[0]?.plan)
}

async function hasRecordedChallengeResult(
	userId,
	challengeId,
	{ query = (sql, params) => db.query(sql, params) } = {},
) {
	const result = await query(
		`
		SELECT 1
		FROM user_game_results
		WHERE user_id = $1
			AND challenge_id = $2
		LIMIT 1
		`,
		[userId, challengeId],
	)

	return result.rowCount > 0
}

async function countUserGameResultsForUtcDay(
	userId,
	{ now = new Date(), query = (sql, params) => db.query(sql, params) } = {},
) {
	const { start, end } = utcDayRange(now)
	const result = await query(
		`
		SELECT COUNT(*) AS used
		FROM user_game_results
		WHERE user_id = $1
			AND created_at >= $2
			AND created_at < $3
		`,
		[userId, start, end],
	)

	return {
		used: normalizeCount(result.rows[0]?.used),
		resetsAt: end,
	}
}

export async function getUserGameQuota(
	userId,
	{ now = new Date(), query = (sql, params) => db.query(sql, params) } = {},
) {
	const [plan, dailyUsage] = await Promise.all([
		getUserPlan(userId, { query }),
		countUserGameResultsForUtcDay(userId, { now, query }),
	])

	return createQuota({
		plan,
		used: dailyUsage.used,
		resetsAt: dailyUsage.resetsAt,
	})
}

export async function assertCanUseChallengeCheck(
	userId,
	challengeId,
	{ now = new Date(), query = (sql, params) => db.query(sql, params) } = {},
) {
	if (!challengeId) throw createChallengeIdRequiredError()

	const alreadyRecorded = await hasRecordedChallengeResult(userId, challengeId, { query })
	const quota = await getUserGameQuota(userId, { now, query })

	if (alreadyRecorded || quota.canPlay) return quota

	// TODO(premium): Re-enable this rejection when free quota limits return.
	// throw createDailyLimitReachedError(quota)
	return quota
}

function normalizeDifficulty(difficulty) {
	return validDifficulties.has(difficulty) ? difficulty : null
}

function createModeAccumulator() {
	return new Map(
		TRACKED_GAME_MODES.map(({ mode }) => [
			mode,
			{ totalGames: 0, correct: 0, incorrect: 0 },
		]),
	)
}

function addStats(statsByMode, { mode, totalGames, correct, incorrect }) {
	const stats = statsByMode.get(mode)
	if (!stats) return

	stats.totalGames += totalGames
	stats.correct += correct
	stats.incorrect += incorrect
}

function createStatsGroup(statsByMode) {
	const games = TRACKED_GAME_MODES.map(({ mode, label }) =>
		createStats({
			mode,
			label,
			...statsByMode.get(mode),
		}),
	)
	const total = games.reduce(
		(summary, game) => ({
			totalGames: summary.totalGames + game.totalGames,
			correct: summary.correct + game.correct,
			incorrect: summary.incorrect + game.incorrect,
		}),
		{ totalGames: 0, correct: 0, incorrect: 0 },
	)

	return {
		total: createStats(total),
		games,
	}
}

export async function recordGameResult(
	{
		userId,
		challengeId,
		mode,
		difficulty = "easy",
		prompt,
		answer,
		correct,
		feedback,
	},
	{ query = (sql, params) => db.query(sql, params) } = {},
) {
	if (!trackedModeLabels.has(mode)) return false
	const recordedDifficulty = difficulty || "easy"
	if (!validDifficulties.has(recordedDifficulty)) return false

	const result = await query(
		`
		INSERT INTO user_game_results (
			user_id,
			challenge_id,
			mode,
			difficulty,
			prompt,
			answer,
			correct,
			feedback
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (user_id, challenge_id) DO NOTHING
		`,
		[
			userId,
			challengeId,
			mode,
			recordedDifficulty,
			prompt || null,
			answer || null,
			Boolean(correct),
			feedback || null,
		],
	)

	return result.rowCount > 0
}

export async function getUserGameStats(
	userId,
	{
		visibility = PREMIUM_STATS_VISIBILITY,
		now = new Date(),
		query = (sql, params) => db.query(sql, params),
	} = {},
) {
	const visibilityRange = statsVisibilityRange({ visibility, now })
	const params = [userId]
	const visibilityCondition = visibilityRange
		? `
			AND created_at >= $2
			AND created_at < $3
		`
		: ""

	if (visibilityRange) {
		params.push(visibilityRange.start, visibilityRange.end)
	}

	const result = await query(
		`
		SELECT mode,
			difficulty,
			COUNT(*) AS total_games,
			COUNT(*) FILTER (WHERE correct) AS correct,
			COUNT(*) FILTER (WHERE NOT correct) AS incorrect
		FROM user_game_results
		WHERE user_id = $1
			${visibilityCondition}
		GROUP BY mode, difficulty
		`,
		params,
	)
	const statsByFilter = new Map(
		GAME_STAT_FILTERS.map((difficulty) => [difficulty, createModeAccumulator()]),
	)

	for (const row of result.rows) {
		if (!trackedModeLabels.has(row.mode)) continue

		const difficulty = normalizeDifficulty(row.difficulty)
		const rowStats = {
			mode: row.mode,
			totalGames: normalizeCount(row?.total_games),
			correct: normalizeCount(row?.correct),
			incorrect: normalizeCount(row?.incorrect),
		}

		addStats(statsByFilter.get("all"), rowStats)
		if (difficulty) addStats(statsByFilter.get(difficulty), rowStats)
	}

	const byDifficulty = Object.fromEntries(
		GAME_STAT_FILTERS.map((difficulty) => [
			difficulty,
			createStatsGroup(statsByFilter.get(difficulty)),
		]),
	)

	return {
		...byDifficulty.all,
		byDifficulty,
	}
}

function createHistoryWhereClause({ mode, difficulty, visibility, now }) {
	const params = []
	const conditions = []

	function addParam(value) {
		params.push(value)
		return `$${params.length}`
	}

	conditions.push(`user_id = ${addParam(null)}`)

	if (mode && mode !== "all") {
		conditions.push(`mode = ${addParam(mode)}`)
	}

	if (difficulty && difficulty !== "all") {
		conditions.push(`difficulty = ${addParam(difficulty)}`)
	}

	const visibilityRange = statsVisibilityRange({ visibility, now })
	if (visibilityRange) {
		conditions.push(`created_at >= ${addParam(visibilityRange.start)}`)
		conditions.push(`created_at < ${addParam(visibilityRange.end)}`)
	}

	return { conditions, params }
}

function normalizeHistoryItem(row) {
	const modeLabel = trackedModeLabels.get(row.mode) || row.mode

	return {
		id: Number(row.id),
		challengeId: row.challenge_id,
		mode: row.mode,
		label: modeLabel,
		difficulty: row.difficulty || null,
		prompt: row.prompt || "",
		answer: row.answer || "",
		correct: Boolean(row.correct),
		feedback: row.feedback || "",
		createdAt: row.created_at,
	}
}

export async function getUserGameHistory(
	userId,
	{ mode = "all", difficulty = "all", limit = 50, offset = 0 } = {},
	{
		visibility = PREMIUM_STATS_VISIBILITY,
		now = new Date(),
		query = (sql, params) => db.query(sql, params),
	} = {},
) {
	const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
	const boundedOffset = Math.max(Number(offset) || 0, 0)
	const { conditions, params } = createHistoryWhereClause({
		mode,
		difficulty,
		visibility,
		now,
	})
	params[0] = userId
	params.push(boundedLimit + 1, boundedOffset)

	const limitParam = `$${params.length - 1}`
	const offsetParam = `$${params.length}`
	const result = await query(
		`
		SELECT id,
			challenge_id,
			mode,
			difficulty,
			prompt,
			answer,
			correct,
			feedback,
			created_at
		FROM user_game_results
		WHERE ${conditions.join(" AND ")}
		ORDER BY created_at DESC, id DESC
		LIMIT ${limitParam}
		OFFSET ${offsetParam}
		`,
		params,
	)
	const rows = result.rows.slice(0, boundedLimit)

	return {
		items: rows.map(normalizeHistoryItem),
		hasMore: result.rows.length > boundedLimit,
		nextOffset:
			result.rows.length > boundedLimit ? boundedOffset + boundedLimit : null,
	}
}
