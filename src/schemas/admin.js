import Joi from "joi"

export const adminUsersQuerySchema = Joi.object({
	query: Joi.string().trim().allow("").max(254).default("").messages({
		"string.max": "Search query must be at most 254 characters",
	}),
	limit: Joi.number().integer().min(1).max(100).default(25).messages({
		"number.base": "Limit must be a positive integer",
		"number.integer": "Limit must be a positive integer",
		"number.min": "Limit must be at least 1",
		"number.max": "Limit must be at most 100",
	}),
	offset: Joi.number().integer().min(0).default(0).messages({
		"number.base": "Offset must be a non-negative integer",
		"number.integer": "Offset must be a non-negative integer",
		"number.min": "Offset must be a non-negative integer",
	}),
})
