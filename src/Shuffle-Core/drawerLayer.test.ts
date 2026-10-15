// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getOverlayStack,
  installGlobalOverlayAutoLayer,
  uninstallGlobalOverlayAutoLayer,
} from './drawerLayer';

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));
const z = (el: HTMLElement) => Number(el.style.zIndex);
const overlay = (className = 'MuiDrawer-root MuiModal-root', owned = true) => {
  const root = document.createElement('div');
  root.className = className;
  const panel = document.createElement('div');
  panel.className = `MuiPaper-root ${owned ? 'shuffle-core-scope' : ''}`;
  panel.setAttribute('role', 'dialog');
  root.append(panel);
  document.body.append(root);
  return root;
};

beforeEach(() => {
  uninstallGlobalOverlayAutoLayer();
  document.body.replaceChildren();
  getOverlayStack().splice(0);
  installGlobalOverlayAutoLayer();
});
afterEach(() => {
  uninstallGlobalOverlayAutoLayer();
  document.body.replaceChildren();
  getOverlayStack().splice(0);
});

describe('shared nested overlay opening order', () => {
  it('keeps an aria-hidden parent registered when a child opens and closes', async () => {
    const parent = overlay();
    await flush();
    const parentZ = z(parent);
    parent.setAttribute('aria-hidden', 'true');
    const child = overlay();
    await flush();
    expect(z(child)).toBeGreaterThan(parentZ);
    expect(z(parent)).toBe(parentZ);
    expect(getOverlayStack().filter((r) => r.type === 'surface')).toHaveLength(2);
    child.remove();
    parent.removeAttribute('aria-hidden');
    await flush();
    expect(z(parent)).toBe(parentZ);
    expect(getOverlayStack()).toHaveLength(1);
  });

  it('does not promote a parent above a child on pointerdown', async () => {
    const parent = overlay();
    await flush();
    const child = overlay();
    await flush();
    parent.firstElementChild?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flush();
    expect(z(child)).toBeGreaterThan(z(parent));
  });

  it('opens a drawer above its originating popup without promoting the old popup on rerender', async () => {
    const parent = overlay();
    await flush();
    const popup = overlay('MuiPopover-root MuiModal-root');
    await flush();
    const popupZ = z(popup);
    expect(popupZ).toBeGreaterThan(z(parent));
    const child = overlay();
    await flush();
    popup.style.width = '200px';
    await flush();
    expect(z(child)).toBeGreaterThan(popupZ);
    expect(z(popup)).toBe(popupZ);
  });

  it('registers a portal whose scoped panel mounts later inside a wrapper', async () => {
    const root = document.createElement('div');
    root.className = 'MuiDialog-root MuiModal-root';
    document.body.append(root);
    await flush();
    expect(getOverlayStack()).toHaveLength(0);
    root.innerHTML = '<div class="MuiDialog-container"><div class="MuiPaper-root shuffle-core-scope" role="dialog"></div></div>';
    await flush();
    expect(z(root)).toBeGreaterThan(10010);
    expect(getOverlayStack()).toHaveLength(1);
    root.querySelector('[role="dialog"]')?.setAttribute('style', 'width: 300px');
    await flush();
    expect(getOverlayStack()).toHaveLength(1);
  });

  it('does not touch host dialogs, Radix portals, menus or tooltips while a Shuffle drawer is open', async () => {
    overlay();
    await flush();
    const host = overlay('MuiDialog-root MuiModal-root', false);
    const menu = overlay('MuiMenu-root MuiPopover-root MuiModal-root', false);
    const radix = document.createElement('div');
    radix.setAttribute('data-radix-portal', '');
    radix.innerHTML = '<div role="dialog" style="z-index: 44"></div><div role="tooltip"></div>';
    document.body.append(radix);
    await flush();
    expect(host.style.zIndex).toBe('');
    expect(menu.style.zIndex).toBe('');
    expect(radix.querySelector<HTMLElement>('[role="dialog"]')?.style.zIndex).toBe('44');
    expect(radix.querySelector<HTMLElement>('[role="tooltip"]')?.style.zIndex).toBe('');
    expect(getOverlayStack()).toHaveLength(1);
  });

  it('restores original inline layers and removes owned records on cleanup', async () => {
    const root = overlay();
    root.style.setProperty('z-index', '123', 'important');
    await flush();
    expect(z(root)).toBeGreaterThan(10010);
    uninstallGlobalOverlayAutoLayer();
    expect(root.style.zIndex).toBe('123');
    expect(root.style.getPropertyPriority('z-index')).toBe('important');
    expect(root.dataset.shuffleLayerId).toBeUndefined();
    expect(getOverlayStack()).toHaveLength(0);
  });
});