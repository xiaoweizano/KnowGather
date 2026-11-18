<script setup lang="ts">
import { computed } from 'vue'
import { translate } from '../i18n'
import type { CompanionStyle } from '../stores/ui'

const props = withDefaults(defineProps<{
  compact?: boolean
  /** Built-in variant, or `custom` to render the uploaded image. */
  variant?: CompanionStyle
  /** Attachment URL for the custom companion. */
  src?: string
}>(), {
  compact: false,
  variant: 'cat',
  src: '',
})

const isImage = computed(() => props.variant === 'custom' && Boolean(props.src))

const label = computed(() => {
  const names: Record<CompanionStyle, string> = {
    cat: translate('mascot.catName'),
    dog: translate('mascot.dogName'),
    rabbit: translate('mascot.rabbitName'),
    panda: translate('mascot.pandaName'),
    custom: translate('mascot.customAlt'),
  }
  return names[props.variant] ?? translate('mascot.label')
})

/** Ear shapes differ per animal; the face and body are shared. */
const ears = computed(() => {
  switch (props.variant) {
    case 'dog':
      return { left: 'M60 58c-14-10-22-28-18-44 10 4 20 14 26 26', right: 'M162 58c14-10 22-28 18-44-10 4-20 14-26 26', inner: false }
    case 'rabbit':
      return { left: 'M84 46c-6-20-2-38 8-42 8 10 10 28 6 42', right: 'M138 46c6-20 2-38-8-42-8 10-10 28-6 42', inner: false }
    case 'panda':
      return { left: 'M62 62c-12-14-12-34 0-44 12 2 22 12 26 26', right: 'M160 62c12-14 12-34 0-44-12 2-22 12-26 26', inner: true }
    case 'cat':
    default:
      return { left: 'M55 70c-9-19-4-37 3-49 6 12 13 21 23 27', right: 'M167 70c9-19 4-37-3-49-6 12-13 21-23 27', inner: false }
  }
})

const palette = computed(() => {
  switch (props.variant) {
    case 'panda':
      return { fur0: '#ffffff', fur1: '#f2f2f5', fur2: '#d9d9e2', stroke: '#7c7c8c', patch: '#3a3a46' }
    case 'rabbit':
      return { fur0: '#fffdfe', fur1: '#fbf3f6', fur2: '#ecd9e2', stroke: '#b58fa0', patch: '#e8b8c8' }
    case 'dog':
      return { fur0: '#fff8ef', fur1: '#f6e8d6', fur2: '#e2c9ad', stroke: '#b09272', patch: '#c9a884' }
    case 'cat':
    default:
      return { fur0: '#fff', fur1: '#f5f1fb', fur2: '#dcd4ef', stroke: '#9b91b4', patch: '#8f879f' }
  }
})
</script>

