import { useEffect, useState } from 'react';
import { getDatastoreByCategory, DATASTORE_CATEGORIES, type DatastoreItem } from '@/Shuffle-Core/datastore';

const isDemoIncident = (item: DatastoreItem): boolean => {
  const key = String((item as any)?.key || '');
  if (/^demo-/i.test(key)) return true;
  let value: any = (item as any)?.value;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return false; }
  }
  return value?.metadata?.extensions?.custom_attributes?.demo === true;
};

/**
 * Counts real (non-demo) incidents in the current org. Used to decide whether
 * the Incident Handler skill should show an "ingest incidents" CTA.
 * Returns null while loading or when the lookup failed.
 */
export const useRealIncidentCount = () => {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getDatastoreByCategory(DATASTORE_CATEGORIES.INCIDENTS);
        if (cancelled) return;
        if (!res.success || !Array.isArray(res.data)) {
          setCount(null);
          return;
        }
        setCount(res.data.filter((item) => !isDemoIncident(item)).length);
      } catch {
        if (!cancelled) setCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return count;
};
