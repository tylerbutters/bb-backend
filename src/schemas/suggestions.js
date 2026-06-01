import Joi from "joi"

export const suggestionSchema = Joi.object({
	suggestion: Joi.string()
		.trim()
		.min(1)
		.max(4000)
		.messages({
			"string.empty": "Suggestion is required",
			"string.max": "Suggestion must be at most 4000 characters",
			"any.required": "Suggestion is required",
		})
		.required(),
})
	.required()
	.messages({
		"object.unknown": "{#label} is not allowed",
	})
