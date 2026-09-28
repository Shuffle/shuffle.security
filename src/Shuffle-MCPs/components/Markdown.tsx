/**
 * ShuffleMarkdown — the ONE markdown renderer for the platform.
 *
 * Every place that renders user/AI/remote markdown should use this component
 * (or `InlineMarkdown` for single-line strings) instead of importing
 * `react-markdown` directly, so plugins, link safety and typography stay
 * identical everywhere.
 *
 * Defaults:
 *  - remark-gfm (tables, strikethrough, task lists, autolinks)
 *  - remark-breaks (single newline = <br>, matches how LLM/agent output reads)
 *  - rehype-sanitize (defense in depth; raw HTML is never enabled)
 *  - external links open in a new tab with noopener/noreferrer
 *  - shared code / table / blockquote styling based on HSL design tokens
 */
import React, { useMemo } from 'react';
import { Box, useTheme, type SxProps, type Theme } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import JsonView from 'react18-json-view';
import 'react18-json-view/src/style.css';
import 'react18-json-view/src/dark.css';
import { defaultCollapsed } from '@/lib/jsonView';
import { VideoEmbed, resolveVideoUrl } from './VideoEmbed';
import { resolveProductLink } from '@/lib/shuffleUrls';

/** Parse a string into an object/array, or return null when it is not JSON. */
const tryParseJson = (raw: string): object | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (!((first === '{' && last === '}') || (first === '[' && last === ']'))) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const jsonBoxSx: SxProps<Theme> = {
  my: 1,
  p: 1.5,
  borderRadius: 1,
  overflow: 'auto',
  backgroundColor: 'hsl(var(--muted))',
  border: '1px solid hsl(var(--border))',
  '& .json-view': { backgroundColor: 'transparent !important', fontSize: '0.82rem' },
};

/** Standardised JSON tree used inside markdown (same viewer as the rest of the platform). */
export const MarkdownJsonBlock: React.FC<{ src: object }> = ({ src }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box sx={jsonBoxSx}>
      <JsonView
        src={src}
        dark={isDark}
        collapsed={defaultCollapsed}
        collapseStringMode="word"
        collapseStringsAfterLength={120}
        enableClipboard
        displaySize
      />
    </Box>
  );
};

/**
 * Deliberately loose (not react-markdown's own `Components` type): that type is a mapped
 * type over `keyof JSX.IntrinsicElements`, which tsup's declaration bundler (rollup-plugin-dts)
 * cannot inline into this package's published `.d.ts` without erroring (TS2709).
 */
type MarkdownComponentOverrides = Record<string, React.ElementType>;

export interface ShuffleMarkdownProps {
  /** The markdown source. */
  children?: string | null;
  /** Component overrides merged on top of the shared defaults. */
  components?: MarkdownComponentOverrides;
  /** Extra remark plugins appended to the defaults. */
  remarkPlugins?: any[];
  /** Disable remark-breaks (for prose docs where blank lines separate paragraphs). */
  disableBreaks?: boolean;
  /** Styling applied to the wrapping Box. */
  sx?: SxProps<Theme>;
  className?: string;
}

