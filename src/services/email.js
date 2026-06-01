import { HttpError } from "../errors.js"

const zohoConfigKeys = [
	"ZOHO_CLIENT_ID",
	"ZOHO_CLIENT_SECRET",
	"ZOHO_REFRESH_TOKEN",
	"ZOHO_ACCOUNT_ID",
	"ZOHO_FROM_ADDRESS",
]
const defaultZohoAccountsUrl = "https://accounts.zoho.com.au"
const defaultZohoMailApiUrl = "https://mail.zoho.com.au"
const defaultZohoTimeoutMs = 10_000

function envValue(key) {
	return process.env[key]?.trim()
}

function getMissingZohoConfigKeys() {
	return zohoConfigKeys.filter((key) => !envValue(key))
}

function hasZohoConfig() {
	return getMissingZohoConfigKeys().length === 0
}

function getZohoAccountsUrl() {
	return (envValue("ZOHO_ACCOUNTS_URL") || defaultZohoAccountsUrl).replace(/\/+$/, "")
}

function getZohoMailApiUrl() {
	return (envValue("ZOHO_MAIL_API_URL") || defaultZohoMailApiUrl).replace(/\/+$/, "")
}

function getZohoTimeoutMs() {
	return Number(envValue("ZOHO_TIMEOUT_MS") || defaultZohoTimeoutMs)
}

function getSuggestionRecipientAddress() {
	return envValue("SUGGESTIONS_TO_ADDRESS") || envValue("ZOHO_FROM_ADDRESS")
}

function createZohoConfigError({ purpose, code }) {
	return new HttpError(500, `${purpose} email is not configured.`, {
		code,
		logMessage: `Zoho ${purpose.toLowerCase()} email is not configured. Missing env vars: ${getMissingZohoConfigKeys().join(", ")}`,
	})
}

function getZohoErrorMessage(data) {
	if (!data || typeof data !== "object") return ""

	return [
		data.error,
		data.error_description,
		data.message,
		data.status?.description,
		data.data?.errorCode,
		data.data?.moreInfo,
	]
		.filter(Boolean)
		.join(" ")
}

function createZohoResponseError(operation, response, data, { purpose, code }) {
	const zohoMessage = getZohoErrorMessage(data)
	const responseDetails = [response.status, response.statusText, zohoMessage]
		.filter(Boolean)
		.join(" ")

	return new HttpError(502, `${purpose} email could not be sent.`, {
		code,
		logMessage: `Zoho Mail API failed while trying to ${operation}${responseDetails ? ` (${responseDetails})` : ""}.`,
	})
}

function createZohoNetworkError(operation, error, { purpose, code }) {
	return new HttpError(502, `${purpose} email could not be sent.`, {
		code,
		cause: error,
		logMessage: `Zoho Mail API request failed while trying to ${operation}.`,
	})
}

async function fetchWithTimeout(url, options = {}) {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), getZohoTimeoutMs())

	try {
		return await fetch(url, {
			...options,
			signal: controller.signal,
		})
	} finally {
		clearTimeout(timer)
	}
}

async function readResponseData(response) {
	try {
		return await response.json()
	} catch {
		return null
	}
}

async function refreshZohoAccessToken(emailContext) {
	const params = new URLSearchParams({
		refresh_token: envValue("ZOHO_REFRESH_TOKEN"),
		client_id: envValue("ZOHO_CLIENT_ID"),
		client_secret: envValue("ZOHO_CLIENT_SECRET"),
		grant_type: "refresh_token",
	})
	const tokenUrl = `${getZohoAccountsUrl()}/oauth/v2/token`

	let response

	try {
		response = await fetchWithTimeout(tokenUrl, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: params,
		})
	} catch (error) {
		throw createZohoNetworkError("refresh the access token", error, emailContext)
	}

	const data = await readResponseData(response)

	if (!response.ok || !data?.access_token) {
		throw createZohoResponseError("refresh the access token", response, data, emailContext)
	}

	return data.access_token
}

