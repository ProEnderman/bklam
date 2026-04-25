import { createContext, useContext } from 'react'
import type { User } from '../api/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  /** True after at least one successful refresh+getMe (valid token). Use to avoid API calls before auth is ready. */
  authReady: boolean
  refreshUser: () => Promise<void>
  /** Clear user and cache (call after logout so Login page is shown instead of redirect back). */
  clearUser: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export { AuthContext }
export type { AuthContextType }

