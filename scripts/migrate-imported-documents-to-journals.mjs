#!/usr/bin/env node
/**
 * Moves documents that were imported into the library into the journal.
 *
 * Imports now land in the journal as dated entries; documents imported by an
 * earlier build still sit in the library. This script copies each of them into
 * `journalEntries` (keeping title, content and the day they belong to) and
 * soft-deletes the original document, so nothing is lost and the change can be
 * rolled back from the backup file.
 *
 * Only documents whose title starts with a date are touched; a document written
 * and edited within the same millisecond happens to share createdAt/updatedAt,
 * so that shape is not a reliable import signal.
 *   - `2024-05-20`, `20240520` and `2024.05.20` prefixes all count.
 *
 * Dry run by default. Pass --apply to write; the database is backed up first and
 * replaced atomically. Close the app before applying.
 *
 *   node scripts/migrate-imported-documents-to-journals.mjs
 *   node scripts/migrate-imported-documents-to-journals.mjs --apply
 *   node scripts/migrate-imported-documents-to-journals.mjs --user-data-dir "C:/path/to/profile"
 */

import { copyFile, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'

const DOCUMENTS_FILE = 'shizhi-documents.json'
const TITLE_DATE = /^(\d{4})-?(\d{2})-?(\d{2})(?!\d)/

function parseArgs(argv) {
  const options = { apply: false, userDataDir: defaultUserDataDir() }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') options.apply = true
    else if (arg === '--user-data-dir') options.userDataDir = argv[++index]
    else if (arg.startsWith('--user-data-dir=')) options.userDataDir = arg.slice('--user-data-dir='.length)
  }
  return options
}

function defaultUserDataDir() {
  if (process.platform === 'win32' && process.env.APPDATA) return path.join(process.env.APPDATA, 'shizhi')
  if (process.platform === 'darwin') return path.join(homedir(), 'Library', 'Application Support', 'shizhi')
  return path.join(homedir(), '.config', 'shizhi')
}

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Local noon, so the stored UTC timestamp still reads as this day. */
function noonIso(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString()
}

function titleDate(title) {
  const match = TITLE_DATE.exec(String(title ?? '').trim())
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

function looksImported(document) {
  return Boolean(titleDate(document.title))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const documentsPath = path.join(options.userDataDir, DOCUMENTS_FILE)
  if (!existsSync(documentsPath)) {
    console.error(`找不到文档库：${documentsPath}`)
    process.exitCode = 1
    return
  }

  const database = JSON.parse(await readFile(documentsPath, 'utf8'))
  if (database.schemaVersion !== 2) {
    console.error(`不支持的数据库版本：${database.schemaVersion}（需要 2）`)
    process.exitCode = 1
    return
  }
  database.journalEntries ??= {}

  const candidates = []
  const skipped = []
  for (const document of Object.values(database.documents ?? {})) {
    if (document.deletedAt !== null) continue
    if (!looksImported(document)) {
      skipped.push(document)
      continue
    }
    const day = titleDate(document.title) ?? localDayKey(new Date(document.createdAt))
    candidates.push({ document, day })
  }

  console.log(`配置目录：${options.userDataDir}`)
  console.log(`共 ${Object.keys(database.documents ?? {}).length} 篇文档：${candidates.length} 篇将转为日志，${skipped.length} 篇保留在知识库\n`)
  for (const candidate of candidates) {
    console.log(`  ${candidate.document.title.padEnd(24, ' ')} → ${candidate.day}`)
  }
  if (skipped.length) {
    console.log('\n保留在知识库的文档：')
    for (const document of skipped.slice(0, 10)) console.log(`  ${document.title}`)
    if (skipped.length > 10) console.log(`  … 另有 ${skipped.length - 10} 篇`)
  }

  if (!options.apply) {
    console.log('\n这是预演（dry run）。确认无误后加 --apply 写入。')
    return
  }

  const now = new Date().toISOString()
  for (const candidate of candidates) {
    const { document, day } = candidate
    const stamp = noonIso(day)
    const journalId = randomUUID()
    database.journalEntries[journalId] = {
      id: journalId,
      title: document.title,
      content: document.content,
      categoryId: document.categoryId ?? null,
      revision: 0,
      version: 1,
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
      documentId: null,
    }
    database.documents[document.id] = {
      ...document,
      version: (document.version ?? 1) + 1,
      updatedAt: now,
      deletedAt: now,
    }
  }

  const stampName = now.replace(/[:.]/g, '-')
  await copyFile(documentsPath, `${documentsPath}.bak-${stampName}`)
  await writeAtomically(documentsPath, JSON.stringify(database, null, 2))
  console.log(`\n已把 ${candidates.length} 篇文档转为日志，原文件备份为 *.bak-${stampName}`)
}

async function writeAtomically(target, contents) {
  const temporaryPath = `${target}.${process.pid}.tmp`
  await writeFile(temporaryPath, contents, 'utf8')
  await rename(temporaryPath, target)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
