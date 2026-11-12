import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { build } from 'vite'
import { checkP0Smoke } from './check-p0-smoke.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

function typescriptWithoutEsbuild() {
  return {
    name: 'shizhi-electron-typescript',
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

async function buildElectronEntry(entry, outDir) {
  await build({
    configFile: false,
    root,
    plugins: [typescriptWithoutEsbuild()],
    esbuild: false,
    build: {
      ssr: join(root, entry),
      outDir: join(root, outDir),
      emptyOutDir: true,
      target: 'node20',
      sourcemap: true,
      minify: false,
      rollupOptions: {
        external: ['electron', /^node:/],
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
          inlineDynamicImports: true,
        },
      },
    },
  })
}

await build({
  configFile: fileURLToPath(new URL('../vite.config.mjs', import.meta.url)),
  configLoader: 'native',
})

await Promise.all([
  buildElectronEntry('src/main/index.ts', 'out/main'),
  buildElectronEntry('src/preload/index.ts', 'out/preload'),
])

await checkP0Smoke()
