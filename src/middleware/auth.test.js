import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { requireAdmin } from "./auth.js"

describe("requireAdmin", () => {
	it("rejects unauthenticated requests with 401", () => {
		let nextError = null

		requireAdmin({}, {}, (error) => {
			nextError = error
		})

		assert.equal(nextError.status, 401)
		assert.equal(nextError.code, "AUTHENTICATION_REQUIRED")
	})

	it("rejects non-admin users with 403", () => {
		let nextError = null

		requireAdmin({ currentUser: { role: "user" } }, {}, (error) => {
			nextError = error
		})

		assert.equal(nextError.status, 403)
		assert.equal(nextError.code, "ADMIN_ACCESS_FORBIDDEN")
	})

	it("allows admin users", () => {
		let nextCalled = false

		requireAdmin({ currentUser: { role: "admin" } }, {}, () => {
			nextCalled = true
		})

		assert.equal(nextCalled, true)
	})
})
