import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GoogleAuthProvider, createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firestore, isFirebaseConfigured } from '../utils/firebase'
import type { UserRole } from '../utils/access'

const ADMIN_EMAIL_HASH = '2651f4360178c3d81219a1ad00a491bcdc928600053e17992a2ea285eafd146a'
export interface UserProfile { email: string; displayName: string; role: UserRole; teamIds: string[]; canViewOtherTeams: boolean }
interface AuthValue { user: User | null; profile: UserProfile | null; loading: boolean; configured: boolean; googleLogin: () => Promise<void>; emailLogin: (email: string, password: string) => Promise<void>; signUp: (email: string, password: string, name: string) => Promise<void>; reset: (email: string) => Promise<void>; logout: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)
const normalize = (email: string) => email.trim().toLowerCase()
async function sha256(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') }

async function loadProfile(user: User) {
  if (!firestore || !user.email) throw new Error('사용자 이메일을 확인할 수 없습니다.')
  const email = normalize(user.email)
  const ref = doc(firestore, 'users', email)
  const found = await getDoc(ref)
  if (found.exists()) return found.data() as UserProfile
  const isAdmin = await sha256(email) === ADMIN_EMAIL_HASH
  const invite = isAdmin ? null : await getDoc(doc(firestore, 'invites', email))
  if (!isAdmin && !invite?.exists()) throw new Error('관리자가 아직 등록하지 않은 계정입니다.')
  const invited = invite?.data()
  const profile: UserProfile = { email, displayName: user.displayName ?? email.split('@')[0], role: isAdmin ? 'admin' : invited?.role ?? 'member', teamIds: isAdmin ? [] : invited?.teamIds ?? [], canViewOtherTeams: isAdmin || Boolean(invited?.canViewOtherTeams) }
  await setDoc(ref, { ...profile, uid: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [profile, setProfile] = useState<UserProfile | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => {
    const auth = firebaseAuth
    if (!auth) { setLoading(false); return }
    return onAuthStateChanged(auth, next => {
      setUser(next)
      if (!next) { setProfile(null); setLoading(false); return }
      void loadProfile(next).then(setProfile).catch(() => signOut(auth)).finally(() => setLoading(false))
    })
  }, [])
  const value = useMemo<AuthValue>(() => ({
    user, profile, loading, configured: isFirebaseConfigured,
    googleLogin: async () => { if (!firebaseAuth) throw new Error('Firebase 설정을 확인하세요.'); const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider()); try { await loadProfile(result.user) } catch (e) { await signOut(firebaseAuth); throw e } },
    emailLogin: async (email, password) => { if (!firebaseAuth) throw new Error('Firebase 설정을 확인하세요.'); const result = await signInWithEmailAndPassword(firebaseAuth, normalize(email), password); try { await loadProfile(result.user) } catch (e) { await signOut(firebaseAuth); throw e } },
    signUp: async (email, password, name) => {
      if (!firebaseAuth || !firestore) throw new Error('Firebase 설정을 확인하세요.')
      const normalized = normalize(email)
      if (!normalized.endsWith('@osstem.com')) throw new Error('회사 이메일(@osstem.com)만 가입할 수 있습니다.')
      const invite = await getDoc(doc(firestore, 'invites', normalized))
      if (!invite.exists()) throw new Error('관리자의 초대를 먼저 받아야 합니다.')
      const credential = await createUserWithEmailAndPassword(firebaseAuth, normalized, password)
      try {
        const data = invite.data()
        await setDoc(doc(firestore, 'users', normalized), { uid: credential.user.uid, email: normalized, displayName: name.trim(), role: data.role ?? 'member', teamIds: data.teamIds ?? [], canViewOtherTeams: Boolean(data.canViewOtherTeams), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      } catch (error) { await deleteUser(credential.user); throw error }
    },
    reset: async email => { if (!firebaseAuth) throw new Error('Firebase 설정을 확인하세요.'); await sendPasswordResetEmail(firebaseAuth, normalize(email)) },
    logout: async () => { if (firebaseAuth) await signOut(firebaseAuth) },
  }), [loading, profile, user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider가 필요합니다.'); return value }
