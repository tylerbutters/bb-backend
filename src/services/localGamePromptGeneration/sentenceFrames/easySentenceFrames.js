import {
	ADJECTIVE_KEYS,
	DESCRIBED_NOUN_KEYS,
	DESTINATION_KEYS,
	SIMPLE_ACTIONS,
	SUBJECT_KEYS,
} from "./frameVocabulary.js"
import {
	buildSentenceVerbChunk,
	buildSentenceWordChunk,
	englishAdjectiveText,
	englishDescribedSubjectText,
	englishDestinationText,
	englishObjectText,
	englishSubjectText,
	englishVerbText,
	tenseToConjugation,
} from "./frameHelpers.js"

const BASIC_TENSES = ["present", "past"]

export const EASY_SENTENCE_FRAMES = [
	{
		id: "subject_object_verb",
		pickParts(frameContext) {
			return pickSubjectObjectVerbParts(frameContext)
		},
		pickConjugationParts(frameContext) {
			return pickSubjectObjectVerbParts(frameContext, { fixedTense: "past" })
		},
		buildEnglish({ subject, action, object, tense }) {
			return `${englishSubjectText(subject)} ${englishVerbText(
				action.verb,
				subject,
				tense,
			)} ${englishObjectText(object)}`
		},
		buildJapanese({ subject, action, object, tense }) {
			return [
				buildSentenceWordChunk(subject, "は", "subject"),
				buildSentenceWordChunk(object, "を", "object"),
				buildSentenceVerbChunk(action.verb, tenseToConjugation(tense), "verb"),
			]
		},
	},
	{
		id: "subject_destination_verb",
		pickParts(frameContext) {
			return pickSubjectDestinationVerbParts(frameContext)
		},
		pickConjugationParts(frameContext) {
			return pickSubjectDestinationVerbParts(frameContext, { fixedTense: "past" })
		},
		buildEnglish({ subject, destination, tense }) {
			return `${englishSubjectText(subject)} ${englishVerbText(
				"go",
				subject,
				tense,
			)} ${englishDestinationText(destination)}`
		},
		buildJapanese({ subject, destination, tense }) {
			return [
				buildSentenceWordChunk(subject, "は", "subject"),
				buildSentenceWordChunk(destination, "に", "destination"),
				buildSentenceVerbChunk("go", tenseToConjugation(tense), "verb"),
			]
		},
	},
	{
		id: "adjective_predicate",
		pickParts({ pickVocabularyKey }) {
			const subject = pickVocabularyKey(DESCRIBED_NOUN_KEYS, "describedSubject")
			const adjective = pickVocabularyKey(ADJECTIVE_KEYS, "adjective")

			return { subject, adjective }
		},
		buildEnglish({ subject, adjective }) {
			return `${englishDescribedSubjectText(subject)} is ${englishAdjectiveText(adjective)}`
		},
		buildJapanese({ subject, adjective }) {
			return [
				buildSentenceWordChunk(subject, "は", "subject"),
				buildSentenceWordChunk(adjective, null, "adjective"),
			]
		},
	},
]

function pickSubjectObjectVerbParts(
	{ pickVocabularyKey, pickOne },
	{ fixedTense } = {},
) {
	const subject = pickVocabularyKey(SUBJECT_KEYS, "subject")
	const action = pickOne(SIMPLE_ACTIONS)
	const object = pickVocabularyKey(action.objects, "object")
	const tense = fixedTense || pickOne(BASIC_TENSES)

	return { subject, action, object, tense }
}

function pickSubjectDestinationVerbParts(
	{ pickVocabularyKey, pickOne },
	{ fixedTense } = {},
) {
	const subject = pickVocabularyKey(SUBJECT_KEYS, "subject")
	const destination = pickVocabularyKey(DESTINATION_KEYS, "destination")
	const tense = fixedTense || pickOne(BASIC_TENSES)

	return { subject, destination, tense }
}
