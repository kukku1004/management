import { v4 as uuidv4 } from 'uuid'
import type { Task } from '../types'
import { googleAuthorizedFetch } from './googleDrive'

const SOURCE_SHEET = '2026 추진현황'
const SOURCE_YEAR = 2026
const SOURCE_START_ROW = 3

interface SheetValuesResponse { values?: unknown[][] }

export interface GoogleSheetTaskImport {
  tasks: Task[]
  addedCount: number
  updatedCount: number
  skippedCount: number
  reviewCount: number
}

function spreadsheetIdFromUrl(url: string): string {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) throw new Error('올바른 Google Sheets 링크를 입력하세요.')
  return match[1]
}

function cell(row: unknown[], index: number): string {
  const value = row[index]
  return value == null ? '' : String(value).trim()
}

function assigneesFromCell(value: string): string[] {
  return [...new Set(value.split(/[\n,/·]+/).map((item) => item.trim()).filter(Boolean))]
}

function firstDate(value: string): { iso?: string; needsReview: boolean } {
  const full = value.match(/(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/)
  const short = value.match(/(?:^|\s)(\d{1,2})[.\/-]\s*(\d{1,2})(?:\s|$)/)
  const year = full ? Number(full[1]) : SOURCE_YEAR
  const month = Number(full?.[2] ?? short?.[1])
  const day = Number(full?.[3] ?? short?.[2])
  if (!month || !day || month > 12 || day > 31) return { needsReview: Boolean(value) }
  return {
    iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    needsReview: !full || value.replace(full?.[0] ?? short?.[0] ?? '', '').trim().length > 0,
  }
}

export async function importTasksFromGoogleSheet(url: string, existing: Task[]): Promise<GoogleSheetTaskImport> {
  const spreadsheetId = spreadsheetIdFromUrl(url)
  const range = `'${SOURCE_SHEET}'!D${SOURCE_START_ROW}:BP509`
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`
  const response = await googleAuthorizedFetch<SheetValuesResponse>(endpoint)
  const next = [...existing]
  let addedCount = 0
  let updatedCount = 0
  let skippedCount = 0
  let reviewCount = 0

  ;(response.values ?? []).forEach((row, index) => {
    const name = cell(row, 0) // D
    const classification = cell(row, 54) // BF
    if (!name || (classification !== '과제' && classification !== '일반')) { skippedCount += 1; return }
    const sourceRow = SOURCE_START_ROW + index
    const assignees = assigneesFromCell(cell(row, 58)) // BJ
    const sourceStartText = cell(row, 61) // BM
    const sourceEndText = cell(row, 64) // BP
    const start = firstDate(sourceStartText)
    const end = firstDate(sourceEndText)
    const dateNeedsReview = start.needsReview || end.needsReview
    if (dateNeedsReview) reviewCount += 1
    const foundIndex = next.findIndex((task) => task.source === 'google-sheets' && task.sourceSpreadsheetId === spreadsheetId && task.sourceRow === sourceRow)
    const sourceFields: Partial<Task> = {
      name,
      classification,
      assignees,
      startDate: start.iso,
      endDate: end.iso,
      source: 'google-sheets',
      sourceSpreadsheetId: spreadsheetId,
      sourceSheetName: SOURCE_SHEET,
      sourceRow,
      sourceStartText,
      sourceEndText,
      dateNeedsReview,
      submittedByMember: true,
    }
    if (foundIndex >= 0) {
      next[foundIndex] = { ...next[foundIndex], ...sourceFields } as Task
      updatedCount += 1
    } else {
      next.push({
        id: uuidv4(),
        name,
        importance: classification === '과제' ? '중점' : '일반',
        performanceGrade: 'B',
        workload: '중',
        objective: '',
        achievement: '',
        ...sourceFields,
      } as Task)
      addedCount += 1
    }
  })
  return { tasks: next, addedCount, updatedCount, skippedCount, reviewCount }
}
