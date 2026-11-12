<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <svg
    class="shizhi-mascot"
    :class="{ 'is-compact': compact }"
    viewBox="0 0 220 170"
    role="img"
    aria-label="拾知小猫助手"
  >
    <defs>
      <linearGradient id="mascotFur" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" />
        <stop offset="0.6" stop-color="#f5f1fb" />
        <stop offset="1" stop-color="#dcd4ef" />
      </linearGradient>
      <linearGradient id="mascotScarf" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#9d8cff" />
        <stop offset="1" stop-color="#6c58df" />
      </linearGradient>
      <radialGradient id="mascotGlow">
        <stop offset="0" stop-color="#b7a7ff" stop-opacity=".45" />
        <stop offset="1" stop-color="#b7a7ff" stop-opacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="113" cy="142" rx="83" ry="19" fill="url(#mascotGlow)" />
    <path d="M55 70c-9-19-4-37 3-49 6 12 13 21 23 27" fill="url(#mascotFur)" stroke="#9b91b4" stroke-width="2.4" stroke-linejoin="round" />
    <path d="M167 70c9-19 4-37-3-49-6 12-13 21-23 27" fill="url(#mascotFur)" stroke="#9b91b4" stroke-width="2.4" stroke-linejoin="round" />
    <path d="M74 31c5 8 10 14 16 18M145 31c-5 8-10 14-16 18" fill="none" stroke="#d5cce6" stroke-width="3" stroke-linecap="round" />
    <path d="M67 75c0-30 20-48 44-48s44 18 44 48v36c0 23-20 37-44 37s-44-14-44-37V75Z" fill="url(#mascotFur)" stroke="#9b91b4" stroke-width="2.6" />
    <path d="M80 40c9-9 19-13 31-13 13 0 25 5 34 15-5-1-10-1-15 1-7-5-14-8-22-8-10 0-19 2-28 5Z" fill="#8f879f" />
    <path d="M90 47c7-5 15-7 22-7 8 0 16 3 22 8-2 5-5 8-9 10-4-2-8-3-13-3-6 0-11 2-16 5-3-4-5-8-6-13Z" fill="#fdfcff" />
    <ellipse cx="94" cy="77" rx="8" ry="10" fill="#393343" />
    <ellipse cx="128" cy="77" rx="8" ry="10" fill="#393343" />
    <circle cx="96.5" cy="73.5" r="2.7" fill="white" />
    <circle cx="130.5" cy="73.5" r="2.7" fill="white" />
    <path d="M105 91c3-3 8-3 11 0-1 4-4 6-6 6s-4-2-5-6Z" fill="#e7a2b2" />
    <path d="M111 97v3M111 100c-4 5-9 5-12 1M111 100c4 5 9 5 12 1" fill="none" stroke="#665c72" stroke-width="2" stroke-linecap="round" />
    <path d="M73 84h-17M73 91l-17 4M147 84h17M147 91l17 4" fill="none" stroke="#a89fba" stroke-width="2" stroke-linecap="round" />
    <path d="M67 108c7 5 14 8 22 9l-6 13c-8-4-14-9-19-16l3-6ZM157 108c-7 5-14 8-22 9l6 13c8-4 14-9 19-16l-3-6Z" fill="url(#mascotFur)" stroke="#9b91b4" stroke-width="2.4" />
    <path d="M72 104c14 9 26 13 40 13s27-4 39-13l8 15c-14 11-29 16-47 16s-34-5-48-16l8-15Z" fill="url(#mascotScarf)" />
    <path d="M151 117c11-2 21 2 29 10-13 4-25 2-36-4l7-6Z" fill="#7867e6" />
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
}

.shizhi-mascot.is-compact {
  width: 64px;
}
</style>
