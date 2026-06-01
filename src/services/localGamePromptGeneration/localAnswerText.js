import { getPromptVocabularyEntry } from "./promptData/localVocabulary.js"

const GODAN_ROWS = {
	く: ["か", "き", "く", "け", "こ", "いて", "いた"],
	ぐ: ["が", "ぎ", "ぐ", "げ", "ご", "いで", "いだ"],
	す: ["さ", "し", "す", "せ", "そ", "して", "した"],
	ぶ: ["ば", "び", "ぶ", "べ", "ぼ", "んで", "んだ"],
	む: ["ま", "み", "む", "め", "も", "んで", "んだ"],
	ぬ: ["な", "に", "ぬ", "ね", "の", "んで", "んだ"],
	る: ["ら", "り", "る", "れ", "ろ", "って", "った"],
	つ: ["た", "ち", "つ", "て", "と", "って", "った"],
	う: ["わ", "い", "う", "え", "お", "って", "った"],
}

const VERB_TYPES_BY_KEY = {
	go: "godan-iku",
	come: "kuru",
	eat: "ichidan",
	drink: "godan",
	read: "godan",
	buy: "godan",
	study: "suru",
	watch: "ichidan",
	write: "godan",
	speak: "godan",
	listen: "godan",
	wait: "godan",
	use: "godan",
	make: "godan",
	praise: "ichidan",
	fall: "godan",
}

export function buildAcceptedJapaneseAnswerTexts(sentenceChunks) {
	if (!Array.isArray(sentenceChunks) || sentenceChunks.length === 0) return []

	return unique([
		buildJapaneseAnswerText(sentenceChunks, "kanji"),
		buildJapaneseAnswerText(sentenceChunks, "kana"),
	]).filter(Boolean)
}

export function buildJapaneseAnswerFeedbackText(sentenceChunks) {
	return buildJapaneseAnswerFeedbackParts(sentenceChunks).join(" ")
}

export function buildJapaneseAnswerFeedbackParts(sentenceChunks, writingSystem = "kanji") {
	if (!Array.isArray(sentenceChunks) || sentenceChunks.length === 0) return []

	return sentenceChunks.map((chunk) => chunkToText(chunk, writingSystem)).filter(Boolean)
}

export function normalizeJapaneseAnswerText(text) {
	return String(text || "")
		.normalize("NFKC")
		.trim()
		.replace(/\s+/g, "")
		.replace(/[。．.]+$/g, "")
}

function buildJapaneseAnswerText(sentenceChunks, writingSystem) {
	return sentenceChunks.map((chunk) => chunkToText(chunk, writingSystem)).join("")
}

function chunkToText(chunk, writingSystem) {
	const vocabularyEntry = chunk?.key ? getPromptVocabularyEntry(chunk.key) : null
	const elementType = vocabularyEntry?.type
	const particle = chunk?.particle || ""

	switch (elementType) {
		case "verb":
			return `${verbChunkToText(chunk, vocabularyEntry, writingSystem)}${particle}`
		case "counter":
			return `${chunk?.form?.number ?? "0"}${wordText(chunk, writingSystem)}${particle}`
		default:
			return `${wordText(chunk, writingSystem)}${particle}`
	}
}

function wordText(chunk, writingSystem) {
	const key = writingSystem === "kana" ? "kana" : "kanji"
	return String(chunk?.[key] || chunk?.kanji || chunk?.kana || "")
}

function verbChunkToText(chunk, vocabularyEntry, writingSystem) {
	const baseText = wordText(chunk, writingSystem)
	const verbType = VERB_TYPES_BY_KEY[chunk.key] || inferVerbType(vocabularyEntry)
	const conjugationSteps = Array.isArray(chunk.conjugation) ? chunk.conjugation : []

	return conjugationSteps.reduce(
		(currentForm, step) => conjugateVerbForm(currentForm, step),
		createBaseVerbForm(baseText, verbType),
	).text
}

function createBaseVerbForm(text, verbType) {
	return {
		text,
		verbType,
	}
}

function conjugateVerbForm(form, step) {
	const type = conjugationStepType(step)

	switch (type) {
		case "causative":
			return causativeForm(form)
		case "negative":
			return negativeForm(form)
		case "passive":
			return passiveForm(form)
		case "past":
			return pastForm(form)
		case "potential":
			return potentialForm(form)
		case "te":
			return teForm(form)
		default:
			return form
	}
}

function conjugationStepType(step) {
	if (typeof step === "string") return step
	if (step && typeof step === "object") return step.type || step.text || ""

	return ""
}

