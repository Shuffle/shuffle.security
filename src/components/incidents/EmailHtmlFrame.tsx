/**
 * EmailHtmlFrame — renders untrusted HTML email bodies safely.
 *
 * Strategy:
 *   1. Preserve the email HTML/CSS as-is for rendering fidelity.
 *   2. Strip only executable/navigation primitives that should never be
 *      needed for an email preview.
 *   3. Block remote images by default — loading them leaks a read receipt to
 *      the sender (tracking pixels). Inline (`data:` / `cid:`) images are
 *      always allowed. A toolbar lets the user opt in per-message.
 *   4. Wrap the result in a minimal HTML document when the payload is a
 *      fragment.
 *   5. Render it inside a <iframe srcDoc sandbox="..."> — the browser then
 *      enforces the security boundary at the platform level.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, useTheme } from '@mui/material';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { requestExternalLinkConfirm } from '@/utils/safeExternalLinks';

interface EmailHtmlFrameProps {
  html: string;
  /** Cap the auto-grown height so a runaway email cannot push the page absurdly tall. */
  maxHeight?: number;
}

// No sanitizer allowlist and no base styles are applied here. Allowlist-based
// sanitizers drop email-specific tags/attributes/classes that templates use
// for image dimensions and responsive sizing. The sandbox is the primary
// security boundary; this helper only removes active content before srcDoc.
const hardenHtmlForSandbox = (dirty: string): string => {
  let safe = dirty || '';

  safe = safe
    .replace(/<\s*(script|object|embed|iframe|template|portal)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|object|embed|iframe|template|portal)\b[^>]*\/?>/gi, '')
    .replace(/<\s*meta\b(?=[^>]*http-equiv\s*=\s*(?:"refresh"|'refresh'|refresh))[^>]*>/gi, '');

  safe = safe
    .replace(/\s+on[a-z0-9_:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src|xlink:href|formaction|action)\s*=\s*"[\t\n\r ]*(?:javascript|vbscript):[^"]*"/gi, '')
    .replace(/\s+(href|src|xlink:href|formaction|action)\s*=\s*'[\t\n\r ]*(?:javascript|vbscript):[^']*'/gi, '')
    .replace(/\s+(href|src|xlink:href|formaction|action)\s*=\s*[\t\n\r ]*(?:javascript|vbscript):[^\s>]*/gi, '');

  return safe;
};

// A URL counts as "remote" (i.e. leaks a request to a third party) unless it
// is an inline data URI, an attached cid: reference, or an about: blank.
const isRemoteUrl = (raw: string): boolean => {
  const v = (raw || '').trim();
  if (!v) return false;
  if (/^(data:|cid:|about:)/i.test(v)) return false;
  // http, https, protocol-relative //, and everything else that would trigger
  // a network fetch (ftp:, custom schemes) is treated as remote.
  return true;
};

/**
 * Block network-loading image references so opening the email cannot silently
 * confirm receipt to the sender. Preserves the original URL in a data-* attr
 * so we can restore it when the user opts in.
 */
