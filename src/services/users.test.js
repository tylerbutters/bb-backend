import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { HttpError } from "../errors.js"
import { applyAdminEmailBootstrap, isAdminBootstrapEmail, updateUser } from "./users.js"

const originalAdminEmails = process.env.ADMIN_EMAILS

afterEach(() => {
	if (originalAdminEmails === undefined) {
		delete process.env.ADMIN_EMAILS
		return
	}

	process.env.ADMIN_EMAILS = originalAdminEmails
})

function createUpdateUserQueryStub({
	currentUser = { passwordHash: "hash:old-password1" },
	updatedUser = { id: 1, email: "user@example.com", displayName: "User" },
} = {}) {
	const calls = []
	const query = async (sql, params = []) => {
		calls.push({ sql, params })

		if (sql.includes("SELECT password_hash")) {
			return {
				rows: currentUser ? [currentUser] : [],
				rowCount: currentUser ? 1 : 0,
			}
		}

		if (sql.includes("UPDATE users")) {
			return {
				rows: [updatedUser],
				rowCount: 1,
			}
		}

		return { rows: [], rowCount: 0 }
	}

	return { calls, query }
}

describe("users service", () => {
	it("recognizes admin bootstrap emails case-insensitively", () => {
		process.env.ADMIN_EMAILS = "owner@example.com, Admin@Example.com "

		assert.equal(isAdminBootstrapEmail("admin@example.com"), true)
		assert.equal(isAdminBootstrapEmail("OWNER@example.com"), true)
		assert.equal(isAdminBootstrapEmail("user@example.com"), false)
	})

	it("promotes allowlisted users to admin", async () => {
		process.env.ADMIN_EMAILS = "admin@example.com"
		const calls = []
		const promotedUser = {
			id: 7,
			email: "admin@example.com",
			displayName: "Admin",
			plan: "free",
			role: "admin",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		}

		const user = await applyAdminEmailBootstrap(
			{
				...promotedUser,
				role: "user",
			},
			{
				query: async (sql, params) => {
					calls.push({ sql, params })
					return {
						rowCount: 1,
						rows: [promotedUser],
					}
				},
			},
		)

		assert.deepEqual(user, promotedUser)
		assert.equal(calls.length, 1)
		assert.match(calls[0].sql, /SET role = 'admin'/)
		assert.deepEqual(calls[0].params, [7])
	})

	it("does not auto-demote admins when ADMIN_EMAILS changes", async () => {
		process.env.ADMIN_EMAILS = "owner@example.com"
		const adminUser = {
			id: 7,
			email: "admin@example.com",
			displayName: "Admin",
			role: "admin",
		}
		const calls = []

		const user = await applyAdminEmailBootstrap(adminUser, {
			query: async (sql, params) => {
				calls.push({ sql, params })
				return { rowCount: 0, rows: [] }
			},
		})

		assert.equal(user, adminUser)
		assert.equal(calls.length, 0)
	})

	it("updates a password only after verifying the current password", async () => {
		const { calls, query } = createUpdateUserQueryStub()

		assert.deepEqual(
			await updateUser(
				1,
				{ currentPassword: "old-password1", password: "new-password2" },
				{
					query,
					hashValue: async (value) => `hash:${value}`,
					verifyValue: async (value, hash) =>
						value === "old-password1" && hash === "hash:old-password1",
				},
			),
			{ id: 1, email: "user@example.com", displayName: "User" },
		)

		assert.equal(calls[0].sql.includes("SELECT password_hash"), true)
		assert.equal(
			calls.some(
				(call) => call.sql.includes("UPDATE users") && call.params[2] === "hash:new-password2",
			),
			true,
		)
	})

	it("rejects password updates with an incorrect current password", async () => {
		const { calls, query } = createUpdateUserQueryStub()

		await assert.rejects(
			() =>
				updateUser(
					1,
					{ currentPassword: "wrong-password1", password: "new-password2" },
					{
						query,
						hashValue: async (value) => `hash:${value}`,
						verifyValue: async () => false,
					},
				),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 401)
				assert.equal(error.code, "INVALID_CURRENT_PASSWORD")
				return true
			},
		)

		assert.equal(calls.some((call) => call.sql.includes("UPDATE users")), false)
	})

	it("updates non-password account fields without checking the current password", async () => {
		const { calls, query } = createUpdateUserQueryStub({
			updatedUser: { id: 1, email: "next@example.com", displayName: "User" },
		})

		assert.deepEqual(
			await updateUser(1, { email: "next@example.com" }, { query }),
			{ id: 1, email: "next@example.com", displayName: "User" },
		)

		assert.equal(calls.some((call) => call.sql.includes("SELECT password_hash")), false)
		assert.equal(
			calls.some(
				(call) => call.sql.includes("UPDATE users") && call.params[0] === "next@example.com",
			),
			true,
		)
	})
})
