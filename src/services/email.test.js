import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { HttpError } from "../errors.js"
import {
	sendPasswordResetCode,
	sendSignupConfirmationCode,
	sendSignupNotificationEmail,
	sendSuggestionEmail,
} from "./email.js"

const envKeys = [
	"NODE_ENV",
	"ZOHO_CLIENT_ID",
	"ZOHO_CLIENT_SECRET",
	"ZOHO_REFRESH_TOKEN",
	"ZOHO_ACCOUNT_ID",
	"ZOHO_FROM_ADDRESS",
	"ZOHO_ACCOUNTS_URL",
	"ZOHO_MAIL_API_URL",
	"SUGGESTIONS_TO_ADDRESS",
]

let originalEnv
let originalFetch

function restoreEnv() {
	for (const key of envKeys) {
		if (originalEnv[key] === undefined) {
			delete process.env[key]
			continue
		}

		process.env[key] = originalEnv[key]
	}
}

function setZohoEnv() {
	process.env.NODE_ENV = "production"
	process.env.ZOHO_CLIENT_ID = "client-id"
	process.env.ZOHO_CLIENT_SECRET = "client-secret"
	process.env.ZOHO_REFRESH_TOKEN = "refresh-token"
	process.env.ZOHO_ACCOUNT_ID = "123456789"
	process.env.ZOHO_FROM_ADDRESS = "no-reply@bunshobuilder.com"
	process.env.ZOHO_ACCOUNTS_URL = "https://accounts.zoho.com.au"
	process.env.ZOHO_MAIL_API_URL = "https://mail.zoho.com.au"
}

describe("sendPasswordResetCode", () => {
	beforeEach(() => {
		originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
		originalFetch = globalThis.fetch
	})

	afterEach(() => {
		restoreEnv()
		globalThis.fetch = originalFetch
	})

	it("fails clearly in production when Zoho email config is missing", async () => {
		process.env.NODE_ENV = "production"

		for (const key of envKeys.filter((key) => key !== "NODE_ENV")) {
			delete process.env[key]
		}

		await assert.rejects(
			() => sendPasswordResetCode({ email: "user@example.com", code: "123456" }),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 500)
				assert.equal(error.code, "PASSWORD_RESET_EMAIL_NOT_CONFIGURED")
				assert.match(error.logMessage, /ZOHO_CLIENT_ID/)
				return true
			},
		)
	})

	it("refreshes a Zoho token and sends the password reset email through the Mail API", async () => {
		setZohoEnv()

		const calls = []
		globalThis.fetch = async (url, options) => {
			calls.push({ url, options })

			if (url === "https://accounts.zoho.com.au/oauth/v2/token") {
				return new Response(JSON.stringify({ access_token: "access-token" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			}

			return new Response(JSON.stringify({ status: { code: 200 } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})
		}

		await sendPasswordResetCode({ email: "user@example.com", code: "123456" })

		assert.equal(calls.length, 2)
		assert.equal(calls[0].url, "https://accounts.zoho.com.au/oauth/v2/token")
		assert.equal(calls[0].options.method, "POST")
		assert.equal(calls[0].options.body.get("grant_type"), "refresh_token")
		assert.equal(calls[0].options.body.get("refresh_token"), "refresh-token")

		assert.equal(
			calls[1].url,
			"https://mail.zoho.com.au/api/accounts/123456789/messages",
		)
		assert.equal(calls[1].options.method, "POST")
		assert.equal(calls[1].options.headers.Authorization, "Zoho-oauthtoken access-token")

		const message = JSON.parse(calls[1].options.body)
		assert.deepEqual(message, {
			fromAddress: "no-reply@bunshobuilder.com",
			toAddress: "user@example.com",
			subject: "Your Bunsho Builder password reset code",
			content:
				"Use this code to reset your password:\n\n123456\n\nThis code expires in 10 minutes. If you did not request it, you can ignore this email.",
			mailFormat: "plaintext",
			askReceipt: "no",
			encoding: "UTF-8",
		})
	})

	it("sends a signup confirmation email through the Mail API", async () => {
		setZohoEnv()

		const calls = []
		globalThis.fetch = async (url, options) => {
			calls.push({ url, options })

			if (url === "https://accounts.zoho.com.au/oauth/v2/token") {
				return new Response(JSON.stringify({ access_token: "access-token" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			}

			return new Response(JSON.stringify({ status: { code: 200 } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})
		}

		await sendSignupConfirmationCode({ email: "user@example.com", code: "123456" })

		assert.equal(calls.length, 2)
		const message = JSON.parse(calls[1].options.body)
		assert.deepEqual(message, {
			fromAddress: "no-reply@bunshobuilder.com",
			toAddress: "user@example.com",
			subject: "Your Bunsho Builder confirmation code",
			content:
				"Use this code to confirm your email and finish creating your account:\n\n123456\n\nThis code expires in 10 minutes. If you did not request it, you can ignore this email.",
			mailFormat: "plaintext",
			askReceipt: "no",
			encoding: "UTF-8",
		})
	})

	it("sends a signup notification email to support through the Mail API", async () => {
		setZohoEnv()

		const calls = []
		globalThis.fetch = async (url, options) => {
			calls.push({ url, options })

			if (url === "https://accounts.zoho.com.au/oauth/v2/token") {
				return new Response(JSON.stringify({ access_token: "access-token" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			}

			return new Response(JSON.stringify({ status: { code: 200 } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})
		}

		await sendSignupNotificationEmail({
			user: {
				id: 21,
				email: "user@example.com",
				displayName: "User",
				createdAt: "2026-06-03T01:23:45.000Z",
			},
		})

		assert.equal(calls.length, 2)
		const message = JSON.parse(calls[1].options.body)
		assert.deepEqual(message, {
			fromAddress: "no-reply@bunshobuilder.com",
			toAddress: "support@bunshobuilder.com",
			subject: "New Bunsho Builder signup",
			content:
				"New Bunsho Builder signup:\n\nDisplay name: User\nEmail: user@example.com\nUser ID: 21\nCreated at: 2026-06-03T01:23:45.000Z",
			mailFormat: "plaintext",
			askReceipt: "no",
			encoding: "UTF-8",
		})
	})

	it("sends an anonymous suggestion through the Mail API", async () => {
		setZohoEnv()
		process.env.SUGGESTIONS_TO_ADDRESS = "support@bunshobuilder.com"

		const calls = []
		globalThis.fetch = async (url, options) => {
			calls.push({ url, options })

			if (url === "https://accounts.zoho.com.au/oauth/v2/token") {
				return new Response(JSON.stringify({ access_token: "access-token" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			}

			return new Response(JSON.stringify({ status: { code: 200 } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})
		}

		await sendSuggestionEmail({ suggestion: "Please add custom practice lists." })

		assert.equal(calls.length, 2)
		const message = JSON.parse(calls[1].options.body)
		assert.deepEqual(message, {
			fromAddress: "no-reply@bunshobuilder.com",
			toAddress: "support@bunshobuilder.com",
			subject: "New Bunsho Builder suggestion",
			content: "New Bunsho Builder suggestion:\n\nPlease add custom practice lists.",
			mailFormat: "plaintext",
			askReceipt: "no",
			encoding: "UTF-8",
		})
	})
})
