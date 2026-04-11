import { z } from 'zod';

export const ProviderTypeSchema = z.enum(['openai-compatible', 'ollama']);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const ProviderConfigSchema = z.object({
  id:        z.string().uuid(),
  name:      z.string().min(1).max(100),
  type:      ProviderTypeSchema,
  baseUrl:   z.string().url(),
  model:     z.string().min(1),
  keyRef:    z.string().optional(),
  isDefault: z.boolean().default(false),
  createdAt: z.number(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export type ProviderConfigPublic = Omit<ProviderConfig, 'keyRef'> & {
  hasApiKey: boolean;
};

export interface ModelInfo {
  id:   string;
  name: string;
}

export interface CompletionRequest {
  providerId:   string;
  model:        string;
  messages:     ChatMessage[];
  systemPrompt?: string;
  maxTokens?:   number;
  temperature?: number;
  stream?:      boolean;
}

export interface CompletionResponse {
  content:     string;
  tokensUsed?: number;
  model:       string;
  latencyMs:   number;
}

export interface ChatMessage {
  role:    'user' | 'assistant' | 'system';
  content: string;
}

// ── Provider presets (OpenCode-familiar names) ─────────────────────────────

export interface ProviderPreset {
  id:          string;
  name:        string;
  type:        ProviderType;
  baseUrl:     string;
  defaultModel: string;
  models:      string[];
  requiresKey: boolean;
  keyPlaceholder?: string;
  docsUrl?:    string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id:           'openrouter',
    name:         'OpenRouter',
    type:         'openai-compatible',
    baseUrl:      'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    models: [
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-r1:free',
      'microsoft/phi-4-reasoning:free',
      'qwen/qwen3-235b-a22b:free',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3.5-haiku',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
    ],
    requiresKey:     true,
    keyPlaceholder:  'sk-or-...',
    docsUrl:         'https://openrouter.ai/keys',
  },
  {
    id:           'openai',
    name:         'OpenAI',
    type:         'openai-compatible',
    baseUrl:      'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'],
    requiresKey:     true,
    keyPlaceholder:  'sk-...',
    docsUrl:         'https://platform.openai.com/api-keys',
  },
  {
    id:           'anthropic',
    name:         'Anthropic',
    type:         'openai-compatible',
    baseUrl:      'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: [
      'claude-opus-4-5',
      'claude-sonnet-4-5',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-haiku-20240307',
    ],
    requiresKey:     true,
    keyPlaceholder:  'sk-ant-...',
    docsUrl:         'https://console.anthropic.com/',
  },
  {
    id:           'groq',
    name:         'Groq',
    type:         'openai-compatible',
    baseUrl:      'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    requiresKey:     true,
    keyPlaceholder:  'gsk_...',
    docsUrl:         'https://console.groq.com/keys',
  },
  {
    id:           'gemini',
    name:         'Google Gemini',
    type:         'openai-compatible',
    baseUrl:      'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    requiresKey:     true,
    keyPlaceholder:  'AIza...',
    docsUrl:         'https://aistudio.google.com/app/apikey',
  },
  {
    id:           'ollama',
    name:         'Ollama',
    type:         'ollama',
    baseUrl:      'http://localhost:11434',
    defaultModel: 'llama3.2',
    models:       ['gemma4:31b', 'qwen3.5:397b', 'deepseek-v3.1:671b', 'llama3.2', 'llama3.1', 'mistral', 'gemma3:27b', 'gemma3:12b', 'phi4', 'qwen2.5-coder', 'deepseek-r1'],
    requiresKey:     false,
    docsUrl:         'https://ollama.com/library',
  },
  {
    id:           'custom',
    name:         'Custom / Self-hosted',
    type:         'openai-compatible',
    baseUrl:      '',
    defaultModel: '',
    models:       [],
    requiresKey:     false,
    keyPlaceholder:  'optional',
  },
];
