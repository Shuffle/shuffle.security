/**
 * Auto-initialize default IOC Types for an org if they haven't been set up yet.
 * Call once when /incidents loads.
 *
 * Delegates to the canonical `seedDefaultIOCTypes` so this auto-init path,
 * the IOC Types page reset button, and the demo-mode bootstrap all share
 * the exact same write logic.
 *
 * NOTE: Threat Feeds are intentionally NOT auto-seeded here. The Threat Feeds
 * page must always reflect the real contents of the datastore — defaults are
 * only inserted when the user explicitly clicks "Reset to Defaults".
 */

import { getDatastoreByCategory, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import { seedDefaultIOCTypes } from '@/hooks/useIOCTypes';

let _initialized = false;

export const ensureDefaultsInitialized = async () => {
  if (_initialized) return;
  _initialized = true;

  try {
    const iocsRes = await getDatastoreByCategory(DATASTORE_CATEGORIES.IOCS);

    // Initialize IOC types if empty — never touch existing user choices.
    if (!iocsRes.success || !iocsRes.data || iocsRes.data.length === 0) {
      await seedDefaultIOCTypes();
    }
  } catch {
    // Non-critical — defaults will be used in-memory as fallback
    _initialized = false;
  }
};
