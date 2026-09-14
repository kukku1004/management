import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspace } from '../state/WorkspaceContext'
import { downloadRankPeerReviewTemplates, parseRankPeerReviewWorkbook } from '../utils/excel'
import { formatEvaluationPeriod } from '../utils/workspace'

export default function PeerReviewSection() {
  const { state, dispatch } = useAppState()
  const { activeProject } = useWorkspace()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const activeMembers = state.members.filter((member) => member.active)
  const periodLabel = activeProject ? formatEvaluationPeriod(activeProject.period) : '현재평가'
  const summaries = useMemo(() => activeMembers.map((member) => {
    const reviews = state.peerReviews.filter((review) => review.targetMemberId === member.id && review.reviewerMemberId !== member.id && review.rank)
    const averageRank = reviews.length ? reviews.reduce((sum, review) => sum + (review.rank ?? 0), 0) / reviews.length : null
    return { member, reviews, averageRank }
  }).sort((a, b) => (a.averageRank ?? Number.MAX_SAFE_INTEGER) - (b.averageRank ?? Number.MAX_SAFE_INTEGER)), [activeMembers, state.peerReviews])

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return
    const next = [...state.peerReviews]
    const uploadedReviewers = new Set<string>()
    const uploadErrors: string[] = []
    for (const file of Array.from(files)) {
      try {
        const result = parseRankPeerReviewWorkbook(await file.arrayBuffer(), activeMembers, next)
        if (result.errors.length) { uploadErrors.push(...result.errors.map((error) => `${file.name}: ${error}`)); continue }
        const retained = next.filter((review) => review.reviewerMemberId !== result.reviewerId)
        next.splice(0, next.length, ...retained, ...result.reviews)
        uploadedReviewers.add(result.reviewerId)
      } catch {
        uploadErrors.push(`${file.name}: 파일을 읽을 수 없습니다.`)
      }
    }
    if (uploadedReviewers.size > 0) dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: next })
    setErrors(uploadErrors)
    setMessage(uploadedReviewers.size > 0 ? `${uploadedReviewers.size}명의 피어리뷰를 반영했습니다.` : '')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (activeMembers.length < 2) return <div className="ui-empty">피어리뷰를 진행하려면 팀원을 2명 이상 등록하세요.</div>

  return <div className="space-y-6">
    <section className="border-b border-gray-200 pb-5">
      <h2 className="ui-page-title">팀원 피어리뷰</h2>
      <p className="mt-1 text-sm text-gray-500">팀원별 Excel 양식을 내려받아 작성한 뒤 완성된 파일을 다시 올립니다. 순위는 피어리뷰 반영 비율에 따라 성과점수에 자동 반영됩니다.</p>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { const count = downloadRankPeerReviewTemplates(activeMembers, periodLabel); setMessage(`${count}명용 피어리뷰 양식을 내려받았습니다.`); setErrors([]) }} className="ui-button ui-button-secondary">팀원별 Excel 양식 다운로드</button><button type="button" onClick={() => fileInputRef.current?.click()} className="ui-button ui-button-primary">작성한 Excel 올리기</button><input ref={fileInputRef} type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={(event) => void uploadFiles(event.target.files)} /></div>
      <p className="mt-3 text-xs leading-5 text-gray-500">다운로드한 ZIP에는 평가자별 Excel 파일이 들어 있습니다. 각 파일에 다른 팀원의 1위부터 {activeMembers.length - 1}위까지 중복 없이 입력하고 순위 근거를 작성하세요.</p>
      {message && <p className="mt-3 text-sm text-success">{message}</p>}
      {errors.length > 0 && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"><p className="font-semibold">가져오지 못한 항목</p><ul className="mt-1 list-disc space-y-1 pl-5">{errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul></div>}
    </section>
    <section><div className="flex items-end justify-between gap-4"><div><h3 className="ui-section-title">피어리뷰 결과</h3><p className="mt-1 text-sm text-gray-500">업로드가 완료된 리뷰만 집계합니다.</p></div><span className="text-sm text-gray-500">완료 {new Set(state.peerReviews.filter((review) => review.rank).map((review) => review.reviewerMemberId)).size}/{activeMembers.length}명</span></div><div className="mt-3 ui-table-wrap"><table className="ui-table min-w-[720px]"><thead><tr><th className="w-24 text-center">종합순위</th><th>팀원</th><th className="w-32 text-center">평균순위</th><th className="w-32 text-center">응답 수</th><th>근거</th></tr></thead><tbody>{summaries.map((summary, index) => <tr key={summary.member.id}><td className="text-center font-semibold">{summary.averageRank === null ? '-' : index + 1}</td><td className="font-medium">{summary.member.name}</td><td className="text-center tabular-nums">{summary.averageRank === null ? '-' : summary.averageRank.toFixed(1)}</td><td className="text-center">{summary.reviews.length}명</td><td className="max-w-xl whitespace-normal text-sm text-gray-600">{summary.reviews.length ? summary.reviews.map((review) => `${review.reviewerName}: ${review.evidence}`).join(' · ') : '아직 받은 리뷰가 없습니다.'}</td></tr>)}</tbody></table></div></section>
  </div>
}
