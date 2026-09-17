import type { User } from "./types";

const USER_KEY = "fit23hub_user";

/**
 * The session itself is an httpOnly cookie the browser sends automatically and
 * no script can read - not this code, and not anything injected into the page.
 * Only the display profile is cached here, which is not a credential: tampering
 * with it changes what the UI draws, never what the server allows.
 */
export function setStoredUser(user: User) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

/**
 * A hint for routing only. The cookie is invisible to JavaScript, so the server
 * remains the sole authority - a 401 is what actually proves a session is gone.
 */
export function hasSession(): boolean {
  return getStoredUser() !== null;
}
