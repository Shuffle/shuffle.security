/**
 * Universal dynamic stacking order for overlays (drawers, dialogs, modals, popovers, tooltips).
 *
 * Core rule: NEW SHOULD ALWAYS SHOW UP OVER OLD.
 *
 * Whenever any modal, drawer, or dialog opens anywhere in the application, it
 * dynamically claims the next layer above whatever is currently the forward-most
 * surface. When it closes, the stack recalculates and restores the layer underneath.
 *
 * The stack lives on globalThis so all Shuffle modules, packages, and components
 * share one runtime context.
 */
import { useEffect, useState } from 'react';

const STACK_KEY = '__shuffleOverlayStack';
const COUNTER_KEY = '__shuffleDrawerLayerTop';
const AUTO_LAYER_KEY = '__shuffleOverlayAutoLayerInstalled';

/** Baseline layer: above sticky headers, sidebars, and page content (9999). */
export const OVERLAY_BASE = 10010;
export const DRAWER_LAYER_BASE = OVERLAY_BASE;

/** Spacing between distinct overlay surfaces (drawer, dialog, modal). */
export const SURFACE_STEP = 20;

/** Headroom allocated within each surface tier for menus and tooltips. */
export const POPUP_OFFSET = 6;
export const TOOLTIP_OFFSET = 12;

export interface OverlayRecord {
  id: string;
  element?: HTMLElement | null;
  zIndex: number;
  type: 'surface' | 'popup' | 'tooltip';
}

const getStore = (): Record<string, unknown> => globalThis as Record<string, unknown>;

export const getOverlayStack = (): OverlayRecord[] => {
  const store = getStore();
  if (!Array.isArray(store[STACK_KEY])) {
    store[STACK_KEY] = [];
  }
  const stack = store[STACK_KEY] as OverlayRecord[];
  for (let i = stack.length - 1; i >= 0; i--) {
    const el = stack[i].element;
    if (el && !el.isConnected) {
      stack.splice(i, 1);
    }
  }
  return stack;
};

export const getTopSurfaceZIndex = (base: number = OVERLAY_BASE): number => {
  const stack = getOverlayStack();
  const surfaces = stack.filter((r) => r.type === 'surface');
  if (surfaces.length === 0) {
    const store = getStore();
    store[COUNTER_KEY] = base;
    return base;
  }
  let maxZ = base;
  for (const s of surfaces) {
    if (s.zIndex > maxZ) {
      maxZ = s.zIndex;
    }
  }
  getStore()[COUNTER_KEY] = maxZ;
  return maxZ;
};

const syncGlobalCounter = (base: number = OVERLAY_BASE) => {
  getTopSurfaceZIndex(base);
};

export const getPopupZIndex = (
  offset: number = POPUP_OFFSET,
  minZ: number = 10040
): number => Math.max(getTopSurfaceZIndex() + offset, minZ);

export const allocateSurfaceLayer = (
  id: string,
  element?: HTMLElement | null,
  base: number = OVERLAY_BASE
): number => {
  const stack = getOverlayStack();
  const existing = stack.find((r) => r.id === id || (element && r.element === element));
  if (existing) {
    return existing.zIndex;
  }
  const currentTop = Math.max(getTopSurfaceZIndex(base), ...stack.map((r) => r.zIndex));
  const nextZ = currentTop + SURFACE_STEP;
  stack.push({ id, element, zIndex: nextZ, type: 'surface' });
  syncGlobalCounter(base);
  return nextZ;
};

export const releaseOverlayLayer = (idOrElement: string | HTMLElement): void => {
  const stack = getOverlayStack();
  const index = stack.findIndex(
    (r) => r.id === idOrElement || (typeof idOrElement !== 'string' && r.element === idOrElement)
  );
  if (index !== -1) {
    stack.splice(index, 1);
  }
  syncGlobalCounter();
};

