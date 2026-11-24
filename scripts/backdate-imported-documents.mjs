#!/usr/bin/env node
/**
 * One-off repair for documents imported before date-aware import existed.
 *
 * Those files were all saved on the day of the import, so the activity heatmap
 * shows a single spike. This script re-dates documents whose *title* still
 * carries the original date (importer titles fall back to the file name) and
 * moves one activity edit from the import day to each target day.
 *
 * Dry run by default. Pass --apply to write; both JSON files are backed up
 * first and replaced atomically. Close the app before applying.
 *
 *   node scripts/backdate-imported-documents.mjs
 *   node scripts/backdate-imported-documents.mjs --apply
 *   node scripts/backdate-imported-documents.mjs --user-data-dir "C:/path/to/profile"
 */

import { copyFile, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const DOCUMENTS_FILE = 'shizhi-documents.json'
const ACTIVITY_FILE = 'shizhi-activity.json'
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
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Local noon, so the stored UTC timestamp still reads as this day. */
function noonIso(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString()
}

function characterCount(node) {
  let count = 0
  const visit = (value) => {
    if (!value || typeof value !== 'object') return
    if (typeof value.text === 'string') count += Array.from(value.text.replace(/\s/g, '')).length
    if (Array.isArray(value.content)) value.content.forEach(visit)
  }
  visit(node)
  return count
}

function titleDate(title) {
  const match = TITLE_DATE.exec(String(title ?? '').trim())
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

function shiftDay(days, dayKey, edits, characters) {
  const day = days[dayKey] ?? { edits: 0, journals: 0, characters: 0 }
  day.edits = Math.max(0, day.edits + edits)
  day.characters = Math.max(0, day.characters + characters)
  if (day.edits === 0 && day.journals === 0 && day.characters === 0) delete days[dayKey]
  else days[dayKey] = day
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const documentsPath = path.join(options.userDataDir, DOCUMENTS_FILE)
  const activityPath = path.join(options.userDataDir, ACTIVITY_FILE)
  if (!existsSync(documentsPath)) {
    console.error(`找不到文档库：${documentsPath}`)
    process.exitCode = 1
    return
  }

  const database = JSON.parse(await readFile(documentsPath, 'utf8'))
  const activity = existsSync(activityPath)
    ? JSON.parse(await readFile(activityPath, 'utf8'))
    : { schemaVersion: 1, seeded: true, days: {} }

  const moves = []
  const skipped = []
  for (const document of Object.values(database.documents ?? {})) {
    if (document.deletedAt !== null) continue
    const day = titleDate(document.title)
    if (!day) {
      skipped.push(document)
      continue
    }
    const from = localDayKey(new Date(document.updatedAt))
    if (from === day) continue
    moves.push({ document, day, from, characters: characterCount(document.content) })
  }

  console.log(`配置目录：${options.userDataDir}`)
  console.log(`共 ${Object.keys(database.documents ?? {}).length} 篇文档，可回填 ${moves.length} 篇，无日期线索 ${skipped.length} 篇\n`)
  for (const move of moves) {
    console.log(`  ${move.document.title.padEnd(14, ' ')} ${move.from} → ${move.day}`)
  }
  if (skipped.length) {
    console.log(`\n保持不动的文档（标题里没有日期）：`)
    for (const document of skipped.map((item) => item.title).slice(0, 10)) console.log(`  ${document}`)
    if (skipped.length > 10) console.log(`  … 另有 ${skipped.length - 10} 篇`)
  }

  // Move the edits the import wrote on the import day onto each target day.
  // The import day is not necessarily the documents' updatedAt (older builds
  // could record activity separately), so take the busiest day instead.
  const days = { ...(activity.days ?? {}) }
  const importDay = Object.entries(days)
    .filter(([, day]) => (day.edits ?? 0) >= moves.length && moves.length > 0)
    .sort(([leftDay, left], [rightDay, right]) => (right.edits - left.edits) || rightDay.localeCompare(leftDay))[0]?.[0]
  if (importDay) {
    const movedCharacters = moves.reduce((total, move) => total + move.characters, 0)
    shiftDay(days, importDay, -moves.length, -movedCharacters)
    console.log(`\n从导入日 ${importDay} 扣除 ${moves.length} 次编辑，分摊到各目标日期。`)
  } else if (moves.length) {
    console.log('\n找不到足够大的导入日，只补目标日期、不扣减（请手动核对）。')
  }
  for (const move of moves) shiftDay(days, move.day, 1, move.characters)

  const summary = Object.entries(days)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, value]) => `${day}: ${value.edits} 次`)
  console.log(`\n热力图将变为：\n  ${summary.join('\n  ') || '（空）'}`)

  if (!options.apply) {
    console.log('\n这是预演（dry run）。确认无误后加 --apply 写入。')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  for (const file of [documentsPath, activityPath]) {
    if (existsSync(file)) await copyFile(file, `${file}.bak-${stamp}`)
  }

  for (const move of moves) {
    const stampIso = noonIso(move.day)
    move.document.createdAt = stampIso
    move.document.updatedAt = stampIso
  }
  activity.days = days

  await writeAtomically(documentsPath, JSON.stringify(database, null, 2))
  await writeAtomically(activityPath, JSON.stringify(activity, null, 2))
  console.log('\n已写入，原文件备份为 *.bak-' + stamp)
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