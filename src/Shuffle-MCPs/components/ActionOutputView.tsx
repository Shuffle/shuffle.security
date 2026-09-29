/**
 * Renders an action's stdout. Most actions return text and we show it in a
 * <pre>. The `script:screenshot` action returns a base64-encoded PNG which
 * we detect by signature and render as an inline image instead.
 */
import { useMemo, useState, useEffect } from 'react';

const IMAGE_SIGNATURES: Array<{ prefix: string; mime: string }> = [
  { prefix: 'iVBORw0KGgo', mime: 'image/png' },   // PNG
  { prefix: '/9j/',        mime: 'image/jpeg' },  // JPEG
  { prefix: 'R0lGOD',      mime: 'image/gif' },   // GIF
  { prefix: 'UklGR',       mime: 'image/webp' },  // WebP
];

const matchSignature = (compact: string): { mime: string; b64: string } | null => {
  if (compact.length < 200) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return null;
  for (const sig of IMAGE_SIGNATURES) {
    if (compact.startsWith(sig.prefix)) return { mime: sig.mime, b64: compact };
  }
  return null;
};

interface DetectedImage {
  mime: string;
  b64: string;
  cursor?: { x: number; y: number };
  screenSize?: { width: number; height: number };
}

const toCursor = (v: unknown): { x: number; y: number } | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.x === 'number' && typeof o.y === 'number') return { x: o.x, y: o.y };
  return undefined;
};

const toSize = (v: unknown): { width: number; height: number } | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.width === 'number' && typeof o.height === 'number') return { width: o.width, height: o.height };
  return undefined;
};

const detectImage = (raw: string): DetectedImage | null => {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().replace(/^["']|["']$/g, '');

  // data: URI
  const dataMatch = s.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (dataMatch) return { mime: dataMatch[1], b64: dataMatch[2].replace(/\s+/g, '') };

  // Plain base64 blob
  const compact = s.replace(/\s+/g, '');
  const direct = matchSignature(compact);
  if (direct) return direct;

  // JSON wrapper, e.g. [{ "image": "<base64>", ... }] or { "image": "..." }
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      const keys = ['image_base64', 'imageBase64', 'image', 'screenshot', 'screenshot_base64', 'data', 'png', 'jpeg', 'jpg', 'b64', 'base64'];
      for (const item of candidates) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const cursor = toCursor(rec.cursor);
        const screenSize = toSize(rec.screen_size ?? rec.screenSize);
        for (const key of keys) {
          const v = rec[key];
          if (typeof v !== 'string') continue;
          const inner = v.trim().replace(/\s+/g, '');
          const dm = inner.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
          if (dm) return { mime: dm[1], b64: dm[2], cursor, screenSize };
          const sig = matchSignature(inner);
          if (sig) return { ...sig, cursor, screenSize };
        }
      }
    } catch {
      // truncated/invalid JSON — fall through to regex extraction
    }
  }

  // Last-resort regex extraction (handles truncated JSON)
  // Pull cursor + screen_size if present in the raw text
  let cursor: { x: number; y: number } | undefined;
  let screenSize: { width: number; height: number } | undefined;
  const cursorMatch = s.match(/"cursor"\s*:\s*\{\s*"x"\s*:\s*(-?\d+)\s*,\s*"y"\s*:\s*(-?\d+)/);
  if (cursorMatch) cursor = { x: Number(cursorMatch[1]), y: Number(cursorMatch[2]) };
  const sizeMatch = s.match(/"screen_?[Ss]ize"\s*:\s*\{\s*"width"\s*:\s*(\d+)\s*,\s*"height"\s*:\s*(\d+)/);
  if (sizeMatch) screenSize = { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) };

  const dataUriInWrapper = s.match(/data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]{200,})/i);
  if (dataUriInWrapper) {
    const b64 = dataUriInWrapper[2].replace(/\s+/g, '').replace(/["'\\].*$/, '');
    return { mime: dataUriInWrapper[1], b64, cursor, screenSize };
  }
  const regexMatch = s.match(/"(?:image_base64|imageBase64|image|screenshot|screenshot_base64|data|png|jpeg|jpg|b64|base64)"\s*:\s*"([^"]{200,})"?/i);
  if (regexMatch) {
    const inner = regexMatch[1].replace(/\s+/g, '');
    const dm = inner.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
    if (dm) return { mime: dm[1], b64: dm[2], cursor, screenSize };
    const sig = matchSignature(inner);
    if (sig) return { ...sig, cursor, screenSize };
  }

  return null;
};

const MAX_TEXT_CHARS = 4000;

interface ActionOutputViewProps {
  output: string;
  /** Tailwind classes for the <pre> fallback (so each call site keeps its own sizing). */
  className?: string;
}

export const ActionOutputView = ({ output, className }: ActionOutputViewProps) => {
  const detected = useMemo(() => detectImage(output), [output]);
  const [zoomed, setZoomed] = useState(false);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setZoomed(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  if (detected) {
    const src = `data:${detected.mime};base64,${detected.b64}`;
    const hasMeta = !!(detected.cursor || detected.screenSize);
    return (
      <>
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="block max-w-[50%] rounded border border-border overflow-hidden bg-muted/30 hover:border-primary transition-colors"
        >
          <img
            src={src}
            alt="Action screenshot"
            className="w-full h-auto block"
            onLoad={(e) => {
              // Once the image actually paints, the surrounding scroll
              // container's content height grows. Pull this entry into view
              // so the user does not have to manually scroll up to see it.
              try {
                (e.currentTarget as HTMLImageElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              } catch { /* ignore */ }
            }}
          />
        </button>
        {hasMeta && (
          <div className="mt-1 flex items-center gap-3 text-[0.6rem] font-mono text-muted-foreground">
            {detected.screenSize && (
              <span>screen {detected.screenSize.width}×{detected.screenSize.height}</span>
            )}
            {detected.cursor && (
              <span>cursor ({detected.cursor.x}, {detected.cursor.y})</span>
            )}
          </div>
        )}
        {zoomed && (
          <div
            className="fixed inset-0 z-[10000] bg-black/80 flex flex-col items-center justify-center p-6 cursor-zoom-out gap-2"
            onClick={() => setZoomed(false)}
          >
            <img src={src} alt="Action screenshot" className="max-w-full max-h-[calc(100%-2rem)] rounded shadow-2xl" />
            {hasMeta && (
              <div className="flex items-center gap-3 text-xs font-mono text-white/80">
                {detected.screenSize && (
                  <span>screen {detected.screenSize.width}×{detected.screenSize.height}</span>
                )}
                {detected.cursor && (
                  <span>cursor ({detected.cursor.x}, {detected.cursor.y})</span>
                )}
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  const isHuge = !!output && output.length > MAX_TEXT_CHARS;
  const display = !isHuge || showFull
    ? output
    : `${output.slice(0, MAX_TEXT_CHARS)}\n\n… [truncated ${output.length - MAX_TEXT_CHARS} chars to keep the page responsive]`;

  return (
    <>
      <pre className={className}>{display}</pre>
      {isHuge && (
        <div className="mt-1 flex items-center gap-2 text-[0.6rem] text-muted-foreground">
          <span>{(output.length / 1024).toFixed(1)} KB output</span>
          <button
            type="button"
            onClick={() => setShowFull(v => !v)}
            className="underline hover:text-foreground"
          >
            {showFull ? 'Collapse' : 'Show full'}
          </button>
        </div>
      )}
    </>
  );
};