async function sendZohoMail({ toAddress, subject, content, emailContext, operation }) {
	const accessToken = await refreshZohoAccessToken(emailContext)
	const accountId = encodeURIComponent(envValue("ZOHO_ACCOUNT_ID"))
	const sendUrl = `${getZohoMailApiUrl()}/api/accounts/${accountId}/messages`

	let response

	try {
		response = await fetchWithTimeout(sendUrl, {
			method: "POST",
			headers: {
				Accept: "application/json",
				Authorization: `Zoho-oauthtoken ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				fromAddress: envValue("ZOHO_FROM_ADDRESS"),
				toAddress,
				subject,
				content,
				mailFormat: "plaintext",
				askReceipt: "no",
				encoding: "UTF-8",
			}),
		})
	} catch (error) {
		throw createZohoNetworkError(operation, error, emailContext)
	}

	const data = await readResponseData(response)

	if (!response.ok) {
		throw createZohoResponseError(operation, response, data, emailContext)
	}
}

export async function sendPasswordResetCode({ email, code }) {
	// if (process.env.NODE_ENV === "development") return
	const emailContext = {
		purpose: "Password reset",
		code: "PASSWORD_RESET_EMAIL_SEND_FAILED",
	}

	if (!hasZohoConfig()) {
		if (process.env.NODE_ENV === "production") {
			throw createZohoConfigError({
				purpose: "Password reset",
				code: "PASSWORD_RESET_EMAIL_NOT_CONFIGURED",
			})
		}

		console.info(
			`Password reset code for ${email}: ${code}. Zoho email is not configured; missing env vars: ${getMissingZohoConfigKeys().join(", ")}`,
		)
		return
	}

	await sendZohoMail({
		toAddress: email,
		subject: "Your Bunsho Builder password reset code",
		content: [
			"Use this code to reset your password:",
			"",
			code,
			"",
			"This code expires in 10 minutes. If you did not request it, you can ignore this email.",
		].join("\n"),
		emailContext,
		operation: "send the password reset email",
	})
}

export async function sendSignupConfirmationCode({ email, code }) {
	const emailContext = {
		purpose: "Signup confirmation",
		code: "SIGNUP_CONFIRMATION_EMAIL_SEND_FAILED",
	}

	if (!hasZohoConfig()) {
		if (process.env.NODE_ENV === "production") {
			throw createZohoConfigError({
				purpose: "Signup confirmation",
				code: "SIGNUP_CONFIRMATION_EMAIL_NOT_CONFIGURED",
			})
		}

		console.info(
			`Signup confirmation code for ${email}: ${code}. Zoho email is not configured; missing env vars: ${getMissingZohoConfigKeys().join(", ")}`,
		)
		return
	}

	await sendZohoMail({
		toAddress: email,
		subject: "Your Bunsho Builder confirmation code",
		content: [
			"Use this code to confirm your email and finish creating your account:",
			"",
			code,
			"",
			"This code expires in 10 minutes. If you did not request it, you can ignore this email.",
		].join("\n"),
		emailContext,
		operation: "send the signup confirmation email",
	})
}

export async function sendEmailChangeConfirmationEmail({ currentEmail, newEmail, token }) {
	const emailContext = {
		purpose: "Email change confirmation",
		code: "EMAIL_CHANGE_CONFIRMATION_EMAIL_SEND_FAILED",
	}

	const confirmUrl = `${process.env.CLIENT_URL}/confirm-email-change?token=${token}`
	console.log(confirmUrl)
	if (!hasZohoConfig()) {
		if (process.env.NODE_ENV === "production") {
			throw createZohoConfigError({
				purpose: "Email change confirmation",
				code: "EMAIL_CHANGE_CONFIRMATION_EMAIL_NOT_CONFIGURED",
			})
		}

		console.info(
			`Email change confirmation link for ${currentEmail}: ${confirmUrl}. Zoho email is not configured; missing env vars: ${getMissingZohoConfigKeys().join(", ")}`,
		)
		return
	}

	await sendZohoMail({
		toAddress: currentEmail,
		subject: "Confirm your Bunsho Builder email change",
		content: [
			`A request has been made to change your email to: ${newEmail}`,
			"Click the link below to confirm your new email address:",
			"",
			confirmUrl,
			"",
			"This link expires in 30 minutes. If you did not request this, you can ignore this email.",
		].join("\n"),
		emailContext,
		operation: "send the email change confirmation email",
	})
}

export async function sendSuggestionEmail({ suggestion }) {
	const emailContext = {
		purpose: "Suggestion",
		code: "SUGGESTION_EMAIL_SEND_FAILED",
	}

	if (!hasZohoConfig()) {
		if (process.env.NODE_ENV === "production") {
			throw createZohoConfigError({
				purpose: "Suggestion",
				code: "SUGGESTION_EMAIL_NOT_CONFIGURED",
			})
		}

		console.info(
			`Suggestion received: ${suggestion}. Zoho email is not configured; missing env vars: ${getMissingZohoConfigKeys().join(", ")}`,
		)
		return
	}

	await sendZohoMail({
		toAddress: getSuggestionRecipientAddress(),
		subject: "New Bunsho Builder suggestion",
		content: ["New Bunsho Builder suggestion:", "", suggestion].join("\n"),
		emailContext,
		operation: "send the suggestion email",
	})
}
