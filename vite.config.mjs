import { readFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'
import ts from 'typescript'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { compileScript, parse } from 'vue/compiler-sfc'

function environmentWithoutEsbuild(mode) {
  const envObject = JSON.stringify({
    BASE_URL: '/',
    MODE: mode,
    DEV: mode !== 'production',
    PROD: mode === 'production',
    SSR: false,
  })
  return {
    name: 'shizhi-environment-without-esbuild',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source.startsWith('\0') || source.startsWith('node:')) return null
      const actualImporter = importer?.startsWith('\0shizhi-env:')
        ? importer.slice('\0shizhi-env:'.length)
        : importer
      const resolved = await this.resolve(source, actualImporter, { ...options, skipSelf: true })
      if (!resolved || resolved.external) return null
      const file = resolved.id.split('?')[0]
      if (
        !file ||
        !/\.(?:[cm]?js|jsx|ts|tsx)$/i.test(file) ||
        (!file.includes('/node_modules/') && !file.includes('\\node_modules\\') && !file.includes('/vendor/') && !file.includes('\\vendor\\'))
      ) return null
      return `\0shizhi-env:${file}`
    },
    async load(id) {
      if (!id.startsWith('\0shizhi-env:')) return null
      const file = id.slice('\0shizhi-env:'.length)
      const code = await readFile(file, 'utf8')
      return {
        code: rewriteEnvironment(code, 'production'),
        map: null,
      }
    },
    transform(code) {
      if (!code.includes('process.env') && !code.includes('import.meta.env') && !code.includes('import.meta.hot') && !code.includes('__DEFINES__')) return null
      return { code: rewriteEnvironment(code, 'production'), map: null }
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
    name: 'shizhi-typescript-without-esbuild',
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

function serializeVueBlock(tag, block) {
  const attrs = Object.entries(block.attrs || {})
    .map(([name, value]) => value === true ? ` ${name}` : ` ${name}="${String(value).replaceAll('"', '&quot;')}"`)
    .join('')
  return `<${tag}${attrs}>\n${block.content}\n</${tag}>`
}
function vueSfcWithoutEsbuild() {
  return {
    name: 'shizhi-vue-sfc-without-esbuild',
    enforce: 'pre',
    transform(code, id) {
      const filename = id.split('?')[0]
      if (id !== filename || !filename.endsWith('.vue') || filename.includes('node_modules')) return null
      const { descriptor, errors } = parse(code, { filename })
      if (errors.length || (!descriptor.script && !descriptor.scriptSetup)) return null
      if (descriptor.script?.src || descriptor.scriptSetup?.src || descriptor.template?.src) return null
      const compiled = compileScript(descriptor, { id: filename, inlineTemplate: Boolean(descriptor.template) })
      const result = ts.transpileModule(compiled.content, {
        fileName: filename,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          sourceMap: false,
          jsx: ts.JsxEmit.Preserve,
          verbatimModuleSyntax: false,
          esModuleInterop: true,
        },
      })
      const blocks = [`<script>\n${result.outputText}\n</script>`]
      for (const style of descriptor.styles) blocks.push(serializeVueBlock('style', style))
      for (const block of descriptor.customBlocks) blocks.push(serializeVueBlock(block.type, block))
      return { code: blocks.join('\n'), map: null }
    },
  }
}
export default defineConfig({
  keepProcessEnv: true,
  plugins: [disableViteDefinePlugin(), environmentWithoutEsbuild('production'), typescriptWithoutEsbuild(), vueSfcWithoutEsbuild(), vue()],
  esbuild: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  build: {
    outDir: 'out/renderer',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
  },
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})

