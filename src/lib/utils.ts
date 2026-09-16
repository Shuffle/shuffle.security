import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert HTML to readable plain text.
 * - Converts block elements (div, p, br) to newlines
 * - Decodes HTML entities (&nbsp;, &amp;, etc.)
 * - Strips remaining HTML tags
 * - Normalizes whitespace while preserving intentional line breaks
 */

// Pre-compiled regexes to avoid creating them on every call
const HTML_BLOCK_END_RE = /<\/(div|p|h[1-6]|li|tr|td|th)>/gi;
const HTML_BR_RE = /<br\s*\/?>/gi;
const HTML_LIST_RE = /<\/?(ul|ol|table|tbody|thead)>/gi;
const HTML_TAG_RE = /<[^>]*>/g;
const HTML_NUMERIC_ENTITY_RE = /&#(\d+);/g;
const HTML_HEX_ENTITY_RE = /&#x([a-fA-F0-9]+);/g;
const MULTI_NEWLINE_RE = /\n{3,}/g;
const SPACE_NOT_NEWLINE_RE = /[^\S\n]+/g;

// Pre-compiled entity regexes
const ENTITY_MAP: [RegExp, string][] = [
  [/&nbsp;/gi, ' '],
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#39;/gi, "'"],
  [/&apos;/gi, "'"],
  [/&ndash;/gi, '–'],
  [/&mdash;/gi, '—'],
  [/&hellip;/gi, '…'],
  [/&copy;/gi, '©'],
  [/&reg;/gi, '®'],
  [/&trade;/gi, '™'],
  [/&bull;/gi, '•'],
  [/&ldquo;/gi, '\u201C'],
  [/&rdquo;/gi, '\u201D'],
  [/&lsquo;/gi, '\u2018'],
  [/&rsquo;/gi, '\u2019'],
  [/&laquo;/gi, '«'],
  [/&raquo;/gi, '»'],
  [/&deg;/gi, '°'],
  [/&micro;/gi, 'µ'],
  [/&para;/gi, '¶'],
  [/&sect;/gi, '§'],
  [/&times;/gi, '×'],
  [/&divide;/gi, '÷'],
  [/&plusmn;/gi, '±'],
];