const baseSx: SxProps<Theme> = {
  color: 'inherit',
  fontSize: 'inherit',
  lineHeight: 1.6,
  wordBreak: 'break-word',
  '& > *:first-of-type': { mt: 0 },
  '& > *:last-child': { mb: 0 },
  '& p': { m: 0, mb: 1 },
  '& strong, & b': { color: 'inherit', fontWeight: 600 },
  '& ul, & ol': { m: 0, mb: 1, pl: 2.5 },
  '& li': { mb: 0.25 },
  '& a': { color: 'hsl(var(--primary))', textDecoration: 'underline' },
  '& code': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.92em',
    padding: '0 4px',
    borderRadius: '3px',
    backgroundColor: 'hsl(var(--muted))',
  },
  '& pre': {
    m: 0,
    mb: 1,
    p: 1.5,
    borderRadius: 1,
    overflow: 'auto',
    backgroundColor: 'hsl(var(--muted))',
    border: '1px solid hsl(var(--border))',
    '& code': { p: 0, backgroundColor: 'transparent' },
  },
  '& blockquote': {
    m: 0,
    mb: 1,
    pl: 1.5,
    borderLeft: '3px solid hsl(var(--border))',
    color: 'hsl(var(--muted-foreground))',
  },
  '& table': { width: '100%', borderCollapse: 'collapse', mb: 1 },
  '& th, & td': {
    border: '1px solid hsl(var(--border))',
    p: 0.75,
    textAlign: 'left',
  },
  '& th': { backgroundColor: 'hsl(var(--muted))', fontWeight: 600 },
  '& hr': { border: 0, borderTop: '1px solid hsl(var(--border))', my: 1.5 },
  '& img': { maxWidth: '100%', borderRadius: '2px' },
};

const defaultComponents: MarkdownComponentOverrides = {
  a: ({ href, children, ...props }: any) => {
    const isInternal = typeof href === 'string' && href.startsWith('/');
    const video = isInternal ? null : resolveVideoUrl(href);
    if (video) {
      const label = typeof children === 'string' ? children : undefined;
      return <VideoEmbed video={video} title={label} />;
    }
    const resolved = typeof href === 'string' ? resolveProductLink(href) : null;
    const targetUrl = resolved ? resolved.url : href;
    const openExternal = resolved ? !resolved.isInternal : !isInternal;
    return (
      <a
        href={targetUrl}
        {...(openExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt, ...props }: any) => {
    const video = resolveVideoUrl(src);
    if (video) return <VideoEmbed video={video} title={alt} />;
    return (
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        style={{ borderRadius: 2, ...props.style }}
        {...props}
      />
    );
  },
  pre: ({ children, ...props }: any) => {
    // Render fenced code blocks containing JSON with the standard JSON tree viewer.
    const child: any = Array.isArray(children) ? children[0] : children;
    const raw = child?.props?.children;
    const text = Array.isArray(raw) ? raw.join('') : typeof raw === 'string' ? raw : '';
    const parsed = tryParseJson(text);
    if (parsed) return <MarkdownJsonBlock src={parsed} />;
    return <pre {...props}>{children}</pre>;
  },
};

export const ShuffleMarkdown: React.FC<ShuffleMarkdownProps> = ({
  children,
  components,
  remarkPlugins,
  disableBreaks = false,
  sx,
  className,
}) => {
  const plugins = useMemo(
    () => [remarkGfm, ...(disableBreaks ? [] : [remarkBreaks]), ...(remarkPlugins ?? [])],
    [disableBreaks, remarkPlugins],
  );
  const merged = useMemo(() => {
    const next: any = { ...defaultComponents, ...(components ?? {}) };
    // Video embeds always win, even when a caller overrides `a` / `img`.
    if (components?.a) {
      const Custom: any = components.a;
      next.a = (props: any) => {
        const video = resolveVideoUrl(props?.href);
        if (video) return <VideoEmbed video={video} title={typeof props?.children === 'string' ? props.children : undefined} />;
        return <Custom {...props} />;
      };
    }
    if (components?.img) {
      const Custom: any = components.img;
      next.img = (props: any) => {
        const video = resolveVideoUrl(props?.src);
        if (video) return <VideoEmbed video={video} title={props?.alt} />;
        return <Custom {...props} />;
      };
    }
    return next as MarkdownComponentOverrides;
  }, [components]);

  return (
    <Box className={className} sx={{ ...(baseSx as object), ...(sx as object) }}>
      <ReactMarkdown remarkPlugins={plugins} rehypePlugins={[rehypeSanitize]} components={merged as any}>
        {children ?? ''}
      </ReactMarkdown>
    </Box>
  );
};

export default ShuffleMarkdown;
