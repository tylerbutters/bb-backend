import { Router } from "express"
import { asyncHandler } from "../errors.js"
import { suggestionRateLimiter } from "../middleware/rateLimiters.js"
import { validateBody } from "../middleware/validate.js"
import { suggestionSchema } from "../schemas/suggestions.js"
import { sendSuggestionEmail } from "../services/email.js"

const router = Router()

router.post(
	"/",
	suggestionRateLimiter,
	validateBody(suggestionSchema),
	asyncHandler(async (req, res) => {
		await sendSuggestionEmail(req.validated.body)

		res.status(202).send({
			message: "Thanks for the suggestion.",
		})
	}),
)

export default router
