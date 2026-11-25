<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { linkLabelFromHref } from '../core/editorCommands'
import { useI18n } from '../../i18n/useI18n'

const props = withDefaults(defineProps<{ text?: string; href?: string }>(), { text: '', href: '' })
const emit = defineEmits<{
  submit: [text: string, href: string]
  cancel: []
}>()
const { t } = useI18n()

const textValue = ref(props.text)
const hrefValue = ref(props.href)
const hrefInput = ref<HTMLInputElement | null>(null)

watch(
  () => [props.text, props.href] as const,
  ([text, href]) => {
    textValue.value = text
    hrefValue.value = href
  },
)

onMounted(() => {
  void nextTick(() => {
    hrefInput.value?.focus()
    hrefInput.value?.select()
  })
})

function submit(): void {
  emit('submit', textValue.value, hrefValue.value)
}

/**
 * Shows what the link will read as while the address is typed. An explicit
 * label always wins; with the text field empty the label comes from the
 * address (host without `www.`, plus the path), which is also what the editor
 * stores on submit.
 */
const previewLabel = computed(() => textValue.value.trim() || linkLabelFromHref(hrefValue.value))
</script>

<template>
  <!-- The address field is `text`, not `url`: the browser's own validation
       rejects bare hosts like `www.baidu.com` before our normalizer runs, so
       the card flashed "请输入网址" for perfectly usable addresses. -->
  <form class="link-form" novalidate @submit.prevent="submit" @keydown.esc.prevent.stop="emit('cancel')">
    <label class="link-field">
      <span>{{ t('editor.toolbar.linkTextLabel') }}</span>
      <input v-model="textValue" type="text" :placeholder="previewLabel || t('editor.toolbar.linkTextPlaceholder')" />
    </label>
    <label class="link-field">
      <span>{{ t('editor.toolbar.linkLabel') }}</span>
      <input ref="hrefInput" v-model="hrefValue" type="text" inputmode="url" autocapitalize="off" spellcheck="false" :placeholder="t('editor.toolbar.linkPlaceholder')" @keydown.enter.prevent="submit" />
    </label>
    <p v-if="!textValue.trim() && previewLabel" class="link-preview">
      {{ t('editor.toolbar.linkPreview', { label: previewLabel }) }}
    </p>
    <button type="submit">{{ t('editor.toolbar.linkConfirm') }}</button>
  </form>
</template>

<style scoped>
.link-form {
  display: flex;
  width: 252px;
  flex-direction: column;
  gap: 9px;
  padding: 12px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.link-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 10.5px;
  font-weight: 600;
}

.link-field input {
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--panel-muted);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
  font-weight: 400;
}

.link-field input:focus {
  border-color: var(--accent);
  outline: none;
}

.link-form > button {
  align-self: flex-start;
  height: 29px;
  padding: 0 16px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--panel-strong);
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

/* Reads as the sentence will: "显示为：baidu.com". */
.link-preview {
  margin: -2px 0 0;
  color: var(--text-tertiary);
  font-size: 10.5px;
  overflow-wrap: anywhere;
}

.link-form > button:hover {
  border-color: var(--accent);
  color: var(--accent-strong);
}
</style>
