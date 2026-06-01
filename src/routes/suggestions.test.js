import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import app from "../app.js"

const envKeys = [
	"NODE_ENV",
	"ZOHO_CLIENT_ID",
	"ZOHO_CLIENT_SECRET",
	"ZOHO_REFRESH_TOKEN",
	"ZOHO_ACCOUNT_ID",
	"ZOHO_FROM_ADDRESS",
]

let originalEnv
let originalConsoleInfo

function clearZohoEnv() {
	for (const key of envKeys.filter((key) => key !== "NODE_ENV")) {
		delete process.env[key]
	}
}

function restoreEnv() {
	for (const key of envKeys) {
		if (originalEnv[key] === undefined) {
			delete process.env[key]
			continue
		}

		process.env[key] = originalEnv[key]
	}
}

async function withServer(callback) {
	const server = await new Promise((resolve, reject) => {
		const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer))
		nextServer.on("error", reject)
	})

	try {
		const { port } = server.address()
		return await callback(`http://127.0.0.1:${port}`)
	} finally {
		await new Promise((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()))
		})
	}
}

async function readResponse(response) {
	return {
		status: response.status,
		body: await response.json(),
	}
}

beforeEach(() => {
	originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
	originalConsoleInfo = console.info
	process.env.NODE_ENV = "test"
	clearZohoEnv()
	console.info = () => {}
})

afterEach(() => {
	restoreEnv()
	console.info = originalConsoleInfo
})

describe("suggestion routes", () => {
	it("accepts an anonymous suggestion", async () => {
		await withServer(async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/v1/suggestions`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					suggestion: "Please add custom practice lists.",
				}),
			})
			const result = await readResponse(response)

			assert.equal(result.status, 202)
			assert.deepEqual(result.body, {
				message: "Thanks for the suggestion.",
			})
		})
	})

	it("rejects an empty suggestion", async () => {
		await withServer(async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/v1/suggestions`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					suggestion: "",
				}),
			})
			const result = await readResponse(response)

			assert.equal(result.status, 400)
			assert.equal(result.body.error.code, "VALIDATION_ERROR")
			assert.equal(result.body.error.message, "Suggestion is required")
		})
	})
})
