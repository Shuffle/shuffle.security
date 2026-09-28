/**
 * RFC 4122 v4 UUID generator and global polyfill for crypto.randomUUID.
 *
 * In modern browsers, `crypto.randomUUID()` is restricted to Secure Contexts
 * (HTTPS or localhost). When Shuffle Security is accessed over plain HTTP via
 * an IP address or internal hostname (e.g. http://8.234.112.65:3002),
 * `crypto.randomUUID` is undefined, throwing:
 *   TypeError: crypto.randomUUID is not a function
 *
 * This module ensures:
 * 1. A resilient `safeRandomUUID()` function that works in all contexts:
 *    - Uses native `crypto.randomUUID()` if available
 *    - Falls back to `crypto.getRandomValues()` (which IS allowed in insecure contexts)
 *    - Falls back to `Math.random()` in extreme environments
 * 2. A global shim installed on `crypto` and `Crypto.prototype` so any third-party
 *    or inline calls to `crypto.randomUUID()` succeed transparently.
 */

const getGlobalCrypto = (): Crypto | undefined => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  if (typeof self !== 'undefined' && self.crypto) {
    return self.crypto;
  }
  return undefined;
};

/**
 * Generates an RFC 4122 v4 compliant UUID string.
 * Safe to call in both secure and insecure contexts (plain HTTP, older browsers, SSR).
 */
export function safeRandomUUID(): string {
  const c = getGlobalCrypto();

  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      // Continue to getRandomValues fallback
    }
  }

  if (c && typeof c.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      // Per RFC 4122 section 4.4:
      // Set the 4 most significant bits of the 7th byte to 0100 (version 4)
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      // Set the 2 most significant bits of the 9th byte to 10 (variant 1)
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      // Continue to Math.random fallback
    }
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const uuid = safeRandomUUID;

/**
 * Installs `randomUUID` on `crypto` and `Crypto.prototype` if not already present.
 */
export function installCryptoRandomUuidPolyfill(): void {
  const g = (typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
    ? window
    : typeof self !== 'undefined'
    ? self
    : {}) as {
    crypto?: Crypto;
    Crypto?: { prototype: Crypto };
  };

  if (!g.crypto) {
    try {
      g.crypto = {} as Crypto;
    } catch {
      // Ignore if read-only
    }
  }

  const polyfillFn = function randomUUID(): string {
    return safeRandomUUID();
  };

  if (typeof g.Crypto !== 'undefined' && g.Crypto.prototype) {
    try {
      if (typeof (g.Crypto.prototype as any).randomUUID !== 'function') {
        Object.defineProperty(g.Crypto.prototype, 'randomUUID', {
          value: polyfillFn,
          writable: true,
          configurable: true,
        });
      }
    } catch {
      // Prototype may be non-extensible
    }
  }

  if (g.crypto && typeof g.crypto.randomUUID !== 'function') {
    try {
      Object.defineProperty(g.crypto, 'randomUUID', {
        value: polyfillFn,
        writable: true,
        configurable: true,
      });
    } catch {
      try {
        (g.crypto as any).randomUUID = polyfillFn;
      } catch {
        // Crypto object may be sealed
      }
    }
  }
}

// Automatically install upon import
installCryptoRandomUuidPolyfill();
