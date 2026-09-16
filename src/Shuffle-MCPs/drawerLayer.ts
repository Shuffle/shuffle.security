/**
 * Shared stacking order for drawers.
 *
 * Drawers used to hardcode their own z-index, so a drawer opened from inside
 * another drawer could land underneath it (for example the notifications
 * drawer opened from the execution drawer). Every drawer now asks this module
 * for a layer while it is open, so a nested drawer always sits on top of the
 * one that opened it. The counter lives on globalThis so all Shuffle packages
 * share one stack at runtime.
 */
import { useEffect, useState } from 'react';

const COUNTER_KEY = '__shuffleDrawerLayerTop';

/** Baseline layer: above sticky headers, dialogs and popovers. */
export const DRAWER_LAYER_BASE = 10011;

const STEP = 10;

const getTop = (base: number): number => {
  const store = globalThis as Record<string, unknown>;
  const current = store[COUNTER_KEY];
  return typeof current === 'number' ? current : base;
};

/**
 * Returns the z-index this drawer should render at. Each drawer that opens
 * takes the next layer above whatever is already open and releases it on close.
 */
export const useDrawerLayer = (open: boolean, base: number = DRAWER_LAYER_BASE): number => {
  const [zIndex, setZIndex] = useState(base);

  useEffect(() => {
    if (!open) return;
    const store = globalThis as Record<string, unknown>;
    const next = Math.max(base, getTop(base) + STEP);
    store[COUNTER_KEY] = next;
    setZIndex(next);
    return () => {
      if (store[COUNTER_KEY] === next) {
        store[COUNTER_KEY] = next - STEP;
      }
    };
  }, [open, base]);

  return zIndex;
};
