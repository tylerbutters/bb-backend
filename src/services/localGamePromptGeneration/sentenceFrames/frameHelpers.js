import { getPromptVocabularyEntry } from "../promptData/localVocabulary.js"
import { buildConjugatedWordChunk, buildWordChunk } from "../promptData/wordChunks.js"

const DIFFICULTY_ORDER = ["easy", "medium", "hard"]

export function createFrameContext({ difficulty, randomNumber }) {
	return {
		difficulty,
		randomNumber,
		pickOne: (items) => pick(items, randomNumber),
		pickVocabularyKey: (keys, role) => pickVocabularyKey(keys, role, difficulty, randomNumber),
		pickDifferentVocabularyKey: (keys, role, excludedKey) =>
			pickDifferentVocabularyKey(keys, role, difficulty, randomNumber, excludedKey),
	}
}

export function pick(items, randomNumber) {
	if (!Array.isArray(items) || items.length === 0) {
		throw new Error("Cannot pick from an empty prompt list.")
	}

	// randomNumber is injectable so tests can cover every frame and branch deterministically.
	const index = Math.min(items.length - 1, Math.floor(randomNumber() * items.length))

	return items[index]
}

function pickVocabularyKey(keys, role, difficulty, randomNumber) {
	return pick(
		keys.filter((key) => vocabularyEntryMatchesRoleAndDifficulty(key, role, difficulty)),
		randomNumber,
	)
}

function pickDifferentVocabularyKey(keys, role, difficulty, randomNumber, excludedKey) {
	const options = keys.filter(
		(key) => key !== excludedKey && vocabularyEntryMatchesRoleAndDifficulty(key, role, difficulty),
	)

	return pick(options, randomNumber)
}

function vocabularyEntryMatchesRoleAndDifficulty(key, role, difficulty) {
	const vocabularyEntry = getPromptVocabularyEntry(key)
	const roles = role === "describedSubject" ? ["object", "place", "destination"] : [role]

	return (
		roles.some((allowedRole) => vocabularyEntry.roles.includes(allowedRole)) &&
		DIFFICULTY_ORDER.indexOf(vocabularyEntry.difficulty) <= DIFFICULTY_ORDER.indexOf(difficulty)
	)
}

// key and role are internal metadata used by prompt transforms and tests.
// removeInternalChunkMetadata removes them before these chunks are sent to the client.
export function buildSentenceWordChunk(key, particle, role) {
	return {
		key,
		role,
		...buildWordChunk(key, particle),
	}
}

export function buildSentenceVerbChunk(key, conjugation, role) {
	return {
		key,
		role,
		...(conjugation?.length
			? buildConjugatedWordChunk(key, null, conjugation)
			: buildWordChunk(key)),
	}
}

export function buildSentenceCounterChunk(key, number) {
	return {
		key,
		role: "counter",
		...buildWordChunk(key, null, {
			form: {
				number,
			},
		}),
	}
}

export function englishSubjectText(key) {
	return getPromptVocabularyEntry(key).english.subject
}

export function englishDescribedSubjectText(key) {
	return getPromptVocabularyEntry(key).english.subject
}

export function englishObjectText(key) {
	return getPromptVocabularyEntry(key).english.object
}

export function englishPluralObjectText(key) {
	return getPromptVocabularyEntry(key).english.plural
}

export function englishAdjectiveText(key) {
	return getPromptVocabularyEntry(key).english.predicate
}

export function englishAdverbText(key) {
	return getPromptVocabularyEntry(key).english.adverb
}

export function englishPlaceText(key) {
	return getPromptVocabularyEntry(key).english.place
}

export function englishDestinationText(key) {
	return getPromptVocabularyEntry(key).english.destination
}

export function englishVerbBase(key) {
	return getPromptVocabularyEntry(key).english.base
}

export function englishVerbText(key, subjectKey, tense) {
	// These English forms are only for the user-facing prompt. Japanese inflection is
	// represented separately by the conjugation array on buildSentenceVerbChunk.
	const verb = getPromptVocabularyEntry(key).english
	if (tense === "past") return verb.past
	if (tense === "negative") {
		return `${usesThirdPersonSingular(subjectKey) ? "does" : "do"} not ${verb.base}`
	}

	return usesThirdPersonSingular(subjectKey) ? verb.present3 : verb.base
}

function usesThirdPersonSingular(key) {
	return Boolean(getPromptVocabularyEntry(key).thirdPersonSingular)
}

export function tenseToConjugation(tense) {
	if (tense === "past") return ["past"]
	if (tense === "negative") return ["negative"]

	return []
}

export function formatEnglishPrompt(text) {
	const trimmedText = text.trim()

	return `${trimmedText.charAt(0).toUpperCase()}${trimmedText.slice(1)}.`
}
