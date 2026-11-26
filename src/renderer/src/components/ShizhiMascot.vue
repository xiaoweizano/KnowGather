<script setup lang="ts">
import { computed } from 'vue'
import { translate } from '../i18n'
import type { CompanionStyle } from '../stores/ui'

/**
 * Renders the companion mascot.
 *
 * The artwork is a set of fifteen illustrated PNGs shipped in
 * `assets/companions`; `custom` swaps in whatever image the user uploaded. The
 * earlier version drew four animals as SVG in this file, which never matched
 * the illustrated set well enough to keep both.
 *
 * Images are imported rather than referenced by URL string: Vite only emits a
 * file into the bundle when the import is visible to it, and a template-built
 * path would silently 404 in a production build.
 */
import cat from '../assets/companions/cat.png'
import dog from '../assets/companions/dog.png'
import penguin from '../assets/companions/penguin.png'
import rabbit from '../assets/companions/rabbit.png'
import fox from '../assets/companions/fox.png'
import panda from '../assets/companions/panda.png'
import dragon from '../assets/companions/dragon.png'
import bear from '../assets/companions/bear.png'
import hamster from '../assets/companions/hamster.png'
import hedgehog from '../assets/companions/hedgehog.png'
import sheep from '../assets/companions/sheep.png'
import chick from '../assets/companions/chick.png'
import seal from '../assets/companions/seal.png'
import dino from '../assets/companions/dino.png'
import robot from '../assets/companions/robot.png'

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

/** Every built-in variant's artwork, keyed by the stored style name. */
const COMPANION_IMAGES: Record<Exclude<CompanionStyle, 'custom'>, string> = {
  cat, dog, rabbit, hamster, hedgehog,
  fox, panda, bear, sheep, penguin,
  chick, seal, dino, dragon, robot,
}

const label = computed(() =>
  props.variant === 'custom'
    ? translate('mascot.customAlt')
    : translate(`mascot.${props.variant}Name`))

/**
 * The image to show.
 *
 * A `custom` variant with no upload falls back to the cat rather than rendering
 * a broken image: the style is stored in localStorage, and the uploaded file
 * lives in the attachment store, so the two can disagree after a manual reset.
 */
const source = computed(() => {
  if (props.variant === 'custom') return props.src || COMPANION_IMAGES.cat
  return COMPANION_IMAGES[props.variant] ?? COMPANION_IMAGES.cat
})
</script>

<template>
  <img
    class="shizhi-mascot"
    :class="{ 'is-compact': compact, 'is-custom': variant === 'custom' }"
    :src="source"
    :alt="label"
    draggable="false"
  />
</template>

<style scoped>
.shizhi-mascot {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 8px 10px rgba(88, 72, 132, 0.12));
  user-select: none;
  animation: mascot-breathe 5.5s ease-in-out infinite;
}

.shizhi-mascot.is-compact {
  width: 64px;
  height: 64px;
}

/* An uploaded picture is usually not square-cropped, so it gets a rounded
   frame instead of the transparent-background treatment the artwork uses. */
.shizhi-mascot.is-custom {
  border-radius: 10px;
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
