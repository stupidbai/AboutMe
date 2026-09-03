import { reactive } from 'vue'

export interface CommunityUser {
  id: string
  username: string
  displayName: string
  email?: string
  role: 'member' | 'moderator'
  bio?: string
  createdAt: string
}

const state = reactive({
  loading: true,
  available: true,
  user: null as CommunityUser | null,
  csrfToken: ''
})
let pending: Promise<void> | null = null

export const refreshCommunitySession = (force = false) => {
  if (pending && !force) return pending
  state.loading = true
  pending = fetch('/api/auth/session', { credentials: 'same-origin', headers: { accept: 'application/json' } })
    .then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('community unavailable')
      const payload = await response.json()
      state.user = payload.authenticated ? payload.user : null
      state.csrfToken = payload.csrfToken || ''
      state.available = true
    })
    .catch(() => {
      state.user = null
      state.available = false
    })
    .finally(() => {
      state.loading = false
      pending = null
    })
  return pending
}

export const useCommunityAuth = () => ({
  state,
  refresh: refreshCommunitySession,
  setUser: (user: CommunityUser | null) => { state.user = user; state.available = true; state.loading = false }
})

export const communityFetch = (input: RequestInfo | URL, init: RequestInit = {}) => fetch(input, {
  ...init,
  credentials: 'same-origin',
  headers: {
    ...(init.body ? { 'content-type': 'application/json' } : {}),
    ...(state.csrfToken ? { 'x-csrf-token': state.csrfToken } : {}),
    ...Object.fromEntries(new Headers(init.headers).entries())
  }
})
