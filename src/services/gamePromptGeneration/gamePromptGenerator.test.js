import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, it } from "node:test"
import { validateConjugationPrompt } from "../games.js"
import {
	buildAcceptedJapaneseAnswerTexts,
	buildJapaneseAnswerFeedbackParts,
	buildJapaneseAnswerFeedbackText,
} from "./answerText.js"
import { PROMPT_VOCABULARY } from "./promptData/promptVocabulary.js"
import { generateGamePromptContent } from "./gamePromptGenerator.js"
import { generateSentenceFromFrame } from "./sentenceFrames/index.js"

const FIRST_RANDOM_VALUE = 0
const LAST_RANDOM_VALUE = 0.999999

describe("generateGamePromptContent", () => {
	it("generates translate prompts from sentence rules", () => {
		const prompt = generateGamePromptContent({
			mode: "translate",
			difficulty: "easy",
			randomNumber: () => FIRST_RANDOM_VALUE,
		})

		assert.equal(prompt.prompt, "I eat sushi.")
		assert.equal(prompt.source, "generated")
		assert.equal(prompt.templateId, "subject_object_verb")
		assert.equal(Object.hasOwn(prompt, "japaneseTranslation"), false)
	})

	it("generates prompts for each structured game mode", () => {
		for (const mode of ["conjugations", "fix sentence", "particles", "reorder"]) {
			const prompt = generateGamePromptContent({
				mode,
				difficulty: "medium",
				randomNumber: () => FIRST_RANDOM_VALUE,
			})

			assert.equal(prompt.source, "generated")
			assert.equal(typeof prompt.prompt, "string")
			assert.notEqual(prompt.prompt.length, 0)
			assert.equal(prompt.gameProfile.vocabLevel, "easy")
		}
	})

	it("generates particle prompts with sentence elements and missing particles", () => {
		for (const difficulty of ["easy", "medium", "hard"]) {
			for (const randomValue of [FIRST_RANDOM_VALUE, LAST_RANDOM_VALUE]) {
				const prompt = generateGamePromptContent({
					mode: "particles",
					difficulty,
					randomNumber: () => randomValue,
				})

				assert.equal(Array.isArray(prompt.japaneseTranslation), true)
				assert.notEqual(prompt.japaneseTranslation.length, 0)
				assert.equal(
					prompt.japaneseTranslation.some((wordData) => Object.hasOwn(wordData, "particle")),
					false,
				)
			}
		}

		assert.deepEqual(
			generateGamePromptContent({
				mode: "particles",
				difficulty: "easy",
				randomNumber: () => FIRST_RANDOM_VALUE,
			}),
			{
				prompt: "I eat sushi.",
				source: "generated",
				templateId: "subject_object_verb",
				gameProfile: {
					vocabLevel: "easy",
					sentenceComplexity: "simple",
					particleLevel: "easy",
				},
				japaneseTranslation: [
					{ kanji: "私", kana: "わたし" },
					{ kanji: "寿司", kana: "すし" },
					{ kanji: "食べる", kana: "たべる" },
				],
			},
		)
	})

	it("generates reorder prompts with English text and scrambled sentence elements", () => {
		const prompt = generateGamePromptContent({
			mode: "reorder",
			difficulty: "easy",
			randomNumber: () => FIRST_RANDOM_VALUE,
		})

		assert.equal(prompt.prompt, "I eat sushi.")
		assert.equal(prompt.prompt.includes("English:"), false)
		assert.equal(prompt.prompt.includes("Chunks:"), false)
		assert.deepEqual(prompt.japaneseTranslation, [
			{ kanji: "寿司", kana: "すし", particle: "を" },
			{ kanji: "食べる", kana: "たべる" },
			{ kanji: "私", kana: "わたし", particle: "は" },
		])

		for (const difficulty of ["easy", "medium", "hard"]) {
			for (const randomValue of [FIRST_RANDOM_VALUE, LAST_RANDOM_VALUE]) {
				const nextPrompt = generateGamePromptContent({
					mode: "reorder",
					difficulty,
					randomNumber: () => randomValue,
				})

				assert.equal(Array.isArray(nextPrompt.japaneseTranslation), true)
				assert.notEqual(nextPrompt.japaneseTranslation.length, 0)
				assert.equal(nextPrompt.prompt.includes("English:"), false)
				assert.equal(nextPrompt.prompt.includes("Chunks:"), false)
			}
		}
	})

	it("allows non-conjugation modes to generate conjugated verb elements", () => {
		assert.deepEqual(
			generateGamePromptContent({
				mode: "reorder",
				difficulty: "medium",
				randomNumber: () => FIRST_RANDOM_VALUE,
			}).japaneseTranslation,
			[
				{ kanji: "学校", kana: "がっこう", particle: "で" },
				{
					kanji: "勉強する",
					kana: "べんきょうする",
					conjugation: ["past"],
				},
				{ kanji: "私", kana: "わたし", particle: "は" },
				{ kanji: "日本語", kana: "にほんご", particle: "を" },
			],
		)

		assert.deepEqual(
			generateGamePromptContent({
				mode: "particles",
				difficulty: "medium",
				randomNumber: () => LAST_RANDOM_VALUE,
			}).japaneseTranslation[2].conjugation,
			["passive", "past"],
		)

		assert.deepEqual(
			generateGamePromptContent({
				mode: "particles",
				difficulty: "hard",
				randomNumber: () => LAST_RANDOM_VALUE,
			}).japaneseTranslation[3].conjugation,
			["causative", "passive", "past"],
		)
	})

	it("generates adjective, adverb, and counter elements", () => {
		const adjectiveSentence = generateSentenceFromFrame({
			difficulty: "easy",
			randomNumber: () => LAST_RANDOM_VALUE,
		})
		const adverbSentence = generateSentenceFromFrame({
			difficulty: "medium",
			randomNumber: () => 0.6,
		})
		const counterSentence = generateSentenceFromFrame({
			difficulty: "hard",
			randomNumber: () => 0.6,
		})

		assert.equal(adjectiveSentence.templateId, "adjective_predicate")
		assert.equal(generatedElementTypes(adjectiveSentence).includes("adjective"), true)
		assert.equal(adverbSentence.templateId, "adverb_object_verb")
		assert.equal(generatedElementTypes(adverbSentence).includes("adverb"), true)
		assert.equal(counterSentence.templateId, "counted_object_action")
		assert.equal(generatedElementTypes(counterSentence).includes("counter"), true)
		assert.equal(
			counterSentence.japaneseTranslation.some((wordData) => wordData.form?.number),
			true,
		)
	})

	it("samples rule generation across modes and difficulties", () => {
		for (const mode of ["translate", "conjugations", "particles", "reorder", "fix sentence"]) {
			for (const difficulty of ["easy", "medium", "hard"]) {
				for (const randomValue of [0, 0.2, 0.4, 0.6, 0.8, LAST_RANDOM_VALUE]) {
					const prompt = generateGamePromptContent({
						mode,
						difficulty,
						randomNumber: () => randomValue,
					})

					assert.equal(prompt.source, "generated")
					assert.equal(typeof prompt.prompt, "string")
					assert.notEqual(prompt.prompt.length, 0)
					assert.equal(typeof prompt.templateId, "string")
					assert.notEqual(prompt.templateId.length, 0)

					if (mode === "translate") {
						assert.equal(Object.hasOwn(prompt, "japaneseTranslation"), false)
					} else {
						assert.equal(Array.isArray(prompt.japaneseTranslation), true)
						assert.notEqual(prompt.japaneseTranslation.length, 0)
						assert.equal(
							prompt.japaneseTranslation.some(
								(wordData) =>
									Object.hasOwn(wordData, "key") || Object.hasOwn(wordData, "role"),
							),
							false,
						)
					}
				}
			}
		}
	})

	it("scrambles reorder prompts without losing generated elements", () => {
		for (const difficulty of ["easy", "medium", "hard"]) {
			const randomNumber = () => 0
			const sentence = stripPromptMetadata(
				generateSentenceFromFrame({ difficulty, randomNumber }).japaneseTranslation,
			)
			const prompt = generateGamePromptContent({
				mode: "reorder",
				difficulty,
				randomNumber,
			})

			assert.notDeepEqual(prompt.japaneseTranslation, sentence)
			assert.deepEqual(sortWords(prompt.japaneseTranslation), sortWords(sentence))
		}
	})

	it("increases fix sentence mistakes by difficulty", () => {
		const expectedMistakesByDifficulty = {
			easy: 1,
			medium: 2,
			hard: 3,
		}

		for (const difficulty of ["easy", "medium", "hard"]) {
			for (const randomValue of [FIRST_RANDOM_VALUE, LAST_RANDOM_VALUE]) {
				const randomNumber = () => randomValue
				const sentence = stripPromptMetadata(
					generateSentenceFromFrame({ difficulty, randomNumber }).japaneseTranslation,
				)
				const prompt = generateGamePromptContent({
					mode: "fix sentence",
					difficulty,
					randomNumber,
				})

				assert.equal(
					countChangedWords(sentence, prompt.japaneseTranslation),
					expectedMistakesByDifficulty[difficulty],
				)
			}
		}
	})

	it("generates fix sentence prompts with English text and wrong elements", () => {
		const prompt = generateGamePromptContent({
			mode: "fix sentence",
			difficulty: "easy",
			randomNumber: () => FIRST_RANDOM_VALUE,
		})

		assert.equal(prompt.prompt, "I eat sushi.")
		assert.equal(prompt.prompt.includes("Japanese:"), false)
		assert.equal(prompt.prompt.includes("Fix one mistake"), false)
		assert.deepEqual(prompt.japaneseTranslation, [
			{ kanji: "私", kana: "わたし", particle: "は" },
			{ kanji: "寿司", kana: "すし", particle: "に" },
			{ kanji: "食べる", kana: "たべる" },
		])

		for (const difficulty of ["easy", "medium", "hard"]) {
			for (const randomValue of [FIRST_RANDOM_VALUE, LAST_RANDOM_VALUE]) {
				const nextPrompt = generateGamePromptContent({
					mode: "fix sentence",
					difficulty,
					randomNumber: () => randomValue,
				})

				assert.equal(Array.isArray(nextPrompt.japaneseTranslation), true)
				assert.notEqual(nextPrompt.japaneseTranslation.length, 0)
				assert.equal(nextPrompt.prompt.includes("Japanese:"), false)
				assert.equal(nextPrompt.prompt.includes("Fix one mistake"), false)
			}
		}
	})

	it("generates conjugation prompts by stripping conjugations from sentence frames", () => {
		const prompt = generateGamePromptContent({
			mode: "conjugations",
			difficulty: "easy",
			randomNumber: () => FIRST_RANDOM_VALUE,
		})

		assert.deepEqual(prompt, {
			prompt: "I ate sushi.",
			source: "generated",
			templateId: "subject_object_verb",
			gameProfile: {
				vocabLevel: "easy",
				sentenceComplexity: "simple",
				conjugationLevel: "easy",
			},
			japaneseTranslation: [
				{ kanji: "私", kana: "わたし", particle: "は" },
				{ kanji: "寿司", kana: "すし", particle: "を" },
				{ kanji: "食べる", kana: "たべる" },
			],
		})
		assert.deepEqual(validateConjugationPrompt(prompt), {
			prompt: "I ate sushi.",
			japaneseTranslation: [
				{ kanji: "私", kana: "わたし", particle: "は" },
				{ kanji: "寿司", kana: "すし", particle: "を" },
				{ kanji: "食べる", kana: "たべる" },
			],
		})
	})

	it("uses harder sentence frames for harder conjugation prompts", () => {
		const prompt = generateGamePromptContent({
			mode: "conjugations",
			difficulty: "hard",
			randomNumber: () => LAST_RANDOM_VALUE,
		})

		assert.equal(prompt.prompt, "My friend was made to go to the movie theater by the student.")
		assert.equal(prompt.templateId, "causative_passive_destination")
		assert.equal(prompt.gameProfile.vocabLevel, "medium")
		assert.equal(prompt.gameProfile.sentenceComplexity, "complex")
		assert.equal(prompt.gameProfile.conjugationLevel, "hard")
		assert.deepEqual(prompt.japaneseTranslation, [
			{ kanji: "友達", kana: "ともだち", particle: "は" },
			{ kanji: "学生", kana: "がくせい", particle: "に" },
			{ kanji: "映画館", kana: "えいがかん", particle: "に" },
			{ kanji: "いく", kana: "いく" },
		])
		assert.doesNotThrow(() => validateConjugationPrompt(prompt))
	})

	it("keeps sampled conjugation prompts as base-form Japanese chunks", () => {
		for (const difficulty of ["easy", "medium", "hard"]) {
			for (const randomValue of [0, 0.2, 0.4, 0.6, 0.8, LAST_RANDOM_VALUE]) {
				const prompt = generateGamePromptContent({
					mode: "conjugations",
					difficulty,
					randomNumber: () => randomValue,
				})

				assert.equal(prompt.source, "generated")
				assert.equal(prompt.templateId.startsWith("conjugation_"), false)
				assert.equal(Array.isArray(prompt.japaneseTranslation), true)
				assert.notEqual(prompt.japaneseTranslation.length, 0)
				assert.equal(
					prompt.japaneseTranslation.some((wordData) =>
						Object.hasOwn(wordData, "conjugation"),
					),
					false,
				)
				assert.doesNotThrow(() => validateConjugationPrompt(prompt))
			}
		}
	})

	it("keeps hard conjugation prompts on hard sentence profiles", () => {
		const prompt = generateGamePromptContent({
			mode: "conjugations",
			difficulty: "hard",
			randomNumber: () => FIRST_RANDOM_VALUE,
		})

		assert.equal(prompt.prompt, "Because it rained, I studied Japanese at school.")
		assert.equal(prompt.templateId, "reason_clause_action")
		assert.equal(prompt.gameProfile.vocabLevel, "medium")
		assert.equal(prompt.gameProfile.sentenceComplexity, "complex")
		assert.equal(prompt.gameProfile.conjugationLevel, "hard")
	})

	it("returns null for modes without a generator", () => {
		assert.equal(generateGamePromptContent({ mode: "sandbox" }), null)
		assert.equal(generateGamePromptContent({ mode: "shuffle" }), null)
	})
})

