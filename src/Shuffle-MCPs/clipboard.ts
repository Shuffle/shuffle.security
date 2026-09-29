/**
 * Self-contained clipboard export for the Singul / Shuffle-MCPs bundle.
 */

import { fallbackCopyText, installClipboardPolyfill } from '@/lib/browser-shims';

export { fallbackCopyText as fallbackCopyToClipboard, installClipboardPolyfill };

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to offscreen textarea fallback
    }
  }

  return fallbackCopyText(text);
}
