import express from "express"
import cors from "cors"
import helmet from "helmet"
import { HttpError, errorHandler } from "./errors.js"
import adminRouter from "./routes/admin.js"
import authRouter from "./routes/auth.js"
import gamesRouter from "./routes/games.js"
import healthRouter from "./routes/health.js"
import suggestionsRouter from "./routes/suggestions.js"
import usersRouter from "./routes/users.js"
import { apiRateLimiter } from "./middleware/rateLimiters.js"
import { requestLogger } from "./middleware/requestLogger.js"

const app = express()
const apiRoot = "/api/v1"

const allowedOrigins = ["http://localhost:3000", process.env.CLIENT_URL].filter(Boolean)
const localDevelopmentHosts = new Set(["localhost", "127.0.0.1", "[::1]"])
const stateChangingMethods = new Set(["DELETE", "PATCH", "POST", "PUT"])

if (process.env.TRUST_PROXY) {
	app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : process.env.TRUST_PROXY)
}

app.disable("x-powered-by")
app.use(requestLogger)

function isLocalDevelopmentOrigin(origin) {
	if (process.env.NODE_ENV === "production") return false

	try {
		const { hostname, protocol } = new URL(origin)
		return localDevelopmentHosts.has(hostname) && ["http:", "https:"].includes(protocol)
	} catch {
		return false
	}
}

function isAllowedOrigin(origin) {
	return !origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin(origin)
}

function requireTrustedOrigin(req, res, next) {
	if (!stateChangingMethods.has(req.method)) {
		next()
		return
	}

	const origin = req.get("origin")
	if (isAllowedOrigin(origin)) {
		next()
		return
	}

	next(
		new HttpError(403, "Origin is not allowed.", {
			code: "ORIGIN_NOT_ALLOWED",
		}),
	)
}

app.use(
	helmet({
		contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
		crossOriginEmbedderPolicy: false,
	}),
)

app.use(
	cors({
		credentials: true,
		origin(origin, callback) {
			if (isAllowedOrigin(origin)) {
				callback(null, true)
				return
			}

			callback(
				new HttpError(403, "Origin is not allowed by CORS.", {
					code: "CORS_ORIGIN_NOT_ALLOWED",
				}),
			)
		},
	}),
)

app.use(requireTrustedOrigin)
app.use(express.json({ limit: "16kb" }))

app.use(`${apiRoot}/health`, healthRouter)
app.use(apiRoot, apiRateLimiter)
app.use(`${apiRoot}/admin`, adminRouter)
app.use(`${apiRoot}/users`, usersRouter)
app.use(`${apiRoot}/login`, authRouter)
app.use(`${apiRoot}/games`, gamesRouter)
app.use(`${apiRoot}/suggestions`, suggestionsRouter)

app.use(errorHandler)

export default app
