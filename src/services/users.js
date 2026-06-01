import crypto from "node:crypto"
import { db } from "../db.js"
import { HttpError } from "../errors.js"
import { hashPassword, verifyPassword } from "./password.js"
import { sendEmailChangeConfirmationEmail } from "./email.js"

const publicUserFields = `
	id, email, display_name AS "displayName", plan, role, created_at AS "createdAt", updated_at AS "updatedAt"
`
const EMAIL_CHANGE_TOKEN_EXPIRES_MINUTES = 30

function normalizeEmail(email) {
	return email.trim().toLowerCase()
}

function adminEmailSet() {
	return new Set(
		(process.env.ADMIN_EMAILS || "")
			.split(",")
			.map((email) => email.trim().toLowerCase())
			.filter(Boolean),
	)
}

export function isAdminBootstrapEmail(email) {
	if (!email) return false

	return adminEmailSet().has(normalizeEmail(email))
}

function createEmailInUseError() {
	return new HttpError(409, "Email is already in use.", {
		code: "EMAIL_IN_USE",
	})
}

function createSameEmailError() {
	return new HttpError(400, "New email must be different from your current email.", {
		code: "SAME_EMAIL",
	})
}

function createInvalidEmailChangeTokenError() {
	return new HttpError(400, "Invalid or expired email change link.", {
		code: "INVALID_EMAIL_CHANGE_TOKEN",
	})
}

function createToken() {
	return crypto.randomBytes(32).toString("hex")
}

function hashToken(token) {
	return crypto.createHash("sha256").update(token).digest("hex")
}

function createUserNotFoundError() {
	return new HttpError(404, "User not found.", {
		code: "USER_NOT_FOUND",
	})
}

export async function createUser({ email, displayName, password }) {
	const passwordHash = await hashPassword(password)
	const result = await db.query(
		`
		INSERT INTO users (email, display_name, password_hash)
		VALUES ($1, $2, $3)
		RETURNING ${publicUserFields}
	`,
		[email, displayName, passwordHash],
	)

	return result.rows[0]
}

export async function applyAdminEmailBootstrap(
	user,
	{ query = db.query.bind(db) } = {},
) {
	if (!user || !isAdminBootstrapEmail(user.email) || user.role === "admin") {
		return user
	}

	const result = await query(
		`
		UPDATE users
		SET role = 'admin'
		WHERE id = $1
		RETURNING ${publicUserFields}
		`,
		[user.id],
	)

	return result.rows[0] || {
		...user,
		role: "admin",
	}
}

export async function getUserIdByEmail(email, { query = db.query.bind(db) } = {}) {
	const normalizedEmail = normalizeEmail(email)

	const result = await query(
		`
		SELECT id
		FROM users
		WHERE email = $1
		`,
		[normalizedEmail],
	)

	if (result.rowCount === 0) {
		throw createUserNotFoundError()
	}

	return result.rows[0].id
}

function createInvalidCurrentPasswordError() {
	return new HttpError(401, "Current password is incorrect.", {
		code: "INVALID_CURRENT_PASSWORD",
	})
}

export async function updateUser(
	userId,
	{ email, displayName, currentPassword, password },
	{ query = db.query.bind(db), hashValue = hashPassword, verifyValue = verifyPassword } = {},
) {
	let passwordHash = null

	if (password) {
		const currentUserResult = await query(
			`
			SELECT password_hash AS "passwordHash"
			FROM users
			WHERE id = $1
		`,
			[userId],
		)

		if (currentUserResult.rowCount === 0) {
			throw createUserNotFoundError()
		}

		const passwordMatches = currentPassword
			? await verifyValue(currentPassword, currentUserResult.rows[0].passwordHash)
			: false

		if (!passwordMatches) {
			throw createInvalidCurrentPasswordError()
		}

		passwordHash = await hashValue(password)
	}

	const result = await query(
		`
		UPDATE users
		SET email = COALESCE($1, email),
			display_name = COALESCE($2, display_name),
			password_hash = COALESCE($3, password_hash)
		WHERE id = $4
		RETURNING ${publicUserFields}
	`,
		[email ?? null, displayName ?? null, passwordHash, userId],
	)

	if (result.rowCount === 0) {
		throw createUserNotFoundError()
	}

	return result.rows[0]
}

export async function deleteUser(userId) {
	const result = await db.query(
		`
		DELETE FROM users
		WHERE id = $1
		RETURNING id
	`,
		[userId],
	)

	if (result.rowCount === 0) {
		throw createUserNotFoundError()
	}
}

