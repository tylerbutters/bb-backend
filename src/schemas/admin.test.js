import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { adminUsersQuerySchema } from "./admin.js"

describe("adminUsersQuerySchema", () => {
	it("defaults to an empty user search with a 25 item page", () => {
		const { error, value } = adminUsersQuerySchema.validate({})

		assert.equal(error, undefined)
		assert.deepEqual(value, {
			query: "",
			limit: 25,
			offset: 0,
		})
	})

	it("accepts a search query and pagination", () => {
		const { error, value } = adminUsersQuerySchema.validate({
			query: " tyler ",
			limit: "10",
			offset: "20",
		})

		assert.equal(error, undefined)
		assert.deepEqual(value, {
			query: "tyler",
			limit: 10,
			offset: 20,
		})
	})

	it("rejects pages above the maximum limit", () => {
		const { error } = adminUsersQuerySchema.validate({
			limit: 101,
		})

		assert.equal(error?.details[0].message, "Limit must be at most 100")
	})
})
