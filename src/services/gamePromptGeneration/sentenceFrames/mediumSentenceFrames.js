import {
	ADVERB_KEYS,
	AGENT_KEYS,
	COMPANION_ACTIONS,
	COMPANION_KEYS,
	PATIENT_KEYS,
	PLACE_ACTIONS,
	PLACE_KEYS,
	SUBJECT_KEYS,
} from "./frameVocabulary.js"
import {
	buildSentenceVerbChunk,
	buildSentenceWordChunk,
	englishAdverbText,
	englishObjectText,
	englishPlaceText,
	englishSubjectText,
	englishVerbText,
	tenseToConjugation,
} from "./frameHelpers.js"

const ACTION_TENSES = ["past", "present", "negative"]
const CONJUGATED_ACTION_TENSES = ["past", "negative"]
const ADVERB_ACTION_TENSES = ["present", "past"]
const PASSIVE_TENSES = ["present", "negative", "past"]

export const MEDIUM_SENTENCE_FRAMES = [
	{
		id: "subject_place_object_verb",
		pickParts(frameContext) {
			return pickSubjectPlaceObjectVerbParts(frameContext)
		},
		pickConjugationParts(frameContext) {
			return pickSubjectPlaceObjectVerbParts(frameContext, {
				tenseOptions: CONJUGATED_ACTION_TENSES,
			})
		},
		buildEnglish({ subject, place, action, object, tense }) {
			return `${englishSubjectText(subject)} ${englishVerbText(
				action.verb,
				subject,
				tense,
			)} ${englishObjectText(object)} ${englishPlaceText(place)}`
		},
		buildJapanese({ subject, place, action, object, tense }) {
			return [
				buildSentenceWordChunk(subject, "は", "subject"),
				buildSentenceWordChunk(place, "で", "place"),
				buildSentenceWordChunk(object, "を", "object"),
				buildSentenceVerbChunk(action.verb, tenseToConjugation(tense), "verb"),
			]
		},
	},
	{
		id: "subject_companion_object_verb",
		pickParts(frameContext) {
			return pickSubjectCompanionObjectVerbParts(frameContext)
		},
		pickConjugationParts(frameContext) {
			return pickSubjectCompanionObjectVerbParts(frameContext, {
				tenseOptions: CONJUGATED_ACTION_TENSES,
			})
		},
		buildEnglish({ subject, companion, action, object, tense }) {
			return `${englishSubjectText(subject)} ${englishVerbText(
				action.verb,
				subject,
				tense,
			)} ${englishObjectText(object)} with ${englishObjectText(companion)}`
		},
		buildJapanese({ subject, companion, action, object, tense }) {
			return [
				buildSentenceWordChunk(subject, "は", "subject"),
				buildSentenceWordChunk(companion, "と", "companion"),
				buildSentenceWordChunk(object, "を", "object"),
				buildSentenceVerbChunk(action.verb, tenseToConjugation(tense), "verb"),
			]
		},
	},
	{
		id: "adverb_object_verb",
		pickParts(frameContext) {
			return pickAdverbObjectVerbParts(frameContext)
		},
		pickConjugationParts(frameContext) {
			return pickAdverbObjectVerbParts(frameContext, { fixedTense: "past" })
		},
		buildEnglish({ subject, adverb, action, object, tense }) {
			return `${englishSubjectText(subject)} ${englishVerbText(
				action.verb,
				subject,
				tense,
			)} ${englishObjectText(object)} ${englishAdverbText(adverb)}`
		},
		buildJapanese({ subject, adverb, action, object, tense }) {
			return [
				buildSentenceWordChunk(subject, "は", "subject"),
				buildSentenceWordChunk(adverb, null, "adverb"),
				buildSentenceWordChunk(object, "を", "object"),
				buildSentenceVerbChunk(action.verb, tenseToConjugation(tense), "verb"),
			]
		},
	},
	{
		id: "passive_agent",
		pickParts(frameContext) {
			return pickPassiveAgentParts(frameContext)
		},
		pickConjugationParts(frameContext) {
			return pickPassiveAgentParts(frameContext)
		},
		buildEnglish({ patient, agent, tense }) {
			return {
				present: `${englishSubjectText(patient)} is praised by ${englishObjectText(agent)}`,
				past: `${englishSubjectText(patient)} was praised by ${englishObjectText(agent)}`,
				negative: `${englishSubjectText(patient)} is not praised by ${englishObjectText(agent)}`,
			}[tense]
		},
		buildJapanese({ patient, agent, tense }) {
			return [
				buildSentenceWordChunk(patient, "は", "subject"),
				buildSentenceWordChunk(agent, "に", "agent"),
				buildSentenceVerbChunk("praise", passiveConjugationForTense(tense), "verb"),
			]
		},
	},
]

function pickSubjectPlaceObjectVerbParts(
	{ pickVocabularyKey, pickOne },
	{ tenseOptions = ACTION_TENSES } = {},
) {
	const subject = pickVocabularyKey(SUBJECT_KEYS, "subject")
	const place = pickVocabularyKey(PLACE_KEYS, "place")
	const action = pickOne(PLACE_ACTIONS)
	const object = pickVocabularyKey(action.objects, "object")
	const tense = pickOne(tenseOptions)

	return { subject, place, action, object, tense }
}

function pickSubjectCompanionObjectVerbParts(
	{ pickVocabularyKey, pickDifferentVocabularyKey, pickOne },
	{ tenseOptions = ACTION_TENSES } = {},
) {
	const subject = pickVocabularyKey(SUBJECT_KEYS, "subject")
	const companion = pickDifferentVocabularyKey(COMPANION_KEYS, "companion", subject)
	const action = pickOne(COMPANION_ACTIONS)
	const object = pickVocabularyKey(action.objects, "object")
	const tense = pickOne(tenseOptions)

	return { subject, companion, action, object, tense }
}

function pickAdverbObjectVerbParts(
	{ pickVocabularyKey, pickOne },
	{ fixedTense } = {},
) {
	const subject = pickVocabularyKey(SUBJECT_KEYS, "subject")
	const adverb = pickVocabularyKey(ADVERB_KEYS, "adverb")
	const action = pickOne(COMPANION_ACTIONS)
	const object = pickVocabularyKey(action.objects, "object")
	const tense = fixedTense || pickOne(ADVERB_ACTION_TENSES)

	return { subject, adverb, action, object, tense }
}

function pickPassiveAgentParts({ pickVocabularyKey, pickDifferentVocabularyKey, pickOne }) {
	const patient = pickVocabularyKey(PATIENT_KEYS, "patient")
	const agent = pickDifferentVocabularyKey(AGENT_KEYS, "agent", patient)
	const tense = pickOne(PASSIVE_TENSES)

	return { patient, agent, tense }
}

function passiveConjugationForTense(tense) {
	if (tense === "negative") return ["passive", "negative"]
	if (tense === "past") return ["passive", "past"]

	return ["passive"]
}
