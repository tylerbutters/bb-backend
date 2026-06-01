import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { HttpError } from "../errors.js"
import {
	checkSandboxSentence,
	generateGamePrompt,
	getGameCheckInstructions,
	validateConjugationPrompt,
} from "./games.js"

describe("validateConjugationPrompt", () => {
	it("keeps the English prompt and base-form Japanese kanji/kana word data", () => {
		assert.deepEqual(
			validateConjugationPrompt({
				prompt: "He wanted to go to school.",
				englishSentence: "He wanted to go to school.",
				targetConjugation: "desire",
				japaneseTranslation: [
					{ kanji: "彼", kana: "かれ", particle: "は" },
					{ kanji: "学校", kana: "がっこう", particle: "に" },
					{ kanji: "行く", kana: "いく" },
				],
			}),
			{
				prompt: "He wanted to go to school.",
				englishSentence: "He wanted to go to school.",
				targetConjugation: "desire",
				japaneseTranslation: [
					{ kanji: "彼", kana: "かれ", particle: "は" },
					{ kanji: "学校", kana: "がっこう", particle: "に" },
					{ kanji: "行く", kana: "いく" },
				],
			},
		)
	})

	it("rejects incomplete structured prompts", () => {
		assert.throws(
			() =>
				validateConjugationPrompt({
					prompt: "Conjugate 食べる.",
					englishSentence: "I eat rice.",
					targetConjugation: "plain present",
					japaneseTranslation: [{ kanji: "食べます" }],
				}),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 502)
				assert.equal(error.code, "AI_INVALID_RESPONSE")
				return true
			},
		)
	})

	it("rejects standalone particles that should be attached to nouns", () => {
		assert.throws(
			() =>
				validateConjugationPrompt({
					prompt: "I want to eat sushi.",
					englishSentence: "I want to eat sushi.",
					targetConjugation: "desire",
					japaneseTranslation: [
						{ kanji: "私", kana: "わたし" },
						{ kanji: "は", kana: "は" },
						{ kanji: "食べる", kana: "たべる" },
						{ kanji: "を", kana: "を" },
						{ kanji: "寿司", kana: "すし" },
					],
				}),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 502)
				assert.equal(error.code, "AI_INVALID_RESPONSE")
				return true
			},
		)
	})

	it("rejects conjugation helper words in the base Japanese word data", () => {
		assert.throws(
			() =>
				validateConjugationPrompt({
					prompt: "She wants to go.",
					englishSentence: "She wants to go.",
					targetConjugation: "desire",
					japaneseTranslation: [
						{ kanji: "彼女", kana: "かのじょ", particle: "は" },
						{ kanji: "行く", kana: "いく", particle: "を" },
						{ kanji: "欲しい", kana: "ほしい" },
					],
				}),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 502)
				assert.equal(error.code, "AI_INVALID_RESPONSE")
				return true
			},
		)
	})

	it("rejects unknown target conjugation labels", () => {
		assert.throws(
			() =>
				validateConjugationPrompt({
					prompt: "She went to school.",
					englishSentence: "She went to school.",
					targetConjugation: "made-up form",
					japaneseTranslation: [
						{ kanji: "彼女", kana: "かのじょ", particle: "は" },
						{ kanji: "学校", kana: "がっこう", particle: "に" },
						{ kanji: "行く", kana: "いく" },
					],
				}),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 502)
				assert.equal(error.code, "AI_INVALID_RESPONSE")
				return true
			},
		)
	})

	it("allows medium targets to combine two conjugation concepts", () => {
		assert.deepEqual(
			validateConjugationPrompt(
				{
					prompt: "She did not go to school.",
					englishSentence: "She did not go to school.",
					targetConjugation: "negative past",
					japaneseTranslation: [
						{ kanji: "彼女", kana: "かのじょ", particle: "は" },
						{ kanji: "学校", kana: "がっこう", particle: "に" },
						{ kanji: "行く", kana: "いく" },
					],
				},
				{ difficulty: "medium" },
			),
			{
				prompt: "She did not go to school.",
				englishSentence: "She did not go to school.",
				targetConjugation: "negative past",
				japaneseTranslation: [
					{ kanji: "彼女", kana: "かのじょ", particle: "は" },
					{ kanji: "学校", kana: "がっこう", particle: "に" },
					{ kanji: "行く", kana: "いく" },
				],
			},
		)
	})

	it("rejects medium targets for easy prompts", () => {
		assert.throws(
			() =>
				validateConjugationPrompt(
					{
						prompt: "She did not go to school.",
						englishSentence: "She did not go to school.",
						targetConjugation: "negative past",
						japaneseTranslation: [
							{ kanji: "彼女", kana: "かのじょ", particle: "は" },
							{ kanji: "学校", kana: "がっこう", particle: "に" },
							{ kanji: "行く", kana: "いく" },
						],
					},
					{ difficulty: "easy" },
				),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 502)
				assert.equal(error.code, "AI_INVALID_RESPONSE")
				return true
			},
		)
	})

	it("allows hard targets to chain several conjugation concepts", () => {
		assert.deepEqual(
			validateConjugationPrompt(
				{
					prompt: "She did not want to be made to go.",
					englishSentence: "She did not want to be made to go.",
					targetConjugation: "causative passive desire negative past",
					japaneseTranslation: [
						{ kanji: "彼女", kana: "かのじょ", particle: "は" },
						{ kanji: "行く", kana: "いく" },
					],
				},
				{ difficulty: "hard" },
			),
			{
				prompt: "She did not want to be made to go.",
				englishSentence: "She did not want to be made to go.",
				targetConjugation: "causative passive desire negative past",
				japaneseTranslation: [
					{ kanji: "彼女", kana: "かのじょ", particle: "は" },
					{ kanji: "行く", kana: "いく" },
				],
			},
		)
	})

	it("rejects hard targets for medium prompts", () => {
		assert.throws(
			() =>
				validateConjugationPrompt(
					{
						prompt: "She did not want to be made to go.",
						englishSentence: "She did not want to be made to go.",
						targetConjugation: "causative passive desire negative past",
						japaneseTranslation: [
							{ kanji: "彼女", kana: "かのじょ", particle: "は" },
							{ kanji: "行く", kana: "いく" },
						],
					},
					{ difficulty: "medium" },
				),
			(error) => {
				assert.equal(error instanceof HttpError, true)
				assert.equal(error.status, 502)
				assert.equal(error.code, "AI_INVALID_RESPONSE")
				return true
			},
		)
	})
})

