export class HttpError extends Error {
	constructor(status, message, { code, cause, details, logMessage } = {}) {
		super(message)
		this.name = "HttpError"
		this.status = status
		this.code = code
		this.cause = cause
		this.details = details
		this.logMessage = logMessage
	}
}

export function asyncHandler(handler) {
	return (req, res, next) => {
		Promise.resolve(handler(req, res, next)).catch(next)
	}
}

export function createErrorResponse(message, { code, details } = {}) {
	const response = {
		error: {
			message,
		},
	}

	if (code) response.error.code = code
	if (details) response.error.details = details

	return response
}

function logServerError(error, req) {
	const requestLabel = req ? `${req.method} ${req.originalUrl}` : "request"
	const requestId = req?.requestId ? ` [api:${req.requestId}]` : ""
	const message = error.logMessage || error.message || "Unhandled request error"

	console.error(`Unhandled ${requestLabel}${requestId}: ${message}`)

	if (error.cause) {
		console.error(error.cause)
		return
	}

	console.error(error)
}

export function errorHandler(error, req, res, next) {
	if (res.headersSent) {
		next(error)
		return
	}

	if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
		res.status(400).send(
			createErrorResponse("Request body must be valid JSON.", {
				code: "INVALID_JSON",
			}),
		)
		return
	}

	if (error.type === "entity.too.large") {
		res.status(413).send(
			createErrorResponse("Request body is too large.", {
				code: "REQUEST_BODY_TOO_LARGE",
			}),
		)
		return
	}

	if (error.code === "23505") {
		res.status(409).send(
			createErrorResponse("A user with that email already exists.", {
				code: "DUPLICATE_USER_EMAIL",
			}),
		)
		return
	}

	if (["23502", "23514", "22P02"].includes(error.code)) {
		res.status(400).send(
			createErrorResponse("Request contains invalid data.", {
				code: "INVALID_REQUEST_DATA",
			}),
		)
		return
	}

	if (error instanceof HttpError) {
		if (error.status >= 500) {
			logServerError(error, req)
		}

		res.status(error.status).send(
			createErrorResponse(error.message, {
				code: error.code,
				details: error.details,
			}),
		)
		return
	}

	logServerError(error, req)

	res.status(500).send(
		createErrorResponse("Internal server error.", {
			code: "INTERNAL_SERVER_ERROR",
		}),
	)
}
