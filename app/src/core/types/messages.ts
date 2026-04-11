import { z } from 'zod';

export enum MessageType {
  // Auth — the only messages that bypass the auth gate
  SIGN_IN         = 'SIGN_IN',
  SIGN_OUT        = 'SIGN_OUT',
  GET_AUTH_STATUS = 'GET_AUTH_STATUS',

  // Chat
  CHAT_SEND = 'CHAT_SEND',
  CHAT_STOP = 'CHAT_STOP',

  // DOM — live read/write on the adjacent tab
  DOM_READ_PAGE      = 'DOM_READ_PAGE',       // full structured page content
  DOM_READ_SELECTION = 'DOM_READ_SELECTION',  // current text selection + context
  DOM_FILL_FORM      = 'DOM_FILL_FORM',       // fill form fields by CSS selector
  DOM_CLICK          = 'DOM_CLICK',           // click a button/link/element by selector
  DOM_HIGHLIGHT_TEXT = 'DOM_HIGHLIGHT_TEXT',  // highlight text in page
  DOM_INSERT_TEXT    = 'DOM_INSERT_TEXT',     // insert text at cursor/selection
  DOM_CLEAR_MARKS    = 'DOM_CLEAR_MARKS',     // remove all highlights/marks

  // Page context (legacy — kept for compatibility)
  GET_PAGE_CONTENT = 'GET_PAGE_CONTENT',
  GET_TAB_GROUPS   = 'GET_TAB_GROUPS',

  // Provider management
  PROVIDER_ADD    = 'PROVIDER_ADD',
  PROVIDER_UPDATE = 'PROVIDER_UPDATE',
  PROVIDER_DELETE = 'PROVIDER_DELETE',
  PROVIDER_LIST   = 'PROVIDER_LIST',
  PROVIDER_TEST   = 'PROVIDER_TEST',

  // Conversation
  CONVERSATION_LIST   = 'CONVERSATION_LIST',
  CONVERSATION_GET    = 'CONVERSATION_GET',
  CONVERSATION_DELETE = 'CONVERSATION_DELETE',
  CONVERSATION_CLEAR  = 'CONVERSATION_CLEAR',

  // Data
  EXPORT_DATA   = 'EXPORT_DATA',
  DELETE_ALL    = 'DELETE_ALL',
  GET_AUDIT_LOG = 'GET_AUDIT_LOG',
}

/** All cross-component messages share this shape */
export const AgentGrowMessageSchema = z.object({
  type:      z.nativeEnum(MessageType),
  requestId: z.string().uuid(),
  payload:   z.record(z.string(), z.unknown()).default({}),
  source:    z.enum(['sidepanel', 'content', 'background', 'popup', 'options']),
});

export type AgentGrowMessage = z.infer<typeof AgentGrowMessageSchema>;

/** Messages the service worker returns */
export interface AgentGrowResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
