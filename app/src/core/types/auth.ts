/** Stored in chrome.storage.session — cleared on browser close */
export interface AuthSession {
  /** Raw Google OAuth2 token — stays in service worker only */
  token: string;
  /** User-facing identity sent to UI */
  user: PublicUserInfo;
  /** Epoch ms when token was issued */
  issuedAt: number;
}

/** Safe to pass to side panel / popup — no token */
export interface PublicUserInfo {
  email: string;
  name: string;
  picture: string;
  isAuthenticated: true;
}

export interface UnauthenticatedState {
  isAuthenticated: false;
}

export type AuthState = PublicUserInfo | UnauthenticatedState;
