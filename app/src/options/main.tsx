import React from 'react';
import { createRoot } from 'react-dom/client';
import '../sidepanel/styles/index.css';

// Options page — stub for Phase 1; full implementation adds provider CRUD,
// privacy dashboard, audit log, and permission explainer.
function Options() {
  return (
    <div className="min-h-screen bg-ag-bg text-ag-text p-8 font-ui">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-xl bg-ag-surface border border-ag-border flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
              <path d="M8 16 L16 8 L24 16 L16 24 Z" stroke="var(--ag-accent)" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
              <circle cx="16" cy="16" r="3" fill="var(--ag-accent)" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold">AgentGrow Settings</h1>
        </div>
        <p className="text-ag-sub text-sm">Options page — coming in Phase 1.</p>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
createRoot(container).render(<React.StrictMode><Options /></React.StrictMode>);
