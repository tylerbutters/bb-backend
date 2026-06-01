import { HttpError, asyncHandler } from "../errors.js"
import {
	SESSION_COOKIE_NAME,
	SESSION_TTL_DAYS,
	getSessionByToken,
	revokeSessionToken,
} from "../services/sessions.js"
import { applyAdminEmailBootstrap } from "../services/users.js"

const SESSION_MAX_AGE_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

function decodeCookieValue(value) {
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}

function parseCookies(cookieHeader = "") {
	return Object.fromEntries(
		cookieHeader
			.split(";")
			.map((cookie) => cookie.trim())
			.filter(Boolean)
			.map((cookie) => {
				const separatorIndex = cookie.indexOf("=")
				if (separatorIndex === -1) return [cookie, ""]

				return [
					decodeCookieValue(cookie.slice(0, separatorIndex)),
					decodeCookieValue(cookie.slice(separatorIndex + 1)),
				]
			}),
	)
}

export function getSessionToken(req) {
	return parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME] || null
}

function sessionCookieOptions(overrides = {}) {
	return {
		httpOnly: true,
		maxAge: SESSION_MAX_AGE_MS,
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		...overrides,
	}
}

export function setSessionCookie(res, token) {
	res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions())
}

export function clearSessionCookie(res) {
	res.clearCookie(
		SESSION_COOKIE_NAME,
		sessionCookieOptions({
			maxAge: undefined,
		}),
	)
}

function createUnauthenticatedError() {
	return new HttpError(401, "Login is required.", {
		code: "AUTHENTICATION_REQUIRED",
	})
}

function createForbiddenUserError() {
	return new HttpError(403, "You do not have permission to access that account.", {
		code: "ACCOUNT_ACCESS_FORBIDDEN",
	})
}

function createAdminForbiddenError() {
	return new HttpError(403, "Admin access is required.", {
		code: "ADMIN_ACCESS_FORBIDDEN",
	})
}

export const requireAuth = asyncHandler(async (req, res, next) => {
	const token = getSessionToken(req)
	const session = await getSessionByToken(token)

	if (!session) {
		clearSessionCookie(res)
		throw createUnauthenticatedError()
	}

	req.currentUser = await applyAdminEmailBootstrap(session.user)
	req.sessionToken = token
	next()
})

export function requireAdmin(req, res, next) {
	if (!req.currentUser) {
		next(createUnauthenticatedError())
		return
	}

	if (req.currentUser.role !== "admin") {
		next(createAdminForbiddenError())
		return
	}

	next()
}

export function requireCurrentUserParam(req, res, next) {
	const requestedUserId = req.validated?.params?.user_id ?? req.params.user_id

	if (String(req.currentUser?.id) !== String(requestedUserId)) {
		next(createForbiddenUserError())
		return
	}

	next()
}

export const revokeCurrentSession = asyncHandler(async (req, res, next) => {
	const token = getSessionToken(req)

	await revokeSessionToken(token)
	clearSessionCookie(res)
	next()
})
