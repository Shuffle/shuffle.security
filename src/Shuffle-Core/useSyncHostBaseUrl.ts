/**
 * useSyncHostBaseUrl — registers the host-injected `globalUrl` with
 * `setHostBaseUrl` so EVERY internal fetch (hooks like `useAppLookup`,
 * helpers like `appsCache`, anything using `getApiUrl()`) targets the host's
 * backend instead of the bundled default.
 *
 * Every exported Shuffle-Core / Shuffle-MCPs component runs this through its
 * library wrapper, so any of them accepts a `globalUrl` prop.
 *
 * The value is applied during render (not only in an effect) so child
 * components' first requests already use it. setHostBaseUrl is idempotent.
 * Unmounting does NOT clear the override.
 */
import { useEffect, useRef } from 'react';
import { setHostBaseUrl } from './api';

export const useSyncHostBaseUrl = (globalUrl: string | undefined | null) => {
  const applied = useRef<string | null>(null);
  if (typeof window !== 'undefined' && globalUrl && applied.current !== globalUrl) {
    applied.current = globalUrl;
    setHostBaseUrl(globalUrl);
  }
  useEffect(() => {
    if (!globalUrl) return;
    setHostBaseUrl(globalUrl);
  }, [globalUrl]);
};
