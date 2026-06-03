import { randomUUID } from "node:crypto"

function formatLogFields(fields) {
	return Object.entries(fields)
		.filter(([, value]) => value !== undefined && value !== null && value !== "")
		.map(([key, value]) => `${key}=${value}`)
		.join(" ")
}

function logRequestCompletion({ requestId, req, statusCode, durationMs }) {
	const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info"
	const fields = formatLogFields({
		status: statusCode,
		duration: `${durationMs.toFixed(1)}ms`,
	})

	console[level](`[api:${requestId}] <- ${req.method} ${req.originalUrl} ${fields}`)
}

export function requestLogger(req, res, next) {
	const startedAt = process.hrtime.bigint()
	const requestId = randomUUID().slice(0, 8)

	req.requestId = requestId
	console.info(
		`[api:${requestId}] -> ${req.method} ${req.originalUrl} ${formatLogFields({
			ip: req.ip,
		})}`,
	)

	res.on("finish", () => {
		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
		logRequestCompletion({
			requestId,
			req,
			statusCode: res.statusCode,
			durationMs,
		})
	})

	next()
}
