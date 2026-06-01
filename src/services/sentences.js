import "../env.js"
import { HttpError } from "../errors.js"
import OpenAI from "openai"

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
})

async function createResponse(payload) {
	if (!process.env.OPENAI_API_KEY) {
		throw new HttpError(503, "AI service is not configured.", {
			code: "AI_SERVICE_NOT_CONFIGURED",
			logMessage: "OPENAI_API_KEY is not configured.",
		})
	}

	try {
		return await openai.responses.create({
			model: "gpt-5.4-mini",
			...payload,
		})
	} catch (error) {
		throw normalizeOpenAIError(error)
	}
}

function normalizeOpenAIError(error) {
	const status = error?.status
	const message =
		status === 429 ? "AI service is rate limited right now." : "AI service is unavailable right now."
	const responseStatus =
		status === 408 || status === 504 ? 504 : status === 429 || status >= 500 ? 503 : 502

	return new HttpError(responseStatus, message, {
		code: "AI_SERVICE_ERROR",
		cause: error,
		logMessage: `OpenAI request failed${status ? ` with ${status}` : ""}: ${error.message}`,
	})
}

export async function checkJapaneseGameAnswer({
	gameTitle,
	prompt,
	answer,
	checkInstructions,
}) {
	const response = await createResponse({
		instructions: [
			`You judge beginner Japanese ${gameTitle} answers.`,
			checkInstructions,
			"Return only valid JSON.",
			"The JSON must have these fields: correct boolean, feedback string.",
			"Do not wrap the JSON in markdown.",
			"If incorrect, give concise, helpful feedback without being harsh.",
			"Give feedback in English.",
		].join(" "),
		input: JSON.stringify({
			prompt,
			answer,
		}),
	})

	const rawText = String(response.output_text || "").trim()

	try {
		const result = JSON.parse(rawText)

		return {
			correct: Boolean(result.correct),
			feedback: String(result.feedback || "").trim(),
		}
	} catch {
		throw new HttpError(502, "AI service returned invalid game feedback.", {
			code: "AI_INVALID_RESPONSE",
			logMessage: `Invalid JSON from OpenAI: ${rawText}`,
		})
	}
}

export async function checkJapaneseTranslation({ englishSentence, japaneseSentence }) {
	return checkJapaneseGameAnswer({
		gameTitle: "sentence translation",
		prompt: englishSentence,
		answer: japaneseSentence,
		checkInstructions: [
			"The prompt is an English sentence.",
			"The answer is the learner's Japanese sentence.",
			"Compare the English sentence with the learner's Japanese sentence.",
			"Mark correct when the Japanese naturally communicates the same meaning, even if wording differs.",
		].join(" "),
	})
}
