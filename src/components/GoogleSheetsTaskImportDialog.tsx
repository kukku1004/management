import { useMemo, useState } from 'react'
import type { Task } from '../types'
import { importSelectedGoogleSheetGroups, loadGoogleSheetTaskPreview, type GoogleSheetTaskImport, type GoogleSheetTaskPreview } from '../utils/googleSheetsTasks'

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1wnE6O8uIdCPPPHPYvQj5SBCSN9LlunkNT8dncA7NL2o/edit?gid=2042819477#gid=2042819477'

interface Props {
  tasks: Task[]
  onImport: (result: GoogleSheetTaskImport) => void
  onClose?: () => void
  embedded?: boolean
}

export default function GoogleSheetsTaskImportDialog({ tasks, onImport, onClose, embedded = false }: Props) {
  const [url, setUrl] = useState(DEFAULT_SHEET_URL)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<GoogleSheetTaskPreview | null>(null)
  const [activeLevel1, setActiveLevel1] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importComplete, setImportComplete] = useState(false)
  const level1s = useMemo(() => preview ? [...new Set(preview.groups.map((group) => group.level1))] : [], [preview])
  const selectedGroups = useMemo(() => preview?.groups.filter((group) => selected.has(group.key)) ?? [], [preview, selected])

  async function loadPreview() {
    setBusy(true)
    setError('')
    try {
      const result = await loadGoogleSheetTaskPreview(url)
      setPreview(result)
      setActiveLevel1(result.groups[0]?.level1 ?? '')
      setSelected(new Set())
      setImportComplete(false)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : ''
      setError(/not found|404|entity/i.test(message)
        ? '현재 로그인한 Google 계정이 시트를 찾지 못했습니다. 해당 계정에 시트가 공유되었는지 확인해 주세요.'
        : message || 'Google Sheets 데이터를 가져오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  function toggle(key: string) {
    setImportComplete(false)
    setSelected((current) => {
      const next = new Set(current)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function finish() {
    if (!preview || selected.size === 0) return
    onImport(importSelectedGoogleSheetGroups(preview, selected, tasks))
    setImportComplete(true)
    if (!embedded) onClose?.()
  }

  const content = <div className={embedded ? 'w-full min-w-0' : 'h-[80dvh] w-[80vw] min-w-0 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-xl'}>
    <div className="flex items-start justify-between gap-4">
      <div><h2 className={embedded ? 'ui-section-title' : 'text-lg font-semibold text-gray-950'}>Google Sheets 과제 선택</h2><p className="mt-1 text-sm text-gray-500">L1 탭에서 L2 상위과제를 선택하면 포함된 L3 과제와 담당자만 가져옵니다.</p></div>
      {!embedded && <button type="button" onClick={onClose} className="ui-button ui-button-ghost ui-button-sm">닫기</button>}
    </div>
    <div className="mt-5 flex gap-2"><input aria-label="Google Sheets 링크" className="ui-field" value={url} onChange={(event) => { setUrl(event.target.value); setPreview(null) }} /><button type="button" disabled={busy} onClick={() => void loadPreview()} className="ui-button ui-button-secondary whitespace-nowrap">{busy ? '불러오는 중…' : '목록 확인'}</button></div>
    {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    {preview && <div className="mt-5 min-w-0 overflow-hidden rounded-lg border border-gray-200">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 px-3 pt-3" role="tablist" aria-label="Google Sheets L1 분야">{level1s.map((level1) => <button key={level1} type="button" role="tab" aria-selected={activeLevel1 === level1} onClick={() => setActiveLevel1(level1)} className={`ui-tab rounded-b-none ${activeLevel1 === level1 ? 'ui-tab-active' : ''}`}>{level1} <span className="ml-1 text-xs opacity-60">{preview.groups.filter((group) => group.level1 === level1).length}</span></button>)}</div>
      <div className={`${embedded ? 'max-h-[360px]' : 'max-h-[520px]'} divide-y divide-gray-100 overflow-y-auto`}>{preview.groups.filter((group) => group.level1 === activeLevel1).map((group) => <label key={group.key} className="flex cursor-pointer items-start gap-3 px-4 py-4 hover:bg-gray-50"><input type="checkbox" className="mt-1" checked={selected.has(group.key)} onChange={() => toggle(group.key)} /><span className="min-w-0 flex-1"><span className="block font-semibold text-gray-950">{group.level2}</span><span className="mt-1 block text-xs text-gray-500">L3 하위과제 {group.children.length}개 · 담당자 {[...new Set(group.children.flatMap((child) => child.assignees ?? []))].join(', ') || '미지정'}</span><span className="mt-2 block border-l-2 border-orange-200 pl-3 text-xs leading-5 text-gray-600">{group.children.slice(0, 4).map((child) => child.name).join(' · ')}{group.children.length > 4 ? ` 외 ${group.children.length - 4}개` : ''}</span></span></label>)}</div>
    </div>}
    {importComplete && <div role="status" className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"><span aria-hidden="true">✓</span><span>선택한 과제를 가져왔습니다.</span></div>}
    <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0 flex-1"><p className="text-sm text-gray-500">선택한 L2 상위과제 {selected.size}개</p>{selectedGroups.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{selectedGroups.map((group) => <span key={group.key} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 py-1 pl-3 pr-1.5 text-xs font-medium text-orange-900"><span className="truncate">{group.level2}</span><button type="button" onClick={() => toggle(group.key)} aria-label={`${group.level2} 선택 해제`} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-orange-700 hover:bg-orange-100">×</button></span>)}</div>}</div><div className="flex shrink-0 gap-2">{!embedded && <button type="button" onClick={onClose} className="ui-button ui-button-secondary">취소</button>}<button type="button" disabled={!preview || selected.size === 0 || importComplete} onClick={finish} className="ui-button ui-button-primary">{importComplete ? '가져오기 완료' : '선택 과제 가져오기'}</button></div></div>
  </div>

  if (embedded) return content
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="Google Sheets 과제 가져오기">{content}</div>
}