<template>
  <img
    v-if="isImage"
    class="shizhi-mascot is-image"
    :class="{ 'is-compact': compact }"
    :src="props.src"
    :alt="label"
    draggable="false"
  />
  <svg
    v-else
    class="shizhi-mascot"
    :class="[`variant-${props.variant}`, { 'is-compact': compact }]"
    viewBox="0 0 220 170"
    role="img"
    :aria-label="label"
  >
    <defs>
      <linearGradient :id="`mascotFur-${props.variant}`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="palette.fur0" />
        <stop offset="0.6" :stop-color="palette.fur1" />
        <stop offset="1" :stop-color="palette.fur2" />
      </linearGradient>
      <linearGradient :id="`mascotScarf-${props.variant}`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--accent, #9d8cff)" />
        <stop offset="1" stop-color="var(--accent-strong, #6c58df)" />
      </linearGradient>
      <radialGradient :id="`mascotGlow-${props.variant}`">
        <stop offset="0" stop-color="var(--accent, #b7a7ff)" stop-opacity=".45" />
        <stop offset="1" stop-color="var(--accent, #b7a7ff)" stop-opacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="113" cy="142" rx="83" ry="19" :fill="`url(#mascotGlow-${props.variant})`" />
    <path :d="ears.left" :fill="`url(#mascotFur-${props.variant})`" :stroke="palette.stroke" stroke-width="2.4" stroke-linejoin="round" />
    <path :d="ears.right" :fill="`url(#mascotFur-${props.variant})`" :stroke="palette.stroke" stroke-width="2.4" stroke-linejoin="round" />
    <path
      v-if="props.variant === 'cat'"
      d="M74 31c5 8 10 14 16 18M145 31c-5 8-10 14-16 18"
      fill="none"
      stroke="#d5cce6"
      stroke-width="3"
      stroke-linecap="round"
    />
    <path d="M67 75c0-30 20-48 44-48s44 18 44 48v36c0 23-20 37-44 37s-44-14-44-37V75Z" :fill="`url(#mascotFur-${props.variant})`" :stroke="palette.stroke" stroke-width="2.6" />
    <path d="M80 40c9-9 19-13 31-13 13 0 25 5 34 15-5-1-10-1-15 1-7-5-14-8-22-8-10 0-19 2-28 5Z" :fill="palette.patch" />
    <path d="M90 47c7-5 15-7 22-7 8 0 16 3 22 8-2 5-5 8-9 10-4-2-8-3-13-3-6 0-11 2-16 5-3-4-5-8-6-13Z" fill="#fdfcff" />
    <!-- Panda patches around the eyes are what make the silhouette readable. -->
    <ellipse v-if="props.variant === 'panda'" cx="94" cy="77" rx="14" ry="15" :fill="palette.patch" />
    <ellipse v-if="props.variant === 'panda'" cx="128" cy="77" rx="14" ry="15" :fill="palette.patch" />
    <ellipse cx="94" cy="77" rx="8" ry="10" fill="#393343" />
    <ellipse cx="128" cy="77" rx="8" ry="10" fill="#393343" />
    <circle cx="96.5" cy="73.5" r="2.7" fill="white" />
    <circle cx="130.5" cy="73.5" r="2.7" fill="white" />
    <path d="M105 91c3-3 8-3 11 0-1 4-4 6-6 6s-4-2-5-6Z" fill="#e7a2b2" />
    <path d="M111 97v3M111 100c-4 5-9 5-12 1M111 100c4 5 9 5 12 1" fill="none" stroke="#665c72" stroke-width="2" stroke-linecap="round" />
    <path d="M73 84h-17M73 91l-17 4M147 84h17M147 91l17 4" fill="none" stroke="#a89fba" stroke-width="2" stroke-linecap="round" />
    <path d="M67 108c7 5 14 8 22 9l-6 13c-8-4-14-9-19-16l3-6ZM157 108c-7 5-14 8-22 9l6 13c8-4 14-9 19-16l-3-6Z" :fill="`url(#mascotFur-${props.variant})`" :stroke="palette.stroke" stroke-width="2.4" />
    <path d="M72 104c14 9 26 13 40 13s27-4 39-13l8 15c-14 11-29 16-47 16s-34-5-48-16l8-15Z" :fill="`url(#mascotScarf-${props.variant})`" />
    <path d="M151 117c11-2 21 2 29 10-13 4-25 2-36-4l7-6Z" fill="var(--accent-strong, #7867e6)" />
    <path d="M70 130c12 9 26 14 42 14 17 0 31-4 43-13" fill="none" stroke="#e4dff3" stroke-width="2" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.shizhi-mascot {
  display: block;
  width: 100%;
  height: auto;
  filter: drop-shadow(0 8px 10px rgba(88, 72, 132, 0.12));
  user-select: none;
  animation: mascot-breathe 5.5s ease-in-out infinite;
}

.shizhi-mascot.is-image {
  object-fit: contain;
  border-radius: 10px;
}

.shizhi-mascot.is-compact {
  width: 64px;
}

.shizhi-mascot.is-image.is-compact {
  width: 64px;
  height: 64px;
}

@keyframes mascot-breathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-2px) scale(1.012); }
}

@media (prefers-reduced-motion: reduce) {
  .shizhi-mascot {
    animation: none;
  }
}
</style>
