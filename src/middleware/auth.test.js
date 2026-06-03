import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { requireAdmin, sessionCookieOptions } from "./auth.js"

const originalNodeEnv = process.env.NODE_ENV
const originalSessionCookieSameSite = process.env.SESSION_COOKIE_SAME_SITE

afterEach(() => {
	restoreEnv("NODE_ENV", originalNodeEnv)
	restoreEnv("SESSION_COOKIE_SAME_SITE", originalSessionCookieSameSite)
})

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

describe("sessionCookieOptions", () => {
	it("uses lax cookies by default outside production", () => {
		process.env.NODE_ENV = "test"
		delete process.env.SESSION_COOKIE_SAME_SITE

		const options = sessionCookieOptions()

		assert.equal(options.sameSite, "lax")
		assert.equal(options.secure, false)
	})

	it("uses secure cross-site cookies in production", () => {
		process.env.NODE_ENV = "production"
		delete process.env.SESSION_COOKIE_SAME_SITE

		const options = sessionCookieOptions()

		assert.equal(options.sameSite, "none")
		assert.equal(options.secure, true)
	})

	it("allows same-site behavior to be overridden", () => {
		process.env.NODE_ENV = "production"
		process.env.SESSION_COOKIE_SAME_SITE = "lax"

		const options = sessionCookieOptions()

		assert.equal(options.sameSite, "lax")
		assert.equal(options.secure, true)
	})
})

function restoreEnv(key, value) {
	if (value === undefined) {
		delete process.env[key]
		return
	}

	process.env[key] = value
}
