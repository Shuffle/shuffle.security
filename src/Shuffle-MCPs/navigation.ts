/**
 * Navigation utility for Shuffle-MCPs.
 * Opens URLs, optionally delegating to a host-registered cross-domain auth handoff
 * handler if available on window.__shuffleNavigateToCore.
 */

export async function navigateToShuffleCore(
  url: string,
  options?: { newTab?: boolean }
): Promise<void> {
  if (typeof window !== 'undefined' && typeof (window as any).__shuffleNavigateToCore === 'function') {
    return (window as any).__shuffleNavigateToCore(url, options);
  }
  if (typeof window !== 'undefined') {
    if (options?.newTab) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  }
}

export function isShuffleCoreUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return parsed.hostname.includes('shuffler.io');
  } catch {
    return url.includes('shuffler.io');
  }
}
