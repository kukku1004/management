import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import type { Importance, PerformanceGrade, Task, Workload } from '../types'
import { IMPORTANCE_OPTIONS, PERFORMANCE_GRADE_OPTIONS, WORKLOAD_OPTIONS } from '../types'
import ConfirmDialog from './ConfirmDialog'
import ImportFeedback from './ImportFeedback'
import Badge from './Badge'
import FileDropZone from './FileDropZone'
import TitleHelp from './TitleHelp'
import { downloadTaskTemplate, parseTaskWorkbook, type TaskImportResult } from '../utils/excel'
import CriteriaWorkspaceLayout from './CriteriaWorkspaceLayout'
import EvaluationMatrix from './EvaluationMatrix'
import GoogleSheetsTaskImportDialog from './GoogleSheetsTaskImportDialog'
import type { GoogleSheetTaskImport } from '../utils/googleSheetsTasks'
import { useAuth } from '../state/AuthContext'
import { useWorkspace } from '../state/WorkspaceContext'
import { evaluationPeriodFolderName } from '../utils/workspace'
import { downloadRegisteredTasks, registeredTasksWorkbookBlob } from '../utils/taskExport'
import { saveRegisteredTasksAsGoogleSheet } from '../utils/googleDrive'

interface TaskForm {
  name: string
  importance: Importance
  performanceGrade: PerformanceGrade
  workload: Workload
  objective: string
  achievement: string
  classification: '과제' | '일반'
  assignees: string
  startDate: string
  endDate: string
}

const EMPTY_TASK_FORM: TaskForm = { name: '', importance: '일반', performanceGrade: 'B', workload: '중', objective: '', achievement: '', classification: '일반', assignees: '', startDate: '', endDate: '' }

interface TaskManagementProps {
  openManagementRequest?: number
}

