import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // AgentGrow design tokens
        'ag-bg':      '#0e0e11',
        'ag-surface': '#16161d',
        'ag-border':  '#2a2a35',
        'ag-muted':   '#3a3a4a',
        'ag-accent':  '#22d3a8',
        'ag-accent2': '#6366f1',
        'ag-text':    '#e8e8f0',
        'ag-sub':     '#8888a8',
        'ag-error':   '#f87171',
        'ag-warn':    '#fbbf24',
        'ag-success': '#34d399',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        ui:   ['DM Sans', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      width: {
        panel: '400px',
      },
    },
  },
  plugins: [],
} satisfies Config;
