import * as XLSX from 'xlsx-js-style'
import type { Task } from '../types'

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function createRegisteredTasksWorkbook(tasks: Task[]) {
  const current = tasks.filter((task) => !task.excludedFromCurrentEvaluation)
  const parents = current.filter((task) => task.isTaskGroup)
  const groupedChildIds = new Set(current.filter((task) => task.parentTaskId).map((task) => task.id))
  const rows: Array<Array<string | number>> = [['L1', 'L2 상위과제', 'L3 하위과제', '분류', '담당자', '시작일', '종료일', '과제등급', '성과등급', '업무량', '목표', '성과']]
  parents.forEach((parent) => {
    const children = current.filter((task) => task.parentTaskId === parent.id)
    if (children.length === 0) rows.push([parent.sourceLevel1 ?? parent.sourceGroup ?? '', parent.name, '', parent.classification ?? '과제', (parent.assignees ?? []).join(', '), parent.startDate ?? '', parent.endDate ?? '', parent.importance, parent.performanceGrade, parent.workload, parent.objective, parent.achievement])
    children.forEach((child) => rows.push([parent.sourceLevel1 ?? parent.sourceGroup ?? child.sourceLevel1 ?? '', parent.name, child.name, child.classification ?? '', (child.assignees ?? []).join(', '), child.startDate ?? '', child.endDate ?? '', child.importance, child.performanceGrade, child.workload, child.objective, child.achievement]))
  })
  current.filter((task) => !task.isTaskGroup && !groupedChildIds.has(task.id)).forEach((task) => rows.push([task.sourceLevel1 ?? task.sourceGroup ?? '', task.sourceLevel2 ?? '', task.name, task.classification ?? '', (task.assignees ?? []).join(', '), task.startDate ?? '', task.endDate ?? '', task.importance, task.performanceGrade, task.workload, task.objective, task.achievement]))
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = [{ wch: 18 }, { wch: 34 }, { wch: 42 }, { wch: 9 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 28 }, { wch: 28 }]
  sheet['!autofilter'] = { ref: `A1:L${Math.max(1, rows.length)}` }
  rows[0].forEach((_, index) => { const address = XLSX.utils.encode_cell({ r: 0, c: index }); sheet[address].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '374151' } }, alignment: { vertical: 'center' } } })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '등록과제')
  return workbook
}

export function registeredTasksWorkbookBlob(tasks: Task[]) {
  const data = XLSX.write(createRegisteredTasksWorkbook(tasks), { bookType: 'xlsx', type: 'array', cellStyles: true })
  return new Blob([data], { type: MIME })
}

export function downloadRegisteredTasks(tasks: Task[], filename = '등록과제.xlsx') {
  const url = URL.createObjectURL(registeredTasksWorkbookBlob(tasks))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
