export function removeInternalChunkMetadata(sentenceChunks) {
	return sentenceChunks.map(({ key, role, ...wordData }) => ({ ...wordData }))
}
