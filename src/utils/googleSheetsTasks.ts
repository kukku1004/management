import { v4 as uuidv4 } from 'uuid'
import type { Task } from '../types'
import { googleAuthorizedFetch } from './googleDrive'

const SOURCE_SHEET = '2026 추진현황'
const SOURCE_YEAR = 2026
const SOURCE_START_ROW = 3
interface SheetValuesResponse { values?: unknown[][] }
export interface GoogleSheetTaskCandidate { key: string; level1: string; level2: string; children: Task[] }
export interface GoogleSheetTaskPreview { spreadsheetId: string; groups: GoogleSheetTaskCandidate[]; skippedCount: number; reviewCount: number }
export interface GoogleSheetTaskImport { tasks: Task[]; addedCount: number; updatedCount: number; skippedCount: number; reviewCount: number; selectedGroupCount: number; importedAssignees: string[] }

function spreadsheetIdFromUrl(url: string) { const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); if (!match) throw new Error('올바른 Google Sheets 링크를 입력하세요.'); return match[1] }
function cell(row: unknown[], index: number) { const value = row[index]; return value == null ? '' : String(value).trim() }
function assigneesFromCell(value: string) { return [...new Set(value.split(/[\n,/·]+/).map((item) => item.trim()).filter(Boolean))] }
function firstDate(value: string): { iso?: string; needsReview: boolean } {
  const full = value.match(/(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/); const short = value.match(/(?:^|\s)(\d{1,2})[.\/-]\s*(\d{1,2})(?:\s|$)/)
  const year = full ? Number(full[1]) : SOURCE_YEAR; const month = Number(full?.[2] ?? short?.[1]); const day = Number(full?.[3] ?? short?.[2])
  if (!month || !day || month > 12 || day > 31) return { needsReview: Boolean(value) }
  return { iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, needsReview: !full || value.replace(full?.[0] ?? short?.[0] ?? '', '').trim().length > 0 }
}

export async function loadGoogleSheetTaskPreview(url: string): Promise<GoogleSheetTaskPreview> {
  const spreadsheetId = spreadsheetIdFromUrl(url); const range = `'${SOURCE_SHEET}'!A${SOURCE_START_ROW}:BP509`
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`
  const response = await googleAuthorizedFetch<SheetValuesResponse>(endpoint); const grouped = new Map<string, GoogleSheetTaskCandidate>()
  let level1 = ''; let level2 = ''; let skippedCount = 0; let reviewCount = 0
  ;(response.values ?? []).forEach((row, index) => {
    level1 = cell(row, 1) || level1; level2 = cell(row, 2) || level2
    const name = cell(row, 3); const classification = cell(row, 57)
    if (!level1 || !level2 || !name || (classification !== '과제' && classification !== '일반')) { skippedCount += 1; return }
    const sourceRow = SOURCE_START_ROW + index; const sourceStartText = cell(row, 64); const sourceEndText = cell(row, 67); const start = firstDate(sourceStartText); const end = firstDate(sourceEndText); const dateNeedsReview = start.needsReview || end.needsReview
    if (dateNeedsReview) reviewCount += 1
    const key = `${level1}\u0000${level2}`; if (!grouped.has(key)) grouped.set(key, { key, level1, level2, children: [] })
    grouped.get(key)!.children.push({ id: uuidv4(), name, importance: classification === '과제' ? '중점' : '일반', performanceGrade: 'B', workload: '중', objective: '', achievement: '', classification, assignees: assigneesFromCell(cell(row, 61)), startDate: start.iso, endDate: end.iso, source: 'google-sheets', sourceSpreadsheetId: spreadsheetId, sourceSheetName: SOURCE_SHEET, sourceRow, sourceStartText, sourceEndText, dateNeedsReview, submittedByMember: true, sourceGroup: level1, sourceLevel1: level1, sourceLevel2: level2 })
  })
  return { spreadsheetId, groups: Array.from(grouped.values()), skippedCount, reviewCount }
}

export function importSelectedGoogleSheetGroups(preview: GoogleSheetTaskPreview, selectedKeys: Set<string>, existing: Task[]): GoogleSheetTaskImport {
  const next = [...existing]; let addedCount = 0; let updatedCount = 0
  preview.groups.filter((group) => selectedKeys.has(group.key)).forEach((group) => {
    const existingParent = next.find((task) => task.isTaskGroup && task.source === 'google-sheets' && task.sourceSpreadsheetId === preview.spreadsheetId && task.sourceLevel1 === group.level1 && task.sourceLevel2 === group.level2)
    const parentId = existingParent?.id ?? uuidv4()
    if (!existingParent) { next.push({ id: parentId, name: group.level2, importance: '일반', performanceGrade: 'B', workload: '중', objective: '', achievement: '', classification: '과제', assignees: [], source: 'google-sheets', sourceSpreadsheetId: preview.spreadsheetId, sourceSheetName: SOURCE_SHEET, sourceGroup: group.level1, sourceLevel1: group.level1, sourceLevel2: group.level2, isTaskGroup: true }); addedCount += 1 }
    group.children.forEach((candidate) => { const foundIndex = next.findIndex((task) => task.source === 'google-sheets' && task.sourceSpreadsheetId === preview.spreadsheetId && task.sourceRow === candidate.sourceRow); if (foundIndex >= 0) { next[foundIndex] = { ...next[foundIndex], ...candidate, id: next[foundIndex].id, parentTaskId: parentId }; updatedCount += 1 } else { next.push({ ...candidate, parentTaskId: parentId }); addedCount += 1 } })
    const parentIndex = next.findIndex((task) => task.id === parentId); const children = next.filter((task) => task.parentTaskId === parentId); const starts = children.flatMap((task) => task.startDate ? [task.startDate] : []).sort(); const ends = children.flatMap((task) => task.endDate ? [task.endDate] : []).sort()
    next[parentIndex] = { ...next[parentIndex], assignees: [...new Set(children.flatMap((task) => task.assignees ?? []))], startDate: starts[0], endDate: ends[ends.length - 1] }
  })
  const importedAssignees = [...new Set(preview.groups.filter((group) => selectedKeys.has(group.key)).flatMap((group) => group.children.flatMap((task) => task.assignees ?? [])))]
  return { tasks: next, addedCount, updatedCount, skippedCount: preview.skippedCount, reviewCount: preview.reviewCount, selectedGroupCount: selectedKeys.size, importedAssignees }
}
