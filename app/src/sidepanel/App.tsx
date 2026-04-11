import { useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { SignInView } from './views/SignInView.js';
import { ChatView } from './views/ChatView.js';
import { SettingsView } from './views/SettingsView.js';
import { ProviderFormView } from './views/ProviderFormView.js';
import type { PublicUserInfo } from '../core/types/auth.js';
import type { ProviderConfigPublic } from '../core/types/provider.js';

type Screen = 'chat' | 'settings' | 'provider-add' | 'provider-edit';

export default function App() {
  const { authState, isAuthenticated, loading, error, signIn, signOut } = useAuth();
  const [screen, setScreen] = useState<Screen>('chat');
  const [editingProvider, setEditingProvider] = useState<ProviderConfigPublic | null>(null);

  if (loading && authState === null) {
    return (
      <div className="flex items-center justify-center h-full bg-ag-bg">
        <div className="w-6 h-6 border-2 border-ag-muted border-t-ag-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <SignInView
        onSignIn={() => void signIn()}
        loading={loading}
        error={error}
      />
    );
  }

  const user = authState as PublicUserInfo;

  if (screen === 'provider-add') {
    return (
      <ProviderFormView
        onBack={() => setScreen('settings')}
        onSaved={() => setScreen('chat')}
      />
    );
  }

  if (screen === 'provider-edit' && editingProvider) {
    return (
      <ProviderFormView
        editing={editingProvider}
        onBack={() => setScreen('settings')}
        onSaved={() => { setEditingProvider(null); setScreen('settings'); }}
      />
    );
  }

  if (screen === 'settings') {
    return (
      <SettingsView
        onBack={() => setScreen('chat')}
        onAddProvider={() => setScreen('provider-add')}
        onEditProvider={(p) => { setEditingProvider(p); setScreen('provider-edit'); }}
      />
    );
  }

  return (
    <ChatView
      user={user}
      onSignOut={() => void signOut()}
      onSettings={() => setScreen('settings')}
    />
  );
}
