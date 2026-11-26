/**
 * Re-exports of the Markdown helpers that now live in `shared`.
 *
 * The assistant's tools run in the main process and need the same conversions
 * the editor uses; keeping one implementation avoids the two drifting apart.
 */
export { insertAiReplyIntoDocument, markdownToDocument, markdownToNodes } from '../../../shared/markdownBlocks'
