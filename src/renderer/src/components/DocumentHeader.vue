<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import type { DocumentRecord } from '../../../shared/document'

const props = defineProps<{ document: DocumentRecord }>()
const emit = defineEmits<{
  updateTitle: [title: string]
  toggleFavorite: []
  share: []
}>()

const titleDraft = ref(props.document.title)
const favorite = ref(true)

const updatedLabel = computed(() => {
  const date = new Date(props.document.updatedAt)
  return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
})

function commitTitle(): void {
  const next = titleDraft.value.trim() || '无标题文档'
  titleDraft.value = next
  emit('updateTitle', next)
}

function commitTitleAndBlur(event: KeyboardEvent): void {
  const target = event.target
  if (target instanceof HTMLInputElement) target.blur()
}

function toggleFavorite(): void {
  favorite.value = !favorite.value
  emit('toggleFavorite')
}
</script>

<template>
  <header class="document-header">
    <div class="breadcrumbs" aria-label="文档路径">
      <span>个人知识库</span>
      <AppIcon name="chevronRight" :size="12" />
      <strong>{{ document.title }}</strong>
      <button type="button" class="header-add" title="新建文档"><AppIcon name="plus" :size="18" /></button>
    </div>

    <div class="title-row">
      <span class="document-symbol"><AppIcon name="journal" :size="25" /></span>
      <input
        v-model="titleDraft"
        class="document-title"
        aria-label="文档标题"
        maxlength="120"
        @blur="commitTitle"
        @keydown.enter.prevent="commitTitleAndBlur"
      />
      <button
        type="button"
        class="favorite-button"
        :class="{ active: favorite }"
        :title="favorite ? '取消收藏' : '收藏文档'"
        @click="toggleFavorite"
      >
        <span>{{ favorite ? '★' : '☆' }}</span>
      </button>
      <span class="title-meta">最后编辑：{{ updatedLabel }}</span>
      <span class="title-clock"><AppIcon name="clock" :size="17" /></span>
      <button type="button" class="share-button" @click="emit('share')">
        <AppIcon name="share" :size="17" />
        <span>分享</span>
      </button>
      <button type="button" class="more-button" title="更多文档操作"><AppIcon name="more" :size="19" /></button>
    </div>

    <div class="tag-row">
      <span v-for="tag in document.tags" :key="tag" class="tag-chip" :class="{ hot: tag === '重要' }">
        <span v-if="tag === '重要'" class="tag-dot">●</span>{{ tag }}
      </span>
      <button type="button" class="add-tag"><AppIcon name="plus" :size="12" /> 标签</button>
    </div>
  </header>
</template>

<style scoped>
.document-header {
  flex: 0 0 auto;
  padding: 8px 24px 11px;
  background: var(--panel-strong);
}

.breadcrumbs {
  display: flex;
  height: 24px;
  align-items: center;
  gap: 7px;
  color: #777283;
  font-size: 10px;
}

.breadcrumbs strong {
  overflow: hidden;
  max-width: 320px;
  color: #625d6c;
  font-size: 10px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-add {
  display: grid;
  width: 24px;
  height: 24px;
  margin-left: auto;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #aba6b7;
  cursor: pointer;
}

.title-row {
  display: flex;
  min-width: 0;
  height: 53px;
  align-items: center;
  gap: 10px;
}

.document-symbol {
  display: grid;
  width: 35px;
  height: 35px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #e2ddfc;
  border-radius: 9px;
  background: linear-gradient(135deg, #f1edff, #e6e0ff);
  color: #7561e5;
}

.document-title {
  width: min(520px, 50vw);
  min-width: 120px;
  padding: 2px 3px;
  border: 0;
  border-radius: 5px;
  outline: 0;
  background: transparent;
  color: #282532;
  font-size: 23px;
  font-weight: 730;
  letter-spacing: -0.035em;
}

.document-title:hover {
  background: var(--panel-muted);
}

.document-title:focus {
  background: var(--panel-muted);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--accent) 35%, transparent);
}

.favorite-button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #b0aab8;
  cursor: pointer;
  font-size: 18px;
}

.favorite-button.active {
  color: #f3bd35;
}

.title-meta {
  margin-left: auto;
  color: #9893a1;
  font-size: 10px;
  white-space: nowrap;
}

.title-clock {
  color: #aaa5b2;
}

.share-button {
  display: flex;
  height: 31px;
  align-items: center;
  gap: 5px;
  padding: 0 11px;
  border: 1px solid #6f5be0;
  border-radius: 8px;
  background: linear-gradient(180deg, #836ff0, #6d59df);
  box-shadow: 0 4px 10px rgba(105, 84, 221, 0.18);
  color: white;
  cursor: pointer;
  font-size: 11px;
}

.more-button {
  display: grid;
  width: 31px;
  height: 30px;
  place-items: center;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--panel-strong);
  color: #746f80;
  cursor: pointer;
}

.tag-row {
  display: flex;
  min-height: 25px;
  align-items: center;
  gap: 6px;
  padding-left: 45px;
}

.tag-chip {
  display: inline-flex;
  height: 20px;
  align-items: center;
  gap: 3px;
  padding: 0 9px;
  border-radius: 999px;
  background: #e9e5ff;
  color: #6956dd;
  font-size: 9px;
  font-weight: 600;
}

.tag-chip:nth-child(2) {
  background: #e8f3fb;
  color: #5d8db8;
}

.tag-chip.hot {
  background: #fff0e5;
  color: #dd8353;
}

.tag-dot {
  color: #f18b52;
  font-size: 7px;
}

.add-tag {
  display: inline-flex;
  height: 20px;
  align-items: center;
  gap: 2px;
  padding: 0 7px;
  border: 1px dashed #dcd7e6;
  border-radius: 999px;
  background: transparent;
  color: #9791a2;
  cursor: pointer;
  font-size: 9px;
}

@media (max-width: 1150px) {
  .title-meta {
    display: none;
  }
}
</style>
