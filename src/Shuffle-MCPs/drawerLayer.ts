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
  return store[STACK_KEY] as OverlayRecord[];
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
  const currentTop = getTopSurfaceZIndex(base);
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

/**
 * True only for overlays that belong to Shuffle-Core / Shuffle-MCPs. Their MUI
 * surfaces/popups stamp a `.shuffle-core-scope` / `.shuffle-mcp-scope` class on
 * their paper; Radix portals are exclusively ours. Host apps embedding the
 * published packages (e.g. shaffuru) render their own dialogs, menus and
 * tooltips — this global observer must never rewrite their z-index.
 */
const isShuffleOwnedOverlay = (el: HTMLElement): boolean =>
  el.classList.contains('shuffle-core-scope') ||
  el.classList.contains('shuffle-mcp-scope') ||
  el.querySelector('.shuffle-core-scope, .shuffle-mcp-scope') !== null ||
  el.closest('[data-radix-portal]') !== null;

const isSurfaceElement = (el: Element): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.classList.contains('MuiDialog-root') ||
    el.classList.contains('MuiDrawer-root') ||
    (el.classList.contains('MuiModal-root') &&
      !el.classList.contains('MuiPopover-root') &&
      !el.classList.contains('MuiMenu-root')) ||
    el.getAttribute('role') === 'dialog' ||
    el.getAttribute('role') === 'alertdialog' ||
    Boolean(el.closest('[data-radix-portal]'))
  );
};

const isChildPopupElement = (el: Element): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.classList.contains('MuiPopover-root') ||
    el.classList.contains('MuiMenu-root') ||
    el.classList.contains('MuiAutocomplete-popper') ||
    Boolean(el.closest('[data-radix-popper-content-wrapper]')) ||
    (el.classList.contains('MuiPopper-root') && !el.classList.contains('MuiTooltip-popper'))
  );
};

const isTooltipElement = (el: Element): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  return el.classList.contains('MuiTooltip-popper') || el.getAttribute('role') === 'tooltip';
};

const isElementOpen = (el: HTMLElement): boolean => {
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.getAttribute('data-state') === 'closed') return false;
  if (el.classList.contains('MuiModal-hidden')) return false;
  const style = el.style;
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
};

let observerInstance: MutationObserver | null = null;

export const installGlobalOverlayAutoLayer = (): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const store = getStore();
  if (store[AUTO_LAYER_KEY]) return;
  store[AUTO_LAYER_KEY] = true;

  const handleElementOpen = (el: HTMLElement) => {
    // Only ever manage Shuffle's own overlays — never the host app's dialogs,
    // menus or tooltips (covers all three paths below in one place).
    if (!isShuffleOwnedOverlay(el)) return;
    if (isSurfaceElement(el)) {
      let layerId = el.dataset.shuffleLayerId;
      if (!layerId) {
        layerId = 'dom_' + Math.random().toString(36).substring(2, 9);
        el.dataset.shuffleLayerId = layerId;
      }
      const targetZ = allocateSurfaceLayer(layerId, el);
      el.dataset.shuffleLayerZ = String(targetZ);
      el.style.setProperty('z-index', String(targetZ), 'important');

      // Radix / custom dialog portals: also elevate dialog content container
      const dialogContent = el.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      if (dialogContent && dialogContent !== el) {
        dialogContent.style.setProperty('z-index', String(targetZ), 'important');
      }
      return;
    }

    if (isChildPopupElement(el)) {
      const topZ = getTopSurfaceZIndex();
      const popupZ = topZ + POPUP_OFFSET;
      el.dataset.shuffleLayerZ = String(popupZ);
      el.style.setProperty('z-index', String(popupZ), 'important');
      return;
    }

    if (isTooltipElement(el)) {
      const topZ = getTopSurfaceZIndex();
      const tooltipZ = topZ + TOOLTIP_OFFSET;
      el.dataset.shuffleLayerZ = String(tooltipZ);
      el.style.setProperty('z-index', String(tooltipZ), 'important');
      return;
    }
  };

  const handleElementClose = (el: HTMLElement) => {
    const layerId = el.dataset.shuffleLayerId;
    if (layerId) {
      releaseOverlayLayer(layerId);
      delete el.dataset.shuffleLayerId;
      delete el.dataset.shuffleLayerZ;
    } else {
      releaseOverlayLayer(el);
    }
  };

  const scanNode = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    if (isSurfaceElement(node) || isChildPopupElement(node) || isTooltipElement(node)) {
      if (isElementOpen(node)) {
        handleElementOpen(node);
      } else {
        handleElementClose(node);
      }
    }
    // Scan direct children for nested portals or wrappers
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child instanceof HTMLElement) {
        if (isSurfaceElement(child) || isChildPopupElement(child) || isTooltipElement(child)) {
          if (isElementOpen(child)) {
            handleElementOpen(child);
          } else {
            handleElementClose(child);
          }
        }
      }
    }
  };

  observerInstance = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(scanNode);
        m.removedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            handleElementClose(node);
          }
        });
      } else if (m.type === 'attributes') {
        const target = m.target;
        if (target instanceof HTMLElement) {
          scanNode(target);
        }
      }
    }
  });

  const body = document.body;
  if (body) {
    observerInstance.observe(body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden', 'data-state'],
    });

    // Scan initial open elements in document.body
    Array.from(body.children).forEach(scanNode);
  }

  // When clicking an open surface that is partially covered, bring it forward
  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const surface = target.closest<HTMLElement>(
        '.MuiDialog-root, .MuiDrawer-root, .MuiModal-root:not(.MuiPopover-root):not(.MuiMenu-root), [role="dialog"], [role="alertdialog"]'
      );
      if (!surface || !surface.dataset.shuffleLayerId) return;
      const currentZ = Number(surface.dataset.shuffleLayerZ || 0);
      const topZ = getTopSurfaceZIndex();
      if (currentZ > 0 && currentZ < topZ) {
        const newZ = bringSurfaceToFront(surface.dataset.shuffleLayerId);
        surface.dataset.shuffleLayerZ = String(newZ);
        surface.style.setProperty('z-index', String(newZ), 'important');
      }
    },
    true
  );
};

// Automatically self-initialize in browser environments on import
if (typeof window !== 'undefined') {
  installGlobalOverlayAutoLayer();
}
