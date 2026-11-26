<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import ToolCallCard from './ai/ToolCallCard.vue'
import ApprovalCard from './ai/ApprovalCard.vue'
import WorkbenchPanel from './ai/WorkbenchPanel.vue'
import { useAiStore, type AiApprovalItem, type AiToolCallView } from '../stores/ai'
import { useDocumentStore } from '../stores/document'
import { useI18n } from '../i18n/useI18n'
import { formatKnowledgeUpdatedAt } from '../app/knowledgeView'
import { insertAiReplyIntoDocument, markdownToDocument } from '../app/assistantInsert'

const emit = defineEmits<{ goToSettings: []; notify: [message: string] }>()

const ai = useAiStore()
const documentStore = useDocumentStore()
const { t, locale } = useI18n()

const draft = ref('')
const input = ref<HTMLTextAreaElement | null>(null)
const scroller = ref<HTMLDivElement | null>(null)
const pendingDelete = ref<string | null>(null)
const copiedId = ref<string | null>(null)
// Streaming should follow new text, but not drag a user who scrolled up to
// reread something. The flag turns off when they leave the bottom and back on
// when they return.
const follow = ref(true)

const canSend = computed(() => draft.value.trim().length > 0 && !ai.streaming && ai.configured)
const history = computed(() => [...ai.conversations]
  .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)))

/** The parked approval for a card, if it is the one waiting on the user. */
function approvalFor(call: AiToolCallView): AiApprovalItem | undefined {
  if (call.status !== 'approval') return undefined
  return ai.pendingApprovals.find((item) => item.toolUseId === call.toolUseId)
}

function decideApproval(call: AiToolCallView, decision: 'allow' | 'deny', remember: boolean): void {
  const item = approvalFor(call)
  if (item) void ai.respondApproval(item, decision, remember)
}

onMounted(() => {
  void ai.loadConfig()
  autoResize()
})

// Streamed text mutates the last turn in place, so watching the turn count
// alone would only scroll once per message; the tail length watches the stream.
const tailLength = computed(() => {
  const turns = ai.active?.turns ?? []
  return turns.length + (turns[turns.length - 1]?.content.length ?? 0)
})

watch(tailLength, async () => {
  await nextTick()
  scrollToBottom()
})

watch(() => ai.activeId, async () => {
  follow.value = true
  await nextTick()
  scrollToBottom()
})

function scrollToBottom(): void {
  const element = scroller.value
  if (element && follow.value) element.scrollTop = element.scrollHeight
}

function handleScroll(): void {
  const element = scroller.value
  if (!element) return
  follow.value = element.scrollHeight - element.scrollTop - element.clientHeight < 48
}

