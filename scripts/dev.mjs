import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.mjs', import.meta.url)),
  configLoader: 'native' })
await server.listen()
server.printUrls()
