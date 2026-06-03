import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { HttpError } from "../errors.js"
import {
	SIGNUP_CONFIRMATION_REQUEST_MESSAGE,
	SIGNUP_CONFIRMATION_SUCCESS_MESSAGE,
	createSignupConfirmationService,
} from "./signupConfirmation.js"

function createQueryStub({ existingUser, signupConfirmation, insertedUser } = {}) {
	const calls = []
	const query = async (sql, params = []) => {
		calls.push({ sql, params })

		if (sql.includes("SELECT id") && sql.includes("FROM users")) {
			return { rows: existingUser ? [existingUser] : [], rowCount: existingUser ? 1 : 0 }
		}

		if (sql.includes("FROM signup_confirmation_codes")) {
			return {
				rows: signupConfirmation ? [signupConfirmation] : [],
				rowCount: signupConfirmation ? 1 : 0,
			}
		}

		if (sql.includes("INSERT INTO users")) {
			return {
				rows: [
					insertedUser || {
						id: 21,
						email: params[0],
					},
				],
				rowCount: 1,
			}
		}

		return { rows: [], rowCount: 1 }
	}

	return { calls, query }
}

describe("signup confirmation service", () => {
	it("stores a pending signup with hashed password and code, then sends the plain code by email", async () => {
		const sentCodes = []
		const { calls, query } = createQueryStub()
		const service = createSignupConfirmationService({
			query,
			createCode: () => "123456",
			hashValue: async (value) => `hash:${value}`,
			sendCode: async (message) => sentCodes.push(message),
		})

		assert.deepEqual(
			await service.requestSignupConfirmation({
				email: "user@example.com",
				password: "password1",
			}),
			{ message: SIGNUP_CONFIRMATION_REQUEST_MESSAGE },
		)
		assert.deepEqual(sentCodes, [{ email: "user@example.com", code: "123456" }])
		assert.equal(
			calls.some(
				(call) =>
					call.sql.includes("INSERT INTO signup_confirmation_codes") &&
					call.params.includes("hash:123456") &&
					call.params.includes("hash:password1"),
			),
			true,
		)
		assert.equal(calls.some((call) => call.params.includes("123456")), false)
		assert.equal(calls.some((call) => call.params.includes("password1")), false)
	})

	it("rejects signup requests for emails that already have an account", async () => {
		const { query } = createQueryStub({ existingUser: { id: 12 } })
		const service = createSignupConfirmationService({ query })

		await assert.rejects(
			() =>
				service.requestSignupConfirmation({
					email: "user@example.com",
					password: "password1",
				}),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 409)
				assert.equal(error.code, "DUPLICATE_USER_EMAIL")
				return true
			},
		)
	})

	it("creates the user only when the confirmation code matches", async () => {
		const sentSignupNotifications = []
		const { calls, query } = createQueryStub({
			signupConfirmation: {
				id: 4,
				email: "user@example.com",
				passwordHash: "hash:password1",
				codeHash: "hash:123456",
				expiresAt: "2030-01-01T00:00:00.000Z",
				attemptCount: 0,
			},
		})
		const service = createSignupConfirmationService({
			query,
			verifyValue: async (value, hash) => value === "123456" && hash === "hash:123456",
			sendSignupNotification: async (message) => sentSignupNotifications.push(message),
			now: () => new Date("2029-01-01T00:00:00.000Z"),
		})

		assert.deepEqual(
			await service.confirmSignup({
				email: "user@example.com",
				code: "123456",
			}),
			{
				message: SIGNUP_CONFIRMATION_SUCCESS_MESSAGE,
				user: {
					id: 21,
					email: "user@example.com",
				},
			},
		)
		assert.deepEqual(sentSignupNotifications, [
			{
				user: {
					id: 21,
					email: "user@example.com",
				},
			},
		])
		assert.equal(
			calls.some(
				(call) =>
					call.sql.includes("INSERT INTO users") &&
					call.params[0] === "user@example.com" &&
					call.params[1] === "hash:password1",
			),
			true,
		)
		assert.equal(
			calls.some(
				(call) =>
					call.sql.includes("UPDATE signup_confirmation_codes") &&
					call.sql.includes("SET used_at = NOW()"),
			),
			true,
		)
	})

	it("still creates the user when the support signup notification fails", async () => {
		const loggedErrors = []
		const { query } = createQueryStub({
			signupConfirmation: {
				id: 4,
				email: "user@example.com",
				passwordHash: "hash:password1",
				codeHash: "hash:123456",
				expiresAt: "2030-01-01T00:00:00.000Z",
				attemptCount: 0,
			},
		})
		const service = createSignupConfirmationService({
			query,
			verifyValue: async (value, hash) => value === "123456" && hash === "hash:123456",
			sendSignupNotification: async () => {
				throw new Error("Notification failed.")
			},
			logSignupNotificationError: (error) => loggedErrors.push(error),
			now: () => new Date("2029-01-01T00:00:00.000Z"),
		})

		const result = await service.confirmSignup({
			email: "user@example.com",
			code: "123456",
		})

		assert.equal(result.message, SIGNUP_CONFIRMATION_SUCCESS_MESSAGE)
		assert.equal(result.user.email, "user@example.com")
		assert.equal(loggedErrors.length, 1)
		assert.equal(loggedErrors[0].message, "Notification failed.")
	})

	it("increments attempts and rejects a wrong code", async () => {
		const { calls, query } = createQueryStub({
			signupConfirmation: {
				id: 4,
				email: "user@example.com",
				passwordHash: "hash:password1",
				codeHash: "hash:123456",
				expiresAt: "2030-01-01T00:00:00.000Z",
				attemptCount: 0,
			},
		})
		const service = createSignupConfirmationService({
			query,
			verifyValue: async () => false,
			now: () => new Date("2029-01-01T00:00:00.000Z"),
		})

		await assert.rejects(
			() =>
				service.confirmSignup({
					email: "user@example.com",
					code: "000000",
				}),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 400)
				assert.equal(error.code, "INVALID_SIGNUP_CONFIRMATION_CODE")
				return true
			},
		)
		assert.equal(
			calls.some(
				(call) =>
					call.sql.includes("SET attempt_count = attempt_count + 1") && call.params[0] === 4,
			),
			true,
		)
	})
})
