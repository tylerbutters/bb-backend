// These lists contain keys from promptData/promptVocabulary.js.
export const SUBJECT_KEYS = [
	"i",
	"he",
	"she",
	"teacher",
	"student",
	"mother",
	"father",
	"child",
	"doctor",
	"friend",
]
export const PATIENT_KEYS = ["he", "she", "student", "friend"]
export const AGENT_KEYS = ["teacher", "student", "friend"]
export const COMPANION_KEYS = ["teacher", "student", "friend"]
export const DESTINATION_KEYS = [
	"school",
	"station",
	"library",
	"home",
	"room",
	"store",
	"park",
	"company",
	"hospital",
	"restaurant",
	"classroom",
	"office",
	"supermarket",
	"movieTheater",
]
export const PLACE_KEYS = [
	"school",
	"station",
	"library",
	"home",
	"room",
	"store",
	"park",
	"company",
	"hospital",
	"restaurant",
	"classroom",
	"office",
	"supermarket",
	"movieTheater",
]
export const DESCRIBED_NOUN_KEYS = [
	"book",
	"library",
	"room",
	"movie",
	"letter",
	"phone",
	"homework",
	"restaurant",
	"classroom",
	"newspaper",
]
export const ADJECTIVE_KEYS = [
	"new",
	"old",
	"big",
	"small",
	"quiet",
	"simple",
	"difficult",
	"fun",
	"important",
	"expensive",
	"cheap",
]
export const ADVERB_KEYS = [
	"quickly",
	"slowly",
	"well",
	"sometimes",
	"today",
	"yesterday",
	"tomorrow",
	"often",
	"usually",
]

export const SIMPLE_ACTIONS = [
	{ verb: "eat", objects: ["sushi", "rice", "lunch"] },
	{ verb: "drink", objects: ["water", "tea", "coffee"] },
	{ verb: "read", objects: ["book", "newspaper", "letter"] },
]

export const PLACE_ACTIONS = [
	{ verb: "study", objects: ["japanese"] },
	{ verb: "read", objects: ["book", "newspaper", "letter"] },
	{ verb: "eat", objects: ["sushi", "rice", "lunch"] },
	{ verb: "drink", objects: ["water", "tea", "coffee"] },
	{ verb: "buy", objects: ["book", "newspaper", "tea", "rice", "coffee", "lunch", "phone"] },
	{ verb: "watch", objects: ["movie"] },
	{ verb: "write", objects: ["letter"] },
	{ verb: "speak", objects: ["japanese"] },
	{ verb: "listen", objects: ["music"] },
	{ verb: "use", objects: ["phone"] },
	{ verb: "make", objects: ["lunch"] },
]

export const COMPANION_ACTIONS = [
	{ verb: "study", objects: ["japanese"] },
	{ verb: "read", objects: ["book", "newspaper", "letter"] },
	{ verb: "eat", objects: ["sushi", "rice", "lunch"] },
	{ verb: "drink", objects: ["water", "tea", "coffee"] },
	{ verb: "watch", objects: ["movie"] },
	{ verb: "speak", objects: ["japanese"] },
	{ verb: "listen", objects: ["music"] },
	{ verb: "use", objects: ["phone"] },
]

export const POTENTIAL_ACTIONS = [
	{ verb: "read", objects: ["book", "newspaper", "letter"] },
	{ verb: "buy", objects: ["book", "newspaper", "tea", "rice", "coffee", "lunch", "phone"] },
	{ verb: "study", objects: ["japanese"] },
	{ verb: "watch", objects: ["movie"] },
	{ verb: "write", objects: ["letter"] },
	{ verb: "listen", objects: ["music"] },
	{ verb: "use", objects: ["phone"] },
	{ verb: "make", objects: ["lunch"] },
]

export const COUNTED_OBJECTS = [
	{
		object: "book",
		counter: "bookCounter",
		counts: [
			{ number: "2", english: "two" },
			{ number: "3", english: "three" },
		],
	},
	{
		object: "letter",
		counter: "flatCounter",
		counts: [
			{ number: "2", english: "two" },
			{ number: "4", english: "four" },
		],
	},
	{
		object: "newspaper",
		counter: "generalCounter",
		counts: [
			{ number: "2", english: "two" },
			{ number: "5", english: "five" },
		],
	},
]