function autoResize(): void {
  const element = input.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(180, element.scrollHeight)}px`
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  void submit()
}

async function submit(): Promise<void> {
  const text = draft.value
  if (!text.trim() || ai.streaming) return
  if (!ai.configured) {
    emit('goToSettings')
    return
  }
  // Clear first: the store keeps the turn even if the request fails, and the
  // composer must not look like the text was swallowed.
  draft.value = ''
  follow.value = true
  await nextTick()
  autoResize()
  await ai.send(text)
  scrollToBottom()
}

async function copyReply(content: string, id: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(content)
    copiedId.value = id
    window.setTimeout(() => { if (copiedId.value === id) copiedId.value = null }, 1600)
  } catch {
    emit('notify', t('document.toast.shareFailed'))
  }
}

function insertReply(content: string): void {
  if (!documentStore.current) {
    emit('notify', t('assistant.noDocument'))
    return
  }
  const inserted = insertAiReplyIntoDocument(documentStore.current.content, content)
  documentStore.updateContent(inserted)
  emit('notify', t('assistant.inserted'))
}

/**
 * Files the reply as a new library document.
 *
 * The model normally does this itself through `create_document`; this button is
 * the manual path for when it did not, or when the user wants a second copy.
 * The category is created on demand further down the same way the tool does.
 */
async function saveReply(content: string): Promise<void> {
  const title = firstLine(content) || t('assistant.conversationUntitled')
  // Create with the reply already in place, so there is never an empty
  // document left behind if the second step fails.
  const created = await documentStore.createDocument({ title, content: markdownToDocument(content) })
  if (!created) {
    emit('notify', t('assistant.saveFailed'))
    return
  }
  emit('notify', t('assistant.savedToLibrary', { title }))
}

/** The reply's first non-empty line, trimmed of Markdown heading marks. */
function firstLine(text: string): string {
  const line = text.split('\n').map((item) => item.trim()).find(Boolean) ?? ''
  return line.replace(/^#{1,6}\s*/, '').slice(0, 60)
}

function confirmDelete(): void {
  if (pendingDelete.value) ai.deleteConversation(pendingDelete.value)
  pendingDelete.value = null
}

function timeLabel(value: string): string {
  return formatKnowledgeUpdatedAt(value, new Date(), locale.value)
}
</script>

<template>
  <section class="assistant-page" aria-labelledby="assistant-heading">
    <aside class="assistant-history" :aria-label="t('assistant.history')">
      <header class="history-head">
        <h2>{{ t('assistant.history') }}</h2>
        <button type="button" class="history-new" :disabled="ai.streaming" @click="ai.newConversation()">
          <AppIcon name="plus" :size="14" /> {{ t('assistant.newChat') }}
        </button>
      </header>
      <ul v-if="history.length" class="history-list">
        <li v-for="conversation in history" :key="conversation.id">
          <button
            type="button"
            class="history-entry"
            :class="{ active: conversation.id === ai.activeId }"
            :disabled="ai.streaming"
            @click="ai.selectConversation(conversation.id)"
          >
            <strong>{{ conversation.title || t('assistant.conversationUntitled') }}</strong>
            <small>{{ timeLabel(conversation.updatedAt) }}</small>
          </button>
          <button
            type="button"
            class="history-delete"
            :title="t('assistant.delete')"
            :disabled="ai.streaming"
            @click="pendingDelete = conversation.id"
          >
            <AppIcon name="trash" :size="13" />
          </button>
        </li>
      </ul>
      <p v-else class="history-empty">{{ t('assistant.emptyHistory') }}</p>
    </aside>

    <div class="assistant-main">
      <header class="assistant-header">
        <div>
          <h1 id="assistant-heading">{{ t('assistant.title') }}</h1>
          <p>{{ t('assistant.subtitle') }}</p>
        </div>
        <span v-if="ai.config.model" class="assistant-model">{{ ai.config.model }}</span>
      </header>

      <section v-if="!ai.configured" class="assistant-setup">
        <span class="setup-icon"><AppIcon name="sparkles" :size="22" /></span>
        <strong>{{ t('assistant.notConfiguredTitle') }}</strong>
        <p>{{ t('assistant.notConfiguredBody') }}</p>
        <button type="button" @click="emit('goToSettings')">{{ t('assistant.goSettings') }}</button>
      </section>

      <div v-else ref="scroller" class="assistant-transcript" aria-live="polite" @scroll.passive="handleScroll">
        <div v-if="!ai.active || ai.active.turns.length === 0" class="assistant-empty">
          <span class="empty-mark"><AppIcon name="sparkles" :size="22" /></span>
          <strong>{{ t('assistant.emptyTitle') }}</strong>
          <p>{{ t('assistant.emptyBody') }}</p>
        </div>

        <template v-else>
          <article
            v-for="(turn, index) in ai.active.turns"
            :key="index"
            class="assistant-turn"
            :class="turn.role"
          >
            <span class="turn-avatar">
              <AppIcon :name="turn.role === 'user' ? 'users' : 'sparkles'" :size="14" />
            </span>
            <div class="turn-body">
              <p v-if="turn.content" class="turn-text">{{ turn.content }}</p>
              <p v-else-if="turn.status === 'streaming' && !turn.toolCalls.length" class="turn-thinking">
                {{ t('assistant.thinking') }}
              </p>
              <div v-if="turn.toolCalls.length" class="turn-tools">
                <template v-for="call in turn.toolCalls" :key="call.toolUseId">
                  <ApprovalCard
                    v-if="approvalFor(call)"
                    :item="approvalFor(call)!"
                    @decide="(decision, remember) => decideApproval(call, decision, remember)"
                  />
                  <ToolCallCard v-else :call="call" />
                </template>
              </div>
              <p v-if="turn.status === 'error'" class="turn-error">
                {{ t('assistant.failed', { message: turn.error ?? '' }) }}
              </p>
              <p v-else-if="turn.status === 'aborted'" class="turn-note">{{ t('assistant.aborted') }}</p>
              <footer v-if="turn.role === 'assistant' && turn.content && turn.status !== 'streaming'" class="turn-actions">
                <button type="button" @click="copyReply(turn.content, `${ai.activeId}-${index}`)">
                  <AppIcon name="copy" :size="12" />
                  {{ copiedId === `${ai.activeId}-${index}` ? t('assistant.copied') : t('assistant.copy') }}
                </button>
                <button type="button" @click="insertReply(turn.content)">
                  <AppIcon name="filePlus" :size="12" /> {{ t('assistant.insertToDocument') }}
                </button>
                <button type="button" @click="saveReply(turn.content)">
                  <AppIcon name="library" :size="12" /> {{ t('assistant.saveToLibrary') }}
                </button>
              </footer>
            </div>
          </article>
        </template>
      </div>

      <footer v-if="ai.configured" class="assistant-composer">
        <textarea
          ref="input"
          v-model="draft"
          rows="1"
          :placeholder="t('assistant.placeholder')"
          :disabled="ai.streaming"
          @input="autoResize"
          @keydown="handleKeydown"
        />
        <button
          v-if="ai.streaming"
          type="button"
          class="composer-send stop"
          @click="ai.stop()"
        >{{ t('assistant.stop') }}</button>
        <button
          v-else
          type="button"
          class="composer-send"
          :disabled="!canSend"
          @click="submit"
        >{{ t('assistant.send') }}</button>
      </footer>
    </div>

    <WorkbenchPanel v-if="ai.configured" />

    <ConfirmDialog
      :open="pendingDelete !== null"
      :title="t('assistant.delete')"
      :description="t('assistant.deleteConfirm')"
      :confirm-label="t('common.delete')"
      danger
      @close="pendingDelete = null"
      @confirm="confirmDelete"
    />
  </section>
</template>

<style scoped>
.assistant-page {
  display: flex;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  background: var(--panel-bg);
}

/* --------------------------------------------------------------- history */
.assistant-history {
  display: flex;
  width: 218px;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 10px;
  padding: 18px 12px;
  border-right: 1px solid var(--border-soft);
  background: var(--panel-strong);
  overflow: hidden;
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
}

.history-head h2 {
  margin: 0;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.history-new {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--panel-muted);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
}

.history-new:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-strong);
}

.history-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.history-list li {
  position: relative;
}

.history-entry {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 2px;
  padding: 8px 30px 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.history-entry:hover:not(:disabled) {
  background: var(--panel-muted);
}

.history-entry.active {
  background: var(--accent-faint);
}

.history-entry strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-entry small {
  color: var(--text-tertiary);
  font-size: 9.5px;
}

.history-delete {
  position: absolute;
  top: 50%;
  right: 6px;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-50%);
}

.history-list li:hover .history-delete {
  opacity: 1;
}

.history-delete:hover:not(:disabled) {
  background: var(--state-danger-bg);
  color: var(--state-danger-fg);
}

.history-empty {
  margin: 8px 4px;
  color: var(--text-tertiary);
  font-size: 11px;
}

/* ------------------------------------------------------------------ main */
.assistant-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.assistant-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px clamp(18px, 4vw, 48px) 12px;
}

.assistant-header h1 {
  margin: 0 0 4px;
  font-size: 20px;
}

.assistant-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11.5px;
}

.assistant-model {
  flex: 0 0 auto;
  padding: 3px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  background: var(--panel-muted);
  color: var(--text-tertiary);
  font-size: 10px;
}

.assistant-setup,
.assistant-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  text-align: center;
}

.assistant-setup p,
.assistant-empty p {
  max-width: 400px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 11.5px;
  line-height: 1.7;
}

.setup-icon,
.empty-mark {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 12px;
  background: var(--accent-faint);
  color: var(--accent);
}

.assistant-setup button {
  margin-top: 6px;
  padding: 7px 14px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
}

/* ------------------------------------------------------------ transcript */
.assistant-transcript {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 6px clamp(18px, 4vw, 48px) 18px;
  scrollbar-width: thin;
}

.assistant-turn {
  display: flex;
  max-width: 760px;
  gap: 10px;
}

.assistant-turn.user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.turn-avatar {
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: var(--panel-muted);
  color: var(--text-secondary);
}

.assistant-turn.assistant .turn-avatar {
  background: var(--accent-faint);
  color: var(--accent);
}

.turn-body {
  min-width: 0;
  padding: 9px 13px;
  border: 1px solid var(--border-soft);
  border-radius: 11px;
  background: var(--panel-strong);
}

.assistant-turn.user .turn-body {
  background: var(--accent-faint);
  border-color: var(--accent-soft-border);
}

.turn-text {
  margin: 0;
  color: var(--text-primary);
  font-size: 12.5px;
  line-height: 1.72;
  white-space: pre-wrap;
  word-break: break-word;
}

.turn-tools {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.turn-text + .turn-tools,
.turn-tools + .turn-text {
  margin-top: 8px;
}

.turn-thinking,
.turn-note {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 11.5px;
}

.turn-error {
  margin: 0;
  color: var(--state-danger-fg);
  font-size: 11px;
  line-height: 1.6;
}

.turn-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.turn-actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
}

.turn-actions button:hover {
  border-color: var(--accent);
  color: var(--accent-strong);
}

/* -------------------------------------------------------------- composer */
.assistant-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px clamp(18px, 4vw, 48px) 20px;
}

.assistant-composer textarea {
  min-width: 0;
  max-height: 180px;
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 11px;
  background: var(--panel-strong);
  color: var(--text-primary);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.6;
  resize: none;
}

.assistant-composer textarea:focus {
  border-color: var(--accent);
  outline: none;
}

.composer-send {
  height: 38px;
  padding: 0 16px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  font-weight: 650;
}

.composer-send:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.composer-send.stop {
  border-color: var(--border-strong);
  background: var(--panel-strong);
  color: var(--text-secondary);
}
</style>
