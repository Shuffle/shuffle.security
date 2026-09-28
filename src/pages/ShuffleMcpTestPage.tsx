import { ChevronDown as ExpandMoreIcon, Copy as ContentCopyIcon, Check as CheckIcon, ChevronDown as KeyboardArrowDownIcon, Github as GitHubIcon } from 'lucide-react';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  Box,
  Typography,
  Container,
  Button,
  Stack,
  Paper,
  Collapse,
  IconButton,
  Tooltip,
  Popover,
  Avatar,
} from '@mui/material';
import {
  ShuffleMCP,
  AppSearchDrawer,
  AppDetailDrawer,
  AppAuthSection,
  TryMcpSection,
  SingulActionsPreview,
  AgentUI,
  AgentRunDrawer,
  AgentActivityList,
  AgentExecutionDrawer,
  AgentsView,
  AppTitleHeader,
  ShufflePipelinesBanner,
  UsageBar,
  useAppLookup,
} from '@/Shuffle-MCPs';
import type { AgentRun } from '@/Shuffle-MCPs';
import PermissionsPanel from '@/components/agent/PermissionsPanel';
import LocalLLMConfig from '@/Shuffle-MCPs/components/LocalLLMConfig';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { API_CONFIG } from '@/Shuffle-MCPs/api';
import { Box as MuiBox, Skeleton } from '@mui/material';

/**
 * Demo page for the Shuffle-MCPs library.
 * Each section is paired with an MUI-docs-style expandable code block
 * showing the exact source that produced the rendered demo.
 */

const SNIPPET_AGENT_UI = `import { AgentUI } from '@shuffleio/shuffle-mcps';

// Modern hero "What do you want to do?" prompt + live debug timeline.
// Reads ?execution_id&authorization from the URL to resume an existing run.
<AgentUI
  defaultApps={[
    { name: 'Http', id: 'ebfe7d5c80000676588f86731db0a555' },
    { name: 'Shuffle_tools', id: '3e2bdf9d5069fe3f4746c29d68785a6a' },
  ]}
  onRun={({ input, success, executionId }) =>
    console.log('agent run', { input, success, executionId })
  }
/>`;

const SNIPPET_INLINE_SEARCH = `import { ShuffleMCP } from '@shuffleio/shuffle-mcps';

<ShuffleMCP inline layout="grid" gridColumns={3} />`;

const SNIPPET_SEARCH_DRAWER = `import { useState } from 'react';
import { Button } from '@mui/material';
import { AppSearchDrawer } from '@shuffleio/shuffle-mcps';

const [open, setOpen] = useState(false);

<>
  <Button variant="contained" onClick={() => setOpen(true)}>
    Open search drawer
  </Button>

  <AppSearchDrawer
    open={open}
    onClose={() => setOpen(false)}
    title="Add Ingestion Source"
    subtitle="Search and authenticate a tool to ingest incidents from"
  />
</>`;

const SNIPPET_DETAIL_DRAWER = `import { useState } from 'react';
import { Button, Stack } from '@mui/material';
import { AppDetailDrawer } from '@shuffleio/shuffle-mcps';

const [appName, setAppName] = useState<string | null>(null);

<>
  <Stack direction="row" spacing={1}>
    {['Gmail', 'Slack', 'VirusTotal'].map(name => (
      <Button key={name} variant="outlined" onClick={() => setAppName(name)}>
        {name}
      </Button>
    ))}
  </Stack>

  <AppDetailDrawer
    open={appName !== null}
    onClose={() => setAppName(null)}
    appName={appName}
  />
</>`;

const SNIPPET_AUTH_SECTION = `import { useState } from 'react';
import { AppAuthSection, useAppLookup } from '@shuffleio/shuffle-mcps';
import { usePageMeta } from '@/hooks/usePageMeta';

// Pass any app name — the hook resolves icon, id, categories, auth entries.
const lookup = useAppLookup('Gmail');
const [open, setOpen] = useState(true);

<AppAuthSection
  displayName={lookup.displayName}
  algoliaApp={lookup.algoliaApp}
  resolvedAlgoliaId={lookup.algoliaId}
  authState={lookup.authState}
  expanded={open}
  onToggle={() => setOpen(v => !v)}
  authCount={lookup.authCount}
  matchingEntries={lookup.matchingEntries}
  onAuthChange={lookup.handleAuthChange}
  onTestConnection={lookup.handleTestConnection}
  onSaveAuth={lookup.handleSaveAuth}
  onRefreshAuth={lookup.refreshAuth}
/>`;

