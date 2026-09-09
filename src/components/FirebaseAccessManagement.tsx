import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import Badge from './Badge'
import { firestore } from '../utils/firebase'
import { useWorkspace } from '../state/WorkspaceContext'
import type { UserRole } from '../utils/access'

interface AccessRecord { email: string; displayName?: string; role: UserRole; teamIds: string[]; canViewOtherTeams: boolean; status: '가입 완료' | '초대 대기' }
const emptyForm = { email: '', role: 'member' as UserRole, teamIds: [] as string[], canViewOtherTeams: false }

export default function FirebaseAccessManagement() {
  const { workspace } = useWorkspace()
  const [records, setRecords] = useState<AccessRecord[]>([])
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!firestore) return
    let users: AccessRecord[] = []; let invites: AccessRecord[] = []
    const publish = () => { const joined = new Set(users.map(item => item.email)); setRecords([...users, ...invites.filter(item => !joined.has(item.email))].sort((a, b) => a.email.localeCompare(b.email))) }
    const stopUsers = onSnapshot(collection(firestore, 'users'), snapshot => { users = snapshot.docs.map(item => ({ ...(item.data() as Omit<AccessRecord, 'status'>), email: item.id, status: '가입 완료' })); publish() })
    const stopInvites = onSnapshot(collection(firestore, 'invites'), snapshot => { invites = snapshot.docs.map(item => ({ ...(item.data() as Omit<AccessRecord, 'status'>), email: item.id, status: '초대 대기' })); publish() })
    return () => { stopUsers(); stopInvites() }
  }, [])
  async function save() {
    if (!firestore) return
    const email = form.email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMessage('이메일 주소를 확인하세요.'); return }
    if (form.role !== 'admin' && form.teamIds.length === 0) { setMessage('소속 팀을 한 개 이상 선택하세요.'); return }
    setBusy(true); setMessage('')
    try {
      const data = { role: form.role, teamIds: form.teamIds, canViewOtherTeams: form.role === 'admin' || form.canViewOtherTeams, updatedAt: serverTimestamp() }
      await setDoc(doc(firestore, 'invites', email), data, { merge: true })
      if (records.some(item => item.email === email && item.status === '가입 완료')) await setDoc(doc(firestore, 'users', email), data, { merge: true })
      setForm(emptyForm); setMessage('초대와 권한을 저장했습니다.')
    } catch { setMessage('권한을 저장하지 못했습니다.') } finally { setBusy(false) }
  }
  function edit(record: AccessRecord) { setForm({ email: record.email, role: record.role, teamIds: record.teamIds ?? [], canViewOtherTeams: record.canViewOtherTeams }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  return <section className="mx-auto max-w-6xl">
    <div className="border-b border-gray-200 pb-5"><div className="flex items-center gap-3"><h1 className="text-xl font-semibold text-gray-950">사용자·권한 관리</h1><Badge tone="neutral">관리자 전용</Badge></div><p className="mt-2 text-sm text-gray-600">이메일, 역할, 담당 팀과 타팀 조회 허용 여부를 관리합니다.</p></div>
    <div className="mt-6 grid gap-4 rounded-lg border border-gray-200 p-5 md:grid-cols-2">
      <label className="ui-label">이메일<input type="email" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} placeholder="회사 이메일 또는 등록할 Google 계정" className="ui-field mt-1" /></label>
      <label className="ui-label">역할<select value={form.role} onChange={e => setForm(v => ({ ...v, role: e.target.value as UserRole }))} className="ui-field mt-1"><option value="member">팀원</option><option value="leader">팀장</option><option value="admin">관리자</option></select></label>
      <fieldset className="md:col-span-2"><legend className="ui-label">소속 팀</legend><div className="mt-2 flex flex-wrap gap-2">{workspace.teams.map(team => <label key={team.id} className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm"><input type="checkbox" checked={form.teamIds.includes(team.id)} onChange={e => setForm(v => ({ ...v, teamIds: e.target.checked ? [...v.teamIds, team.id] : v.teamIds.filter(id => id !== team.id) }))} />{team.name}</label>)}{workspace.teams.length === 0 && <span className="text-sm text-gray-500">팀을 먼저 등록하세요.</span>}</div></fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.canViewOtherTeams} onChange={e => setForm(v => ({ ...v, canViewOtherTeams: e.target.checked }))} disabled={form.role === 'admin'} />다른 팀 조회 허용</label><div className="flex justify-end"><button onClick={() => void save()} disabled={busy} className="ui-button ui-button-primary px-5">{busy ? '저장 중…' : '초대·권한 저장'}</button></div>{message && <p className="text-sm text-gray-700 md:col-span-2">{message}</p>}
    </div>
    <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200"><table className="w-full border-collapse text-sm"><thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600"><tr><th className="px-4 py-3">사용자</th><th className="px-4 py-3">상태</th><th className="px-4 py-3">역할</th><th className="px-4 py-3">담당 팀</th><th className="px-4 py-3">타팀 조회</th><th className="px-4 py-3 text-right">관리</th></tr></thead><tbody className="divide-y divide-gray-100">{records.map(record => <tr key={record.email}><td className="px-4 py-3"><p className="font-medium text-gray-900">{record.displayName || record.email.split('@')[0]}</p><p className="text-xs text-gray-500">{record.email}</p></td><td className="px-4 py-3"><Badge tone={record.status === '가입 완료' ? 'success' : 'neutral'}>{record.status}</Badge></td><td className="px-4 py-3">{record.role === 'admin' ? '관리자' : record.role === 'leader' ? '팀장' : '팀원'}</td><td className="px-4 py-3">{record.role === 'admin' ? '전체' : workspace.teams.filter(team => record.teamIds?.includes(team.id)).map(team => team.name).join(', ') || '-'}</td><td className="px-4 py-3">{record.role === 'admin' || record.canViewOtherTeams ? '허용' : '담당 팀만'}</td><td className="px-4 py-3 text-right"><button onClick={() => edit(record)} className="text-sm font-medium text-accent">수정</button>{record.status === '초대 대기' && <button onClick={() => firestore && deleteDoc(doc(firestore, 'invites', record.email))} className="ml-3 text-sm text-red-600">취소</button>}</td></tr>)}{records.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">등록된 사용자가 없습니다.</td></tr>}</tbody></table></div>
  </section>
}
