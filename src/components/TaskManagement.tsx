import { useRef, useState } from 'react'
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
import GoogleSheetsTaskImportDialog from './GoogleSheetsTaskImportDialog'
import type { GoogleSheetTaskImport } from '../utils/googleSheetsTasks'
import { useAuth } from '../state/AuthContext'

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

export default function TaskManagement() {
  const { state, dispatch } = useAppState()
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'leader'
  const [activeView, setActiveView] = useState<'register' | 'manage'>('register')
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasTasks = state.tasks.length > 0
  const sourceGroups = Array.from(new Set(state.tasks.map((task) => task.sourceGroup).filter((value): value is string => Boolean(value))))
  const rootTasks = state.tasks.filter((task) => !task.parentTaskId)
  const registrationTasks = state.tasks.filter((task) => !task.isTaskGroup)
  const viewTasks = activeView === 'register' ? registrationTasks : rootTasks
  const visibleTasks = activeSourceGroup === '전체' ? viewTasks : viewTasks.filter((task) => task.sourceGroup === activeSourceGroup)

  function addTask() {
    const name = newForm.name.trim()
    if (!name) { setNewFormError('과제명을 입력하세요.'); return }
    if (state.tasks.some((task) => task.name === name)) { setNewFormError(`과제명 '${name}'은(는) 이미 존재합니다.`); return }
    const task: Task = { id: uuidv4(), ...newForm, name, objective: newForm.objective.trim(), achievement: newForm.achievement.trim(), assignees: newForm.assignees.split(',').map(value => value.trim()).filter(Boolean), source: 'manual' }
    dispatch({ type: 'ADD_TASK', payload: task })
    setRecentlyAddedIds((current) => new Set(current).add(task.id))
    setNewForm(EMPTY_TASK_FORM)
    setNewFormError('')
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
      const allVisibleSelected = visibleTasks.length > 0 && visibleTasks.every((task) => current.has(task.id))
      const next = new Set(current)
      visibleTasks.forEach((task) => allVisibleSelected ? next.delete(task.id) : next.add(task.id))
      return next
    })
  }

  function createTaskGroup() {
    const name = groupName.trim()
    if (!name) { setGroupError('상위과제명을 입력하세요.'); return }
    if (state.tasks.some(task => task.name === name)) { setGroupError('같은 이름의 과제가 이미 있습니다.'); return }
    const children = state.tasks.filter(task => selectedTaskIds.has(task.id) && !task.parentTaskId)
    if (children.length < 2) { setGroupError('개별과제를 2개 이상 선택하세요.'); return }
    const parentId = uuidv4()
    children.forEach(child => dispatch({ type: 'UPDATE_TASK', payload: { ...child, parentTaskId: parentId } }))
    const assignees = Array.from(new Set(children.flatMap(task => task.assignees ?? [])))
    const starts = children.map(task => task.startDate).filter((date): date is string => Boolean(date)).sort()
    const ends = children.map(task => task.endDate).filter((date): date is string => Boolean(date)).sort()
    const parent: Task = { id: parentId, name, importance: '일반', performanceGrade: 'B', workload: '중', objective: '', achievement: '', classification: '과제', assignees, startDate: starts[0], endDate: ends[ends.length - 1], source: 'manual', isTaskGroup: true, sourceGroup: children.every(item => item.sourceGroup === children[0]?.sourceGroup) ? children[0]?.sourceGroup : '팀장 그룹핑' }
    dispatch({ type: 'ADD_TASK', payload: parent })
    setRecentlyAddedIds(current => new Set(current).add(parentId)); setSelectedTaskIds(new Set()); setGroupName(''); setGroupError(''); setGroupingOpen(false)
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
    setSheetsFeedback(result)
    setRecentlyAddedIds(new Set(result.tasks.slice(-result.addedCount).map((task) => task.id)))
    setSelectedTaskIds(new Set())
  }

  return (
    <CriteriaWorkspaceLayout>
    <div className="ui-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5"><h3 className="text-lg font-semibold text-black">과제</h3><TitleHelp label="과제를 추가하거나 삭제하면 평가 매트릭스와 리포트에 즉시 반영됩니다." /></div>
        {activeView === 'register' && <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setSheetsImportOpen(true)} className="ui-button ui-button-secondary">Google Sheets 가져오기</button><button onClick={downloadTaskTemplate} className="ui-button ui-button-secondary">엑셀 양식 다운로드</button>{hasTasks && <button type="button" aria-expanded={uploadOpen} onClick={() => setUploadOpen((open) => !open)} className="ui-button ui-button-secondary">엑셀로 업로드</button>}<input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelected} /></div>}
      </div>
      <div className="mt-5 flex border-b border-gray-200" role="tablist" aria-label="업적평가 과제 메뉴"><button type="button" role="tab" aria-selected={activeView === 'register'} onClick={() => { setActiveView('register'); setSelectedTaskIds(new Set()) }} className={`ui-tab rounded-b-none ${activeView === 'register' ? 'ui-tab-active' : ''}`}>과제등록</button>{canManage && <button type="button" role="tab" aria-selected={activeView === 'manage'} onClick={() => { setActiveView('manage'); setSelectedTaskIds(new Set()) }} className={`ui-tab rounded-b-none ${activeView === 'manage' ? 'ui-tab-active' : ''}`}>과제관리</button>}</div>
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
      {sheetsFeedback && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Google Sheets 과제 {sheetsFeedback.addedCount}건 추가, {sheetsFeedback.updatedCount}건 갱신했습니다.{sheetsFeedback.reviewCount > 0 && ` 날짜 확인 필요 ${sheetsFeedback.reviewCount}건`}</div>}

      {hasTasks ? (
      <div>
      {sourceGroups.length > 0 && <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200" role="tablist" aria-label="A열 기준 과제 그룹">
        {['전체', ...sourceGroups].map((group) => {
          const count = group === '전체' ? viewTasks.length : viewTasks.filter((task) => task.sourceGroup === group).length
          return <button key={group} type="button" role="tab" aria-selected={activeSourceGroup === group} onClick={() => { setActiveSourceGroup(group); setSelectedTaskIds(new Set()) }} className={`ui-tab rounded-b-none ${activeSourceGroup === group ? 'ui-tab-active' : ''}`}>{group} <span className="ml-1 text-xs text-gray-400">{count}</span></button>
        })}
      </div>}
      {activeView === 'manage' && selectedTaskIds.size > 0 && <div className="mb-3 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3"><div><p className="text-sm font-medium text-orange-900">개별과제 {selectedTaskIds.size}개 선택됨</p><p className="mt-1 text-xs text-orange-700">선택한 과제를 팀장이 평가할 하나의 상위과제로 묶습니다.</p></div><button type="button" onClick={() => { setGroupingOpen(true); setGroupError('') }} disabled={selectedTaskIds.size < 2} className="ui-button ui-button-primary ui-button-sm">상위과제로 그룹핑</button></div>}
      <div className="ui-table-wrap">
        <table className="ui-table min-w-[1180px]">
          <thead>
            <tr>
              {activeView === 'manage' && <th className="w-12 px-3 py-3 text-center"><input type="checkbox" aria-label="현재 탭 과제 전체 선택" checked={visibleTasks.length > 0 && visibleTasks.every((task) => selectedTaskIds.has(task.id))} onChange={toggleAllTasks} /></th>}
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
            {visibleTasks.map((task) => editingTaskId === task.id ? (
              <tr key={task.id} className="border-t border-gray-200 bg-orange-50/30 text-black">
                {activeView === 'manage' && <td className="px-3 py-2 text-center"><input type="checkbox" aria-label={`${task.name} 선택`} checked={selectedTaskIds.has(task.id)} onChange={() => toggleTaskSelection(task.id)} /></td>}
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
              <tr key={task.id} className="border-t border-gray-200 text-black">
                {activeView === 'manage' && <td className="px-3 py-3 text-center"><input type="checkbox" aria-label={`${task.name} 선택`} checked={selectedTaskIds.has(task.id)} onChange={() => toggleTaskSelection(task.id)} /></td>}
                <td className="px-4 py-3 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {task.name}
                    {recentlyAddedIds.has(task.id) && (
                      <Badge tone="accent">N</Badge>
                    )}
                  </span>
                  {task.isTaskGroup && <details className="mt-2 font-normal"><summary className="cursor-pointer text-xs font-medium text-accent">포함된 개별과제 {state.tasks.filter(child => child.parentTaskId === task.id).length}개</summary><div className="mt-3 min-w-[760px] space-y-2 border-l-2 border-orange-200 pl-3">{state.tasks.filter(child => child.parentTaskId === task.id).map(child => <div key={child.id} className="grid grid-cols-[minmax(220px,2fr)_90px_minmax(150px,1fr)_140px_minmax(200px,2fr)] items-start gap-2 rounded-md bg-gray-50 p-2 text-xs"><div><p className="font-medium text-gray-900">{child.name}</p><button type="button" onClick={() => { setActiveView('register'); startEdit(child) }} className="mt-1 text-accent">기초정보 전체 수정</button></div><select value={child.classification ?? '일반'} onChange={event => dispatch({ type: 'UPDATE_TASK', payload: { ...child, classification: event.target.value as '과제' | '일반' } })} className="ui-field ui-field-sm"><option>과제</option><option>일반</option></select><input value={child.assignees?.join(', ') ?? ''} onChange={event => dispatch({ type: 'UPDATE_TASK', payload: { ...child, assignees: event.target.value.split(',').map(value => value.trim()).filter(Boolean) } })} placeholder="담당자" className="ui-field ui-field-sm" /><div className="space-y-1"><input type="date" value={child.startDate ?? ''} onChange={event => dispatch({ type: 'UPDATE_TASK', payload: { ...child, startDate: event.target.value } })} className="ui-field ui-field-sm" /><input type="date" value={child.endDate ?? ''} onChange={event => dispatch({ type: 'UPDATE_TASK', payload: { ...child, endDate: event.target.value } })} className="ui-field ui-field-sm" /></div><div className="flex flex-wrap gap-1">{state.members.map(member => { const contribution = state.contributions.find(item => item.taskId === child.id && item.memberId === member.id)?.contributionPercent ?? 0; return <label key={member.id} className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1"><span>{member.name}</span><input type="number" min={0} max={100} value={contribution || ''} onChange={event => dispatch({ type: 'SET_CONTRIBUTION_PERCENT', payload: { taskId: child.id, memberId: member.id, contributionPercent: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } })} className="w-10 text-right outline-none" /><span>%</span></label> })}</div></div>)}</div></details>}
                </td>
                <td className="px-4 py-3 text-gray-600">{task.classification ?? '-'}</td>
                <td className="px-4 py-3 text-gray-600">{task.assignees?.join(', ') || '-'}</td>
                <td className="px-4 py-3 text-gray-600"><span className="whitespace-nowrap">{task.startDate || '-'} ~ {task.endDate || '-'}</span>{task.dateNeedsReview && <span className="ml-2"><Badge tone="accent">확인 필요</Badge></span>}</td>
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

      {activeView === 'register' && <section className="rounded-lg border border-gray-200 bg-white p-4" aria-label="과제 추가">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-black">과제명 <span className="text-danger">*</span><input value={newForm.name} onChange={(event) => setNewForm((form) => ({ ...form, name: event.target.value }))} placeholder="예: 신규 랜딩페이지 제작" className={`ui-field mt-1 ${newFormError && !newForm.name.trim() ? 'border-danger' : ''}`} /></label>
          <label className="text-sm font-medium text-black">분류<select value={newForm.classification} onChange={event => setNewForm(form => ({ ...form, classification: event.target.value as '과제' | '일반' }))} className="ui-field mt-1"><option>과제</option><option>일반</option></select></label>
          <label className="text-sm font-medium text-black">담당자<input value={newForm.assignees} onChange={event => setNewForm(form => ({ ...form, assignees: event.target.value }))} placeholder="여러 명은 쉼표로 구분" className="ui-field mt-1" /></label>
          <div className="grid grid-cols-2 gap-2"><label className="text-sm font-medium text-black">시작일<input type="date" value={newForm.startDate} onChange={event => setNewForm(form => ({ ...form, startDate: event.target.value }))} className="ui-field mt-1" /></label><label className="text-sm font-medium text-black">종료일<input type="date" value={newForm.endDate} onChange={event => setNewForm(form => ({ ...form, endDate: event.target.value }))} className="ui-field mt-1" /></label></div>
          {state.criteria.taskGradeWeight > 0 && <label className="text-sm font-medium text-black">과제등급<select value={newForm.importance} onChange={(event) => setNewForm((form) => ({ ...form, importance: event.target.value as Importance }))} className="ui-field mt-1">{IMPORTANCE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>}
          {state.criteria.workloadWeight > 0 && <label className="text-sm font-medium text-black">업무량<select value={newForm.workload} onChange={(event) => setNewForm((form) => ({ ...form, workload: event.target.value as Workload }))} className="ui-field mt-1">{WORKLOAD_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>}
          {state.criteria.performanceGradeWeight > 0 && <label className="text-sm font-medium text-black">성과등급<select value={newForm.performanceGrade} onChange={(event) => setNewForm((form) => ({ ...form, performanceGrade: event.target.value as PerformanceGrade }))} className="ui-field mt-1">{PERFORMANCE_GRADE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>}
          <label className="text-sm font-medium text-black">목표<input value={newForm.objective} onChange={(event) => setNewForm((form) => ({ ...form, objective: event.target.value }))} placeholder="예: 전환율 15% 개선 (선택)" className="ui-field mt-1" /></label>
          <label className="text-sm font-medium text-black">성과<input value={newForm.achievement} onChange={(event) => setNewForm((form) => ({ ...form, achievement: event.target.value }))} placeholder="예: 전환율 18% 달성 (선택)" className="ui-field mt-1" /></label>
          <button type="button" onClick={addTask} className="ui-button ui-button-primary self-end justify-center whitespace-nowrap">+ 과제 등록</button>
        </div>
        {newFormError && <p className="mt-2 text-xs text-danger">{newFormError}</p>}
      </section>}

      <ConfirmDialog
        open={deletingTask !== null}
        title={deletingTask?.isTaskGroup ? '상위과제 그룹 해제' : '과제 삭제'}
        message={deletingTask?.isTaskGroup ? `'${deletingTask.name}' 상위과제를 해제하시겠습니까? 포함된 개별과제는 삭제되지 않고 목록으로 돌아갑니다.` : `'${deletingTask?.name}' 과제를 삭제하시겠습니까? 관련된 기여도 데이터도 함께 삭제됩니다.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingTask(null)}
      />
      {sheetsImportOpen && <GoogleSheetsTaskImportDialog tasks={state.tasks} onImport={handleSheetsImport} onClose={() => setSheetsImportOpen(false)} />}
      {groupingOpen && <div className="ui-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-group-title"><div className="ui-modal-panel max-w-lg"><h2 id="task-group-title" className="ui-modal-title">상위과제로 그룹핑</h2><p className="mt-2 text-sm leading-6 text-gray-600">선택한 개별과제 {selectedTaskIds.size}개와 담당자를 하나의 상위과제에 연결합니다. 원본 개별과제는 삭제되지 않습니다.</p><label className="ui-label mt-5">상위과제명<input autoFocus value={groupName} onChange={event => setGroupName(event.target.value)} onKeyDown={event => event.key === 'Enter' && createTaskGroup()} placeholder="예: 플랫폼 UX 개선" className="ui-field mt-1" /></label>{groupError && <p className="mt-2 text-xs text-danger">{groupError}</p>}<div className="mt-4 max-h-48 overflow-y-auto border-y border-gray-200">{state.tasks.filter(task => selectedTaskIds.has(task.id)).map(task => <div key={task.id} className="border-b border-gray-100 px-3 py-2.5 text-sm last:border-0"><p className="font-medium text-gray-900">{task.name}</p><p className="mt-1 text-xs text-gray-500">담당자 {task.assignees?.join(', ') || '미지정'}</p></div>)}</div><div className="ui-modal-actions"><button type="button" onClick={() => setGroupingOpen(false)} className="ui-button ui-button-ghost">취소</button><button type="button" onClick={createTaskGroup} className="ui-button ui-button-primary">상위과제 만들기</button></div></div></div>}
    </div>
    </CriteriaWorkspaceLayout>
  )
}
