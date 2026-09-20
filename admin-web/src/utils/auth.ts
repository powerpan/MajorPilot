// Session storage is origin-scoped, unlike Cookies shared across localhost ports.
// This is RuoYi's JS bearer token model, not an HttpOnly student session.
const TokenKey = 'MP_ADMIN_TOKEN'

export function getToken(): string | undefined {
  return sessionStorage.getItem(TokenKey) ?? undefined
}

export function setToken(token: string): string | undefined {
  sessionStorage.setItem(TokenKey, token)
  return token
}

export function removeToken(): void {
  sessionStorage.removeItem(TokenKey)
}
