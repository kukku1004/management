import { useState } from 'react'
import type { Task } from '../types'
import { importTasksFromGoogleSheet, type GoogleSheetTaskImport } from '../utils/googleSheetsTasks'

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1wnE6O8uIdCPPPHPYvQj5SBCSN9LlunkNT8dncA7NL2o/edit'

export default function GoogleSheetsTaskImportDialog({ tasks, onImport, onClose }: { tasks: Task[]; onImport: (result: GoogleSheetTaskImport) => void; onClose: () => void }) {
  const [url, setUrl] = useState(DEFAULT_SHEET_URL)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function runImport() {
    setBusy(true); setError('')
    try { onImport(await importTasksFromGoogleSheet(url, tasks)); onClose() }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : ''
      setError(/not found|404|entity/i.test(message)
        ? '현재 로그인한 Google 계정이 시트를 찾지 못했습니다. 로그아웃 후 다시 연결하고, 해당 계정에 시트가 공유되었는지 확인해 주세요.'
        : message || 'Google Sheets 데이터를 가져오지 못했습니다.')
    }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="Google Sheets 과제 가져오기">
    <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-950">Google Sheets에서 팀원 과제 가져오기</h2><p className="mt-1 text-sm text-gray-500">2번째 탭 `2026 추진현황`을 읽기 전용으로 연결합니다.</p></div><button type="button" onClick={onClose} className="ui-button ui-button-ghost ui-button-sm">닫기</button></div>
      <label className="mt-5 block text-sm font-medium text-gray-900">Google Sheets 링크<input className="ui-field mt-2" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">탭 그룹 A · 과제명 D · 분류 BF · 담당자 BJ · 시작일 BM · 완료일 BP</div>
      {error && <p className="mt-3 text-sm text-danger">{error}{error.includes('403') || error.includes('권한') ? ' Google 계정을 다시 연결하여 Sheets 읽기 권한을 허용해 주세요.' : ''}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="ui-button ui-button-secondary">취소</button><button type="button" disabled={busy} onClick={() => void runImport()} className="ui-button ui-button-primary">{busy ? '가져오는 중…' : '과제 가져오기'}</button></div>
    </div>
  </div>
}
