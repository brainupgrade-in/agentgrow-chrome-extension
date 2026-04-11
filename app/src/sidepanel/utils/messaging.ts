import type { AgentGrowResponse, MessageType } from '../../core/types/messages.js';

interface SendOptions {
  type:    MessageType;
  source:  'sidepanel' | 'popup' | 'options';
  payload?: Record<string, unknown>;
}

/**
 * Sends a typed message to the service worker and returns the response.
 * Throws on Chrome runtime error.
 */
export async function sendMessage<T = unknown>(
  opts: SendOptions
): Promise<AgentGrowResponse<T>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type:      opts.type,
        requestId: crypto.randomUUID(),
        payload:   opts.payload ?? {},
        source:    opts.source,
      },
      (response: AgentGrowResponse<T>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      }
    );
  });
}
