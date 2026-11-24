<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
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
</script>

<template>
  <form class="link-form" @submit.prevent="submit" @keydown.esc.prevent.stop="emit('cancel')">
    <label class="link-field">
      <span>{{ t('editor.toolbar.linkTextLabel') }}</span>
      <input v-model="textValue" type="text" :placeholder="t('editor.toolbar.linkTextPlaceholder')" />
    </label>
    <label class="link-field">
      <span>{{ t('editor.toolbar.linkLabel') }}</span>
      <input ref="hrefInput" v-model="hrefValue" type="url" :placeholder="t('editor.toolbar.linkPlaceholder')" />
    </label>
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

.link-form > button:hover {
  border-color: var(--accent);
  color: var(--accent-strong);
}
</style>