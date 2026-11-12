import { readFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'
import ts from 'typescript'
import { defineConfig } from 'vitest/config'

function testEnvironmentDefines() {
  return {
    name: 'shizhi-vitest-environment-defines',
    enforce: 'pre',
    transform(code) {
      if (!code.includes('__DEFINES__')) return null
      return { code: code.replaceAll('__DEFINES__', '({})'), map: null }
    },
  }
}

function rewriteEnvironment(code, mode) {
  const envObject = JSON.stringify({
    BASE_URL: '/',
    MODE: mode,
    DEV: mode !== 'production',
    PROD: mode === 'production',
    SSR: false,
  })
  return code
    .replaceAll('__DEFINES__', '({})')
    .replace(/import\.meta\.env\.([A-Z0-9_]+)/g, (_match, key) => {
      const values = { BASE_URL: '/', MODE: mode, DEV: mode !== 'production', PROD: mode === 'production', SSR: false }
      return JSON.stringify(values[key])
    })
    .replaceAll('import.meta.hot', 'undefined')
    .replaceAll('import.meta.env', envObject)
    .replaceAll('process.env.NODE_ENV', JSON.stringify(mode))
    .replaceAll('process.env', '{}')
}

function disableViteDefinePlugin() {
  return {
    name: 'shizhi-disable-vite-define',
    configResolved(config) {
      const index = config.plugins.findIndex((plugin) => plugin.name === 'vite:define')
      if (index >= 0) config.plugins.splice(index, 1)
    },
  }
}

function typescriptWithoutEsbuild() {
  return {
    name: 'shizhi-vitest-typescript-without-esbuild',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.[cm]?tsx?$/.test(id) || id.includes('/node_modules/')) return null
      const result = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          sourceMap: true,
          inlineSources: true,
          jsx: ts.JsxEmit.Preserve,
          verbatimModuleSyntax: false,
          esModuleInterop: true,
        },
      })
      return {
        code: result.outputText,
        map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
      }
    },
  }
}

export default defineConfig({
  keepProcessEnv: true,
  plugins: [disableViteDefinePlugin(), testEnvironmentDefines(), typescriptWithoutEsbuild()],
  esbuild: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
})