export function htmlToPlainText(html: string): string {
  if (!html) return '';
  
  let text = html;
  
  // Convert block-level elements to newlines before stripping tags
  text = text.replace(HTML_BLOCK_END_RE, '\n');
  text = text.replace(HTML_BR_RE, '\n');
  text = text.replace(HTML_LIST_RE, '\n');
  
  // Strip all remaining HTML tags
  text = text.replace(HTML_TAG_RE, '');
  
  // Decode common HTML entities using pre-compiled regexes
  for (const [re, char] of ENTITY_MAP) {
    text = text.replace(re, char);
  }
  
  // Decode numeric entities (&#60; &#x3C; etc.)
  text = text.replace(HTML_NUMERIC_ENTITY_RE, (_, num) => String.fromCharCode(parseInt(num, 10)));
  text = text.replace(HTML_HEX_ENTITY_RE, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  // Normalize multiple consecutive newlines to max 2
  text = text.replace(MULTI_NEWLINE_RE, '\n\n');
  
  // Normalize spaces (but not newlines)
  text = text.replace(SPACE_NOT_NEWLINE_RE, ' ');
  
  // Trim each line
  text = text.split('\n').map(line => line.trim()).join('\n');
  
  // Trim the whole result
  return text.trim();
}

/**
 * Decode HTML entities in a string (lightweight, no tag stripping).
 * Handles named entities (&amp; &#39; etc.) and numeric/hex entities.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes('&')) return text;
  let result = text;
  for (const [re, char] of ENTITY_MAP) {
    result = result.replace(re, char);
  }
  result = result.replace(HTML_NUMERIC_ENTITY_RE, (_, num) => String.fromCharCode(parseInt(num, 10)));
  result = result.replace(HTML_HEX_ENTITY_RE, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return result;
}

/**
 * Detect and decode base64-encoded strings.
 * Returns the decoded string if it looks like valid base64 and decodes to readable text,
 * otherwise returns the original string unchanged.
 */
export function decodeIfBase64(text: string): string {
  if (!text || text.length < 8) return text;

  // If the original text contains inner whitespace, it's almost certainly
  // normal prose — not a base64 blob. Bail out early so short subjects like
  // "Fw: some ticket" don't get force-decoded into garbage.
  if (/\S\s+\S/.test(text.trim())) return text;

  // Strip surrounding whitespace only (base64 from email clients sometimes has
  // trailing newlines, but real base64 never has embedded spaces).
  let stripped = text.replace(/\s+/g, '');
  if (stripped.length < 8) return text;

  // Convert URL-safe base64 (Gmail/Outlook use - and _ instead of + and /)
  stripped = stripped.replace(/-/g, '+').replace(/_/g, '/');

  // Add missing padding (Gmail often omits trailing =)
  const pad = stripped.length % 4;
  if (pad === 2) stripped += '==';
  else if (pad === 3) stripped += '=';
  else if (pad === 1) return text; // invalid base64 length

  // Must look like base64: only valid chars with optional padding
  if (!/^[A-Za-z0-9+/]+=*$/.test(stripped)) return text;

  try {
    const decoded = atob(stripped);
    if (decoded.length === 0) return text;

    // Only count STRICT ASCII printable / common whitespace as "safe".
    // High-bit (>127) bytes are treated as suspicious because random binary
    // data (short IDs, compressed/encrypted blobs) is mostly >127 and would
    // otherwise render as gibberish like ":ë[¢éÝ¦)hμú+J ~W".
    let asciiPrintable = 0;
    let hasLetter = false;
    let highBit = 0;
    for (let i = 0; i < decoded.length; i++) {
      const code = decoded.charCodeAt(i);
      if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
        asciiPrintable++;
        if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) hasLetter = true;
      } else if (code > 127) {
        highBit++;
      }
    }
    const asciiRatio = asciiPrintable / decoded.length;
    const highBitRatio = highBit / decoded.length;

    // Require the decoded output to look like real text: mostly ASCII
    // printable, contain at least one letter, and not be dominated by
    // high-bit bytes. Otherwise treat it as not-actually-base64.
    if (asciiRatio < 0.9 || !hasLetter || highBitRatio > 0.1) return text;

    // Try UTF-8 decode for multi-byte chars (safe now that we've confirmed
    // the decoded content is dominantly ASCII text).
    try {
      return decodeURIComponent(escape(decoded));
    } catch {
      return decoded;
    }
  } catch {
    // Not valid base64
  }
  return text;
}

// Shared type for authenticated app entries
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

/**
 * Deduplicate apps by normalized name.
 * - Normalizes names (lowercase, replaces spaces/underscores/hyphens)
 * - Prioritizes validated apps
 * - Collects best available image from any instance
 * - Tracks all auth instances for tooltip display
 */
export function deduplicateAuthApps(apps: AuthAppEntry[]): DeduplicatedApp[] {
  const appMap = new Map<string, DeduplicatedApp>();

  apps.forEach(auth => {
    if (!auth.app?.name) return;
    if (!auth.active && !isValidationFresh(auth.validation)) return; // Skip inactive/unvalidated
    
    // Normalize: lowercase, trim, replace spaces/underscores/hyphens for deduplication
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
      // Add instance to list
      existing.instances.push(instance);
      
      // Update hasValidAuth if this instance is valid
      if (isValidated) existing.hasValidAuth = true;
      
      // Collect best available image
      if (!existing.bestImage && entryImage) {
        existing.bestImage = entryImage;
      }
      
      // If new entry is validated and existing app wasn't from a validated source, update app info
      if (isValidated && !existing.app.large_image && entryImage) {
        existing.app = { ...existing.app, large_image: entryImage };
      }
    }
  });
  
  return Array.from(appMap.values());
}

