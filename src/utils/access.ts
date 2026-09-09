import { isAdminEmail } from './admin'

export type UserRole = 'admin' | 'leader' | 'member'
export type AccessTabKey = 'tasks' | 'matrix' | 'results' | 'notes' | 'access'

// Initial bootstrap policy. Administrators can later assign leader/member roles
// from the access-management screen backed by the management Drive workspace.
const INITIAL_LEADER_EMAILS = new Set<string>([])

export async function resolveUserRole(email?: string | null): Promise<UserRole> {
  const normalized = email?.trim().toLowerCase()
  if (await isAdminEmail(normalized)) return 'admin'
  if (normalized && INITIAL_LEADER_EMAILS.has(normalized)) return 'leader'
  return 'member'
}

export function accessibleTabs(role: UserRole): AccessTabKey[] {
  if (role === 'admin') return ['tasks', 'matrix', 'results', 'notes', 'access']
  if (role === 'leader') return ['tasks', 'matrix', 'results', 'notes']
  return ['tasks', 'matrix']
}

export function canAccessTab(role: UserRole, tab: AccessTabKey): boolean {
  return accessibleTabs(role).includes(tab)
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: '관리자',
  leader: '팀장',
  member: '팀원',
}
