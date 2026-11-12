import { fileURLToPath } from 'node:url'
import { preview } from 'vite'

const server = await preview({ configFile: fileURLToPath(new URL('../vite.config.mjs', import.meta.url)),
  configLoader: 'native' })
server.printUrls()
