/// <reference types="vite/client" />
import type { ShizhiApi } from '../../shared/api'

declare global {
  interface Window {
    shizhi?: ShizhiApi
  }
}

export {}
