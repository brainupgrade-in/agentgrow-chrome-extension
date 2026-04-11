interface SignInViewProps {
  onSignIn: () => void;
  loading:  boolean;
  error:    string | null;
}

export function SignInView({ onSignIn, loading, error }: SignInViewProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10 gap-6 text-center">
      {/* Logo mark */}
      <div className="w-16 h-16 rounded-2xl bg-ag-surface border border-ag-border flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M8 16 L16 8 L24 16 L16 24 Z"
            stroke="var(--ag-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="16" cy="16" r="3" fill="var(--ag-accent)" />
        </svg>
      </div>

      {/* Heading */}
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-ag-text font-ui">AgentGrow</h1>
        <p className="text-sm text-ag-sub leading-relaxed max-w-[240px]">
          Sign in with your Google account to start using the AI assistant.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="w-full bg-ag-error/10 border border-ag-error/30 rounded-lg px-4 py-3 text-xs text-ag-error">
          {error}
        </div>
      )}

      {/* Sign-in button */}
      <button
        onClick={onSignIn}
        disabled={loading}
        className="flex items-center gap-3 bg-white text-gray-700 font-medium text-sm px-5 py-2.5 rounded-lg
                   hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors shadow-sm border border-gray-200"
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        {loading ? 'Signing in…' : 'Sign in with Google'}
      </button>

      {/* Privacy note */}
      <p className="text-xs text-ag-sub max-w-[260px] leading-relaxed">
        We request only your name, email, and profile picture.
        No data is sent to AgentGrow servers.{' '}
        <a
          href="https://devops.gheware.com/agentgrow/privacy/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ag-accent hover:underline"
        >
          Privacy policy
        </a>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
