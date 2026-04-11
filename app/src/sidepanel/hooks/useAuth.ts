import { useEffect, useState, useCallback } from 'react';
import { MessageType } from '../../core/types/messages.js';
import type { AuthState } from '../../core/types/auth.js';
import { sendMessage } from '../utils/messaging.js';

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // Fetch auth status from service worker
  const refresh = useCallback(async () => {
    try {
      const res = await sendMessage<AuthState>({
        type:   MessageType.GET_AUTH_STATUS,
        source: 'sidepanel',
      });
      if (res.success && res.data !== undefined) {
        setAuthState(res.data);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Watch for session changes (e.g. sign-in from another UI surface)
  useEffect(() => {
    void refresh();

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if ('auth_session' in changes) {
        void refresh();
      }
    };
    chrome.storage.session.onChanged.addListener(listener);
    return () => chrome.storage.session.onChanged.removeListener(listener);
  }, [refresh]);

  const signIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sendMessage<AuthState>({
        type:   MessageType.SIGN_IN,
        source: 'sidepanel',
      });
      if (res.success && res.data !== undefined) {
        setAuthState(res.data);
      } else {
        setError(res.error ?? 'Sign-in failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      await sendMessage({ type: MessageType.SIGN_OUT, source: 'sidepanel' });
      setAuthState({ isAuthenticated: false });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const isAuthenticated =
    authState !== null && 'isAuthenticated' in authState && authState.isAuthenticated;

  return { authState, isAuthenticated, loading, error, signIn, signOut };
}
