const SESSION_KEY = 'qr_guest_session'
const ETAG_PREFIX = 'qr_menu_etag_'

export function getGuestSession(): string | null {
  return sessionStorage.getItem(SESSION_KEY)
}

export function setGuestSession(token: string): void {
  sessionStorage.setItem(SESSION_KEY, token)
}

export function clearGuestSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

export function getMenuETag(scope: string): string | null {
  return sessionStorage.getItem(ETAG_PREFIX + scope)
}

export function setMenuETag(scope: string, etag: string): void {
  sessionStorage.setItem(ETAG_PREFIX + scope, etag)
}