const SNIPPET_TRY_MCP = `import { TryMcpSection, useAppLookup } from '@shuffleio/shuffle-mcps';

const lookup = useAppLookup('Slack');

<TryMcpSection
  appName="Slack"
  appIcon={lookup.image}
  appId={lookup.algoliaId || 'Slack'}
  categories={lookup.categories}
/>`;

const SNIPPET_TRY_ACTIONS = `import { SingulActionsPreview, useAppLookup } from '@shuffleio/shuffle-mcps';

const lookup = useAppLookup('VirusTotal');

// All actions across the default categories, sorted so the app's
// matching category appears first and is auto-selected.
<SingulActionsPreview
  appName="VirusTotal"
  categories={lookup.categories}
/>`;

// Lightweight JSX/TSX syntax highlighter for the demo "Show source" snippets.
// Uses semantic HSL tokens so it tracks the active theme.
const SYNTAX_COLORS = {
  comment: 'hsl(var(--muted-foreground))',
  string: 'hsl(142 60% 55%)',      // green
  keyword: 'hsl(280 70% 70%)',     // purple
  tag: 'hsl(var(--primary))',      // brand orange — JSX tag names
  attr: 'hsl(40 90% 65%)',         // amber — JSX attribute names
  number: 'hsl(25 95% 65%)',       // orange — numeric literals
  punct: 'hsl(var(--muted-foreground))',
};

const KEYWORDS = new Set([
  'import', 'from', 'export', 'default', 'const', 'let', 'var', 'function',
  'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
  'new', 'class', 'extends', 'this', 'await', 'async', 'true', 'false', 'null',
  'undefined', 'typeof', 'in', 'of', 'as', 'interface', 'type',
]);

function highlightCode(code: string): React.ReactNode[] {
  // Token regex: comments | strings | template strings | JSX tag open/close | numbers | identifiers | other
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|(<\/?[A-Za-z][A-Za-z0-9_]*)|([A-Za-z_$][\w$]*)|(\d+(?:\.\d+)?)|([^\s\w]+)|(\s+)/g;
  const out: React.ReactNode[] = [];
  let m: RegExpExecArray | null;
  let key = 0;
  let prevWasTagOpen = false; // we're inside a JSX tag — color identifiers as attrs
  while ((m = re.exec(code)) !== null) {
    const [, comment, str, tag, ident, num, punct, ws] = m;
    if (comment) {
      out.push(<span key={key++} style={{ color: SYNTAX_COLORS.comment, fontStyle: 'italic' }}>{comment}</span>);
    } else if (str) {
      out.push(<span key={key++} style={{ color: SYNTAX_COLORS.string }}>{str}</span>);
    } else if (tag) {
      prevWasTagOpen = true;
      out.push(<span key={key++} style={{ color: SYNTAX_COLORS.punct }}>{tag.startsWith('</') ? '</' : '<'}</span>);
      out.push(<span key={key++} style={{ color: SYNTAX_COLORS.tag }}>{tag.replace(/^<\/?/, '')}</span>);
    } else if (ident) {
      if (prevWasTagOpen) {
        out.push(<span key={key++} style={{ color: SYNTAX_COLORS.attr }}>{ident}</span>);
      } else if (KEYWORDS.has(ident)) {
        out.push(<span key={key++} style={{ color: SYNTAX_COLORS.keyword }}>{ident}</span>);
      } else {
        out.push(<span key={key++} style={{ color: 'hsl(var(--foreground))' }}>{ident}</span>);
      }
    } else if (num) {
      out.push(<span key={key++} style={{ color: SYNTAX_COLORS.number }}>{num}</span>);
    } else if (punct) {
      if (prevWasTagOpen && (punct === '>' || punct === '/>')) prevWasTagOpen = false;
      if (punct === '{' || punct === '}') prevWasTagOpen = false;
      out.push(<span key={key++} style={{ color: SYNTAX_COLORS.punct }}>{punct}</span>);
    } else if (ws) {
      out.push(ws);
    }
  }
  return out;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <Box
      sx={{
        position: 'relative',
        mt: 2,
        borderRadius: 1.5,
        border: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--muted) / 0.4)',
      }}
    >
      <Tooltip title={copied ? 'Copied' : 'Copy'} placement="left">
        <IconButton
          size="small"
          onClick={handleCopy}
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            color: 'hsl(var(--muted-foreground))',
            '&:hover': { color: 'hsl(var(--foreground))' },
          }}
        >
          {copied ? <CheckIcon size={20} /> : <ContentCopyIcon size={20} />}
        </IconButton>
      </Tooltip>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          pr: 5,
          overflowX: 'auto',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: '0.78rem',
          lineHeight: 1.55,
          color: 'hsl(var(--foreground))',
          whiteSpace: 'pre',
        }}
      >
        <code>{highlightCode(code)}</code>
      </Box>
    </Box>
  );
}

