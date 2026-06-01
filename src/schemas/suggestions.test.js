import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { suggestionSchema } from "./suggestions.js"

describe("suggestionSchema", () => {
	it("accepts a suggestion without contact details", () => {
		const { error, value } = suggestionSchema.validate({
			suggestion: "Please add custom practice lists.",
		})

		assert.equal(error, undefined)
		assert.deepEqual(value, {
			suggestion: "Please add custom practice lists.",
		})
	})

	it("trims the suggestion", () => {
		const { error, value } = suggestionSchema.validate({
			suggestion: "  Please add keyboard shortcuts.  ",
		})

		assert.equal(error, undefined)
		assert.equal(value.suggestion, "Please add keyboard shortcuts.")
	})

	it("rejects an empty suggestion", () => {
		const { error } = suggestionSchema.validate({
			suggestion: "   ",
		})

		assert.equal(error?.details[0].message, "Suggestion is required")
	})

	it("rejects unexpected identity fields", () => {
		const { error } = suggestionSchema.validate({
			suggestion: "Please add custom practice lists.",
			email: "tyler@example.com",
		})

		assert.equal(error?.details[0].message, "\"email\" is not allowed")
	})
})
