import { useEffect, useState } from 'react';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { DEMO_HOST_HOSTNAME } from '@/services/demoLiveEnvironment';
import { fetchEnvironmentsCached } from '@/Shuffle-Core/views/appsFetchCache';

let _cachedRealHostCount: number | null = null;
let _cachedRealHostCountTs = 0;
const HOST_COUNT_TTL_MS = 60_000;

/**
 * Counts real (non-demo) host monitors registered on the current org's
 * environments. Used to decide whether the "Add Host Monitor" CTA should stay
 * highlighted on /vulnerabilities.
 */
export const useHostMonitorCount = () => {
  const [count, setCount] = useState<number | null>(() => {
    if (_cachedRealHostCount !== null && Date.now() - _cachedRealHostCountTs < HOST_COUNT_TTL_MS) {
      return _cachedRealHostCount;
    }
    return _cachedRealHostCount;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchEnvironmentsCached(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        const envs = Array.isArray(data) ? data : data?.environments || [];
        const hosts = envs.flatMap((e: any) => (Array.isArray(e?.sensor_hosts) ? e.sensor_hosts : []));
        const real = hosts.filter((h: any) => {
          const uuid = String(h?.uuid || '');
          const hostname = String(h?.hostname || '');
          if (/^demo-/i.test(uuid)) return false;
          if (hostname.toLowerCase() === DEMO_HOST_HOSTNAME.toLowerCase()) return false;
          return true;
        });
        _cachedRealHostCount = real.length;
        _cachedRealHostCountTs = Date.now();
        if (!cancelled) setCount(real.length);
      } catch {
        if (!cancelled && count === null) setCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
};