const blockRemoteImages = (input: string): { html: string; blocked: number } => {
  let blocked = 0;

  // <img src="..."> — remove src, keep original in data-blocked-src.
  let out = input.replace(
    /<img\b([^>]*?)\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))([^>]*)>/gi,
    (_m, pre: string, dq: string, sq: string, uq: string, post: string) => {
      const url = dq ?? sq ?? uq ?? '';
      if (!isRemoteUrl(url)) {
        return `<img${pre} src="${url}"${post}>`;
      }
      blocked += 1;
      const safeUrl = url.replace(/"/g, '&quot;');
      return `<img${pre} data-blocked-src="${safeUrl}"${post}>`;
    },
  );

  // srcset — same treatment.
  out = out.replace(
    /<img\b([^>]*?)\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)')([^>]*)>/gi,
    (_m, pre: string, dq: string, sq: string, post: string) => {
      const val = dq ?? sq ?? '';
      const anyRemote = val.split(',').some((part) => {
        const url = part.trim().split(/\s+/)[0] || '';
        return isRemoteUrl(url);
      });
      if (!anyRemote) return `<img${pre} srcset="${val}"${post}>`;
      blocked += 1;
      const safeVal = val.replace(/"/g, '&quot;');
      return `<img${pre} data-blocked-srcset="${safeVal}"${post}>`;
    },
  );

  // background="..." attribute on td/table etc.
  out = out.replace(
    /(<[a-z][^>]*?)\sbackground\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))([^>]*>)/gi,
    (_m, pre: string, dq: string, sq: string, uq: string, post: string) => {
      const url = dq ?? sq ?? uq ?? '';
      if (!isRemoteUrl(url)) return `${pre} background="${url}"${post}`;
      blocked += 1;
      const safeUrl = url.replace(/"/g, '&quot;');
      return `${pre} data-blocked-background="${safeUrl}"${post}`;
    },
  );

  // Inline style="... url(...) ..." — neutralize remote url() calls.
  out = out.replace(
    /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (match, dq: string, sq: string) => {
      const style = dq ?? sq ?? '';
      if (!/url\s*\(/i.test(style)) return match;
      let touched = false;
      const rewritten = style.replace(
        /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
        (full, quote: string, url: string) => {
          if (!isRemoteUrl(url)) return full;
          touched = true;
          return `url(${quote}about:blank${quote})`;
        },
      );
      if (touched) blocked += 1;
      const useDouble = dq !== undefined;
      const safe = useDouble ? rewritten.replace(/"/g, '&quot;') : rewritten.replace(/'/g, '&#39;');
      return useDouble ? ` style="${safe}"` : ` style='${safe}'`;
    },
  );

  return { html: out, blocked };
};

// Only a <meta name="referrer"> is injected — no styles. Real mail clients
// render the email's own HTML/CSS untouched inside their viewport; adding
// our own base styles fights the template and distorts sizing/layout.
const HEAD_INJECT = `<meta name="referrer" content="no-referrer">`;

const buildDocument = (sanitized: string): string => {
  const trimmed = (sanitized || '').trim();
  if (/^<!doctype|^<html[\s>]/i.test(trimmed)) {
    if (/<head[\s>]/i.test(trimmed)) {
      return trimmed.replace(/<head([^>]*)>/i, `<head$1>${HEAD_INJECT}`);
    }
    return trimmed.replace(/<html([^>]*)>/i, `<html$1><head>${HEAD_INJECT}</head>`);
  }
  // Fragment — wrap it with an empty head so referrer policy still applies.
  return `<!doctype html><html><head>${HEAD_INJECT}</head><body>${trimmed}</body></html>`;
};

const EmailHtmlFrame = ({ html, maxHeight = 4000 }: EmailHtmlFrameProps) => {
  const theme = useTheme();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(80);
  const [ready, setReady] = useState(false);
  const [imagesAllowed, setImagesAllowed] = useState(false);

  // Reset the opt-in whenever the underlying message changes so we don't
  // silently keep loading remote images for a different email.
  useEffect(() => {
    setImagesAllowed(false);
  }, [html]);

  const { srcDoc, blockedCount, unresolvableCount } = useMemo(() => {
    const hardened = hardenHtmlForSandbox(html || '');
    // Count <img> tags whose src is missing, empty, or a `cid:` reference we
    // cannot resolve (attachment not inlined). These render as broken image
    // placeholders and would otherwise be invisible to the user.
    const countUnresolvable = (input: string): number => {
      let n = 0;
      const re = /<img\b([^>]*)>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(input)) !== null) {
        const attrs = m[1] || '';
        const srcMatch = attrs.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const raw = srcMatch ? (srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? '') : '';
        const v = raw.trim();
        if (!srcMatch || !v) { n += 1; continue; }
        if (/^cid:/i.test(v)) { n += 1; continue; }
      }
      return n;
    };
    const unresolvable = countUnresolvable(hardened);
    if (imagesAllowed) {
      return { srcDoc: buildDocument(hardened), blockedCount: 0, unresolvableCount: unresolvable };
    }
    const { html: blocked, blocked: count } = blockRemoteImages(hardened);
    return { srcDoc: buildDocument(blocked), blockedCount: count, unresolvableCount: unresolvable };
  }, [html, imagesAllowed]);


  // srcDoc changes reset the "ready" gate so a new email starts hidden until
  // its own first stable measurement lands.
  useEffect(() => {
    setReady(false);
  }, [srcDoc]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    const retryTimers: number[] = [];
    let cancelled = false;
    // Monotonic max — once we've observed a taller layout, never shrink
    // back to a smaller one. Prevents the visible "growing" effect where
    // an early partial measurement pops small, then jumps up as fonts and
    // late layout finish.
    let maxObserved = 0;
    // Settle window: coalesce many observer-driven measurements and only
    // reveal the frame once the measured height has stopped changing, so the
    // user never sees the white box grow in steps.
    let settleTimer: number | null = null;
    let lastCommitted = -1;
    const scheduleCommit = (h: number) => {
      if (h > maxObserved) maxObserved = h;
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        if (cancelled) return;
        if (maxObserved === lastCommitted) {
          // Stable across a full settle window — safe to show.
          setReady(true);
          return;
        }
        lastCommitted = maxObserved;
        setHeight(maxObserved + 4);
        // Re-arm one more settle window to confirm stability before reveal.
        settleTimer = window.setTimeout(() => {
          settleTimer = null;
          if (cancelled) return;
          if (maxObserved === lastCommitted) setReady(true);
          else scheduleCommit(maxObserved);
        }, 200);
      }, 120);
    };

    const measure = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc || !doc.body) return;
        const h = Math.min(
          Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight),
          maxHeight,
        );
        if (h > 0) scheduleCommit(h);
      } catch {
        setHeight(400);
        setReady(true);
      }
    };

    const wireDocument = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;

        // Observe body size changes so late-loading fonts, images and
        // reflows keep the iframe height in sync. Without this, an initial
        // measurement of 0/near-zero (srcDoc parsing hadn't finished when
        // the load event fired) would leave the frame collapsed until the
        // user popped out and docked back.
        if (doc.body) {
          if (typeof ResizeObserver !== 'undefined') {
            try {
              resizeObserver = new ResizeObserver(measure);
              resizeObserver.observe(doc.body);
            } catch { /* ignore */ }
          }
          try {
            mutationObserver = new MutationObserver(measure);
            mutationObserver.observe(doc.body, { childList: true, subtree: true, characterData: true });
          } catch { /* ignore */ }
        }

        doc.querySelectorAll('img').forEach((img) => {
          if (!(img as HTMLImageElement).complete) {
            img.addEventListener('load', measure, { once: true });
            img.addEventListener('error', measure, { once: true });
          }
        });

        // Intercept every link click inside the email so untrusted links
        // cannot navigate inside the iframe. Show the global external-link
        // confirmation dialog and open approved links in a new tab.
        doc.querySelectorAll('a').forEach((anchor) => {
          anchor.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const raw = anchor.getAttribute('href')?.trim();
            if (!raw || raw.startsWith('#')) return;
            if (/^(javascript|vbscript|data):/i.test(raw)) return;
            try {
              const resolved = new URL(raw, window.location.href).toString();
              requestExternalLinkConfirm(resolved);
            } catch {
              requestExternalLinkConfirm(raw);
            }
          });
        });

        // Bridge text selections inside the email iframe up to the parent so
        // the "Create automation rule" chip can appear for email body text.
        const forwardSelection = () => {
          try {
            const sel = doc.getSelection?.();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
            const text = sel.toString().trim();
            if (text.length < 3) return;
            const range = sel.getRangeAt(0);
            const rectInFrame = range.getBoundingClientRect();
            const iframeRect = iframe.getBoundingClientRect();
            const x = iframeRect.left + rectInFrame.left + rectInFrame.width / 2;
            const y = iframeRect.top + rectInFrame.bottom + 8;
            window.dispatchEvent(
              new CustomEvent('selection-rule:external', {
                detail: { x, y, text, field: 'rawOCSF.unmapped_original.body' },
              }),
            );
          } catch {
            /* ignore cross-origin */
          }
        };
        doc.addEventListener('mouseup', forwardSelection);
        doc.addEventListener('touchend', forwardSelection);
      } catch {
        /* ignore */
      }
    };

    const onLoad = () => {
      wireDocument();
      // A short burst of remeasurements catches late layout (webfonts,
      // images, slow srcDoc parsing). They all funnel through
      // scheduleCommit so the iframe only commits the final settled
      // height, hiding the intermediate growth.
      [0, 60, 180, 400, 900].forEach((delay) => {
        const t = window.setTimeout(() => { if (!cancelled) measure(); }, delay);
        retryTimers.push(t);
      });
      // Guarantee we eventually reveal even if measurements never grow
      // past the "large enough" threshold (very short emails).
      const revealFallback = window.setTimeout(() => {
        if (!cancelled) setReady(true);
      }, 1400);
      retryTimers.push(revealFallback);
    };

    iframe.addEventListener('load', onLoad);
    // If the srcDoc already finished parsing before this effect attached
    // the listener (React re-mount, HMR, fast navigation), the load event
    // never fires again — invoke onLoad manually so height and wiring get
    // applied on the very first render.
    try {
      if (iframe.contentDocument?.readyState === 'complete') {
        onLoad();
      }
    } catch { /* ignore */ }

    return () => {
      cancelled = true;
      iframe.removeEventListener('load', onLoad);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      retryTimers.forEach((t) => window.clearTimeout(t));
    };
  }, [srcDoc, maxHeight]);


  return (
    <Box
      sx={{
        border: '1px solid #d0d7de',
        borderRadius: 1,
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 1px 2px rgba(0,0,0,0.4)'
            : '0 1px 2px rgba(0,0,0,0.06)',
        // Keep the whole white card collapsed until the measured height has
        // settled — otherwise the card itself is what visibly grows.
        ...(ready
          ? {}
          : { height: 0, opacity: 0, border: 'none', boxShadow: 'none', pointerEvents: 'none' }),
      }}
    >
      {!imagesAllowed && blockedCount > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            px: 1.5,
            py: 0.75,
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#fff8e1',
            color: '#5b4a15',
            fontSize: 12.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ImageOutlinedIcon sx={{ fontSize: 16 }} />
            <span>
              Remote images blocked to prevent read tracking
              {blockedCount > 1 ? ` (${blockedCount} references)` : ''}.
            </span>
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setImagesAllowed(true)}
            sx={{
              height: 26,
              minHeight: 26,
              textTransform: 'none',
              fontSize: 12,
              borderColor: '#c9a227',
              color: '#5b4a15',
              '&:hover': { borderColor: '#a07d10', backgroundColor: 'rgba(201,162,39,0.08)' },
            }}
          >
            Load images
          </Button>
        </Box>
      )}
      {unresolvableCount > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.75,
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f3f4f6',
            color: '#4b5563',
            fontSize: 12.5,
          }}
        >
          <ImageOutlinedIcon sx={{ fontSize: 16 }} />
          <span>
            {unresolvableCount === 1
              ? '1 image could not be displayed — it references an attachment that was not included with the email.'
              : `${unresolvableCount} images could not be displayed — they reference attachments that were not included with the email.`}
          </span>
        </Box>
      )}
      <iframe

        ref={iframeRef}
        title="Email body"
        srcDoc={srcDoc}
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
        referrerPolicy="no-referrer"
        style={{
          width: '100%',
          height: `${height}px`,
          border: 'none',
          display: 'block',
          backgroundColor: '#ffffff',
          // Hide until first stable measurement to avoid the visible
          // "growing" effect while fonts/images/late layout settle.
          visibility: ready ? 'visible' : 'hidden',
        }}
      />
    </Box>
  );
};

export default EmailHtmlFrame;