export default function TaskManagement({ openManagementRequest = 0 }: TaskManagementProps) {
  const { state, dispatch } = useAppState()
  const { profile } = useAuth()
  const { activeProject, activeTeam } = useWorkspace()
  const canManage = profile?.role === 'admin' || profile?.role === 'leader'
  const [activeView, setActiveView] = useState<'register' | 'manage'>('register')
  const [evaluationView, setEvaluationView] = useState<'tasks' | 'contributions'>('tasks')
  const [newForm, setNewForm] = useState<TaskForm>(EMPTY_TASK_FORM)
  const [newFormError, setNewFormError] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TaskForm>(EMPTY_TASK_FORM)
  const [editFormError, setEditFormError] = useState('')
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)
  const [importResult, setImportResult] = useState<TaskImportResult | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set())
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [groupingOpen, setGroupingOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupError, setGroupError] = useState('')
  const [sheetsImportOpen, setSheetsImportOpen] = useState(false)
  const [sheetsFeedback, setSheetsFeedback] = useState<GoogleSheetTaskImport | null>(null)
  const [activeSourceGroup, setActiveSourceGroup] = useState('전체')
  const [activeL2Id, setActiveL2Id] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [registrationLevel, setRegistrationLevel] = useState<'L2' | 'L3'>('L3')
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const [newParentTaskId, setNewParentTaskId] = useState('')
  const [exportingSheet, setExportingSheet] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [insertAt, setInsertAt] = useState<{ id: string; after: boolean } | null>(null)
  const [collapsedL2Ids, setCollapsedL2Ids] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentTasks = state.tasks.filter((task) => !task.excludedFromCurrentEvaluation)
  const hasTasks = currentTasks.length > 0
  const sourceGroups = Array.from(new Set(currentTasks.map((task) => task.sourceGroup).filter((value): value is string => Boolean(value))))
  const rootTasks = currentTasks.filter((task) => !task.parentTaskId)
  const sourceFilteredRoots = activeSourceGroup === '전체' ? rootTasks : rootTasks.filter((task) => task.sourceGroup === activeSourceGroup)
  const l2Tasks = sourceFilteredRoots.filter((task) => task.isTaskGroup)
  const sourceFilteredL3Tasks = currentTasks.filter((task) => !task.isTaskGroup && (activeSourceGroup === '전체' || task.sourceGroup === activeSourceGroup))
  const effectiveL2Id = activeL2Id === 'all' || l2Tasks.some((task) => task.id === activeL2Id) ? activeL2Id : 'all'
  const registrationTasks = effectiveL2Id === 'all' ? sourceFilteredL3Tasks : sourceFilteredL3Tasks.filter((task) => task.parentTaskId === effectiveL2Id)
  const visibleTasks = effectiveL2Id === 'all'
    ? [...l2Tasks.flatMap(parent => [parent, ...(collapsedL2Ids.has(parent.id) ? [] : registrationTasks.filter(task => task.parentTaskId === parent.id))]),
      ...registrationTasks.filter(task => !l2Tasks.some(parent => parent.id === task.parentTaskId))]
    : registrationTasks
  const selectableVisibleTasks = visibleTasks.filter((task) => !task.isTaskGroup)

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true) }
  }, [])

  useEffect(() => {
    if (openManagementRequest > 0 && canManage) {
      setActiveView('manage')
      setSelectedTaskIds(new Set())
    }
  }, [canManage, openManagementRequest])

  useEffect(() => {
    if (activeView === 'register' && registrationLevel === 'L3' && effectiveL2Id && effectiveL2Id !== 'all') {
      setNewParentTaskId(effectiveL2Id)
    }
  }, [activeView, effectiveL2Id, registrationLevel])

  function addTask() {
    const name = newForm.name.trim()
    if (!name) { setNewFormError('과제명을 입력하세요.'); return }
    if (state.tasks.some((task) => task.name === name)) { setNewFormError(`과제명 '${name}'은(는) 이미 존재합니다.`); return }
    if (registrationLevel === 'L3' && rootTasks.some((task) => task.isTaskGroup) && !newParentTaskId) { setNewFormError('하위과제를 넣을 L2 상위과제를 선택하세요.'); return }
    const assignees = newForm.assignees.split(',').map(value => value.trim()).filter(Boolean)
    const task: Task = { id: uuidv4(), ...newForm, name, objective: newForm.objective.trim(), achievement: newForm.achievement.trim(), assignees, source: 'manual', isTaskGroup: registrationLevel === 'L2', parentTaskId: registrationLevel === 'L3' ? newParentTaskId || undefined : undefined, sourceGroup: registrationLevel === 'L2' ? (activeSourceGroup === '전체' ? '직접 등록' : activeSourceGroup) : rootTasks.find((parent) => parent.id === newParentTaskId)?.sourceGroup }
    if (insertAt && registrationLevel === 'L3') {
      const tasks = [...state.tasks]
      const index = tasks.findIndex(item => item.id === insertAt.id)
      tasks.splice(index < 0 ? tasks.length : index + Number(insertAt.after), 0, task)
      dispatch({ type: 'IMPORT_TASKS', payload: tasks })
    } else dispatch({ type: 'ADD_TASK', payload: task })
    setInsertAt(null)
    if (registrationLevel === 'L2') setActiveL2Id(task.id)
    assignees.forEach((assignee) => { if (!state.members.some((member) => normalizeName(member.name) === normalizeName(assignee))) dispatch({ type: 'ADD_MEMBER', payload: { id: uuidv4(), name: assignee, active: true, position: '', level: '', yearsOfService: null, role: '', comment: '' } }) })
    setRecentlyAddedIds((current) => new Set(current).add(task.id))
    setNewForm(EMPTY_TASK_FORM)
    setNewFormError('')
    setTaskFormOpen(false)
  }

  function startEdit(task: Task) {
    setEditingTaskId(task.id)
    setEditForm({ name: task.name, importance: task.importance, performanceGrade: task.performanceGrade, workload: task.workload, objective: task.objective, achievement: task.achievement, classification: task.classification ?? '일반', assignees: task.assignees?.join(', ') ?? '', startDate: task.startDate ?? '', endDate: task.endDate ?? '' })
    setEditFormError('')
  }

  function saveEdit(task: Task) {
    const name = editForm.name.trim()
    if (!name) { setEditFormError('과제명을 입력하세요.'); return }
    if (state.tasks.some((item) => item.id !== task.id && item.name === name)) { setEditFormError(`과제명 '${name}'은(는) 이미 존재합니다.`); return }
    dispatch({ type: 'UPDATE_TASK', payload: { ...task, ...editForm, name, objective: editForm.objective.trim(), achievement: editForm.achievement.trim(), assignees: editForm.assignees.split(',').map(value => value.trim()).filter(Boolean) } })
    setEditingTaskId(null)
    setEditFormError('')
  }

  function handleDeleteConfirm() {
    if (deletingTask) {
      dispatch({ type: 'DELETE_TASK', payload: { id: deletingTask.id } })
      setSelectedTaskIds((current) => new Set(Array.from(current).filter((id) => id !== deletingTask.id)))
      setDeletingTask(null)
    }
  }

  function toggleTaskSelection(id: string) {
    setSelectedTaskIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllTasks() {
    setSelectedTaskIds((current) => {
      const allVisibleSelected = selectableVisibleTasks.length > 0 && selectableVisibleTasks.every((task) => current.has(task.id))
      const next = new Set(current)
      selectableVisibleTasks.forEach((task) => allVisibleSelected ? next.delete(task.id) : next.add(task.id))
      return next
    })
  }

  function createTaskGroup() {
    if (!canManage) return
    const name = groupName.trim()
    if (!name) { setGroupError('상위과제명을 입력하세요.'); return }
    if (state.tasks.some(task => task.name === name)) { setGroupError('같은 이름의 과제가 이미 있습니다.'); return }
    const children = state.tasks.filter(task => selectedTaskIds.has(task.id) && !task.isTaskGroup)
    if (children.length < 1) { setGroupError('개별과제를 1개 이상 선택하세요.'); return }
    const parentId = uuidv4()
    const assignees = Array.from(new Set(children.flatMap(task => task.assignees ?? [])))
    const starts = children.map(task => task.startDate).filter((date): date is string => Boolean(date)).sort()
    const ends = children.map(task => task.endDate).filter((date): date is string => Boolean(date)).sort()
    const parent: Task = { id: parentId, name, importance: '일반', performanceGrade: 'B', workload: '중', objective: '', achievement: '', classification: '과제', assignees, startDate: starts[0], endDate: ends[ends.length - 1], source: 'manual', isTaskGroup: true, sourceGroup: children.every(item => item.sourceGroup === children[0]?.sourceGroup) ? children[0]?.sourceGroup : '팀장 그룹핑' }
    dispatch({ type: 'ADD_TASK', payload: parent })
    children.forEach(child => dispatch({ type: 'UPDATE_TASK', payload: { ...child, parentTaskId: parentId, sourceGroup: parent.sourceGroup } }))
    setActiveSourceGroup(parent.sourceGroup || '전체')
    setActiveL2Id(parentId); setRecentlyAddedIds(current => new Set(current).add(parentId)); setSelectedTaskIds(new Set()); setGroupName(''); setGroupError(''); setGroupingOpen(false)
  }

  async function importTaskFile(file: File | undefined) {
    if (!file) return
    const buffer = await file.arrayBuffer()
    const result = parseTaskWorkbook(buffer, state.tasks)
    dispatch({ type: 'IMPORT_TASKS', payload: result.tasks })
    setImportResult(result)
    setRecentlyAddedIds(new Set(result.addedIds))
    setSelectedTaskIds(new Set())
    setUploadOpen(false)
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    await importTaskFile(file)
  }

  function handleSheetsImport(result: GoogleSheetTaskImport) {
    dispatch({ type: 'IMPORT_TASKS', payload: result.tasks })
    result.importedAssignees.forEach((name) => { if (!state.members.some((member) => normalizeName(member.name) === normalizeName(name))) dispatch({ type: 'ADD_MEMBER', payload: { id: uuidv4(), name, active: true, position: '', level: '', yearsOfService: null, role: '', comment: '' } }) })
    setSheetsFeedback(result)
    setRecentlyAddedIds(new Set(result.tasks.slice(-result.addedCount).map((task) => task.id)))
    setSelectedTaskIds(new Set())
  }

  function normalizeName(value: string) { return value.trim().normalize('NFC') }

  function openContextMenu(event: React.MouseEvent, task: Task) {
    if (activeView !== 'register' || !canManage || task.isTaskGroup) return
    event.preventDefault()
    if (!selectedTaskIds.has(task.id)) setSelectedTaskIds(new Set([task.id]))
    setContextMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 296)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 380)) })
  }

  function moveSelectedTasks(parentTaskId: string) {
    if (!canManage) return
    const parent = state.tasks.find((item) => item.id === parentTaskId)
    state.tasks.filter((task) => selectedTaskIds.has(task.id) && !task.isTaskGroup).forEach((task) => {
      dispatch({ type: 'UPDATE_TASK', payload: { ...task, parentTaskId, sourceGroup: parent?.sourceGroup ?? task.sourceGroup } })
    })
    setSelectedTaskIds(new Set())
    setActiveL2Id(parentTaskId)
    setContextMenu(null)
  }

  function openTaskForm(level: 'L2' | 'L3', parentTaskId = '') {
    setInsertAt(null)
    setRegistrationLevel(level)
    setNewParentTaskId(parentTaskId)
    setNewForm(EMPTY_TASK_FORM)
    setNewFormError('')
    setTaskFormOpen(true)
  }

  function addNearSelection(after: boolean) {
    const selected = visibleTasks.filter(task => selectedTaskIds.has(task.id))
    const anchor = after ? selected[selected.length - 1] : selected[0]
    if (!anchor) return
    openTaskForm('L3', anchor.parentTaskId || '')
    setInsertAt({ id: anchor.id, after })
    setContextMenu(null)
  }

  async function exportGoogleSheet() {
    if (!activeProject) return
    setExportingSheet(true); setExportMessage('')
    try {
      const periodName = evaluationPeriodFolderName(activeProject.period)
      const file = await saveRegisteredTasksAsGoogleSheet(registeredTasksWorkbookBlob(currentTasks), periodName, activeTeam?.name)
      setExportMessage(file.webViewLink ? `Google Sheets 저장 완료|${file.webViewLink}` : 'Google Sheets 저장 완료')
    } catch (error) { setExportMessage(error instanceof Error ? error.message : 'Google Sheets 저장에 실패했습니다.') }
    finally { setExportingSheet(false) }
  }

  return (
    <CriteriaWorkspaceLayout>
    <div className="ui-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5"><h3 className="text-lg font-semibold text-black">과제</h3><TitleHelp label="과제를 추가하거나 삭제하면 평가 매트릭스와 리포트에 즉시 반영됩니다." /></div>
        {activeView === 'register' && <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setSheetsImportOpen(true)} className="ui-button ui-button-secondary">Google Sheets 가져오기</button>{hasTasks && <button type="button" onClick={() => downloadRegisteredTasks(currentTasks)} className="ui-button ui-button-secondary">등록과제 Excel 내보내기</button>}{hasTasks && <button type="button" disabled={exportingSheet} onClick={() => void exportGoogleSheet()} className="ui-button ui-button-secondary">{exportingSheet ? '저장 중…' : '등록과제 Google Sheets 내보내기'}</button>}<button onClick={downloadTaskTemplate} className="ui-button ui-button-secondary">엑셀 양식 다운로드</button>{hasTasks && <button type="button" aria-expanded={uploadOpen} onClick={() => setUploadOpen((open) => !open)} className="ui-button ui-button-secondary">엑셀로 업로드</button>}<input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelected} /></div>}
      </div>
      <div className="mt-5 flex border-b border-gray-200" role="tablist" aria-label="업적평가 과제 메뉴"><button type="button" role="tab" aria-selected={activeView === 'register'} onClick={() => { setActiveView('register'); setSelectedTaskIds(new Set()) }} className={`ui-tab rounded-b-none ${activeView === 'register' ? 'ui-tab-active' : ''}`}>과제등록</button>{canManage && <button type="button" role="tab" aria-selected={activeView === 'manage'} onClick={() => { setActiveView('manage'); setSelectedTaskIds(new Set()) }} className={`ui-tab rounded-b-none ${activeView === 'manage' ? 'ui-tab-active' : ''}`}>과제평가</button>}</div>
      {activeView === 'register' && (!hasTasks || uploadOpen) && <FileDropZone
        title={hasTasks ? '과제 Excel 파일을 여기에 드래그' : '등록된 과제가 없습니다.'}
        description={hasTasks ? '과제명·과제등급·업무량·목표·성과·성과등급을 현재 평가에 반영합니다.' : '아래 입력 영역에서 직접 등록할 수 있습니다.\n또는\n이 영역을 클릭하거나 파일을 드래그하여 한 번에 등록할 수 있습니다.'}
        onClick={() => fileInputRef.current?.click()}
        onDrop={(event) => { event.preventDefault(); void importTaskFile(event.dataTransfer.files[0]) }}
        className={!hasTasks ? 'cursor-pointer bg-gray-50 hover:border-orange-300 hover:bg-orange-50/30' : 'cursor-pointer'}
      />}

      {importResult && (
        <ImportFeedback
          addedCount={importResult.addedCount}
          updatedCount={importResult.updatedCount}
          errors={importResult.errors}
          onDismiss={() => {
            setImportResult(null)
            setRecentlyAddedIds(new Set())
          }}
        />
      )}
      {sheetsFeedback && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">L2 상위과제 {sheetsFeedback.selectedGroupCount}개와 포함된 L3만 현재 평가에 표시합니다. {sheetsFeedback.addedCount}건 추가, {sheetsFeedback.updatedCount}건 갱신, 미선택 기존 과제 {sheetsFeedback.hiddenCount}건은 데이터 보존 상태로 숨겼습니다.</div>}
      {exportMessage && <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">{exportMessage.includes('|') ? <><span>{exportMessage.split('|')[0]}</span><a href={exportMessage.split('|')[1]} target="_blank" rel="noreferrer" className="ml-3 font-medium text-accent underline">새 시트 열기</a></> : exportMessage}</div>}

      {activeView === 'manage' && canManage && <div className="flex gap-2" role="tablist" aria-label="과제평가 입력 방식">
        <button type="button" role="tab" aria-selected={evaluationView === 'tasks'} onClick={() => setEvaluationView('tasks')} className={`ui-tab ${evaluationView === 'tasks' ? 'ui-tab-active' : ''}`}>과제 등급·성과</button>
        <button type="button" role="tab" aria-selected={evaluationView === 'contributions'} onClick={() => setEvaluationView('contributions')} className={`ui-tab ${evaluationView === 'contributions' ? 'ui-tab-active' : ''}`}>팀원별 기여도</button>
      </div>}
      {activeView === 'manage' && canManage && evaluationView === 'contributions' && <EvaluationMatrix embedded />}
      {(activeView === 'register' || (canManage && evaluationView === 'tasks')) && (hasTasks || taskFormOpen) ? (
      <div>
      {(sourceGroups.length > 0 || (activeView === 'register' && canManage)) && <div className="mb-3 flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-medium text-gray-700"><span className="shrink-0">L1 분야</span><select value={activeSourceGroup} onChange={(event) => { setActiveSourceGroup(event.target.value); setActiveL2Id('all'); setSelectedTaskIds(new Set()) }} className="ui-field ui-field-sm w-64"><option value="전체">전체 ({rootTasks.length})</option>{sourceGroups.map((group) => <option key={group} value={group}>{group} ({rootTasks.filter((task) => task.sourceGroup === group).length})</option>)}</select></label>{activeView === 'register' && canManage && selectedTaskIds.size > 0 && <span className="text-xs text-gray-500">L3 {selectedTaskIds.size}개 선택 · 우클릭하여 L2로 이동</span>}</div>}
      <div className="mb-3 flex items-end justify-between gap-3 border-b border-gray-200"><div className="flex min-w-0 flex-1 flex-wrap items-end gap-1" role="tablist" aria-label="L2 상위과제"><button type="button" role="tab" aria-selected={effectiveL2Id === 'all'} onClick={() => setActiveL2Id('all')} className={`ui-tab rounded-b-none ${effectiveL2Id === 'all' ? 'ui-tab-active' : ''}`}>전체 L3 <span className="ml-1 text-xs opacity-60">{sourceFilteredL3Tasks.length}</span></button>{l2Tasks.map((task) => <button key={task.id} type="button" role="tab" aria-selected={effectiveL2Id === task.id} onClick={() => { setActiveL2Id(task.id); setNewParentTaskId(task.id) }} className={`ui-tab max-w-72 rounded-b-none ${effectiveL2Id === task.id ? 'ui-tab-active' : ''}`}><span className="block truncate">{task.name} <span className="ml-1 text-xs opacity-60">{sourceFilteredL3Tasks.filter((child) => child.parentTaskId === task.id).length}</span></span></button>)}{activeView === 'register' && canManage && <button type="button" onClick={() => openTaskForm('L2')} aria-label="L2 상위과제 추가" title="L2 상위과제 추가" className="mb-1 flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-lg text-gray-600 hover:border-orange-300 hover:text-accent">+</button>}</div>{activeView === 'register' && effectiveL2Id !== 'all' && <button type="button" onClick={() => openTaskForm('L3', effectiveL2Id)} className="ui-button ui-button-secondary ui-button-sm mb-1 shrink-0">+ L3 과제 등록</button>}</div>
      <p className="mb-2 text-xs text-gray-500">칸 클릭: 행 바로 편집 · 저장 / 취소 · 체크박스로 여러 행 선택 후 우클릭: 추가·이동·셀 병합</p>
      <div className="ui-table-wrap management-task-sheet">
        <table className="ui-table min-w-[1180px] table-fixed">
          <colgroup>
            {activeView === 'register' && canManage && <col style={{ width: 32 }} />}
            <col />
            <col style={{ width: 72 }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 264 }} />
            {state.criteria.taskGradeWeight > 0 && <col style={{ width: 76 }} />}
            {state.criteria.performanceGradeWeight > 0 && <col style={{ width: 72 }} />}
            {state.criteria.workloadWeight > 0 && <col style={{ width: 68 }} />}
            <col style={{ width: 104 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 108 }} />
          </colgroup>
          <thead>
            <tr>
              {activeView === 'register' && canManage && <th className="w-12 px-3 py-3 text-center"><input type="checkbox" aria-label="현재 탭 과제 전체 선택" checked={selectableVisibleTasks.length > 0 && selectableVisibleTasks.every((task) => selectedTaskIds.has(task.id))} onChange={toggleAllTasks} /></th>}
              <th className="px-4 py-3 font-semibold">과제명</th>
              <th className="px-4 py-3 font-semibold">분류</th>
              <th className="px-4 py-3 font-semibold">담당자</th>
              <th className="px-4 py-3 font-semibold">기간</th>
              {state.criteria.taskGradeWeight > 0 && <th className="px-4 py-3 font-semibold">과제등급</th>}
              {state.criteria.performanceGradeWeight > 0 && <th className="px-4 py-3 font-semibold">성과등급</th>}
              {state.criteria.workloadWeight > 0 && <th className="px-4 py-3 font-semibold">업무량</th>}
              <th className="px-4 py-3 font-semibold">목표</th>
              <th className="px-4 py-3 font-semibold">성과</th>
              <th className="px-4 py-3 font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {activeView === 'register' && taskFormOpen && registrationLevel === 'L3' && <tr className="border-y-2 border-orange-500 bg-orange-50/40 text-black">
              {canManage && <td className="px-3 py-2" />}
              <td className="px-3 py-2"><input autoFocus aria-label="L3 과제명" value={newForm.name} onChange={(event) => setNewForm((form) => ({ ...form, name: event.target.value }))} placeholder="L3 과제명" className={`ui-field ui-field-sm ${newFormError && !newForm.name.trim() ? 'border-danger' : ''}`} />{newFormError && <p className="mt-1 text-xs text-danger">{newFormError}</p>}</td>
              <td className="px-3 py-2"><select aria-label="분류" value={newForm.classification} onChange={(event) => setNewForm((form) => ({ ...form, classification: event.target.value as '과제' | '일반' }))} className="ui-field ui-field-sm"><option>과제</option><option>일반</option></select></td>
              <td className="px-3 py-2"><input aria-label="담당자" value={newForm.assignees} onChange={(event) => setNewForm((form) => ({ ...form, assignees: event.target.value }))} placeholder="쉼표로 구분" className="ui-field ui-field-sm" /></td>
              <td className="px-3 py-2"><div className="flex gap-1"><input aria-label="시작일" type="date" value={newForm.startDate} onChange={(event) => setNewForm((form) => ({ ...form, startDate: event.target.value }))} className="ui-field ui-field-sm" /><input aria-label="종료일" type="date" value={newForm.endDate} onChange={(event) => setNewForm((form) => ({ ...form, endDate: event.target.value }))} className="ui-field ui-field-sm" /></div></td>
              {state.criteria.taskGradeWeight > 0 && <td className="px-3 py-2"><select aria-label="과제등급" value={newForm.importance} onChange={(event) => setNewForm((form) => ({ ...form, importance: event.target.value as Importance }))} className="ui-field ui-field-sm">{IMPORTANCE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></td>}
              {state.criteria.performanceGradeWeight > 0 && <td className="px-3 py-2"><select aria-label="성과등급" value={newForm.performanceGrade} onChange={(event) => setNewForm((form) => ({ ...form, performanceGrade: event.target.value as PerformanceGrade }))} className="ui-field ui-field-sm">{PERFORMANCE_GRADE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></td>}
              {state.criteria.workloadWeight > 0 && <td className="px-3 py-2"><select aria-label="업무량" value={newForm.workload} onChange={(event) => setNewForm((form) => ({ ...form, workload: event.target.value as Workload }))} className="ui-field ui-field-sm">{WORKLOAD_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></td>}
              <td className="px-3 py-2"><input aria-label="목표" value={newForm.objective} onChange={(event) => setNewForm((form) => ({ ...form, objective: event.target.value }))} placeholder="목표" className="ui-field ui-field-sm" /></td>
              <td className="px-3 py-2"><input aria-label="성과" value={newForm.achievement} onChange={(event) => setNewForm((form) => ({ ...form, achievement: event.target.value }))} placeholder="성과" className="ui-field ui-field-sm" /></td>
              <td className="px-3 py-2"><div className="flex gap-1"><button type="button" onClick={addTask} className="ui-button ui-button-primary ui-button-sm">등록</button><button type="button" onClick={() => setTaskFormOpen(false)} className="ui-button ui-button-ghost ui-button-sm">취소</button></div></td>
            </tr>}
            {visibleTasks.map((task) => task.isTaskGroup ? (
              <tr key={task.id} className="border-t border-gray-300 bg-gray-50 text-black">
                {activeView === 'register' && canManage && <td className="px-3 py-3" />}
                <td colSpan={7 + Number(state.criteria.taskGradeWeight > 0) + Number(state.criteria.performanceGradeWeight > 0) + Number(state.criteria.workloadWeight > 0)} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4"><button type="button" aria-expanded={!collapsedL2Ids.has(task.id)} onClick={() => setCollapsedL2Ids(current => { const next = new Set(current); if (next.has(task.id)) next.delete(task.id); else next.add(task.id); return next })} className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"><span aria-hidden="true" className="text-gray-500">{collapsedL2Ids.has(task.id) ? '▸' : '▾'}</span><strong className="text-sm text-gray-950">{task.name}</strong><span className="text-xs text-gray-500">하위과제 {registrationTasks.filter((child) => child.parentTaskId === task.id).length}개</span></button>{activeView === 'manage' && canManage && <button type="button" onClick={() => setDeletingTask(task)} className="ui-button ui-button-danger ui-button-sm">그룹 해제</button>}</div>
                </td>
              </tr>
            ) : editingTaskId === task.id ? (
              <tr key={task.id} onContextMenu={(event) => openContextMenu(event, task)} className="border-y-2 border-orange-500 text-black outline outline-1 -outline-offset-1 outline-orange-500" onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === 'Escape') setEditingTaskId(null); if (event.key === 'Enter' && event.target instanceof HTMLInputElement) saveEdit(task) }}>
                {activeView === 'register' && canManage && <td className="px-3 py-2 text-center"><input type="checkbox" aria-label={`${task.name} 선택`} checked={selectedTaskIds.has(task.id)} onChange={() => toggleTaskSelection(task.id)} /></td>}
                <td className="px-3 py-2"><input value={editForm.name} onChange={(event) => setEditForm((form) => ({ ...form, name: event.target.value }))} className="ui-field ui-field-sm" />{editFormError && <p className="mt-1 text-xs text-danger">{editFormError}</p>}</td>
                <td className="px-3 py-2"><select value={editForm.classification} onChange={event => setEditForm(form => ({ ...form, classification: event.target.value as '과제' | '일반' }))} className="ui-field ui-field-sm"><option>과제</option><option>일반</option></select></td>
                <td className="px-3 py-2"><input value={editForm.assignees} onChange={event => setEditForm(form => ({ ...form, assignees: event.target.value }))} placeholder="쉼표로 구분" className="ui-field ui-field-sm" /></td>
                <td className="px-3 py-2"><div className="flex gap-1"><input type="date" value={editForm.startDate} onChange={event => setEditForm(form => ({ ...form, startDate: event.target.value }))} className="ui-field ui-field-sm" /><input type="date" value={editForm.endDate} onChange={event => setEditForm(form => ({ ...form, endDate: event.target.value }))} className="ui-field ui-field-sm" /></div></td>
                {state.criteria.taskGradeWeight > 0 && <td className="px-3 py-2"><select value={editForm.importance} onChange={(event) => setEditForm((form) => ({ ...form, importance: event.target.value as Importance }))} className="ui-field ui-field-sm">{IMPORTANCE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></td>}
                {state.criteria.performanceGradeWeight > 0 && <td className="px-3 py-2"><select value={editForm.performanceGrade} onChange={(event) => setEditForm((form) => ({ ...form, performanceGrade: event.target.value as PerformanceGrade }))} className="ui-field ui-field-sm">{PERFORMANCE_GRADE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></td>}
                {state.criteria.workloadWeight > 0 && <td className="px-3 py-2"><select value={editForm.workload} onChange={(event) => setEditForm((form) => ({ ...form, workload: event.target.value as Workload }))} className="ui-field ui-field-sm">{WORKLOAD_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></td>}
                <td className="px-3 py-2"><input value={editForm.objective} onChange={(event) => setEditForm((form) => ({ ...form, objective: event.target.value }))} className="ui-field ui-field-sm" /></td>
                <td className="px-3 py-2"><input value={editForm.achievement} onChange={(event) => setEditForm((form) => ({ ...form, achievement: event.target.value }))} className="ui-field ui-field-sm" /></td>
                <td className="px-3 py-2"><div className="flex gap-1"><button type="button" onClick={() => saveEdit(task)} className="ui-button ui-button-primary ui-button-sm">저장</button><button type="button" onClick={() => setEditingTaskId(null)} className="ui-button ui-button-ghost ui-button-sm">취소</button></div></td>
              </tr>
            ) : (
              <tr key={task.id} onContextMenu={(event) => openContextMenu(event, task)} onClick={event => { if (!(event.target as HTMLElement).closest('button,input,select')) startEdit(task) }} className={`cursor-text border-t border-gray-200 text-black ${selectedTaskIds.has(task.id) ? 'outline outline-1 -outline-offset-1 outline-orange-500' : ''}`}>
                {activeView === 'register' && canManage && <td className="px-3 py-3 text-center"><input type="checkbox" aria-label={`${task.name} 선택`} checked={selectedTaskIds.has(task.id)} onChange={() => toggleTaskSelection(task.id)} /></td>}
                <td className={`px-4 py-3 font-medium ${task.parentTaskId ? 'pl-8' : ''}`}>
                  <span className="inline-flex items-center gap-1.5">
                    {task.name}
                    {recentlyAddedIds.has(task.id) && (
                      <Badge tone="accent">N</Badge>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{task.classification ?? '-'}</td>
                <td className="px-4 py-3 text-gray-600">{task.assignees?.join(', ') || '-'}</td>
                <td className="px-4 py-3 text-gray-600"><span className="whitespace-nowrap">{task.startDate || '-'} ~ {task.endDate || '-'}</span></td>
                {state.criteria.taskGradeWeight > 0 && <td className="px-4 py-3">{task.importance}</td>}
                {state.criteria.performanceGradeWeight > 0 && <td className="px-4 py-3">{task.performanceGrade}</td>}
                {state.criteria.workloadWeight > 0 && <td className="px-4 py-3">{task.workload}</td>}
                <td className="px-4 py-3 text-gray-600">{task.objective || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{task.achievement || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(task)}
                      className="ui-button ui-button-secondary ui-button-sm"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => setDeletingTask(task)}
                      className="ui-button ui-button-danger ui-button-sm"
                    >
                      {task.isTaskGroup ? '그룹 해제' : '삭제'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      ) : null}

      {taskFormOpen && activeView === 'register' && registrationLevel === 'L2' && <div className="ui-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-form-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setTaskFormOpen(false) }}><section className="ui-modal-panel max-w-md" aria-label="과제 추가">
        <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="task-form-title" className="ui-modal-title">새 L2 과제 탭</h2><p className="mt-1 text-sm text-gray-500">탭에 표시할 상위과제 이름만 입력하세요.</p></div><button type="button" onClick={() => setTaskFormOpen(false)} aria-label="닫기" className="ui-button ui-button-ghost ui-button-sm">닫기</button></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-black sm:col-span-2 xl:col-span-4">L2 과제명 <span className="text-danger">*</span><input autoFocus value={newForm.name} onChange={(event) => setNewForm((form) => ({ ...form, name: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') addTask() }} placeholder="예: SW 제품 신규 디자인 개발" className={`ui-field mt-1 ${newFormError && !newForm.name.trim() ? 'border-danger' : ''}`} /></label>
        </div>
        {newFormError && <p className="mt-2 text-xs text-danger">{newFormError}</p>}
        <div className="ui-modal-actions"><button type="button" onClick={() => setTaskFormOpen(false)} className="ui-button ui-button-ghost">취소</button><button type="button" onClick={addTask} className="ui-button ui-button-primary">L2 탭 만들기</button></div>
      </section></div>}

      <ConfirmDialog
        open={deletingTask !== null}
        title={deletingTask?.isTaskGroup ? '상위과제 그룹 해제' : '과제 삭제'}
        message={deletingTask?.isTaskGroup ? `'${deletingTask.name}' 상위과제를 해제하시겠습니까? 포함된 개별과제는 삭제되지 않고 목록으로 돌아갑니다.` : `'${deletingTask?.name}' 과제를 삭제하시겠습니까? 관련된 기여도 데이터도 함께 삭제됩니다.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingTask(null)}
      />
      {contextMenu && activeView === 'register' && canManage && <div role="menu" aria-label="선택 L3 과제 메뉴" className="fixed z-[120] max-h-[360px] w-72 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setContextMenu(null) }}>
        <p className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">선택한 L3 {selectedTaskIds.size}개</p>
        <button type="button" role="menuitem" onClick={() => addNearSelection(false)} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">위에 과제 추가</button>
        <button type="button" role="menuitem" onClick={() => addNearSelection(true)} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">아래에 과제 추가</button>
        {selectedTaskIds.size === 1 && <button type="button" role="menuitem" onClick={() => { const task = currentTasks.find(item => selectedTaskIds.has(item.id)); if (task) startEdit(task); setContextMenu(null) }} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">행 바로 편집</button>}
        <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">기존 L2로 이동 · 구분셀 병합</p>
        {l2Tasks.map(task => <button key={task.id} type="button" role="menuitem" onClick={() => moveSelectedTasks(task.id)} className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-gray-50">{task.name}</button>)}
        <button type="button" role="menuitem" onClick={() => { setContextMenu(null); setGroupingOpen(true); setGroupError('') }} className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm font-semibold text-accent hover:bg-orange-50">새 L2로 묶기 · 구분셀 병합</button>
        <button type="button" role="menuitem" onClick={() => { moveSelectedTasks(''); setActiveL2Id('all') }} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">선택 과제 묶기 해제</button>
      </div>}
      {sheetsImportOpen && <GoogleSheetsTaskImportDialog tasks={state.tasks} onImport={handleSheetsImport} onClose={() => setSheetsImportOpen(false)} />}
      {groupingOpen && <div className="ui-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-group-title"><div className="ui-modal-panel max-w-lg"><h2 id="task-group-title" className="ui-modal-title">신규 L2로 그룹핑</h2><p className="mt-2 text-sm leading-6 text-gray-600">선택한 L3 과제 {selectedTaskIds.size}개를 새 L2 상위과제에 연결합니다. 각 L3의 담당자·기간·평가정보는 그대로 유지됩니다.</p><label className="ui-label mt-5">L2 상위과제명<input autoFocus value={groupName} onChange={event => setGroupName(event.target.value)} onKeyDown={event => event.key === 'Enter' && createTaskGroup()} placeholder="예: 플랫폼 UX 개선" className="ui-field mt-1" /></label>{groupError && <p className="mt-2 text-xs text-danger">{groupError}</p>}<div className="mt-4 max-h-48 overflow-y-auto border-y border-gray-200">{state.tasks.filter(task => selectedTaskIds.has(task.id)).map(task => <div key={task.id} className="border-b border-gray-100 px-3 py-2.5 text-sm last:border-0"><p className="font-medium text-gray-900">{task.name}</p><p className="mt-1 text-xs text-gray-500">담당자 {task.assignees?.join(', ') || '미지정'}</p></div>)}</div><div className="ui-modal-actions"><button type="button" onClick={() => setGroupingOpen(false)} className="ui-button ui-button-ghost">취소</button><button type="button" onClick={createTaskGroup} className="ui-button ui-button-primary">L2 만들고 이동</button></div></div></div>}
    </div>
    </CriteriaWorkspaceLayout>
  )
}
