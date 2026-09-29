/**
 * Generic AI conversation utility.
 * Calls the Shuffle AI backend at POST /api/v1/conversation.
 */

import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';

export interface AIConversationOptions {
  query: string;
  outputFormat?: 'raw' | 'json' | 'formatting' | (string & {});
}

export interface AIConversationResponse {
  success: boolean;
  result?: string;
  error?: string;
}

/**
 * Send a query to the Shuffle AI conversation endpoint.
 */
export const askAI = async ({
  query,
  outputFormat = 'formatting',
}: AIConversationOptions): Promise<AIConversationResponse> => {
  try {
    const res = await fetch(getApiUrl('/api/v1/conversation'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({
        output_format: outputFormat,
        query,
      }),
    });

    // Don't fail on HTTP status — the API can return 500 even on success
    const text = await res.text();
    let result: string;
    try {
      const data = JSON.parse(text);
      // Check for explicit failure from the API
      if (data && typeof data === 'object' && data.success === false) {
        return { success: false, error: data.reason || data.error || 'AI query failed' };
      }
      result = typeof data === 'string' ? data : (data.result || data.response || text);
    } catch {
      result = text;
    }

    // Validate we got meaningful content
    if (result && result.trim().length > 0) {
      return { success: true, result };
    }

    return { success: false, error: 'AI returned empty response' };
  } catch (error) {
    console.error('AI conversation error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};
