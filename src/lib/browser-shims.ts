/**
 * Global Browser Compatibility Shims & Defensive Resilience Layer.
 *
 * Prevents runtime crashes caused by restricted, undefined, or throwing
 * browser APIs in insecure contexts (plain HTTP/IP, e.g. http://8.234.112.65:3002),
 * older browsers, embedded WebViews, sandboxed iframes, and SSR environments.
 *
 * Polyfills and defensive wrappers included:
 * 1. crypto.randomUUID (via crypto-polyfill)
 * 2. navigator.clipboard.writeText / readText (with fallback to textarea + execCommand)
 * 3. globalThis.ResizeObserver (safe no-op fallback)
 * 4. globalThis.IntersectionObserver (safe no-op fallback)
 * 5. window.matchMedia (safe media query list fallback)
 * 6. globalThis.structuredClone (safe JSON/object clone fallback)
 * 7. performance.now (Date.now fallback)
 * 8. Element.prototype.scrollIntoView (safe option normalization)
 */

import { installCryptoRandomUuidPolyfill } from './crypto-polyfill';

/**
 * Headless fallback copy using an offscreen textarea and document.execCommand('copy').
 * Operates reliably in insecure contexts (HTTP/IP) where navigator.clipboard is absent.
 */
export function fallbackCopyText(text: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text ?? '';
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '2em';
    textarea.style.height = '2em';
    textarea.style.padding = '0';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.background = 'transparent';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    if (typeof textarea.setSelectionRange === 'function') {
      textarea.setSelectionRange(0, textarea.value.length);
    }
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return Boolean(success);
  } catch {
    return false;
  }
}

/**
 * Installs navigator.clipboard polyfill and wraps existing writeText with fallback.
 */
export function installClipboardPolyfill(): void {
  if (typeof navigator === 'undefined') return;

  const polyfilledClipboard = {
    writeText: async (text: string): Promise<void> => {
      fallbackCopyText(text);
    },
    readText: async (): Promise<string> => '',
  };

  try {
    const nav = navigator as unknown as { clipboard?: typeof polyfilledClipboard };
    const navProto = typeof Navigator !== 'undefined'
      ? Navigator.prototype
      : Object.getPrototypeOf(navigator);

    if (!nav.clipboard) {
      let installedOnProto = false;
      if (navProto) {
        try {
          Object.defineProperty(navProto, 'clipboard', {
            get: () => polyfilledClipboard,
            configurable: true,
            enumerable: true,
          });
          installedOnProto = true;
        } catch {
          installedOnProto = false;
        }
      }

      if (!installedOnProto) {
        try {
          Object.defineProperty(navigator, 'clipboard', {
            value: polyfilledClipboard,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch {
          try {
            (navigator as any).clipboard = polyfilledClipboard;
          } catch {
            // Navigator may be sealed
          }
        }
      }
    } else if (typeof nav.clipboard.writeText === 'function') {
      // Wrap existing writeText so focus/permission DOMExceptions don't crash
      const originalWriteText = nav.clipboard.writeText.bind(nav.clipboard);
      const safeWriteText = async (text: string): Promise<void> => {
        try {
          await originalWriteText(text);
        } catch {
          fallbackCopyText(text);
        }
      };

      try {
        nav.clipboard.writeText = safeWriteText;
      } catch {
        try {
          Object.defineProperty(nav.clipboard, 'writeText', {
            value: safeWriteText,
            writable: true,
            configurable: true,
          });
        } catch {
          // Ignore if sealed
        }
      }
    }
  } catch {
    // Top-level protective catch
  }
}

/**
 * Installs fallback for ResizeObserver if not defined in the environment.
 */
export function installResizeObserverPolyfill(): void {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverPolyfill {
      constructor(_callback: unknown) {}
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }

    try {
      (globalThis as any).ResizeObserver = ResizeObserverPolyfill;
    } catch {}

    if (typeof window !== 'undefined') {
      try {
        (window as any).ResizeObserver = ResizeObserverPolyfill;
      } catch {}
    }
  }
}

/**
 * Installs fallback for IntersectionObserver if not defined in the environment.
 */
export function installIntersectionObserverPolyfill(): void {
  if (typeof globalThis.IntersectionObserver === 'undefined') {
    class IntersectionObserverPolyfill {
      readonly root: Element | Document | null = null;
      readonly rootMargin: string = '0px';
      readonly thresholds: ReadonlyArray<number> = [0];
      constructor(_callback: unknown, _options?: unknown) {}
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }

    try {
      (globalThis as any).IntersectionObserver = IntersectionObserverPolyfill;
    } catch {}

    if (typeof window !== 'undefined') {
      try {
        (window as any).IntersectionObserver = IntersectionObserverPolyfill;
      } catch {}
    }
  }
}

/**
 * Installs fallback for window.matchMedia if not defined.
 */
export function installMatchMediaPolyfill(): void {
  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    try {
      window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as any;
    } catch {}
  }
}

/**
 * Installs fallback for structuredClone if not defined.
 */
export function installStructuredClonePolyfill(): void {
  if (typeof globalThis.structuredClone !== 'function') {
    try {
      globalThis.structuredClone = function structuredClone<T>(value: T): T {
        if (value === undefined) return undefined as unknown as T;
        try {
          return JSON.parse(JSON.stringify(value));
        } catch {
          return value;
        }
      };
    } catch {}
  }
}

/**
 * Installs fallback for performance.now if not defined.
 */
export function installPerformanceNowPolyfill(): void {
  try {
    if (typeof globalThis.performance === 'undefined') {
      (globalThis as any).performance = { now: () => Date.now() };
    } else if (typeof globalThis.performance.now !== 'function') {
      globalThis.performance.now = () => Date.now();
    }
  } catch {}
}

/**
 * Normalizes Element.prototype.scrollIntoView to gracefully swallow option dictionary errors.
 */
export function installScrollIntoViewShim(): void {
  if (typeof Element === 'undefined' || !Element.prototype) return;
  try {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    if (typeof originalScrollIntoView !== 'function') {
      Element.prototype.scrollIntoView = function () {};
    } else {
      Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions) {
        try {
          originalScrollIntoView.call(this, arg);
        } catch {
          try {
            const top = typeof arg === 'object' && arg !== null
              ? (arg.block === 'end' ? false : true)
              : Boolean(arg);
            originalScrollIntoView.call(this, top);
          } catch {
            // Ignore failure
          }
        }
      };
    }
  } catch {}
}

/**
 * Installs the complete suite of browser defensive shims and polyfills.
 */
export function installAllBrowserShims(): void {
  installCryptoRandomUuidPolyfill();
  installClipboardPolyfill();
  installResizeObserverPolyfill();
  installIntersectionObserverPolyfill();
  installMatchMediaPolyfill();
  installStructuredClonePolyfill();
  installPerformanceNowPolyfill();
  installScrollIntoViewShim();
}

// Automatically install upon import
installAllBrowserShims();
