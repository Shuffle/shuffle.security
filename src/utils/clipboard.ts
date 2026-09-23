/**
 * Resilient cross-browser clipboard utilities.
 *
 * Provides safe copy functionality that works consistently across:
 * - Secure Contexts (HTTPS and localhost) via modern navigator.clipboard
 * - Insecure Contexts (HTTP on IP addresses, e.g. http://8.234.112.65:3002) via execCommand fallback
 * - Embedded WebViews, mobile browsers, and sandboxed iframes
 */

import { fallbackCopyText, installClipboardPolyfill } from '@/lib/browser-shims';

export { fallbackCopyText as fallbackCopyToClipboard, installClipboardPolyfill };

/**
 * Copies text to the system clipboard with automatic fallback for insecure contexts.
 * Never throws unhandled rejections or crashes if permissions/focus are denied.
 *
 * @param text The text string to copy
 * @returns Promise resolving to true if copy succeeded, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Try native navigator.clipboard if available
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Modern writeText may reject if document is not focused or user hasn't interacted
      // Fall through to offscreen textarea fallback
    }
  }

  // 2. Offscreen textarea + document.execCommand fallback
  return fallbackCopyText(text);
}
