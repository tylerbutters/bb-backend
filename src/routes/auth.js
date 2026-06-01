import { Router } from "express"
import { HttpError, asyncHandler } from "../errors.js"
import { requireAuth, revokeCurrentSession, setSessionCookie } from "../middleware/auth.js"
import { accountRecoveryRateLimiter, authRateLimiter } from "../middleware/rateLimiters.js"
import { validateBody } from "../middleware/validate.js"
import {
	loginSchema,
	passwordResetConfirmSchema,
	passwordResetRequestSchema,
} from "../schemas/auth.js"
import { verifyPassword } from "../services/password.js"
import { confirmPasswordReset, requestPasswordReset } from "../services/passwordReset.js"
import { createUserSession } from "../services/sessions.js"
import { applyAdminEmailBootstrap, getUserByEmailWithPassword } from "../services/users.js"

const router = Router()

function createInvalidCredentialsError() {
	return new HttpError(401, "Invalid email or password.", {
		code: "INVALID_CREDENTIALS",
	})
}

router.post(
	"/password-reset/request",
	accountRecoveryRateLimiter,
	validateBody(passwordResetRequestSchema),
	asyncHandler(async (req, res) => {
		const result = await requestPasswordReset(req.validated.body)

		res.status(200).send(result)
	}),
)

router.post(
	"/password-reset/confirm",
	accountRecoveryRateLimiter,
	validateBody(passwordResetConfirmSchema),
	asyncHandler(async (req, res) => {
		const result = await confirmPasswordReset(req.validated.body)

		res.status(200).send(result)
	}),
)

router.post(
	"/",
	authRateLimiter,
	validateBody(loginSchema),
	asyncHandler(async (req, res) => {
		const { email, password } = req.validated.body
		const userWithPassword = await getUserByEmailWithPassword(email)

		if (!userWithPassword) {
			throw createInvalidCredentialsError()
		}

		const { passwordHash, ...user } = userWithPassword
		const passwordMatches = await verifyPassword(password, passwordHash)

		if (!passwordMatches) {
			throw createInvalidCredentialsError()
		}

		const currentUser = await applyAdminEmailBootstrap(user)
		const session = await createUserSession(currentUser.id)
		setSessionCookie(res, session.token)

		res.status(200).send({
			message: "Login successful.",
			user: currentUser,
		})
	}),
)

router.get(
	"/session",
	requireAuth,
	asyncHandler(async (req, res) => {
		res.status(200).send({
			user: req.currentUser,
		})
	}),
)

router.delete(
	"/session",
	revokeCurrentSession,
	asyncHandler(async (req, res) => {
		res.status(200).send({
			message: "Logged out.",
		})
	}),
)

export default router