export async function getUserByEmailWithPassword(email) {
	const result = await db.query(
		`
		SELECT ${publicUserFields}, password_hash AS "passwordHash"
		FROM users
		WHERE email = $1
	`,
		[email],
	)

	return result.rows[0] || null
}

function createEmailChangeDatabaseError(error) {
	return new HttpError(500, "Email change could not be saved.", {
		code: "EMAIL_CHANGE_DATABASE_ERROR",
		cause: error,
		logMessage: error.message,
	})
}

function createEmailChangeSendError(error) {
	return new HttpError(502, "Verification email could not be sent.", {
		code: "EMAIL_CHANGE_EMAIL_SEND_FAILED",
		cause: error,
		logMessage: error.message,
	})
}

function createMissingEmailChangeColumnsError(error) {
	return new HttpError(500, "Email change is not configured correctly.", {
		code: "EMAIL_CHANGE_COLUMNS_MISSING",
		cause: error,
		logMessage:
			"Email change columns are missing. Run the migration for pending_email, pending_email_token_hash, pending_email_requested_at, and pending_email_expires_at.",
	})
}

function isMissingColumnError(error) {
	return error?.code === "42703"
}

function isUniqueViolation(error) {
	return error?.code === "23505"
}

export async function requestEmailChange(
	userId,
	{ email },
	{
		query = db.query.bind(db),
		sendEmailChangeEmail = sendEmailChangeConfirmationEmail,
		createRawToken = createToken,
		hashRawToken = hashToken,
	} = {},
) {
	const newEmail = normalizeEmail(email)

	const currentUserResult = await query(
		`
		SELECT id, email, password_hash AS "passwordHash"
		FROM users
		WHERE id = $1
		`,
		[userId],
	)

	if (currentUserResult.rowCount === 0) {
		throw createUserNotFoundError()
	}

	const currentUser = currentUserResult.rows[0]

	if (newEmail === normalizeEmail(currentUser.email)) {
		throw createSameEmailError()
	}

	const existingUserResult = await query(
		`
		SELECT id
		FROM users
		WHERE email = $1
		LIMIT 1
		`,
		[newEmail],
	)

	if (existingUserResult.rowCount > 0) {
		throw createEmailInUseError()
	}

	const token = createRawToken()
	const tokenHash = hashRawToken(token)
	const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_EXPIRES_MINUTES * 60 * 1000)

	await query(
		`
		UPDATE users
		SET pending_email = $1,
			pending_email_token_hash = $2,
			pending_email_requested_at = NOW(),
			pending_email_expires_at = $3
		WHERE id = $4
		`,
		[newEmail, tokenHash, expiresAt, userId],
	)

	await sendEmailChangeEmail({
		currentEmail: currentUser.email,
		newEmail,
		token,
	})

	return {
		message: "Verification email sent. Check your new email address to confirm the change.",
	}
}

export async function confirmEmailChange(
	{ token },
	{ query = db.query.bind(db), hashRawToken = hashToken } = {},
) {
	const tokenHash = hashRawToken(token)

	const pendingEmailResult = await query(
		`
		SELECT id, pending_email AS "pendingEmail"
		FROM users
		WHERE pending_email_token_hash = $1
			AND pending_email IS NOT NULL
			AND pending_email_expires_at > NOW()
		`,
		[tokenHash],
	)

	if (pendingEmailResult.rowCount === 0) {
		throw createInvalidEmailChangeTokenError()
	}

	const userId = pendingEmailResult.rows[0].id
	const pendingEmail = pendingEmailResult.rows[0].pendingEmail

	const existingUserResult = await query(
		`
		SELECT id
		FROM users
		WHERE email = $1
			AND id <> $2
		LIMIT 1
		`,
		[pendingEmail, userId],
	)

	if (existingUserResult.rowCount > 0) {
		throw createEmailInUseError()
	}

	const result = await query(
		`
		UPDATE users
		SET email = pending_email,
			pending_email = NULL,
			pending_email_token_hash = NULL,
			pending_email_requested_at = NULL,
			pending_email_expires_at = NULL,
			updated_at = NOW()
		WHERE id = $1
		RETURNING ${publicUserFields}
		`,
		[userId],
	)

	if (result.rowCount === 0) {
		throw createUserNotFoundError()
	}

	return {
		message: "Email updated.",
		user: result.rows[0],
	}
}