export const bringSurfaceToFront = (idOrElement: string | HTMLElement): number => {
  const stack = getOverlayStack();
  const record = stack.find(
    (r) => r.id === idOrElement || (typeof idOrElement !== 'string' && r.element === idOrElement)
  );
  if (!record || record.type !== 'surface') {
    return typeof idOrElement === 'string'
      ? allocateSurfaceLayer(idOrElement, null)
      : allocateSurfaceLayer('surface_' + Math.random().toString(36).substring(2, 9), idOrElement);
  }
  const currentTop = getTopSurfaceZIndex();
  if (record.zIndex >= currentTop) {
    return record.zIndex;
  }
  record.zIndex = currentTop + SURFACE_STEP;
  syncGlobalCounter();
  return record.zIndex;
};

/**
 * React hook: returns a dynamic z-index for an overlay surface.
 * Guarantees that opening a new surface gets a z-index higher than the current
 * forward-most surface. Out-of-order closing is supported without desync.
 */
export const useOverlayLayer = (
  open: boolean,
  options?: { base?: number; step?: number }
): number => {
  const base = options?.base ?? OVERLAY_BASE;
  const [zIndex, setZIndex] = useState(() => (open ? getTopSurfaceZIndex(base) + SURFACE_STEP : base));

  useEffect(() => {
    if (!open) return;
    const id = 'hook_' + Math.random().toString(36).substring(2, 9);
    const allocated = allocateSurfaceLayer(id, null, base);
    setZIndex(allocated);
    return () => {
      releaseOverlayLayer(id);
    };
  }, [open, base]);

  return zIndex;
};

/**
 * Backward-compatible alias for existing drawer components.
 */
export const useDrawerLayer = (open: boolean, base: number = DRAWER_LAYER_BASE): number =>
  useOverlayLayer(open, { base });

/* -------------------------------------------------------------------------- */
/* Fully Dynamic Runtime DOM Observer                                         */
/* Automatically ensures that NEW surfaces ALWAYS open OVER OLD surfaces.     */
/* -------------------------------------------------------------------------- */

// Only portal roots own a layer; MUI dialog papers are not separate surfaces.
const MUI_SURFACE_SELECTOR = '.MuiDialog-root, .MuiDrawer-root.MuiModal-root, .MuiModal-root:not(.MuiPopover-root):not(.MuiMenu-root)';
const SURFACE_SELECTOR = `${MUI_SURFACE_SELECTOR}, [role="dialog"], [role="alertdialog"]`;
const POPUP_SELECTOR = '.MuiPopover-root, .MuiMenu-root, .MuiAutocomplete-popper, .MuiPopper-root:not(.MuiTooltip-popper), [data-radix-popper-content-wrapper], [data-shuffle-backdrop]';
const TOOLTIP_SELECTOR = '.MuiTooltip-popper, [role="tooltip"]';
const OVERLAY_SELECTOR = `${SURFACE_SELECTOR}, ${POPUP_SELECTOR}, ${TOOLTIP_SELECTOR}`;
const SHUFFLE_SCOPE_SELECTOR = '.shuffle-core-scope, .shuffle-mcp-scope, .shuffle-app-overlay, [data-shuffle-layer]';
const OWN_PANEL_SELECTOR = ':scope > .MuiPaper-root, :scope > .MuiDialog-container > .MuiPaper-root, :scope > [role="dialog"], :scope > [role="alertdialog"], :scope > [role="tooltip"], :scope > .MuiTooltip-tooltip';

const isSurfaceElement = (el: HTMLElement): boolean =>
  el.matches(SURFACE_SELECTOR) &&
  (el.matches(MUI_SURFACE_SELECTOR) || !el.parentElement?.closest(`${MUI_SURFACE_SELECTOR}, [data-radix-popper-content-wrapper]`));

const isShuffleOwnedOverlay = (el: HTMLElement): boolean =>
  el.matches(SHUFFLE_SCOPE_SELECTOR) ||
  Array.from(el.querySelectorAll<HTMLElement>(OWN_PANEL_SELECTOR)).some((panel) => panel.matches(SHUFFLE_SCOPE_SELECTOR)) ||
  (el.matches('[data-radix-popper-content-wrapper]') &&
    Array.from(el.children).some((child) => child.matches(SHUFFLE_SCOPE_SELECTOR)));

const isElementOpen = (el: HTMLElement): boolean => {
  // MUI aria-hides an underlying OPEN modal when a child opens. Do not release it.
  if (!el.matches(MUI_SURFACE_SELECTOR) && el.getAttribute('aria-hidden') === 'true') return false;
  if (el.getAttribute('data-state') === 'closed' || el.classList.contains('MuiModal-hidden')) return false;
  return el.style.display !== 'none' && el.style.visibility !== 'hidden';
};

