/**
 * Turn an LLM provider's HTTP error into a message a non-technical user can act on.
 * LiteLLM (e.g. the Gheware AI gateway) reports exhausted budgets as
 * "Budget has been exceeded! ..." — "Team=" marks a product-wide ceiling.
 */
export const GHEWARE_CREDIT_USED_UP = 'Your Gheware AI credit is used up — top up to continue';

export function friendlyHttpError(status: number, errText: string, model: string, isGheware = false): string {
  if (errText.includes('Budget has been exceeded')) {
    if (!isGheware) return 'Budget exceeded on this provider — check the key\'s spending limit';
    return errText.includes('Team=')
      ? 'This service is temporarily at capacity — please try again later'
      : GHEWARE_CREDIT_USED_UP;
  }
  if (status === 401) return 'Invalid API key — check your key in Settings';
  if (status === 403) return 'Access denied — your API key may lack permissions for this model';
  if (status === 429) return 'Rate limited — too many requests, try again in a moment';
  if (status === 404) return `Model not found — "${model}" may not be available on this provider`;
  if (status >= 500) return `Provider server error (${status}) — try again later`;
  return `API error ${status}: ${errText.slice(0, 200)}`;
}
