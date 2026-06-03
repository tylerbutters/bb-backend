import { randomInt } from "node:crypto"
import { db } from "../db.js"
import { HttpError } from "../errors.js"
import { sendSignupConfirmationCode, sendSignupNotificationEmail } from "./email.js"
import { hashPassword, verifyPassword } from "./password.js"

export const SIGNUP_CONFIRMATION_REQUEST_MESSAGE =
	"Confirmation code sent. Check your email to finish creating your account."
export const SIGNUP_CONFIRMATION_SUCCESS_MESSAGE = "Account created."

const SIGNUP_CODE_TTL_MINUTES = 10
const MAX_SIGNUP_CODE_ATTEMPTS = 5

export function generateSignupConfirmationCode() {
	return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

function createDuplicateUserEmailError() {
	return new HttpError(409, "A user with that email already exists.", {
		code: "DUPLICATE_USER_EMAIL",
	})
}

function createInvalidSignupCodeError() {
	return new HttpError(400, "Invalid or expired confirmation code.", {
		code: "INVALID_SIGNUP_CONFIRMATION_CODE",
	})
}

function isExpired(expiresAt, now) {
	return new Date(expiresAt).getTime() <= now().getTime()
}

const publicUserFields = `
	id, email, plan, role, created_at AS "createdAt", updated_at AS "updatedAt"
`

function logSignupEvent(event, fields = {}) {
	const details = Object.entries(fields)
		.filter(([, value]) => value !== undefined && value !== null && value !== "")
		.map(([key, value]) => `${key}=${value}`)
		.join(" ")

	console.info(`[signup] ${event}${details ? ` ${details}` : ""}`)
}

export function createSignupConfirmationService({
	query = (sql, params) => db.query(sql, params),
	sendCode = sendSignupConfirmationCode,
	sendSignupNotification = sendSignupNotificationEmail,
	logSignupNotificationError = console.error,
	createCode = generateSignupConfirmationCode,
	hashValue = hashPassword,
	verifyValue = verifyPassword,
	now = () => new Date(),
} = {}) {
	async function userExists(email) {
		const result = await query(
			`
			SELECT id
			FROM users
			WHERE email = $1
		`,
			[email],
		)

		return result.rowCount > 0
	}

	async function requestSignupConfirmation({ email, password }) {
		if (await userExists(email)) {
			throw createDuplicateUserEmailError()
		}

		const code = createCode()
		const [codeHash, passwordHash] = await Promise.all([hashValue(code), hashValue(password)])

		await query(
			`
			UPDATE signup_confirmation_codes
			SET used_at = NOW()
			WHERE email = $1
				AND used_at IS NULL
		`,
			[email],
		)
		await query(
			`
			INSERT INTO signup_confirmation_codes
				(email, password_hash, code_hash, expires_at)
			VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 minute'))
		`,
			[email, passwordHash, codeHash, SIGNUP_CODE_TTL_MINUTES],
		)

		await sendCode({ email, code })
		logSignupEvent("confirmation requested", { email })

		return { message: SIGNUP_CONFIRMATION_REQUEST_MESSAGE }
	}

	async function getLatestSignupConfirmation(email) {
		const result = await query(
			`
			SELECT id,
				email,
				password_hash AS "passwordHash",
				code_hash AS "codeHash",
				expires_at AS "expiresAt",
				attempt_count AS "attemptCount"
			FROM signup_confirmation_codes
			WHERE email = $1
				AND used_at IS NULL
			ORDER BY created_at DESC
			LIMIT 1
		`,
			[email],
		)

		return result.rows[0] || null
	}

	async function confirmSignup({ email, code }) {
		const signupConfirmation = await getLatestSignupConfirmation(email)

		if (
			!signupConfirmation ||
			isExpired(signupConfirmation.expiresAt, now) ||
			signupConfirmation.attemptCount >= MAX_SIGNUP_CODE_ATTEMPTS
		) {
			throw createInvalidSignupCodeError()
		}

		const codeMatches = await verifyValue(code, signupConfirmation.codeHash)

		if (!codeMatches) {
			await query(
				`
				UPDATE signup_confirmation_codes
				SET attempt_count = attempt_count + 1
				WHERE id = $1
			`,
				[signupConfirmation.id],
			)
			throw createInvalidSignupCodeError()
		}

		if (await userExists(email)) {
			throw createDuplicateUserEmailError()
		}

		const result = await query(
			`
			INSERT INTO users (email, password_hash)
			VALUES ($1, $2)
			RETURNING ${publicUserFields}
		`,
			[email, signupConfirmation.passwordHash],
		)

		await query(
			`
			UPDATE signup_confirmation_codes
			SET used_at = NOW()
			WHERE email = $1
				AND used_at IS NULL
		`,
			[email],
		)
		logSignupEvent("account created", {
			userId: result.rows[0]?.id,
			email: result.rows[0]?.email,
		})

		try {
			await sendSignupNotification({ user: result.rows[0] })
			logSignupEvent("support notification sent", {
				userId: result.rows[0]?.id,
				email: result.rows[0]?.email,
			})
		} catch (error) {
			// Support notifications should not block a user after their account exists.
			logSignupEvent("support notification failed", {
				userId: result.rows[0]?.id,
				email: result.rows[0]?.email,
			})
			logSignupNotificationError(error)
		}

		return {
			message: SIGNUP_CONFIRMATION_SUCCESS_MESSAGE,
			user: result.rows[0],
		}
	}

	return {
		confirmSignup,
		requestSignupConfirmation,
	}
}

const signupConfirmationService = createSignupConfirmationService()

export function requestSignupConfirmation(data) {
	return signupConfirmationService.requestSignupConfirmation(data)
}

export function confirmSignup(data) {
	return signupConfirmationService.confirmSignup(data)
}
