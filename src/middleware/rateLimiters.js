import { rateLimit } from "express-rate-limit"
import { createErrorResponse } from "../errors.js"

function createLimiter({ windowMs, limit, message, code }) {
	return rateLimit({
		windowMs,
		limit,
		legacyHeaders: false,
		standardHeaders: true,
		message: createErrorResponse(message, { code }),
	})
}

export const apiRateLimiter = createLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.API_RATE_LIMIT_MAX || 600),
	message: "Too many requests. Please try again later.",
	code: "RATE_LIMITED",
})

export const authRateLimiter = createLimiter({
	windowMs: 15 * 60 * 1000,
	limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 25),
	message: "Too many login attempts. Please try again later.",
	code: "AUTH_RATE_LIMITED",
})

export const accountRecoveryRateLimiter = createLimiter({
	windowMs: 60 * 60 * 1000,
	limit: Number(process.env.ACCOUNT_RECOVERY_RATE_LIMIT_MAX || 5),
	message: "Too many account recovery attempts. Please try again later.",
	code: "ACCOUNT_RECOVERY_RATE_LIMITED",
})

export const signupRateLimiter = createLimiter({
	windowMs: 60 * 60 * 1000,
	limit: Number(process.env.SIGNUP_RATE_LIMIT_MAX || 10),
	message: "Too many signup attempts. Please try again later.",
	code: "SIGNUP_RATE_LIMITED",
})

export const suggestionRateLimiter = createLimiter({
	windowMs: 60 * 60 * 1000,
	limit: Number(process.env.SUGGESTION_RATE_LIMIT_MAX || 10),
	message: "Too many suggestions. Please try again later.",
	code: "SUGGESTION_RATE_LIMITED",
})