describe("generateGamePrompt", () => {
	it("uses local generation for all prompt game modes", async () => {
		for (const mode of [
			"translate",
			"conjugations",
			"fix sentence",
			"particles",
			"reorder",
		]) {
			const prompt = await generateGamePrompt({ mode, difficulty: "medium" })

			assert.equal(prompt.source, "local")
			assert.equal(typeof prompt.prompt, "string")
			assert.notEqual(prompt.prompt.length, 0)
		}
	})

	it("uses local generation for translate prompts", async () => {
		const prompt = await generateGamePrompt({ mode: "translate", difficulty: "easy" })

		assert.equal(prompt.source, "local")
		assert.equal(typeof prompt.prompt, "string")
		assert.match(prompt.prompt, /\.$/)
		assert.equal(prompt.profile.vocabLevel, "easy")
	})

	it("includes a challenge ID on generated prompts", async () => {
		const prompt = await generateGamePrompt({ mode: "translate", difficulty: "easy" })

		assert.match(
			prompt.challengeId,
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		)
	})

	it("uses local generation for conjugation prompts", async () => {
		const prompt = await generateGamePrompt({ mode: "conjugations", difficulty: "hard" })

		assert.equal(prompt.source, "local")
		assert.equal(prompt.profile.vocabLevel, "easy")
		assert.equal(prompt.profile.conjugationLevel, "hard")
		assert.doesNotThrow(() => validateConjugationPrompt(prompt, { difficulty: "hard" }))
	})
})

describe("getGameCheckInstructions", () => {
	it("keeps translate checks focused on full sentence meaning", () => {
		const instructions = getGameCheckInstructions("translate")

		assert.match(instructions, /Compare the English sentence/)
		assert.doesNotMatch(instructions, /focused only/)
	})

	it("keeps generated-element games focused on the practiced skill", () => {
		const expectedFocus = {
			conjugations: {
				focus: /focused only on conjugation/,
				ignoredIssue: /particles/,
			},
			"fix sentence": {
				focus: /focused only on fixing the one wrong particle or word/,
				ignoredIssue: /unrelated grammar/,
			},
			particles: {
				focus: /focused only on particle choice/,
				ignoredIssue: /conjugation/,
			},
			reorder: {
				focus: /focused only on word order/,
				ignoredIssue: /particles/,
			},
		}

		for (const [mode, { focus, ignoredIssue }] of Object.entries(expectedFocus)) {
			const instructions = getGameCheckInstructions(mode)

			assert.match(instructions, focus)
			assert.match(instructions, ignoredIssue)
			assert.match(instructions, /Do not mark incorrect or give feedback/)
		}
	})
})

describe("checkSandboxSentence", () => {
	it("checks a standalone Japanese sentence without requiring a target prompt", async () => {
		const calls = []
		const result = await checkSandboxSentence(
			{ answer: "猫がいます。" },
			{
				checkAnswer: async (payload) => {
					calls.push(payload)
					return { correct: true, feedback: "Natural sentence." }
				},
			},
		)

		assert.deepEqual(result, { correct: true, feedback: "Natural sentence." })
		assert.equal(calls.length, 1)
		assert.equal(calls[0].gameTitle, "sandbox sentence check")
		assert.equal(calls[0].answer, "猫がいます。")
		assert.match(calls[0].checkInstructions, /standalone Japanese sentence/)
	})
})
