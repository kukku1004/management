// Bootstrap administrators are stored as SHA-256 digests so a public build
// does not expose their email addresses in plain text.
const ADMIN_EMAIL_HASHES = new Set([
  '2651f4360178c3d81219a1ad00a491bcdc928600053e17992a2ea285eafd146a',
])

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function isAdminEmail(email?: string | null): Promise<boolean> {
  if (!email) return false
  return ADMIN_EMAIL_HASHES.has(await sha256(email.trim().toLowerCase()))
}
