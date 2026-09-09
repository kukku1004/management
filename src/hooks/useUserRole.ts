import { useEffect, useState } from 'react'
import { resolveUserRole, type UserRole } from '../utils/access'

export function useUserRole(email?: string | null): UserRole {
  const [role, setRole] = useState<UserRole>('member')
  useEffect(() => {
    let active = true
    void resolveUserRole(email).then((nextRole) => { if (active) setRole(nextRole) })
    return () => { active = false }
  }, [email])
  return role
}