type ApiEndpoint = { method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ALGOLIA'; path: string; description?: string };

const METHOD_COLORS: Record<ApiEndpoint['method'], string> = {
  GET: 'hsl(142 60% 55%)',
  POST: 'hsl(40 90% 65%)',
  PUT: 'hsl(210 80% 65%)',
  DELETE: 'hsl(0 75% 65%)',
  ALGOLIA: 'hsl(280 70% 70%)',
};

function ApiPanel({ apis }: { apis: ApiEndpoint[] }) {
  return (
    <Box
      sx={{
        borderRadius: 1.5,
        border: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--muted) / 0.4)',
        p: 2,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <Stack spacing={1}>
        {apis.map((api, i) => (
          <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Box
                component="span"
                sx={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: METHOD_COLORS[api.method],
                  border: `1px solid ${METHOD_COLORS[api.method]}`,
                  borderRadius: 0.5,
                  px: 0.6,
                  py: 0.05,
                  flexShrink: 0,
                  letterSpacing: '0.04em',
                }}
              >
                {api.method}
              </Box>
              <Box
                component="code"
                sx={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: '0.75rem',
                  color: 'hsl(var(--foreground))',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={api.path}
              >
                {api.path}
              </Box>
            </Box>
            {api.description && (
              <Typography
                variant="caption"
                sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem', pl: 0.25 }}
              >
                {api.description}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
      <Box sx={{ flex: 1 }} />
      <Typography
        variant="caption"
        sx={{ mt: 1.5, color: 'hsl(var(--muted-foreground))', fontSize: '0.68rem' }}
      >
        Full reference:{' '}
        <Box
          component="a"
          href="https://shuffler.io/docs/API"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: 'hsl(var(--primary))', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          shuffler.io/docs/API
        </Box>
      </Typography>
    </Box>
  );
}

function DemoSection({
  title,
  description,
  code,
  apis,
  children,
}: {
  title: string;
  description: ReactNode;
  code: string;
  apis?: ApiEndpoint[];
  children: ReactNode;
}) {
  const [showCode, setShowCode] = useState(false);
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        backgroundColor: 'hsl(var(--card))',
        backgroundImage: 'none',
        border: '1px solid hsl(var(--border))',
        color: 'hsl(var(--card-foreground))',
      }}
    >
      <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {description}
      </Typography>

      <Box sx={{ mb: 1 }}>{children}</Box>

      <Box
        sx={{
          mt: 2,
          pt: 1.5,
          borderTop: '1px solid hsl(var(--border))',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <Button
          size="small"
          onClick={() => setShowCode(v => !v)}
          endIcon={
            <ExpandMoreIcon
              style={{ transition: 'transform 0.2s', transform: showCode ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          }
          sx={{ textTransform: 'none', color: 'hsl(var(--muted-foreground))' }}
        >
          {showCode ? 'Hide source' : 'Show source'}
        </Button>
      </Box>

      <Collapse in={showCode} unmountOnExit>
        {apis && apis.length > 0 ? (
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.6fr) minmax(0, 1fr)' },
              alignItems: 'stretch',
            }}
          >
            <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography
                variant="caption"
                sx={{
                  mt: 2,
                  mb: -1,
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                Frontend (React)
              </Typography>
              <CodeBlock code={code} />
            </Box>
            <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography
                variant="caption"
                sx={{
                  mt: 2,
                  mb: 1,
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                Backend APIs called
              </Typography>
              <ApiPanel apis={apis} />
            </Box>
          </Box>
        ) : (
          <CodeBlock code={code} />
        )}
      </Collapse>
    </Paper>
  );
}

/** Tiny shared input + lookup wrapper used by the three section demos below. */
function AppNamePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const lookup = useAppLookup(value);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <MuiBox sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">App name:</Typography>
      <Button
        ref={buttonRef}
        onClick={() => setAnchorEl(buttonRef.current)}
        variant="outlined"
        size="small"
        endIcon={<KeyboardArrowDownIcon />}
        sx={{
          textTransform: 'none',
          color: 'hsl(var(--foreground))',
          borderColor: 'hsl(var(--border))',
          backgroundColor: 'hsl(var(--input))',
          minWidth: 240,
          height: 36,
          justifyContent: 'space-between',
          '&:hover': { borderColor: 'hsl(var(--primary))', backgroundColor: 'hsl(var(--input))' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
          {lookup.image && (
            <Avatar
              src={lookup.image}
              alt={value}
              variant="rounded"
              sx={{ width: 18, height: 18, backgroundColor: 'transparent' }}
            />
          )}
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 500 }} noWrap>
            {value || 'Select app…'}
          </Typography>
        </Box>
      </Button>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              width: 420,
              p: 1.5,
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 2,
            },
          },
        }}
      >
        <ShuffleMCP
          inline
          layout="grid"
          gridColumns={1}
          apiKey={API_CONFIG.apiKey || undefined}
          showCategories={false}
          showDescription={false}
          preventDefault
          onAppSelected={(detail: any) => {
            onChange(detail.app.name);
            setAnchorEl(null);
          }}
          customStyles={{ resultsContainer: { maxHeight: 320 } }}
        />
      </Popover>
    </MuiBox>
  );
}
function AuthSectionDemo({ appName }: { appName: string }) {
  const lookup = useAppLookup(appName);
  const [open, setOpen] = useState(true);
  if (lookup.loading) return <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />;
  return (
    <AppAuthSection
      displayName={lookup.displayName}
      algoliaApp={lookup.algoliaApp}
      resolvedAlgoliaId={lookup.algoliaId}
      authState={lookup.authState}
      expanded={open}
      onToggle={() => setOpen((v) => !v)}
      authCount={lookup.authCount}
      matchingEntries={lookup.matchingEntries}
      onAuthChange={lookup.handleAuthChange}
      onTestConnection={lookup.handleTestConnection}
      onSaveAuth={lookup.handleSaveAuth}
      onRefreshAuth={lookup.refreshAuth}
    />
  );
}

function TryMcpDemo({ appName }: { appName: string }) {
  const lookup = useAppLookup(appName);
  if (lookup.loading) return <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />;
  return (
    <TryMcpSection
      appName={appName}
      appIcon={lookup.image}
      appId={lookup.algoliaId || appName}
      categories={lookup.categories}
    />
  );
}

function TryActionsDemo({ appName }: { appName: string }) {
  const lookup = useAppLookup(appName);
  if (lookup.loading) return <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />;
  return <SingulActionsPreview appName={appName} categories={lookup.categories} />;
}

const AgentRunDrawerDemo = () => {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Button variant="contained" onClick={() => setOpen(true)}>
        Open Agent drawer
      </Button>
      <AgentRunDrawer
        open={open}
        onClose={() => setOpen(false)}
        permissionsSlot={<PermissionsPanel compact />}
        localLLMSlot={<LocalLLMConfig />}
      />
    </Box>
  );
};

const ShuffleMcpTestPage = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailApp, setDetailApp] = useState<string | null>(null);
  const [authApp, setAuthApp] = useState('Gmail');
  const [mcpApp, setMcpApp] = useState('Slack');
  const [actionsApp, setActionsApp] = useState('VirusTotal');
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);

  const scrollToActivity = () => {
    const el = document.getElementById('agent-activity');
    if (!el) return;
    const startY = window.scrollY;
    const targetY = el.getBoundingClientRect().top + startY - 24; // small top offset
    const distance = targetY - startY;
    const duration = Math.min(1400, Math.max(700, Math.abs(distance) * 0.6));
    const startTime = performance.now();
    // easeInOutCubic for a calm, deliberate scroll
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      window.scrollTo(0, startY + distance * ease(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // Default to dark mode for unauthenticated visitors on this public demo page.
  const { isAuthenticated, isLoading } = useAuth();
  const { setTheme } = useTheme();
  const forcedThemeRef = useRef(false);
  useEffect(() => {
    if (isLoading || forcedThemeRef.current) return;
    if (!isAuthenticated) {
      forcedThemeRef.current = true;
      setTheme('dark');
    }
  }, [isAuthenticated, isLoading, setTheme]);

  useEffect(() => {
    const TITLE = 'Shuffle MCP — React component library demo';
    const DESCRIPTION =
      'Live demo of @shuffleio/shuffle-mcps: six drop-in React components for app search, authentication, and MCP integration powered by Shuffle.';
    const URL = 'https://shuffle.security/shuffle-mcp-demo';
    const IMAGE = 'https://shuffle.security/og-image.png';

    const prevTitle = document.title;
    document.title = TITLE;

    const setMeta = (selector: string, attr: string, value: string, create: () => HTMLElement) => {
      let el = document.head.querySelector(selector) as HTMLElement | null;
      const created = !el;
      if (!el) {
        el = create();
        document.head.appendChild(el);
      }
      const prev = el.getAttribute(attr);
      el.setAttribute(attr, value);
      return () => {
        if (created) el?.remove();
        else if (prev !== null) el?.setAttribute(attr, prev);
      };
    };

    const cleanups = [
      setMeta('meta[name="description"]', 'content', DESCRIPTION, () => {
        const m = document.createElement('meta');
        m.setAttribute('name', 'description');
        return m;
      }),
      setMeta('link[rel="canonical"]', 'href', URL, () => {
        const l = document.createElement('link');
        l.setAttribute('rel', 'canonical');
        return l;
      }),
      setMeta('meta[property="og:title"]', 'content', TITLE, () => {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:title');
        return m;
      }),
      setMeta('meta[property="og:description"]', 'content', DESCRIPTION, () => {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:description');
        return m;
      }),
      setMeta('meta[property="og:type"]', 'content', 'website', () => {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:type');
        return m;
      }),
      setMeta('meta[property="og:url"]', 'content', URL, () => {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:url');
        return m;
      }),
      setMeta('meta[property="og:image"]', 'content', IMAGE, () => {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:image');
        return m;
      }),
      setMeta('meta[name="twitter:card"]', 'content', 'summary_large_image', () => {
        const m = document.createElement('meta');
        m.setAttribute('name', 'twitter:card');
        return m;
      }),
      setMeta('meta[name="twitter:title"]', 'content', TITLE, () => {
        const m = document.createElement('meta');
        m.setAttribute('name', 'twitter:title');
        return m;
      }),
      setMeta('meta[name="twitter:description"]', 'content', DESCRIPTION, () => {
        const m = document.createElement('meta');
        m.setAttribute('name', 'twitter:description');
        return m;
      }),
    ];

    return () => {
      document.title = prevTitle;
      cleanups.forEach(fn => fn());
    };
  }, []);

  return (
    <>
      <LandingNavbar />
      <Container maxWidth="lg" sx={{ pt: { xs: 12, md: 16 }, pb: 6 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
          Shuffle MCP — library demo
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Six self-contained components from{' '}
          <Box
            component="a"
            href="https://www.npmjs.com/package/@shuffleio/shuffle-mcps"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: 'hsl(var(--primary))', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            <code>@shuffleio/shuffle-mcps</code>
          </Box>
          . Expand "Show source" under each section to see the exact code that produced it.
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
          <Box
            component="a"
            href="https://github.com/shuffle/shuffle"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              border: '1px solid hsl(var(--border))',
              backgroundColor: 'hsl(var(--muted) / 0.5)',
              color: 'hsl(var(--foreground))',
              textDecoration: 'none',
              fontSize: '0.8rem',
              fontWeight: 500,
              transition: 'all 0.15s',
              '&:hover': {
                borderColor: 'hsl(var(--primary) / 0.5)',
                backgroundColor: 'hsl(var(--primary) / 0.08)',
              },
            }}
          >
            <GitHubIcon size={16} />
            Shuffle Core
          </Box>
          <Box
            component="a"
            href="https://github.com/Shuffle/shuffle.security"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              border: '1px solid hsl(var(--border))',
              backgroundColor: 'hsl(var(--muted) / 0.5)',
              color: 'hsl(var(--foreground))',
              textDecoration: 'none',
              fontSize: '0.8rem',
              fontWeight: 500,
              transition: 'all 0.15s',
              '&:hover': {
                borderColor: 'hsl(var(--primary) / 0.5)',
                backgroundColor: 'hsl(var(--primary) / 0.08)',
              },
            }}
          >
            <GitHubIcon size={16} />
            Shuffle Security
          </Box>
        </Stack>
      </Box>

      <Stack spacing={4}>
        <DemoSection
          title="1. Agent UI — start &amp; debug"
          description={<><code>&lt;AgentUI /&gt;</code> — modern hero "What do you want to do?" prompt with MCP/app chips, plus a live decision timeline for debugging in-flight runs. Resumes from <code>?execution_id&amp;authorization</code> URL params. <Box component="button" type="button" onClick={scrollToActivity} sx={{ all: 'unset', cursor: 'pointer', color: 'hsl(var(--primary))', '&:hover': { textDecoration: 'underline' } }}>View past executions ↓</Box></>}
          code={SNIPPET_AGENT_UI}
          apis={[
            { method: 'POST', path: '/api/v1/agent', description: 'Submit prompt + selected MCP/app chips' },
            { method: 'GET', path: '/api/v1/streams/results', description: 'Live decision-by-decision timeline' },
            { method: 'GET', path: '/api/v1/apps/authentication', description: 'Resolve user-authenticated apps for chips' },
            { method: 'GET', path: '/api/v1/apps/:id/config', description: 'Enrich chip metadata (icon, categories)' },
            { method: 'POST', path: '/api/v1/apps/agent/run', description: 'Rerun a previous decision' },
          ]}
        >
          <AgentUI maxWidth={820} />
        </DemoSection>

        <DemoSection
          title="1b. Agent Run drawer"
          description={<><code>&lt;AgentRunDrawer /&gt;</code> — right-side drawer hosting the same <code>AgentUI</code> in a compact tab. Permissions and Local LLM tabs are slot-driven, so the drawer is fully standalone (no host context required). <Box component="button" type="button" onClick={scrollToActivity} sx={{ all: 'unset', cursor: 'pointer', color: 'hsl(var(--primary))', '&:hover': { textDecoration: 'underline' } }}>View past executions ↓</Box></>}
          code={`import { useState } from 'react';
import { Button } from '@mui/material';
import { AgentRunDrawer } from '@shuffleio/shuffle-mcps';

const [open, setOpen] = useState(false);

<>
  <Button variant="contained" onClick={() => setOpen(true)}>Open Agent</Button>
  <AgentRunDrawer open={open} onClose={() => setOpen(false)} />
          </>`}
          apis={[
            { method: 'POST', path: '/api/v1/agent', description: 'Submit prompt from the embedded AgentUI' },
            { method: 'GET', path: '/api/v1/streams/results', description: 'Live decision timeline' },
            { method: 'GET', path: '/api/v1/apps/authentication', description: 'Connected apps for the chips picker' },
          ]}
        >
          <AgentRunDrawerDemo />
        </DemoSection>

        <DemoSection
          title="2. Inline search"
          description={<><code>&lt;ShuffleMCP /&gt;</code> — Algolia + private apps merged into one searchable list.</>}
          code={SNIPPET_INLINE_SEARCH}
          apis={[
            { method: 'ALGOLIA', path: 'appsearch index', description: 'Public 3k+ app catalog (Algolia search)' },
            { method: 'GET', path: '/api/v1/apps', description: 'User-private apps merged into results (when apiKey is set)' },
            { method: 'GET', path: '/api/v1/apps/authentication', description: 'Status dots: validated / configured / inactive' },
          ]}
        >
          <ShuffleMCP
            inline
            layout="grid"
            gridColumns={3}
            apiKey={API_CONFIG.apiKey || undefined}
            customStyles={{ resultsContainer: { maxHeight: 320 } }}
          />
        </DemoSection>

        <DemoSection
          title="3. Search drawer"
          description={<><code>&lt;AppSearchDrawer /&gt;</code> — the exact same drawer used on /incidents → "Add Ingestion Source".</>}
          code={SNIPPET_SEARCH_DRAWER}
          apis={[
            { method: 'ALGOLIA', path: 'appsearch index', description: 'Catalog search inside the drawer' },
            { method: 'GET', path: '/api/v1/apps', description: 'Merged private apps' },
            { method: 'GET', path: '/api/v1/apps/authentication', description: 'Auth status per result' },
          ]}
        >
          <Button variant="contained" onClick={() => setSearchOpen(true)}>
            Open search drawer
          </Button>
        </DemoSection>

        <DemoSection
          title="4. App detail / config drawer"
          description={<><code>&lt;AppDetailDrawer /&gt;</code> — auth + MCP "try it out" for a single app.</>}
          code={SNIPPET_DETAIL_DRAWER}
          apis={[
            { method: 'GET', path: '/api/v1/apps/:id/config', description: 'Resolve app metadata + auth schema' },
            { method: 'GET', path: '/api/v1/apps/authentication', description: 'Existing auth entries for this app' },
            { method: 'POST', path: '/api/v1/apps/authentication', description: 'Save / update auth' },
            { method: 'POST', path: '/api/v1/apps/:name/mcp', description: 'Power the embedded "Try MCP" chat' },
          ]}
        >
          <Stack direction="row" spacing={1}>
            {['Gmail', 'Slack', 'VirusTotal'].map(name => (
              <Button key={name} variant="outlined" onClick={() => setDetailApp(name)}>
                {name}
              </Button>
            ))}
          </Stack>
        </DemoSection>

        <DemoSection
          title="5. Authentication (standalone)"
          description={<><code>&lt;AppAuthSection /&gt;</code> + <code>useAppLookup()</code> — drop the auth card anywhere by passing just an app name.</>}
          code={SNIPPET_AUTH_SECTION}
          apis={[
            { method: 'GET', path: '/api/v1/apps/:id/config', description: 'Auth field schema (apikey, oauth2, basic, …)' },
            { method: 'GET', path: '/api/v1/apps/authentication', description: 'Existing entries for this app' },
            { method: 'POST', path: '/api/v1/apps/authentication', description: 'Create or update an auth entry' },
            { method: 'PUT', path: '/api/v1/apps/authentication/:id', description: 'Rename / edit existing auth' },
            { method: 'GET', path: '/api/v1/docs/:name?location=openapi', description: 'OpenAPI spec for the app' },
          ]}
        >
          <AppNamePicker value={authApp} onChange={setAuthApp} />
          <AuthSectionDemo appName={authApp} />
        </DemoSection>

        <DemoSection
          title="6. Try MCP (standalone)"
          description={<><code>&lt;TryMcpSection /&gt;</code> — chat against an app's MCP tools. Resolves icon + id from the app name.</>}
          code={SNIPPET_TRY_MCP}
          apis={[
            { method: 'POST', path: '/api/v1/apps/:name/mcp', description: 'Send a chat message to the app\'s MCP tools' },
            { method: 'GET', path: '/api/v1/apps/:id/config', description: 'Resolve icon, categories, auth' },
          ]}
        >
          <AppNamePicker value={mcpApp} onChange={setMcpApp} />
          <TryMcpDemo appName={mcpApp} />
        </DemoSection>

        <DemoSection
          title="7. Try individual actions (standalone)"
          description={<><code>&lt;SingulActionsPreview /&gt;</code> — full curl/python catalog with Play. Sorts the app's category to the top.</>}
          code={SNIPPET_TRY_ACTIONS}
          apis={[
            { method: 'POST', path: '/api/v1/singul', description: 'Execute a Singul-mapped action across any app' },
            { method: 'POST', path: '/api/v1/apps/:id/run', description: 'Direct app action runner' },
            { method: 'GET', path: '/api/v1/apps/:id/config', description: 'Categories + action catalog' },
          ]}
        >
          <AppNamePicker value={actionsApp} onChange={setActionsApp} />
          <TryActionsDemo appName={actionsApp} />
        </DemoSection>

        <Box id="agent-activity" sx={{ scrollMarginTop: 96 }}>
          <DemoSection
            title="8. Agent activity list"
            description={<><code>&lt;AgentActivityList /&gt;</code> — past agent executions with search and status filters (All / Completed / Running / Failed). Click any row to open <code>&lt;AgentExecutionDrawer /&gt;</code> with the pre-loaded run.</>}
            code={`import { useState } from 'react';
import { AgentActivityList, AgentExecutionDrawer } from '@shuffleio/shuffle-mcps';
import type { AgentRun } from '@shuffleio/shuffle-mcps';

const [run, setRun] = useState<AgentRun | null>(null);

<>
  <AgentActivityList onRunClick={setRun} />
  <AgentExecutionDrawer
    open={run !== null}
    onClose={() => setRun(null)}
    run={run}
  />
  </>`}
            apis={[
              { method: 'POST', path: '/api/v1/workflows/search', description: 'Paginated past agent runs' },
              { method: 'GET', path: '/api/v1/streams/results', description: 'Inspect a single execution on row click' },
            ]}
          >
            <AgentActivityList onRunClick={setSelectedRun} />
          </DemoSection>
        </Box>

        <DemoSection
          title="9. Agents view (full page)"
          description={<><code>&lt;AgentsView /&gt;</code> — drop-in <code>/agents</code> page: hero AgentUI, edit-existing toggle, prefill from URL, and an embedded activity list. Requires an <code>onSchedule</code> callback so the host can create the underlying scheduled workflow.</>}
          code={`import { AgentsView } from '@shuffleio/shuffle-mcps';

<AgentsView
  onSchedule={async ({ cron, prompt, apps }) => {
    // Host creates the scheduled workflow here.
    await createScheduledAgent({ cron, prompt, apps });
  }}
/>`}
          apis={[
            { method: 'POST', path: '/api/v1/agent', description: 'Run the embedded AgentUI prompt' },
            { method: 'POST', path: '/api/v1/workflows/search', description: 'Past agent runs listed below the hero' },
            { method: 'POST', path: '/api/v1/workflows', description: 'Host writes the scheduled workflow on submit' },
          ]}
        >
          <Box sx={{ border: '1px solid hsl(var(--border))', borderRadius: 1.5, p: 2 }}>
            <AgentsView onSchedule={async () => { /* demo no-op */ }} maxWidth={720} />
          </Box>
        </DemoSection>

        <DemoSection
          title="10. App title header"
          description={<><code>&lt;AppTitleHeader /&gt;</code> — the standard app banner (icon, name, categories, Verified/Pending chip, Activate / + Add button) used at the top of any app detail surface.</>}
          code={`import { AppTitleHeader } from '@shuffleio/shuffle-mcps';

<AppTitleHeader
  name="Slack"
  image="https://shuffler.io/api/v1/apps/Slack/icon"
  categories={['Communication', 'Cases']}
  hasValidAuth
  isActivated
  onActivateToggle={() => console.log('toggle')}
/>`}
        >
          <Box sx={{ border: '1px solid hsl(var(--border))', borderRadius: 1.5, p: 2 }}>
            <AppTitleHeader
              name="Slack"
              categories={['Communication', 'Cases']}
              hasValidAuth
              hasAnyAuth
              isActivated
              onActivateToggle={() => console.log('toggle')}
            />
          </Box>
        </DemoSection>

        <DemoSection
          title="11. Pipelines banner"
          description={<><code>&lt;ShufflePipelinesBanner /&gt;</code> — small promo banner pointing users at Shuffle Pipelines / Tenzir. No props.</>}
          code={`import { ShufflePipelinesBanner } from '@shuffleio/shuffle-mcps';

<ShufflePipelinesBanner />`}
        >
          <Box sx={{ border: '1px solid hsl(var(--border))', borderRadius: 1.5, p: 2 }}>
            <ShufflePipelinesBanner />
          </Box>
        </DemoSection>

        <DemoSection
          title="12. Usage bar"
          description={<><code>&lt;UsageBar /&gt;</code> — compact reusable quota indicator (app runs, agent tokens, storage). Neutral by default, turns amber at 65% and red at 100%.</>}
          code={`import { UsageBar } from '@shuffleio/shuffle-mcps';

<UsageBar label="App runs" usage={1240} limit={2000} unit="runs" />
<UsageBar label="Agent tokens" usage={185000} limit={200000} unit="tokens"
  actionLabel="Upgrade" actionHref="https://shuffler.io/pricing" />`}
        >
          <Box sx={{ border: '1px solid hsl(var(--border))', borderRadius: 1.5, p: 2, display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 320 }}>
            <UsageBar label="App runs" usage={1240} limit={2000} unit="runs" />
            <UsageBar
              label="Agent tokens"
              usage={185000}
              limit={200000}
              unit="tokens"
              actionLabel="Upgrade"
              actionHref="https://shuffler.io/pricing"
            />
          </Box>
        </DemoSection>
      </Stack>

      <AppSearchDrawer
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Add Ingestion Source"
        subtitle="Search and authenticate a tool to ingest incidents from"
      />

      <AppDetailDrawer
        open={detailApp !== null}
        onClose={() => setDetailApp(null)}
        appName={detailApp}
      />

      <AgentExecutionDrawer
        open={selectedRun !== null}
        onClose={() => setSelectedRun(null)}
        run={selectedRun}
      />
    </Container>
    </>
  );
};

export default ShuffleMcpTestPage;
