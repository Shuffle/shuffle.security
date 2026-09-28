/**
 * SafeMarkdown — renders a markdown string with the SAME renderer and config
 * used for documentation (`ShuffleMarkdown`), so plugins, link handling and
 * sanitization stay identical everywhere.
 *
 * Strictness guarantees (defense in depth):
 *  - Raw HTML is never enabled (no rehype-raw) and rehype-sanitize runs on the
 *    resulting tree, so script/iframe/style/event handlers can never appear.
 *  - Link and image URLs are additionally checked here: only http(s), mailto,
 *    relative app paths and `data:image/*` are allowed. Anything else
 *    (javascript:, vbscript:, data:text/html, ...) is rendered as plain text.
 *  - Nothing may set styles: inline `style` is not part of the sanitizer
 *    schema, and our own components only apply theme tokens.
 *
 * Images stored in the Shuffle file API are fetched with the current session
 * (same approach as the email renderer) so they render without an
 * unauthenticated request to the file content URL.
 */

import { useEffect, useState } from 'react';
import { Box, BoxProps } from '@mui/material';
import { ShuffleMarkdown } from '@/components/shared/Markdown';
import { resolveFileUrl, getCachedFileBlob, isShuffleFileUrl } from '@/services/files';

const isApiFileUrl = (src: string) => isShuffleFileUrl(src);

/** Only allow URLs that cannot execute script when rendered. */
const isSafeUrl = (raw?: unknown): raw is string => {
  if (typeof raw !== 'string') return false;
  const url = raw.trim();
  if (!url) return false;
  // Relative paths and fragments are fine.
  if (/^[/#?]/.test(url)) return true;
  // Scheme-less values (e.g. "example.com/x") never execute.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return true;
  return /^(https?:|mailto:)/i.test(url);
};

/** Images may additionally be inline image data (pasted screenshots). */
const isSafeImageUrl = (raw?: unknown): raw is string => {
  if (typeof raw !== 'string') return false;
  const url = raw.trim();
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(url)) return true;
  return isSafeUrl(url);
};

/** Image that loads Shuffle file-API images through the authenticated session. */
const MarkdownImage = ({ src, alt, title }: { src?: unknown; alt?: string; title?: string }) => {
  const safeSrc = isSafeImageUrl(src) ? src.trim() : undefined;
  const [resolved, setResolved] = useState<string | undefined>(() => {
    if (!safeSrc) return undefined;
    if (safeSrc.startsWith('data:') || safeSrc.startsWith('blob:')) return safeSrc;
    if (isShuffleFileUrl(safeSrc)) {
      return getCachedFileBlob(safeSrc);
    }
    return safeSrc;
  });

  useEffect(() => {
    if (!safeSrc) {
      setResolved(undefined);
      return;
    }
    if (safeSrc.startsWith('data:') || safeSrc.startsWith('blob:')) {
      setResolved(safeSrc);
      return;
    }
    if (!isShuffleFileUrl(safeSrc)) {
      setResolved(safeSrc);
      return;
    }
    const cached = getCachedFileBlob(safeSrc);
    if (cached) {
      setResolved(cached);
      return;
    }

    let cancelled = false;
    resolveFileUrl(safeSrc)
      .then((url) => {
        if (!cancelled) setResolved(url);
      })
      .catch(() => {
        // Leave the image unresolved; the alt text stays visible.
      });
    return () => {
      cancelled = true;
    };
  }, [safeSrc]);

  if (!resolved) {
    return (
      <Box
        component="span"
        sx={{ display: 'inline-block', color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}
      >
        {alt || 'Image'}
      </Box>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt || ''}
      title={title}
      loading="lazy"
      style={{ maxWidth: '100%', height: 'auto', borderRadius: 6, display: 'block', margin: '12px 0' }}
    />
  );
};

const components = {
  a: ({ href, children }: any) =>
    isSafeUrl(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(event) => event.stopPropagation()}
        style={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ src, alt, title }: any) => <MarkdownImage src={src} alt={alt} title={title} />,
};

interface SafeMarkdownProps extends Omit<BoxProps, 'children'> {
  text: string;
}

export const SafeMarkdown = ({ text, sx, ...boxProps }: SafeMarkdownProps) => (
  <Box {...boxProps} sx={{ fontSize: '0.95rem', lineHeight: 1.8, ...sx }}>
    <ShuffleMarkdown components={components}>{text}</ShuffleMarkdown>
  </Box>
);

export default SafeMarkdown;
