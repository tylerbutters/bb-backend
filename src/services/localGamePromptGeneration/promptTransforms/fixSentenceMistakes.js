import { buildWordChunk } from "../promptData/wordChunks.js"
import { pick } from "../sentenceFrames/frameHelpers.js"

const MISTAKE_COUNT_BY_DIFFICULTY = {
	easy: 1,
	medium: 2,
	hard: 3,
}

export function buildSentenceWithMistakes(sentenceChunks, difficulty, randomNumber) {
	const selectedMistakes = selectFixSentenceMistakes(sentenceChunks, difficulty, randomNumber)
	if (selectedMistakes.length === 0) {
		return sentenceChunks.map((wordData) => ({ ...wordData }))
	}

	const mistakesByChunkIndex = new Map(
		selectedMistakes.map((mistake) => [mistake.index, mistake]),
	)

	return sentenceChunks.map((wordData, index) => {
		const selectedMistake = mistakesByChunkIndex.get(index)
		if (!selectedMistake) return { ...wordData }

		return selectedMistake.apply(wordData)
	})
}

function selectFixSentenceMistakes(sentenceChunks, difficulty, randomNumber) {
	const mistakeCount = MISTAKE_COUNT_BY_DIFFICULTY[difficulty] || MISTAKE_COUNT_BY_DIFFICULTY.easy
	const selectedMistakes = []
	let availableMistakes = buildFixSentenceMistakeCandidates(sentenceChunks, difficulty)

	while (selectedMistakes.length < mistakeCount && availableMistakes.length > 0) {
		const selectedMistake = pick(availableMistakes, randomNumber)

		selectedMistakes.push(selectedMistake)
		availableMistakes = availableMistakes.filter(
			(mistake) => mistake.index !== selectedMistake.index,
		)
	}

	return selectedMistakes
}

function buildFixSentenceMistakeCandidates(sentenceChunks, difficulty) {
	// Easy fix-sentence prompts only alter particles. Medium and hard prompts may also
	// swap vocabulary items while preserving each chunk's original grammatical role.
	const particleCandidates = sentenceChunks
		.map((wordData, index) => ({ wordData, index }))
		.filter(({ wordData }) => wordData.particle && getMistakeParticleForRole(wordData))
		.sort(
			(a, b) => getMistakeRolePriority(a.wordData.role) - getMistakeRolePriority(b.wordData.role),
		)
		.map(({ wordData, index }) => ({
			index,
			apply: () => ({
				...wordData,
				particle: getMistakeParticleForRole(wordData),
			}),
		}))

	if (difficulty === "easy") return particleCandidates

	const wordCandidates = sentenceChunks
		.map((wordData, index) => ({ wordData, index }))
		.filter(({ wordData }) => getMistakeVocabularyKey(wordData))
		.map(({ wordData, index }) => ({
			index,
			apply: () => ({
				...buildWordChunk(getMistakeVocabularyKey(wordData), wordData.particle),
				key: getMistakeVocabularyKey(wordData),
				role: wordData.role,
				...(wordData.conjugation ? { conjugation: wordData.conjugation } : {}),
			}),
		}))

	return [...particleCandidates, ...wordCandidates]
}

function getMistakeRolePriority(role) {
	const priorityByRole = {
		object: 0,
		destination: 1,
		place: 2,
		agent: 3,
		companion: 4,
		weather: 5,
		subject: 6,
	}

	return priorityByRole[role] ?? 10
}

function getMistakeParticleForRole(wordData) {
	const wrongParticlesByRole = {
		subject: wordData.particle === "は" ? "が" : "は",
		object: wordData.particle === "を" ? "に" : "を",
		place: wordData.particle === "で" ? "に" : "で",
		destination: wordData.particle === "に" ? "を" : "に",
		agent: wordData.particle === "に" ? "と" : "に",
		companion: wordData.particle === "と" ? "に" : "と",
		weather: wordData.particle === "が" ? "は" : "が",
	}

	return wrongParticlesByRole[wordData.role]
}

function getMistakeVocabularyKey(wordData) {
	const wrongWordsByKey = {
		book: "sushi",
		sushi: "book",
		water: "tea",
		tea: "water",
		japanese: "book",
		movie: "book",
		letter: "newspaper",
		newspaper: "letter",
		rice: "sushi",
		school: "station",
		station: "school",
		library: "home",
		home: "library",
		room: "school",
		store: "library",
		park: "school",
		company: "school",
		hospital: "library",
		restaurant: "store",
		classroom: "school",
		office: "company",
		supermarket: "store",
		movieTheater: "school",
		new: "old",
		old: "new",
		big: "small",
		small: "big",
		quiet: "simple",
		simple: "quiet",
		difficult: "simple",
		fun: "quiet",
		important: "simple",
		expensive: "cheap",
		cheap: "expensive",
		quickly: "slowly",
		slowly: "quickly",
		well: "sometimes",
		sometimes: "well",
		today: "yesterday",
		yesterday: "tomorrow",
		tomorrow: "today",
		often: "sometimes",
		usually: "sometimes",
		eat: "drink",
		drink: "eat",
		read: "write",
		write: "read",
		study: "read",
		buy: "read",
		watch: "read",
		speak: "study",
		listen: "speak",
		use: "buy",
		make: "buy",
		praise: "read",
		go: "come",
		coffee: "tea",
		lunch: "rice",
		homework: "book",
		phone: "book",
	}

	return wrongWordsByKey[wordData.key]
}
