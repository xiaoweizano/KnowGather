<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import NavigationRail from '../components/NavigationRail.vue'
import ResourceSidebar from '../components/ResourceSidebar.vue'
import EditorWorkspace from '../components/EditorWorkspace.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'
import { getShizhiApi } from '../services/api'

const documentStore = useDocumentStore()
const ui = useUiStore()
const api = getShizhiApi()
let disposeCloseRequest: (() => void) | null = null

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!documentStore.isDirty) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  disposeCloseRequest = api.window.onCloseRequested(() => {
    void documentStore.saveNow()
  })
  await documentStore.initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  disposeCloseRequest?.()
  disposeCloseRequest = null
  void documentStore.saveNow()
  documentStore.dispose()
})
</script>

<template>
  <div class="document-shell" :class="ui.shellClasses">
    <NavigationRail />
    <ResourceSidebar />

    <EditorWorkspace
      v-if="documentStore.current && !documentStore.loading"
      :key="documentStore.current.id"
      :document="documentStore.current"
    />

    <div v-else class="app-loading" aria-live="polite">
      <span class="loading-mark">拾</span>
      <span>正在整理你的知识库…</span>
    </div>
  </div>
</template>

<style scoped>
.document-shell {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--panel-bg);
}

.app-loading {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

.loading-mark {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-faint);
  color: var(--accent);
  font-weight: 700;
  animation: loading-float 1.2s ease-in-out infinite;
}

@keyframes loading-float {
  50% { transform: translateY(-3px); }
}
</style>