let observerInstance: MutationObserver | null = null;
let cleanupObserver: (() => void) | null = null;

export const uninstallGlobalOverlayAutoLayer = (): void => {
  cleanupObserver?.();
  cleanupObserver = null;
  observerInstance?.disconnect();
  observerInstance = null;
  delete getStore()[AUTO_LAYER_KEY];
};

export const installGlobalOverlayAutoLayer = (): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) return;
  const store = getStore();
  if (store[AUTO_LAYER_KEY]) return;
  store[AUTO_LAYER_KEY] = true;

  const originals = new Map<HTMLElement, { value: string; priority: string }>();
  const writeLayer = (el: HTMLElement, zIndex: number) => {
    if (!originals.has(el)) {
      originals.set(el, { value: el.style.getPropertyValue('z-index'), priority: el.style.getPropertyPriority('z-index') });
    }
    const value = String(zIndex);
    el.dataset.shuffleLayerZ = value;
    if (el.style.zIndex !== value || el.style.getPropertyPriority('z-index') !== 'important') {
      el.style.setProperty('z-index', value, 'important');
    }
  };

  const handleElementClose = (el: HTMLElement) => {
    // Only undo elements this installation actually managed.
    const original = originals.get(el);
    if (!original) return;
    releaseOverlayLayer(el);
    delete el.dataset.shuffleLayerId;
    if (el.style.zIndex === el.dataset.shuffleLayerZ) {
      if (original.value) el.style.setProperty('z-index', original.value, original.priority);
      else el.style.removeProperty('z-index');
    }
    originals.delete(el);
    delete el.dataset.shuffleLayerZ;
  };

  const handleElementOpen = (el: HTMLElement) => {
    if (!isShuffleOwnedOverlay(el)) {
      handleElementClose(el);
      return;
    }
    const stack = getOverlayStack();
    let record = stack.find((r) => r.element === el);
    if (!record) {
      const id = 'dom_' + Math.random().toString(36).substring(2, 9);
      if (isSurfaceElement(el)) {
        const zIndex = allocateSurfaceLayer(id, el);
        writeLayer(el, zIndex);
      } else {
        const tooltip = el.matches(TOOLTIP_SELECTOR);
        const top = Math.max(getTopSurfaceZIndex(), ...stack.map((r) => r.zIndex));
        record = { id, element: el, zIndex: top + (tooltip ? TOOLTIP_OFFSET : POPUP_OFFSET), type: tooltip ? 'tooltip' : 'popup' };
        stack.push(record);
        writeLayer(el, record.zIndex);
      }
      el.dataset.shuffleLayerId = id;
    } else {
      // Keep opening order, even if the underlying drawer re-renders or aria-hidden changes.
      writeLayer(el, record.zIndex);
    }
  };

  const scanNode = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    const candidates = [node, ...Array.from(node.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR))];
    for (const el of candidates) {
      if (!isSurfaceElement(el) && !el.matches(POPUP_SELECTOR) && !el.matches(TOOLTIP_SELECTOR)) continue;
      if (el.isConnected && isElementOpen(el)) handleElementOpen(el);
      else handleElementClose(el);
    }
  };

  observerInstance = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(scanNode);
        m.removedNodes.forEach(scanNode);
        // Portals sometimes mount their empty root before their scoped paper.
        if (m.target instanceof HTMLElement) {
          const root = m.target.closest<HTMLElement>(OVERLAY_SELECTOR);
          if (root) scanNode(root);
        }
      } else if (m.target instanceof HTMLElement) {
        scanNode(m.target);
      }
    }
  });
  observerInstance.observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'aria-hidden', 'data-state'],
  });
  Array.from(document.body.children).forEach(scanNode);
  // Never promote an old parent on pointerdown: it would cover its children.
  cleanupObserver = () => {
    observerInstance?.disconnect();
    for (const el of Array.from(originals.keys())) handleElementClose(el);
  };
};

if (typeof window !== 'undefined') installGlobalOverlayAutoLayer();