function causativeForm(form) {
	if (form.verbType === "suru") return replaceSuruEnding(form, "させる", "ichidan")
	if (form.verbType === "kuru") return { text: "こさせる", verbType: "ichidan" }
	if (form.verbType === "ichidan") return replaceFinalText(form, "る", "させる", "ichidan")
	if (isGodan(form)) return godanStemForm(form, "a", "せる", "ichidan")

	return form
}

function negativeForm(form) {
	if (form.verbType === "i-adjective") {
		return replaceFinalText(form, "い", "くない", "i-adjective")
	}
	if (form.verbType === "suru") return replaceSuruEnding(form, "しない", "i-adjective")
	if (form.verbType === "kuru") return { text: "こない", verbType: "i-adjective" }
	if (form.verbType === "ichidan") return replaceFinalText(form, "る", "ない", "i-adjective")
	if (isGodan(form)) return godanStemForm(form, "a", "ない", "i-adjective")

	return form
}

function passiveForm(form) {
	if (form.verbType === "suru") return replaceSuruEnding(form, "される", "ichidan")
	if (form.verbType === "kuru") return { text: "こられる", verbType: "ichidan" }
	if (form.verbType === "ichidan") return replaceFinalText(form, "る", "られる", "ichidan")
	if (isGodan(form)) return godanStemForm(form, "a", "れる", "ichidan")

	return form
}

function pastForm(form) {
	if (form.verbType === "i-adjective") {
		return replaceFinalText(form, "い", "かった", "terminal")
	}
	if (form.verbType === "suru") return replaceSuruEnding(form, "した", "terminal")
	if (form.verbType === "kuru") return { text: "きた", verbType: "terminal" }
	if (form.verbType === "ichidan") return replaceFinalText(form, "る", "た", "terminal")
	if (isGodan(form)) return godanStemForm(form, "past", "", "terminal")

	return form
}

function potentialForm(form) {
	if (form.verbType === "suru") return replaceSuruEnding(form, "できる", "ichidan")
	if (form.verbType === "kuru") return { text: "こられる", verbType: "ichidan" }
	if (form.verbType === "ichidan") return replaceFinalText(form, "る", "られる", "ichidan")
	if (isGodan(form)) return godanStemForm(form, "e", "る", "ichidan")

	return form
}

function teForm(form) {
	if (form.verbType === "i-adjective") {
		return replaceFinalText(form, "い", "くて", "terminal")
	}
	if (form.verbType === "suru") return replaceSuruEnding(form, "して", "terminal")
	if (form.verbType === "kuru") return { text: "きて", verbType: "terminal" }
	if (form.verbType === "ichidan") return replaceFinalText(form, "る", "て", "terminal")
	if (isGodan(form)) return godanStemForm(form, "te", "", "terminal")

	return form
}

function replaceSuruEnding(form, replacement, nextVerbType) {
	if (form.text.endsWith("する")) {
		return {
			text: `${form.text.slice(0, -"する".length)}${replacement}`,
			verbType: nextVerbType,
		}
	}

	return {
		text: replacement,
		verbType: nextVerbType,
	}
}

function replaceFinalText(form, ending, replacement, nextVerbType) {
	if (!form.text.endsWith(ending)) return form

	return {
		text: `${form.text.slice(0, -ending.length)}${replacement}`,
		verbType: nextVerbType,
	}
}

function godanStemForm(form, column, suffix, nextVerbType) {
	const ending = getGodanEnding(form)
	const row = GODAN_ROWS[ending]
	if (!row) return form

	const [aStem, , , eStem, , teEnding, pastEnding] = row
	const stemText = form.text.slice(0, -ending.length)
	const nextEnding = {
		a: aStem,
		e: eStem,
		te: form.verbType === "godan-iku" ? "って" : teEnding,
		past: form.verbType === "godan-iku" ? "った" : pastEnding,
	}[column]

	if (!nextEnding) return form

	return {
		text: `${stemText}${nextEnding}${suffix}`,
		verbType: nextVerbType,
	}
}

function getGodanEnding(form) {
	return form.text.slice(-1)
}

function isGodan(form) {
	return form.verbType?.startsWith("godan")
}

function inferVerbType(vocabularyEntry) {
	const text = vocabularyEntry?.kana || vocabularyEntry?.kanji || ""
	if (text.endsWith("する")) return "suru"
	if (text === "くる") return "kuru"
	if (text.endsWith("る")) return "ichidan"

	return "godan"
}

function unique(values) {
	return [...new Set(values)]
}