/**
 * Module-level cache: normalized app name → image URL.
 * Persists for the lifetime of the session so Algolia is only queried once per app.
 */
const _imageCache = new Map<string, string>();
const _pendingLookups = new Map<string, Promise<string | null>>();
const _normalize = (n: string) => n.toLowerCase().replace(/[\s_\-]+/g, '_');

/** Manually seed the cache (e.g. from /api/v1/apps or auth data that already has images). */
export function seedImageCache(appName: string, imageUrl: string) {
  if (appName && imageUrl) _imageCache.set(_normalize(appName), imageUrl);
}

/**
 * Backfill missing images in deduplicated apps using a persistent in-memory cache
 * and Algolia search as a fallback. Mutates the array in-place.
 */
export async function backfillAppImages(dedupedApps: DeduplicatedApp[]): Promise<DeduplicatedApp[]> {
  // First pass: seed cache from entries that already have images, and apply cache hits
  for (const d of dedupedApps) {
    const norm = _normalize(d.app.name);
    const existingImg = d.bestImage || d.app.large_image;
    if (existingImg) {
      _imageCache.set(norm, existingImg);
    } else if (_imageCache.has(norm)) {
      d.bestImage = _imageCache.get(norm)!;
      d.app = { ...d.app, large_image: d.bestImage };
    }
  }

  // Second pass: find entries still missing images
  let missing = dedupedApps.filter(d => !d.bestImage && !d.app.large_image);
  if (missing.length === 0) return dedupedApps;

  // Fallback to the user's /api/v1/apps list (already cached, no rate limits).
  // Runs BEFORE Algolia so icons keep resolving when the public catalog 429s.
  try {
    const { fetchAppsViaApiConfig } = await import('@/Shuffle-MCPs/appsCache');
    const apps = await fetchAppsViaApiConfig().catch(() => []);
    if (Array.isArray(apps) && apps.length > 0) {
      const byName = new Map<string, string>();
      for (const a of apps) {
        const url = a?.large_image || a?.image_url;
        if (!url) continue;
        const n = _normalize(a?.name || '');
        if (n && !byName.has(n)) byName.set(n, url);
      }
      for (const entry of missing) {
        const url = byName.get(_normalize(entry.app.name));
        if (url) {
          entry.bestImage = url;
          entry.app = { ...entry.app, large_image: url };
          _imageCache.set(_normalize(entry.app.name), url);
        }
      }
      missing = dedupedApps.filter(d => !d.bestImage && !d.app.large_image);
      if (missing.length === 0) return dedupedApps;
    }
  } catch {
    // ignore
  }

  try {
    const { algoliasearch } = await import('algoliasearch');
    const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');

    await Promise.all(missing.map(async (entry) => {
      const norm = _normalize(entry.app.name);

      // De-duplicate in-flight requests for the same app name
      if (!_pendingLookups.has(norm)) {
        _pendingLookups.set(norm, (async () => {
          try {
            const result = await client.searchSingleIndex({
              indexName: 'appsearch',
              searchParams: { query: entry.app.name, hitsPerPage: 3 },
            });
            const match = (result.hits as any[]).find(
              h => _normalize(h.name || '') === norm
            );
            const url = match?.image_url || null;
            if (url) _imageCache.set(norm, url);
            return url;
          } catch {
            return null;
          } finally {
            _pendingLookups.delete(norm);
          }
        })());
      }

      const url = await _pendingLookups.get(norm);
      if (url) {
        entry.bestImage = url;
        entry.app = { ...entry.app, large_image: url };
      }
    }));
  } catch {
    // Algolia import or init failed — skip
  }

  return dedupedApps;
}

/**
 * Deduplicate tasks by exact match on title + category + description.
 * Keeps the first occurrence (preserving order and IDs).
 */