describe("buildAcceptedJapaneseAnswerTexts", () => {
	it("renders generated Japanese chunks into answer strings", () => {
		const easySentence = generateSentenceFromFrame({
			difficulty: "easy",
			randomNumber: () => FIRST_RANDOM_VALUE,
		})
		const mediumSentence = generateSentenceFromFrame({
			difficulty: "medium",
			randomNumber: () => FIRST_RANDOM_VALUE,
		})
		const hardSentence = generateSentenceFromFrame({
			difficulty: "hard",
			randomNumber: () => LAST_RANDOM_VALUE,
		})

		assert.deepEqual(buildAcceptedJapaneseAnswerTexts(easySentence.japaneseTranslation), [
			"私は寿司を食べる",
			"わたしはすしをたべる",
		])
		assert.deepEqual(buildAcceptedJapaneseAnswerTexts(mediumSentence.japaneseTranslation), [
			"私は学校で日本語を勉強した",
			"わたしはがっこうでにほんごをべんきょうした",
		])
		assert.deepEqual(buildAcceptedJapaneseAnswerTexts(hardSentence.japaneseTranslation), [
			"友達は学生に映画館にいかせられた",
			"ともだちはがくせいにえいがかんにいかせられた",
		])
	})

	it("renders sampled sentence frame answers without missing text", () => {
		for (const difficulty of ["easy", "medium", "hard"]) {
			for (const randomValue of [0, 0.2, 0.4, 0.6, 0.8, LAST_RANDOM_VALUE]) {
				const sentence = generateSentenceFromFrame({
					difficulty,
					randomNumber: () => randomValue,
				})
				const answers = buildAcceptedJapaneseAnswerTexts(sentence.japaneseTranslation)

				assert.notEqual(answers.length, 0)
				for (const answer of answers) {
					assert.equal(answer.includes("undefined"), false)
					assert.notEqual(answer.length, 0)
				}
			}
		}
	})
})

