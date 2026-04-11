import type { AuthSession, PublicUserInfo } from '../core/types/auth.js';

const SESSION_KEY = 'auth_session';

/** Fetches Google profile using the OAuth token */
async function fetchProfile(token: string): Promise<PublicUserInfo> {
  const res = await fetch(
    `https://www.googleapis.com/oauth2/v3/userinfo`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Google profile fetch failed: ${res.status}`);
  }
  const data = await res.json() as {
    email: string;
    name: string;
    picture: string;
  };
  return {
    email:           data.email,
    name:            data.name,
    picture:         data.picture,
    isAuthenticated: true,
  };
}

/** Assembles and persists an AuthSession */
async function buildSession(token: string): Promise<PublicUserInfo> {
  const user = await fetchProfile(token);
  const session: AuthSession = { token, user, issuedAt: Date.now() };
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  return user;
}

export const AuthService = {
  /**
   * Interactive sign-in via chrome.identity.getAuthToken.
   * Shows a Google account picker if no token is cached.
   */
  async signIn(): Promise<PublicUserInfo> {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError ?? !token) {
          reject(
            new Error(chrome.runtime.lastError?.message ?? 'Sign-in cancelled')
          );
          return;
        }
        try {
          resolve(await buildSession(token));
        } catch (err) {
          reject(err);
        }
      });
    });
  },

  /**
   * Non-interactive check — tries to restore an existing session.
   * Returns null if no valid session exists.
   */
  async silentCheck(): Promise<PublicUserInfo | null> {
    // 1. Try session storage first (warm path)
    const stored = await chrome.storage.session.get(SESSION_KEY);
    const session = stored[SESSION_KEY] as AuthSession | undefined;
    if (session?.user) return session.user;

    // 2. Try chrome.identity non-interactive token (cold start)
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, async (token) => {
        if (chrome.runtime.lastError ?? !token) {
          resolve(null);
          return;
        }
        try {
          resolve(await buildSession(token));
        } catch {
          resolve(null);
        }
      });
    });
  },

  /** Returns the raw token for API calls (never exposed to UI) */
  async getToken(): Promise<string | null> {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    const session = stored[SESSION_KEY] as AuthSession | undefined;
    return session?.token ?? null;
  },

  /** Signs out: revokes token, clears session storage */
  async signOut(): Promise<void> {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    const session = stored[SESSION_KEY] as AuthSession | undefined;
    if (session?.token) {
      // Revoke token with Google
      await fetch(
        `https://accounts.google.com/o/oauth2/revoke?token=${session.token}`
      ).catch(() => {/* fire and forget */});
      chrome.identity.removeCachedAuthToken(
        { token: session.token },
        () => { /* noop */ }
      );
    }
    await chrome.storage.session.remove(SESSION_KEY);
  },

  /** Returns the cached PublicUserInfo if signed in, null otherwise */
  async getUser(): Promise<PublicUserInfo | null> {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    const session = stored[SESSION_KEY] as AuthSession | undefined;
    return session?.user ?? null;
  },
};