export function deduplicateTasks<T>(tasks: T[]): T[] {
  if (!tasks || tasks.length === 0) return tasks;
  const seen = new Set<string>();
  return tasks.filter(task => {
    const t = task as any;
    if (t.disabled) return false; // Hide soft-deleted tasks
    const key = `${t.title ?? ''}\0${t.category ?? ''}\0${t.description ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const AI_AGENT_HANDLE = '@AIAgent';
export const AI_AGENT_DISPLAY_NAME = 'AI Agent';

/**
 * Check if an assignee or username refers to the AI Agent.
 * Matches all standard variations:
 * - "ai-agent", "@ai-agent", "ai_agent", "@ai_agent", "aiagent", "@aiagent"
 * - "@AIAgent", "AIAgent", "AI Agent", "@AI Agent"
 * - "agent", "@agent"
 * - "ai-agent@shuffler.io", "ai@shuffle.io"
 */
export function isAIAssignee(assignee?: string | null): boolean {
  if (!assignee) return false;
  const cleaned = assignee.trim().toLowerCase();
  if (!cleaned) return false;

  // Check email forms like ai-agent@shuffler.io or ai@shuffle.io
  if (
    cleaned.startsWith('ai-agent@') ||
    cleaned.startsWith('ai_agent@') ||
    cleaned.startsWith('ai@')
  ) {
    return true;
  }

  // Strip leading @, spaces, hyphens, underscores, dots
  const normalized = cleaned.replace(/^@+/, '').replace(/[\s\-_.]/g, '');

  return (
    normalized === 'agent' ||
    normalized === 'aiagent' ||
    normalized.includes('aiagent') ||
    normalized.startsWith('aiagent')
  );
}

/**
 * Deep-merge two incident data objects with conflict resolution:
 * - Scalars: keep the value from whichever object was edited most recently
 * - Objects: recursively merge keys
 * - Arrays: concatenate and deduplicate (by JSON equality for primitives, by 'id'/'key' for objects)
 * 
 * @param base - The primary/base incident data
 * @param overlay - The secondary data to merge in
 * @param baseEdited - epoch timestamp of when base was last edited
 * @param overlayEdited - epoch timestamp of when overlay was last edited
 * @returns The merged object
 */
export function deepMergeIncidents<T extends Record<string, any>>(
  base: T,
  overlay: T,
  baseEdited: number,
  overlayEdited: number,
): T {
  const result: Record<string, any> = { ...base };

  for (const key of Object.keys(overlay)) {
    const bVal = base[key];
    const oVal = overlay[key];

    // If only one side has it, take whichever exists
    if (bVal === undefined || bVal === null || bVal === '') {
      result[key] = oVal;
      continue;
    }
    if (oVal === undefined || oVal === null || oVal === '') {
      continue; // keep base
    }

    // Both sides have values
    if (Array.isArray(bVal) && Array.isArray(oVal)) {
      // Merge arrays: concat and deduplicate
      result[key] = mergeArrays(bVal, oVal);
    } else if (isPlainObject(bVal) && isPlainObject(oVal)) {
      // Recursively merge objects
      result[key] = deepMergeIncidents(bVal, oVal, baseEdited, overlayEdited);
    } else {
      // Scalar conflict: latest edit wins
      result[key] = overlayEdited > baseEdited ? oVal : bVal;
    }
  }

  return result as T;
}

function isPlainObject(val: any): val is Record<string, any> {
  return val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date);
}

function mergeArrays(a: any[], b: any[]): any[] {
  const seen = new Set<string>();
  const merged: any[] = [];

  const addItem = (item: any) => {
    // For objects with id or key, deduplicate by that
    if (isPlainObject(item) && (item.id || item.key)) {
      const dedupeKey = String(item.id || item.key);
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        merged.push(item);
      }
    } else {
      // For primitives/other, deduplicate by JSON string
      const json = JSON.stringify(item);
      if (!seen.has(json)) {
        seen.add(json);
        merged.push(item);
      }
    }
  };

  a.forEach(addItem);
  b.forEach(addItem);
  return merged;
}