describe("buildJapaneseAnswerFeedbackText", () => {
	it("renders a readable expected answer with sentence chunks separated", () => {
		const sentence = generateSentenceFromFrame({
			difficulty: "easy",
			randomNumber: () => FIRST_RANDOM_VALUE,
		})

		assert.equal(
			buildJapaneseAnswerFeedbackText(sentence.japaneseTranslation),
			"私は 寿司を 食べる",
		)
		assert.deepEqual(buildJapaneseAnswerFeedbackParts(sentence.japaneseTranslation), [
			"私は",
			"寿司を",
			"食べる",
		])
	})
})

describe("prompt vocabulary", () => {
	it("keeps every backend vocabulary entry convertible by frontend dictionaries", () => {
		const frontendElements = loadFrontendProcessedElements()

		for (const [key, vocabularyWord] of Object.entries(PROMPT_VOCABULARY)) {
			assert.equal(
				frontendElements.some((element) =>
					matchesFrontendElement(element, vocabularyWord.kanji, vocabularyWord.kana),
				),
				true,
				`${key} (${vocabularyWord.kanji}/${vocabularyWord.kana}) is missing from frontend dictionaries`,
			)
		}
	})
})

function stripPromptMetadata(words) {
	return words.map(({ key, role, ...wordData }) => wordData)
}

