/**
 * Shuffle-Core local utils.
 *
 * Mirrors the subset of `src/lib/utils.ts` from the host app that the
 * Shuffle-Core onboarding flow needs: `cn` for class composition, plus
 * the `AuthAppEntry` type and `deduplicateAuthApps` helper.
 *
 * Kept here so the published `@shuffleio/shuffle-core` package does not
 * reach into the host app's `@/lib/utils`.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface AuthAppEntry {
  app: {
    id: string;
    name: string;
    large_image?: string;
    categories?: string[];
  };
  active?: boolean;
  validation?: {
    valid: boolean;
    error?: string;
    last_valid?: number;
  };
  label?: string;
  id?: string;
}

export interface DeduplicatedApp {
  app: AuthAppEntry['app'];
  hasValidAuth: boolean;
  bestImage: string;
  instances: { label: string; isValidated: boolean }[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function isValidationFresh(validation?: { valid?: boolean; last_valid?: number; error?: string } | null): boolean {
  if (validation?.valid !== true) return false;
  if (!validation.last_valid) return true;
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const lastValidMs = validation.last_valid > 1e12 ? validation.last_valid : validation.last_valid * 1000;
  return lastValidMs >= cutoff;
}

export function deduplicateAuthApps(apps: AuthAppEntry[]): DeduplicatedApp[] {
  const appMap = new Map<string, DeduplicatedApp>();

  apps.forEach(auth => {
    if (!auth.app?.name) return;
    if (!auth.active && !isValidationFresh(auth.validation)) return;

    const normalizedName = auth.app.name.toLowerCase().trim().replace(/[\s_\-]+/g, '_');
    const existing = appMap.get(normalizedName);
    const isValidated = isValidationFresh(auth.validation);
    const entryImage = auth.app.large_image || '';
    const instance = {
      label: auth.label || auth.id || 'Default',
      isValidated,
    };

    if (!existing) {
      appMap.set(normalizedName, {
        app: auth.app,
        hasValidAuth: isValidated,
        bestImage: entryImage,
        instances: [instance],
      });
    } else {
      existing.instances.push(instance);
      if (isValidated) existing.hasValidAuth = true;
      if (!existing.bestImage && entryImage) {
        existing.bestImage = entryImage;
      }
      if (isValidated && !existing.app.large_image && entryImage) {
        existing.app = { ...existing.app, large_image: entryImage };
      }
    }
  });

  return Array.from(appMap.values());
}
