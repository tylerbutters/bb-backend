import {
	AGENT_KEYS,
	COUNTED_OBJECTS,
	DESTINATION_KEYS,
	PATIENT_KEYS,
	PLACE_ACTIONS,
	PLACE_KEYS,
	POTENTIAL_ACTIONS,
	SUBJECT_KEYS,
} from "./frameVocabulary.js"
import {
	buildSentenceCounterChunk,
	buildSentenceVerbChunk,
	buildSentenceWordChunk,
	englishDestinationText,
	englishObjectText,
	englishPlaceText,
	englishPluralObjectText,
	englishSubjectText,
	englishVerbBase,
	englishVerbText,
} from "./frameHelpers.js"

export const HARD_SENTENCE_FRAMES = [
	{
		id: "reason_clause_action",
		pickParts(frameContext) {
			return pickReasonClauseActionParts(frameContext)
		},
		pickConjugationParts(frameContext) {
			return pickReasonClauseActionParts(frameContext)
		},
		buildEnglish({ subject, place, action, object }) {
			return `because it rained, ${englishSubjectText(subject)} ${englishVerbText(
				action.verb,
				subject,
				"past",
			)} ${englishObjectText(object)} ${englishPlaceText(place)}`
		},
		buildJapanese({ subject, place, action, object }) {
			return [
				buildSentenceWordChunk("rain", "が", "weather"),
				buildSentenceVerbChunk("fall", ["te"], "weatherVerb"),
				buildSentenceWordChunk(subject, "は", "subject"),
				buildSentenceWordChunk(place, "で", "place"),
				buildSentenceWordChunk(object, "を", "object"),
				buildSentenceVerbChunk(action.verb, ["past"], "verb"),
			]
		},
	},
	{
		id: "potential_negative_past",
		pickParts(frameContext) {
			return pickPotentialNegativePastParts(frameContext)
		},
		pickConjugationParts(frameContext) {
			return pickPotentialNegativePastParts(frameContext)
		},
		buildEnglish({ subject, place, action, object }) {
			return `${englishSubjectText(subject)} was not able to ${englishVerbBase(
				action.verb,
			)} ${englishObjectText(object)} ${englishPlaceText(place)}`
		},
		buildJapanese({ subject, place, action, object }) {
			return [
				buildSentenceWordChunk(subject, "は", "subject"),
				buildSentenceWordChunk(place, "で", "place"),
				buildSentenceWordChunk(object, "を", "object"),
				buildSentenceVerbChunk(action.verb, ["potential", "negative", "past"], "verb"),
			]
		},
	},
	{
		id: "counted_object_action",
		pickParts(frameContext) {
			return pickCountedObjectActionParts(frameContext)
		},
		pickConjugationParts(frameContext) {
			return pickCountedObjectActionParts(frameContext)
		},
		buildEnglish({ subject, place, countedObject, count }) {
			return `${englishSubjectText(subject)} bought ${count.english} ${englishPluralObjectText(
				countedObject.object,
			)} ${englishPlaceText(place)}`
		},
		buildJapanese({ subject, place, countedObject, count }) {
			return [
				buildSentenceWordChunk(subject, "は", "subject"),
				buildSentenceWordChunk(place, "で", "place"),
				buildSentenceWordChunk(countedObject.object, "を", "object"),
				buildSentenceCounterChunk(countedObject.counter, count.number),
				buildSentenceVerbChunk("buy", ["past"], "verb"),
			]
		},
	},
	{
		id: "causative_passive_destination",
		pickParts(frameContext) {
			return pickCausativePassiveDestinationParts(frameContext)
		},
		pickConjugationParts(frameContext) {
			return pickCausativePassiveDestinationParts(frameContext)
		},
		buildEnglish({ subject, agent, destination }) {
			return `${englishSubjectText(subject)} was made to go ${englishDestinationText(
				destination,
			)} by ${englishObjectText(agent)}`
		},
		buildJapanese({ subject, agent, destination }) {
			return [
				buildSentenceWordChunk(subject, "は", "subject"),
				buildSentenceWordChunk(agent, "に", "agent"),
				buildSentenceWordChunk(destination, "に", "destination"),
				buildSentenceVerbChunk("go", ["causative", "passive", "past"], "verb"),
			]
		},
	},
]

function pickReasonClauseActionParts({ pickVocabularyKey, pickOne }) {
	const subject = pickVocabularyKey(SUBJECT_KEYS, "subject")
	const place = pickVocabularyKey(PLACE_KEYS, "place")
	const action = pickOne(PLACE_ACTIONS)
	const object = pickVocabularyKey(action.objects, "object")

	return { subject, place, action, object }
}

function pickPotentialNegativePastParts({ pickVocabularyKey, pickOne }) {
	const subject = pickVocabularyKey(SUBJECT_KEYS, "subject")
	const place = pickVocabularyKey(PLACE_KEYS, "place")
	const action = pickOne(POTENTIAL_ACTIONS)
	const object = pickVocabularyKey(action.objects, "object")

	return { subject, place, action, object }
}

function pickCountedObjectActionParts({ pickVocabularyKey, pickOne }) {
	const subject = pickVocabularyKey(SUBJECT_KEYS, "subject")
	const place = pickVocabularyKey(PLACE_KEYS, "place")
	const countedObject = pickOne(COUNTED_OBJECTS)
	const count = pickOne(countedObject.counts)

	return { subject, place, countedObject, count }
}

function pickCausativePassiveDestinationParts({
	pickVocabularyKey,
	pickDifferentVocabularyKey,
}) {
	const subject = pickVocabularyKey(PATIENT_KEYS, "patient")
	const agent = pickDifferentVocabularyKey(AGENT_KEYS, "agent", subject)
	const destination = pickVocabularyKey(DESTINATION_KEYS, "destination")

	return { subject, agent, destination }
}
