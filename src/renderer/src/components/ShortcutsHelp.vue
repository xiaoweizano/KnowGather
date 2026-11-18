<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n/useI18n'
import { readShortcuts, shortcutLabelKey, SHORTCUT_DEFINITIONS } from '../app/shortcuts'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const closeButton = ref<HTMLButtonElement | null>(null)
const { t } = useI18n()

const shortcutGroups = computed(() => [
  {
    title: t('shortcuts.group.text'),
    items: [
      [t('shortcuts.bold'), 'Ctrl + B'],
      [t('shortcuts.italic'), 'Ctrl + I'],
      [t('shortcuts.underline'), 'Ctrl + U'],
      [t('shortcuts.inlineCode'), 'Ctrl + E'],
      [t('shortcuts.insertLink'), 'Ctrl + K'],
    ],
  },
  {
    title: t('shortcuts.group.blocks'),
    items: [
      [t('shortcuts.headings'), 'Ctrl + Alt + 1 / 2 / 3'],
      [t('shortcuts.bulletList'), 'Ctrl + Shift + 8'],
      [t('shortcuts.orderedList'), 'Ctrl + Shift + 7'],
      [t('shortcuts.taskList'), 'Ctrl + Shift + 9'],
      [t('shortcuts.slashMenu'), '/'],
    ],
  },
  {
    title: t('shortcuts.group.navigation'),
    items: [
      [t('shortcuts.undo'), 'Ctrl + Z'],
      [t('shortcuts.redo'), 'Ctrl + Shift + Z'],
      [t('shortcuts.indent'), 'Tab / Shift + Tab'],
      [t('shortcuts.escape'), 'Esc'],
    ],
  },
  {
    title: t('shortcuts.group.app'),
    items: SHORTCUT_DEFINITIONS
      .filter((definition) => definition.group === 'app')
      .map((definition) => [t(shortcutLabelKey(definition.id)), readShortcuts()[definition.id]]),
  },
])

watch(() => props.open, (open) => {
  if (open) void nextTick(() => closeButton.value?.focus())
})

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="props.open" class="shortcut-backdrop" role="presentation" @mousedown.self="emit('close')">
        <section class="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title">
          <header>
            <span class="shortcut-mark"><AppIcon name="keyboard" :size="18" /></span>
            <div>
              <h2 id="shortcut-title">{{ t('shortcuts.title') }}</h2>
              <p>{{ t('shortcuts.subtitle') }}</p>
            </div>
            <button ref="closeButton" type="button" class="dialog-close" :aria-label="t('shortcuts.close')" @click="emit('close')">
              <AppIcon name="x" :size="17" />
            </button>
          </header>

          <div class="shortcut-grid">
            <section v-for="group in shortcutGroups" :key="group.title">
              <h3>{{ group.title }}</h3>
              <dl>
                <template v-for="item in group.items" :key="`${group.title}-${item[0]}`">
                  <dt>{{ item[0] }}</dt>
                  <dd><kbd>{{ item[1] }}</kbd></dd>
                </template>
              </dl>
            </section>
          </div>

          <footer>{{ t('shortcuts.editorNote') }}</footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
<style scoped>
.shortcut-backdrop {
  position: fixed;
  z-index: 120;
  display: grid;
  inset: 0;
  place-items: center;
  background: rgba(29, 24, 44, 0.28);
  backdrop-filter: blur(3px);
}

.shortcut-dialog {
  width: min(680px, calc(100vw - 36px));
  max-height: min(620px, calc(100vh - 40px));
  padding: 20px;
  overflow-y: auto;
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

header {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.shortcut-mark {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: var(--accent-faint);
  color: var(--accent);
}

h2,
h3,
p {
  margin: 0;
}

h2 {
  font-size: 16px;
}

header p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 10px;
}

.dialog-close {
  display: grid;
  width: 30px;
  height: 30px;
  margin-left: auto;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.dialog-close:hover {
  background: var(--panel-muted);
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 22px;
}

h3 {
  margin-bottom: 9px;
  color: var(--text-secondary);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

dl {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px 8px;
  margin: 0;
}

dt {
  color: var(--text-primary);
  font-size: 10px;
}

dd {
  margin: 0;
  text-align: right;
}

kbd {
  padding: 2px 5px;
  border: 1px solid var(--border-soft);
  border-bottom-color: var(--border-strong);
  border-radius: 4px;
  background: var(--panel-muted);
  color: var(--text-secondary);
  font: inherit;
  font-size: 9px;
  white-space: nowrap;
}

footer {
  margin-top: 20px;
  padding-top: 13px;
  border-top: 1px solid var(--border-soft);
  color: var(--text-tertiary);
  font-size: 9.5px;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 140ms ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

@media (max-width: 680px) {
  .shortcut-grid {
    grid-template-columns: 1fr;
  }
}
</style>
