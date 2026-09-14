import { useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import type { PeerReview } from '../types'

interface Draft { rank: string; evidence: string }

export default function PeerReviewSection() {
  const { state, dispatch } = useAppState()
  const activeMembers = state.members.filter((member) => member.active)
  const [reviewerId, setReviewerId] = useState(activeMembers[0]?.id ?? '')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [message, setMessage] = useState('')
  const reviewer = activeMembers.find((member) => member.id === reviewerId)
  const targets = activeMembers.filter((member) => member.id !== reviewerId)

  const summaries = useMemo(() => activeMembers.map((member) => {
    const reviews = state.peerReviews.filter((review) => review.targetMemberId === member.id && review.reviewerMemberId !== member.id && review.rank)
    const averageRank = reviews.length ? reviews.reduce((sum, review) => sum + (review.rank ?? 0), 0) / reviews.length : null
    return { member, reviews, averageRank }
  }).sort((a, b) => (a.averageRank ?? Number.MAX_SAFE_INTEGER) - (b.averageRank ?? Number.MAX_SAFE_INTEGER)), [activeMembers, state.peerReviews])

  function selectReviewer(id: string) {
    setReviewerId(id)
    setMessage('')
    const existing = state.peerReviews.filter((review) => review.reviewerMemberId === id)
    setDrafts(Object.fromEntries(existing.map((review) => [review.targetMemberId, { rank: review.rank ? String(review.rank) : '', evidence: review.evidence } ])))
  }

  function updateDraft(memberId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [memberId]: { rank: current[memberId]?.rank ?? '', evidence: current[memberId]?.evidence ?? '', ...patch } }))
    setMessage('')
  }

  function save() {
    if (!reviewer) return
    const ranks = targets.map((target) => Number(drafts[target.id]?.rank))
    if (ranks.some((rank) => !Number.isInteger(rank) || rank < 1 || rank > targets.length)) { setMessage(`모든 팀원에게 1위부터 ${targets.length}위 사이의 순위를 입력하세요.`); return }
    if (new Set(ranks).size !== ranks.length) { setMessage('같은 순위를 중복해서 사용할 수 없습니다.'); return }
    if (targets.some((target) => !drafts[target.id]?.evidence.trim())) { setMessage('모든 팀원의 순위 근거를 입력하세요.'); return }
    const retained = state.peerReviews.filter((review) => review.reviewerMemberId !== reviewer.id)
    const reviews: PeerReview[] = targets.map((target) => {
      const existing = state.peerReviews.find((review) => review.reviewerMemberId === reviewer.id && review.targetMemberId === target.id)
      return { id: existing?.id ?? uuidv4(), taskId: '', reviewerMemberId: reviewer.id, reviewerName: reviewer.name, targetMemberId: target.id, contributionPercent: null, grade: null, rank: Number(drafts[target.id].rank), evidence: drafts[target.id].evidence.trim() }
    })
    dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: [...retained, ...reviews] })
    setMessage(`${reviewer.name}님의 팀원 순위와 근거를 저장했습니다.`)
  }

  if (activeMembers.length < 2) return <div className="ui-empty">피어리뷰를 진행하려면 팀원을 2명 이상 등록하세요.</div>

  return <div className="space-y-6">
    <section className="border-b border-gray-200 pb-5">
      <h2 className="ui-page-title">팀원 피어리뷰</h2>
      <p className="mt-1 text-sm text-gray-500">과제와 무관하게 함께 일한 팀원의 상대 순위를 정하고, 판단 근거를 작성합니다. 순위는 성과점수에 자동 반영되지 않습니다.</p>
      <label className="mt-4 block max-w-sm text-sm font-medium text-gray-900">리뷰어<select value={reviewerId} onChange={(event) => selectReviewer(event.target.value)} className="ui-field mt-2">{activeMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
    </section>

    <section>
      <div className="mb-3 flex items-center justify-between"><div><h3 className="ui-section-title">팀원 순위 입력</h3><p className="mt-1 text-sm text-gray-500">1위부터 {targets.length}위까지 중복 없이 입력합니다.</p></div><button type="button" onClick={save} className="ui-button ui-button-primary">피어리뷰 저장</button></div>
      <div className="ui-table-wrap"><table className="ui-table min-w-[760px]"><thead><tr><th className="w-28 text-center">순위</th><th className="w-52">팀원</th><th>순위 근거</th></tr></thead><tbody>{targets.map((target) => <tr key={target.id}><td className="text-center"><input type="number" min={1} max={targets.length} value={drafts[target.id]?.rank ?? ''} onChange={(event) => updateDraft(target.id, { rank: event.target.value })} className="ui-field ui-field-sm mx-auto w-20 text-center" placeholder="순위" /></td><td className="font-medium text-gray-950">{target.name}</td><td><textarea rows={2} value={drafts[target.id]?.evidence ?? ''} onChange={(event) => updateDraft(target.id, { evidence: event.target.value })} className="ui-field min-h-16 resize-y py-2" placeholder="함께 일하며 확인한 강점, 협업 방식, 기여 내용을 입력하세요." /></td></tr>)}</tbody></table></div>
      {message && <p className={`mt-3 text-sm ${message.includes('저장했습니다') ? 'text-success' : 'text-danger'}`}>{message}</p>}
    </section>

    <section className="border-t border-gray-200 pt-5"><h3 className="ui-section-title">피어리뷰 결과</h3><div className="mt-3 ui-table-wrap"><table className="ui-table min-w-[720px]"><thead><tr><th className="w-24 text-center">종합순위</th><th>팀원</th><th className="w-32 text-center">평균순위</th><th className="w-32 text-center">응답 수</th><th>근거</th></tr></thead><tbody>{summaries.map((summary, index) => <tr key={summary.member.id}><td className="text-center font-semibold">{summary.averageRank === null ? '-' : index + 1}</td><td className="font-medium">{summary.member.name}</td><td className="text-center tabular-nums">{summary.averageRank === null ? '-' : summary.averageRank.toFixed(1)}</td><td className="text-center">{summary.reviews.length}명</td><td className="max-w-xl whitespace-normal text-sm text-gray-600">{summary.reviews.length ? summary.reviews.map((review) => `${review.reviewerName}: ${review.evidence}`).join(' · ') : '아직 받은 리뷰가 없습니다.'}</td></tr>)}</tbody></table></div></section>
  </div>
}
