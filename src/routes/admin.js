import { Router } from "express"
import { asyncHandler } from "../errors.js"
import { requireAdmin, requireAuth } from "../middleware/auth.js"
import { validateParams, validateQuery } from "../middleware/validate.js"
import { adminUsersQuerySchema } from "../schemas/admin.js"
import { gameHistoryQuerySchema, userParamsSchema } from "../schemas/users.js"
import { getUserGameHistory, PREMIUM_STATS_VISIBILITY } from "../services/gameStats.js"
import { getAdminUser, listAdminUsers } from "../services/admin.js"

const router = Router()

router.use(requireAuth, requireAdmin)

router.get(
	"/users",
	validateQuery(adminUsersQuerySchema),
	asyncHandler(async (req, res) => {
		const users = await listAdminUsers(req.validated.query)

		res.status(200).send(users)
	}),
)

router.get(
	"/users/:user_id",
	validateParams(userParamsSchema),
	asyncHandler(async (req, res) => {
		const user = await getAdminUser(req.validated.params.user_id)

		res.status(200).send(user)
	}),
)

router.get(
	"/users/:user_id/game-history",
	validateParams(userParamsSchema),
	validateQuery(gameHistoryQuerySchema),
	asyncHandler(async (req, res) => {
		const history = await getUserGameHistory(
			req.validated.params.user_id,
			req.validated.query,
			{
				visibility: PREMIUM_STATS_VISIBILITY,
			},
		)

		res.status(200).send(history)
	}),
)

export default router