function sortWords(words) {
	return words.map((wordData) => JSON.stringify(wordData)).sort()
}

function countChangedWords(leftWords, rightWords) {
	return leftWords.filter(
		(wordData, index) => JSON.stringify(wordData) !== JSON.stringify(rightWords[index]),
	).length
}

function generatedElementTypes(sentence) {
	return sentence.japaneseTranslation.map((wordData) => PROMPT_VOCABULARY[wordData.key].type)
}

function loadFrontendProcessedElements() {
	const frontendRootUrl = [
		"../../../../bb-frontend/src/pages/sentence-builder-page/jmdict/processed/",
		"../../../../jsb-frontend/src/pages/sentence-builder-page/jmdict/processed/",
	].find((candidatePath) => fs.existsSync(new URL(candidatePath, import.meta.url)))

	if (!frontendRootUrl) {
		throw new Error("Could not find frontend processed dictionaries")
	}

	return ["nouns", "verbs", "adjectives", "adverbs", "counters"].flatMap((groupName) =>
		JSON.parse(
			fs.readFileSync(
				new URL(`${frontendRootUrl}${groupName}.json`, import.meta.url),
				"utf8",
			),
		),
	)
}

function matchesFrontendElement(element, kanji, kana) {
	return (
		element.text === kanji && (element.textKana === kana || (!element.textKana && kanji === kana))
	)
}
