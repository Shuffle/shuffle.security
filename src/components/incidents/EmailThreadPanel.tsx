/**
 * EmailThreadPanel — renders email threads extracted from incident descriptions.
 * Detects email content (From/To/Subject headers, forwarded chains, "On … wrote:" markers)
 * and displays them as a threaded conversation. Stays within OCSF class_uid 2005.
 */
import { Mail as EmailIcon, Reply as ReplyIcon, ChevronDown as ExpandMoreIcon, ChevronUp as ExpandLessIcon, Send as SendIcon, Forward as ForwardIcon, Paperclip as AttachFileIcon, User as PersonIcon, ExternalLink as OpenInNewIcon, X as CloseIcon, GripVertical as DragIndicatorIcon, Code as CodeIcon } from 'lucide-react';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDemo, TOUR_STEPS } from '@/context/DemoContext';
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Chip,
  Collapse,
  Tooltip,
  TextField,
  Button,
  Divider,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import EmailHtmlFrame from './EmailHtmlFrame';
import { resolveEmailThread, assignLatest, type ResolvedEmailThread } from '@/lib/emailThreadAdapters';
import { IncidentSection } from './IncidentSection';
import { confirmExternalLinkClick } from '@/utils/safeExternalLinks';

export interface EmailMessage {
  id: string;
  from: string;
  fromEmail?: string;
  to?: string;
  cc?: string;
  subject?: string;
  date?: string;
  body: string;
  bodyHtml?: string;
  isLatest?: boolean;
  /** Provider flagged this message as an unsent draft. */
  isDraft?: boolean;
}


interface EmailThreadPanelProps {
  descriptionHtml: string;
  descriptionText: string;
  rawOCSF?: any;
  onReply?: (to: string, subject: string, body: string) => void;
  onForward?: () => void;
  /** Removes the outer section chrome for document-style layouts. */
  borderless?: boolean;
  /** Initial collapsed state. When true, panel starts contracted. */
  defaultCollapsed?: boolean;
}

/** Extract email address from "Name <email>" format */
const extractEmail = (s: string): { name: string; email?: string } => {
  const cleaned = (s || '').replace(/\s+/g, ' ').trim();
  // Pull the first real-looking address anywhere in the string. Quoted
  // attribution lines often nest `<name <mailto:addr>>`, so a naive
  // `<...>` capture returns garbage.
  const addr = cleaned.match(/(?:mailto:)?([\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+)/);
  const named = cleaned.match(/^"?([^"<]+?)"?\s*<[^>]*>$/);
  const name = named?.[1]?.trim() || (addr ? cleaned.split('<')[0].trim() || addr[1] : cleaned);
  return { name: name || cleaned, email: addr?.[1] };
};

/** Get initials for avatar */
const getInitials = (name: string): string => {
  const parts = name.replace(/[<>@]/g, '').trim().split(/[\s.]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
};

/** Avatar color from string hash */
const hashColor = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const colors = ['#4285F4', '#EA4335', '#FBBC04', '#34A853', '#FF6D01', '#46BDC6', '#7B61FF', '#E8710A'];
  return colors[Math.abs(h) % colors.length];
};

/** Minimal HTML -> text conversion used when a provider only sent HTML. */
const htmlToPlainText = (html: string): string =>
  (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n');

/**
 * Detect whether content is email-like by looking for common patterns,
 * structured payloads, provider names, tags, and email headers.
 */
export const isEmailContent = (text: string, html: string, rawOCSF?: any, incident?: any): boolean => {
  // 1. Structured payload check via resolveEmailThread
  if (rawOCSF && resolveEmailThread(rawOCSF)) return true;
  if (incident?.rawOCSF && resolveEmailThread(incident.rawOCSF)) return true;
  if (incident && resolveEmailThread(incident)) return true;

  // 2. Incident or OCSF source & product check
  const sourceCandidates = [
    incident?.source,
    rawOCSF?.metadata?.product?.name,
    rawOCSF?.metadata?.product?.vendor_name,
    rawOCSF?.source,
    rawOCSF?.finding_info?.product_name,
  ].filter(Boolean).map(s => String(s).toLowerCase());

  const emailKeywords = ['gmail', 'outlook', 'microsoft 365', 'office 365', 'exchange', 'email', 'mail', 'imap', 'smtp', 'phish', 'phishing', 'abuse mailbox', 'security mailbox'];
  if (sourceCandidates.some(src => emailKeywords.some(k => src.includes(k)))) return true;

  // 3. Category, type, tags, labels check
  const tagCandidates = [
    ...(Array.isArray(incident?.tags) ? incident.tags : []),
    ...(Array.isArray(incident?.labels) ? incident.labels : []),
    ...(Array.isArray(rawOCSF?.tags) ? rawOCSF.tags : []),
    ...(Array.isArray(rawOCSF?.types) ? rawOCSF.types : []),
    ...(Array.isArray(rawOCSF?.finding_info?.types) ? rawOCSF.finding_info.types : []),
    incident?.category,
    incident?.type,
    rawOCSF?.category_name,
    rawOCSF?.class_name,
  ].filter(Boolean).map(s => String(s).toLowerCase());

  if (tagCandidates.some(t => /email|mail|phish/i.test(t))) return true;

  // 4. OCSF Email Activity class (UID 4001) or explicit email containers
  if (rawOCSF?.class_uid === 4001) return true;
  if (rawOCSF?.email || rawOCSF?.emails || rawOCSF?.email_details || incident?.email) return true;

  // 5. Header patterns & markers across text, decoded HTML, and plain text
  const plainHtml = htmlToPlainText(html);
  const combined = `${text}\n${plainHtml}`.substring(0, 8000);
  const cleaned = combined.replace(/[*_#`]/g, ''); // strip markdown emphasis like **From:** or _To:_

  const headerPatterns = [
    /^\s*From:\s*.+/mi,
    /^\s*To:\s*.+/mi,
    /^\s*Subject:\s*.+/mi,
    /^\s*Date:\s*.+/mi,
    /^\s*Sent:\s*.+/mi,
    /^\s*Cc:\s*.+/mi,
    /^\s*Reply-To:\s*.+/mi,
    /^\s*Sender:\s*.+/mi,
  ];
  const headerHits = headerPatterns.filter(p => p.test(cleaned)).length;
  if (headerHits >= 2) return true;

  // Forwarded / reply markers
  if (/-----\s*Original Message\s*-----/i.test(cleaned)) return true;
  if (/-----\s*Forwarded message\s*-----/i.test(cleaned)) return true;
  if (/On\s.+wrote:/i.test(cleaned)) return true;
  if (/Begin forwarded message/i.test(cleaned)) return true;
  if (/Original Appointment/i.test(cleaned)) return true;

  // MIME / message headers
  if (/Content-Type:\s*multipart\//i.test(cleaned)) return true;
  if (/MIME-Version:\s*1\./i.test(cleaned)) return true;
  if (/Message-ID:\s*<[^>]+>/i.test(cleaned)) return true;

  return false;
};

/**

 * Normalise a raw email body before threading: CRLF -> LF, non-breaking
 * spaces -> spaces, and strip the "> " quote markers plain-text clients add
 * to replies (those markers break the `^From:` / `^On … wrote:` anchors).
 */
const normalizeThreadText = (raw: string): string =>
  (raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(l => l.replace(/^(?:\s*>)+\s?/, ''))
    .join('\n');

/**
 * Wrap a plain-text body in a minimal HTML document so it can go through the
 * exact same sandboxed EmailHtmlFrame as an HTML body. Without this, the first
 * message (which usually has HTML) renders in the frame while quoted replies
 * render as raw <Typography> text — which feels like two different parsers.
 */
const plainTextToEmailHtml = (text: string): string => {
  const esc = (s: string) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = (text || '').split(/\r?\n/);
  const quoteDepth = (line: string) => {
    const m = line.match(/^(\s*(?:>\s?)+)/);
    if (!m) return 0;
    return (m[1].match(/>/g) || []).length;
  };
  const stripQuotes = (line: string) => line.replace(/^(\s*(?:>\s?)+)/, '');

  // Group consecutive lines by quote depth so "> " markers become real,
  // visually indented blockquotes instead of literal characters.
  const groups: { depth: number; body: string[] }[] = [];
  for (const line of lines) {
    const depth = quoteDepth(line);
    const content = depth > 0 ? stripQuotes(line) : line;
    const last = groups[groups.length - 1];
    if (last && last.depth === depth) last.body.push(content);
    else groups.push({ depth, body: [content] });
  }

  const html = groups
    .map(({ depth, body }) => {
      const inner = `<div style="white-space:pre-wrap;">${esc(body.join('\n'))}</div>`;
      if (depth === 0) return inner;
      let out = inner;
      for (let i = 0; i < depth; i += 1) {
        out = `<blockquote style="margin:8px 0;padding:2px 0 2px 12px;border-left:2px solid #d1d5db;color:#4b5563;">${out}</blockquote>`;
      }
      return out;
    })
    .join('');

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;word-break:break-word;">${html}</div>`;
};


/**
 * Pull the body out of a full HTML document so several provider messages can
 * be concatenated into one raw view without nesting <html>/<body> elements
 * (which browsers drop, leaving unstyled Times New Roman text).
 */
const extractHtmlBody = (html: string): string => {
  const src = html || '';
  const bodyMatch = src.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : src.replace(/<\/?(?:!doctype|html|head)[^>]*>/gi, '');
  // Keep any <style> blocks that lived in <head> — email templates rely on them.
  const styles = (src.match(/<style[\s\S]*?<\/style>/gi) || []).join('\n');
  return `${styles}${body}`;
};

/**
 * Wrap raw email HTML in the same base typography the threaded view gets, so
 * text nodes that carry no styling of their own do not fall back to the
 * browser's serif default at document font size.
 */
const wrapRawEmailHtml = (inner: string): string =>
  `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#111827;word-break:break-word;">${inner}</div>`;

/**
 * Raw mode must look identical to the threaded message body. Full provider
 * documents carry their own <body> attributes (bgcolor, align, width) that
 * centre and colour the email — extracting the body markup throws those away,
 * which is why raw mode used to render left-aligned and uncoloured. So pass a
 * complete document through untouched and only wrap bare fragments.
 */
const rawEmailDocument = (html: string): string => {
  const trimmed = (html || '').trim();
  if (!trimmed) return '';
  if (/^<!doctype|<html[\s>]|<body[\s>]/i.test(trimmed)) return trimmed;
  return wrapRawEmailHtml(extractHtmlBody(trimmed));
};

/**
 * Split the original rich HTML at provider quote containers while retaining
 * the markup and style rules for every message. The text parser determines
 * message boundaries and headers; these sections provide the corresponding
 * rendered bodies instead of degrading older messages to plain text.
 */
const extractThreadHtmlSections = (html: string): string[] => {
  if (!html || typeof DOMParser === 'undefined') return [];

  const source = extractHtmlBody(html);
  const styles = (html.match(/<style[\s\S]*?<\/style>/gi) || []).join('\n');
  const selectors = [
    '.gmail_quote',
    '#divRplyFwdMsg',
    '#appendonsend',
    'blockquote[type="cite"]',
    'blockquote',
  ].join(',');
  const sections: string[] = [];
  let remaining = source;

  // Quoted history is commonly nested, so peel off one provider quote
  // container at a time. A cap protects against malformed/cyclic markup.
  for (let depth = 0; depth < 30 && remaining.trim(); depth += 1) {
    const doc = new DOMParser().parseFromString(`<body>${remaining}</body>`, 'text/html');
    const quote = doc.body.querySelector(selectors);
    if (!quote) {
      const finalBody = doc.body.innerHTML.trim();
      if (finalBody) sections.push(wrapRawEmailHtml(`${styles}${finalBody}`));
      break;
    }

    const quotedHtml = quote.innerHTML.trim();
    quote.remove();
    const currentBody = doc.body.innerHTML.trim();
    if (currentBody && htmlToPlainText(currentBody).trim()) {
      sections.push(wrapRawEmailHtml(`${styles}${currentBody}`));
    }

    if (!quotedHtml || quotedHtml === remaining) break;
    remaining = quotedHtml;
  }

  return sections;
};



/**
 * Split an HTML body at the first quoted-reply marker. Gmail wraps quoted
 * history in `.gmail_quote` / `<blockquote>`, Outlook in `#divRplyFwdMsg`,
 * `#appendonsend` or a horizontal rule. Returns the top (new) part only.
 */
export const stripQuotedHtml = (html: string): string => {
  if (!html) return '';
  const markers = [
    /<div[^>]*class="[^"]*gmail_quote[^"]*"/i,
    /<div[^>]*id="divRplyFwdMsg"/i,
    /<div[^>]*id="appendonsend"/i,
    /<blockquote/i,
    /<hr[^>]*id="stopSpelling"/i,
  ];
  let cut = -1;
  for (const m of markers) {
    const idx = html.search(m);
    if (idx >= 0 && (cut === -1 || idx < cut)) cut = idx;
  }
  if (cut <= 0) return html;
  return html.slice(0, cut);
};

/**
 * Parse email content into individual messages in a thread.
 */
const parseEmailThread = (text: string, html: string): EmailMessage[] => {
  const messages: EmailMessage[] = [];
  const normalized = normalizeThreadText(text);

  // Try to split by common thread delimiters. Every delimiter is applied
  // (not just the first that matches) so a chain that mixes Gmail
  // "On … wrote:" markers with Outlook "From:/Sent:" headers still splits.
  const delimiters = [
    /(?=^\s*-{2,}\s*Original Message\s*-{2,})/gim,
    /(?=^\s*-{2,}\s*Forwarded message\s*-{2,})/gim,
    /(?=^On\s[^\n]{5,200}(?:\n[^\n]{0,200})?wrote:)/gim,
    /(?=^From:\s*.+\n\s*(?:Sent|Date|To|Subject):)/gim,
  ];

  let parts: string[] = [normalized];
  for (const delim of delimiters) {
    const newParts: string[] = [];
    for (const part of parts) {
      const splits = part.split(delim).filter(s => s.trim());
      newParts.push(...splits);
    }
    if (newParts.length >= parts.length) parts = newParts;
  }

  // A split is only a real message boundary when the fragment is actually
  // attributable to a sender — i.e. it starts with a "From:" header block or a
  // "On … wrote:" attribution (optionally preceded by an Original/Forwarded
  // banner). Plain separators (horizontal rules, underscore lines, dividers in
  // marketing templates) are NOT message boundaries: glue that text back onto
  // the previous fragment instead of inventing an "Earlier message" bubble.
  const HEADER_START = /^\s*(?:-{2,}\s*(?:Original Message|Forwarded message)\s*-{2,}\s*\n+\s*)?(?:From:\s*.+\n\s*(?:Sent|Date|To|Subject):|On\s[\s\S]{5,300}?\swrote:)/i;
  const merged: string[] = [];
  for (const part of parts) {
    if (merged.length > 0 && !HEADER_START.test(part)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n${part}`;
    } else {
      merged.push(part);
    }
  }
  parts = merged;


  // If no splits found, treat the whole thing as a single message
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    // Extract headers from this part
    const fromMatch = part.match(/^From:\s*(.+)/mi);
    const toMatch = part.match(/^To:\s*(.+)/mi);
    const ccMatch = part.match(/^Cc:\s*(.+)/mi);
    const subjectMatch = part.match(/^Subject:\s*(.+)/mi);
    const dateMatch = part.match(/^(?:Date|Sent):\s*(.+)/mi);
    const wroteMatch = part.match(/^On\s([\s\S]{5,300}?)\swrote:/mi);

    // "On <date> at <time> <Name> <email> wrote:" — the sender is the tail of
    // the attribution line, not the whole date string. Prefer the address, and
    // fall back to the words right before it.
    let wroteFrom = '';
    let wroteDate = '';
    if (wroteMatch) {
      const attribution = wroteMatch[1].replace(/\s+/g, ' ').trim();
      const emailMatch = attribution.match(/<?(?:mailto:)?([\w.+-]+@[\w.-]+\.\w+)/);
      const beforeEmail = emailMatch ? attribution.slice(0, attribution.indexOf(emailMatch[0])) : attribution;
      // Date part is everything up to (and including) the time.
      // Split after the final clock time in the attribution. Using a single
      // broad regex can leave pieces such as `:11 PM` attached to the sender.
      const timePattern = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s*[+-]\d{4})?/gi;
      const timeMatches = Array.from(beforeEmail.matchAll(timePattern));
      const finalTime = timeMatches[timeMatches.length - 1];
      const splitAt = finalTime?.index !== undefined
        ? finalTime.index + finalTime[0].length
        : -1;
      wroteDate = (splitAt >= 0 ? beforeEmail.slice(0, splitAt) : beforeEmail)
        .trim()
        .replace(/[,\s]+$/, '');
      const namePart = (splitAt >= 0 ? beforeEmail.slice(splitAt) : '')
        .replace(/^\s*(?:at\s+)?/i, '')
        .trim()
        .replace(/[<,\s]+$/, '');
      wroteFrom = namePart || emailMatch?.[1] || '';
    }

    const from = fromMatch?.[1]?.trim() || wroteFrom;
    const date = dateMatch?.[1]?.trim() || wroteDate;

    // Extract body: remove the header block
    let body = part;
    // Remove header lines from top
    body = body.replace(/^(From|To|Cc|Bcc|Subject|Date|Sent|Reply-To):\s*.+\n?/gmi, '');
    body = body.replace(/^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}\n?/gmi, '');
    body = body.replace(/^_{10,}\s*\n?/gm, '');
    body = body.replace(/^On\s[\s\S]{5,300}?wrote:\s*\n?/mi, '');
    body = body.trim();

    // Drop empty fragments entirely rather than rendering a blank bubble.
    if (!body && !from) continue;

    // Never invent an anonymous "Earlier message": if we cannot attribute the
    // fragment to a sender, it is continuation text of the previous message.
    if (!from && messages.length > 0) {
      const prev = messages[messages.length - 1];
      prev.body = `${prev.body}\n${body}`.trim();
      continue;
    }

    messages.push({
      id: `email-${i}`,
      from: from || 'Sender',

      fromEmail: fromMatch
        ? extractEmail(fromMatch[1].trim()).email
        : (wroteMatch ? extractEmail(wroteMatch[1]).email : undefined),
      to: toMatch?.[1]?.trim(),
      cc: ccMatch?.[1]?.trim(),
      subject: subjectMatch?.[1]?.trim(),
      date,
      body,
      isLatest: messages.length === 0,
    });
  }


  // If we got nothing, create a single message
  if (messages.length === 0) {
    messages.push({
      id: 'email-0',
      from: 'Sender',
      body: text,
      isLatest: true,
    });
  }

  // Attach the matching rich HTML slice to every parsed message. This keeps
  // each section independently rendered with the provider's original markup
  // rather than styling only the newest message and flattening the rest.
  const htmlSections = extractThreadHtmlSections(html);
  for (let i = 0; i < messages.length; i += 1) {
    const section = htmlSections[i];
    if (section) messages[i].bodyHtml = section;
  }

  return messages;
};

/** Count messages in email thread from structured data or raw text/html.
 * Drafts in an existing thread are omitted until sent.
 */
export const getEmailMessageCount = (text: string, html: string, rawOCSF?: any, incident?: any): number => {
  const structured = resolveEmailThread(rawOCSF || incident?.rawOCSF || incident);
  if (structured && structured.messages.length > 0) {
    const nonDrafts = structured.messages.filter(m => !m.isDraft);
    return nonDrafts.length > 0 ? nonDrafts.length : structured.messages.length;
  }
  if (!text && !html) return 0;
  return parseEmailThread(text, html).length;
};

/** Inline header-style row for To/Cc/Bcc inputs in the reply box. */
const RecipientRow = ({
  label,
  value,
  onChange,
  placeholder,
  onRemove,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onRemove?: () => void;
  autoFocus?: boolean;
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center', px: 1.25, py: 0.25, gap: 1 }}>
    <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', minWidth: 32 }}>
      {label}
    </Typography>
    <TextField
      variant="standard"
      fullWidth
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      InputProps={{ disableUnderline: true, sx: { fontSize: '0.78rem', py: 0.25 } }}
    />
    {onRemove && (
      <IconButton
        size="small"
        onClick={onRemove}
        sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
      >
        <ExpandLessIcon size={14} style={{ transform: 'rotate(45deg)' }} />
      </IconButton>
    )}
  </Box>
);

const EmailThreadPanel = ({
  descriptionHtml,
  descriptionText,
  rawOCSF,
  onReply,
  onForward,
  borderless = false,
  defaultCollapsed = false,
}: EmailThreadPanelProps) => {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [replyCc, setReplyCc] = useState('');
  const [replyBcc, setReplyBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  // Raw mode renders the original email content in one block (the pre-threading
  // rendering) so a mis-parsed thread can always be read as-is. Persisted in
  // localStorage so a user who prefers raw email keeps that choice across
  // incidents.
  const EMAIL_THREAD_RAW_KEY = 'shuffle-incident-email-thread-raw';
  const [rawMode, setRawModeState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(EMAIL_THREAD_RAW_KEY) === '1';
    } catch { /* ignore */ }
    return false;
  });

  const setRawMode: typeof setRawModeState = (value) => {
    setRawModeState((prev) => {
      const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value;
      try { localStorage.setItem(EMAIL_THREAD_RAW_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };


  // Email incidents ALWAYS start with the thread visible on desktop unless
  // defaultCollapsed is explicitly requested (e.g. in Simple view near the top).
  // On mobile the Email Thread is collapsed by default and the Timeline is expanded.
  const EMAIL_THREAD_OPEN_KEY = 'shuffle-incident-email-thread-open';
  const [threadCollapsed, setThreadCollapsed] = useState<boolean>(defaultCollapsed);

  const persistThreadOpen = useCallback((open: boolean) => {
    setThreadCollapsed(!open);
    // Only mobile persists this choice — on desktop the email thread must
    // always start visible on the next incident unless defaultCollapsed.
    if (typeof window !== 'undefined' && window.innerWidth < 600) {
      try { localStorage.setItem(EMAIL_THREAD_OPEN_KEY, open ? '1' : '0'); } catch { /* ignore */ }
    }
  }, []);

  // Mobile defaults: raw view is the only option and is on by default; the
  // thread itself is collapsed by default so the Timeline stays prominent.
  // These effects run once after hydration to avoid server/client mismatches.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const mobileViewport = window.innerWidth < 600;
      const rawStored = localStorage.getItem(EMAIL_THREAD_RAW_KEY);
      if (mobileViewport) {
        setRawModeState(true);
      } else if (rawStored === '1') {
        setRawModeState(true);
      } else if (rawStored === '0') {
        setRawModeState(false);
      }

      if (!mobileViewport) {
        if (defaultCollapsed) {
          setThreadCollapsed(true);
        } else {
          setThreadCollapsed(false);
        }
        return;
      }

      const openStored = localStorage.getItem(EMAIL_THREAD_OPEN_KEY);
      if (openStored === '1') {
        setThreadCollapsed(false);
      } else {
        setThreadCollapsed(true);
        localStorage.setItem(EMAIL_THREAD_OPEN_KEY, '0');
      }
    } catch { /* ignore */ }
  }, []);

  // Keep raw mode forced on whenever the viewport is mobile (state only — the
  // stored desktop preference is left untouched).
  useEffect(() => {
    if (isMobile && !rawMode) {
      setRawModeState(true);
    }
  }, [isMobile, rawMode]);


  // Popout mode — like Gmail's "open in new window" button. When enabled the
  // entire panel is rendered into a draggable floating card via a React
  // portal, so the user can keep reading the email while they navigate
  // around the rest of the incident page.
  const [poppedOut, setPoppedOut] = useState(false);
  const POP_SIZE_KEY = 'shuffle-incident-email-popout-size';
  const MIN_POP_W = 360;
  const MIN_POP_H = 240;
  const [popSize, setPopSize] = useState<{ w: number; h: number }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(POP_SIZE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { w?: number; h?: number };
          if (typeof parsed.w === 'number' && typeof parsed.h === 'number') {
            return {
              w: Math.max(MIN_POP_W, parsed.w),
              h: Math.max(MIN_POP_H, parsed.h),
            };
          }
        }
      } catch { /* ignore */ }
    }
    return { w: 720, h: 600 };
  });
  const [popPos, setPopPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? Math.max(24, window.innerWidth - popSize.w - 32) : 80,
    y: 96,
  }));
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragRef.current = { dx: e.clientX - popPos.x, dy: e.clientY - popPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const nx = ev.clientX - dragRef.current.dx;
      const ny = ev.clientY - dragRef.current.dy;
      // Keep within viewport
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 60;
      setPopPos({
        x: Math.min(Math.max(-popSize.w + 80, nx), maxX),
        y: Math.min(Math.max(0, ny), maxY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [popPos.x, popPos.y, popSize.w]);

  // Resize from the bottom-right grip; the chosen size is remembered.
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = popSize.w;
    const startH = popSize.h;
    let latest = { w: startW, h: startH };
    const onMove = (ev: MouseEvent) => {
      latest = {
        w: Math.max(MIN_POP_W, Math.min(startW + (ev.clientX - startX), window.innerWidth - 24)),
        h: Math.max(MIN_POP_H, Math.min(startH + (ev.clientY - startY), window.innerHeight - 24)),
      };
      setPopSize(latest);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try { localStorage.setItem(POP_SIZE_KEY, JSON.stringify(latest)); } catch { /* ignore */ }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [popSize.w, popSize.h]);


  // Demo tour: keep the auto-collapse behaviour explicit so the spotlight on
  // step #5 lands on the timeline. Reset the one-shot guard between demo
  // sessions so a re-opened tour can collapse it again if the user expanded.
  const { drawerOpen: demoDrawerOpen, step: demoStep } = useDemo();
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    if (!demoDrawerOpen) {
      autoCollapsedRef.current = false;
      return;
    }
    const stepId = TOUR_STEPS[demoStep]?.id;
    if (stepId === 'incident-detail' && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true;
      persistThreadOpen(false);
    }
  }, [demoDrawerOpen, demoStep]);

  // Prefer the structured adapter (Gmail/Outlook/generic) when
  // rawOCSF.unmapped_original is available — it is far more reliable than
  // regex-parsing the description text. Fall back to the legacy parser
  // only when no provider payload is recognised.
  const resolved: ResolvedEmailThread | null = useMemo(
    () => resolveEmailThread(rawOCSF),
    [rawOCSF],
  );

  const messages = useMemo(
    () => {
      const structured = resolved?.messages || [];
      // If the provider payload only exposed a single message (common with
      // Gmail/Outlook, which return each message in a thread individually),
      // the message body itself usually contains the previous replies as
      // inline-quoted text ("On … wrote:", "From: …"). Fall back to the
      // legacy regex parser on that body so the thread expands into every
      // historical message instead of showing just the latest one.
      if (structured.length === 1) {
        const only = structured[0];
        // Prefer the plain-text body for splitting; when the provider only
        // gave HTML, derive text from it so quoted replies are still found.
        const sourceText = only.body || htmlToPlainText(only.bodyHtml || '');
        const quoted = parseEmailThread(sourceText, only.bodyHtml || '');
        if (quoted.length > 1) {
          // Replace the first parsed piece with the structured header
          // (it already has accurate from/to/date/subject/isDraft metadata),
          // then keep the inline-quoted older messages that follow.
          // The HTML body still holds the whole quoted chain, so cut it at
          // the first quote marker to avoid rendering history twice.
          const merged: EmailMessage[] = [
            {
              ...only,
              body: quoted[0].body,
              bodyHtml: quoted[0].bodyHtml || (stripQuotedHtml(only.bodyHtml || '').trim() || undefined),
              isLatest: true,
            },
            ...quoted.slice(1).map((m, i) => ({ ...m, id: `email-quoted-${i}`, isLatest: false })),
          ];
          return merged;
        }
        return structured;
      }

      if (structured.length > 0) return structured;
      return parseEmailThread(descriptionText, descriptionHtml);
    },
    [resolved, descriptionText, descriptionHtml],
  );

  // Drafts can exist, but they should not be a part of the full threading until sent.
  // AKA we just don't show them in the existing Email thread list.
  const hasNonDraft = useMemo(() => messages.some(m => !m.isDraft), [messages]);
  const draftCount = useMemo(() => messages.filter(m => m.isDraft).length, [messages]);
  const allDrafts = messages.length > 0 && draftCount === messages.length;

  const displayMessages: EmailMessage[] = useMemo(() => {
    if (hasNonDraft) {
      const nonDrafts = messages.filter(m => !m.isDraft);
      return assignLatest(nonDrafts);
    }
    return messages;
  }, [messages, hasNonDraft]);

  // Raw mode = render the complete current provider message once, without
  // turning its quoted history into UI rows. It is still parsed/rendered HTML;
  // "raw" does not mean source code or concatenating every provider message.
  const rawHtml = useMemo(() => {
    const current = displayMessages.find((message) => message.isLatest)
      || displayMessages[0];
    if (current?.bodyHtml?.trim()) {
      // Compare readable content only. Marketing/notification emails (LinkedIn,
      // Jira, etc.) carry a plain alternative stuffed with tracking URLs, which
      // makes the plain part far "longer" than the rendered HTML even though the
      // HTML is the complete, useful message. Strip URLs before comparing.
      const readable = (s: string) =>
        s.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim().length;
      const htmlTextLength = readable(htmlToPlainText(current.bodyHtml));
      const plainTextLength = readable(current.body);
      // Only fall back to the plain alternative when the HTML part is
      // essentially empty (a stub/partial MIME fragment).
      if (plainTextLength > 0 && htmlTextLength < 40 && htmlTextLength < plainTextLength * 0.5) {
        return plainTextToEmailHtml(current.body);
      }
      return rawEmailDocument(current.bodyHtml);
    }
    if (current?.body?.trim()) return plainTextToEmailHtml(current.body);

    if (descriptionHtml && descriptionHtml.trim()) {
      return rawEmailDocument(descriptionHtml);
    }

    // Last resort: the threaded parser often recovered HTML slices even when
    // no provider payload / description HTML exists. Without this, raw mode
    // silently rendered nothing at all.
    const fromParsed = displayMessages
      .map((m) => m.bodyHtml)
      .filter((h): h is string => !!h && !!h.trim())
      .map(extractHtmlBody);
    if (fromParsed.length) return rawEmailDocument(fromParsed[0]);

    return '';
  }, [displayMessages, descriptionHtml]);

  const rawText = useMemo(() => {
    const fromProvider = displayMessages
      .map((m) => m.body)
      .filter((b): b is string => !!b && !!b.trim());
    if (fromProvider.length) return fromProvider.join('\n\n');
    return descriptionText;
  }, [displayMessages, descriptionText]);

  const sourceLabel = resolved?.source === 'gmail'
    ? 'Gmail'
    : resolved?.source === 'outlook'
      ? 'Outlook'
      : resolved?.source === 'generic'
        ? 'Email'
        : null;

  // Thread subject from first message
  const threadSubject = useMemo(() => {
    for (const m of displayMessages) {
      if (m.subject) return m.subject.replace(/^(Re|Fwd|Fw):\s*/gi, '').trim();
    }
    return rawOCSF?.title || '';
  }, [displayMessages, rawOCSF]);

  // Latest message is always expanded, toggle older ones
  const toggleMessage = (id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Prefill To/Cc when the reply box is opened, derived from the latest
  // message: reply goes to the sender, Cc preserves any existing Cc recipients.
  // If an omitted draft exists in this thread, populate the reply box with its text.
  useEffect(() => {
    if (!showReplyBox) return;
    const latest = displayMessages[0];
    if (!latest) return;
    const defaultTo = latest.fromEmail || latest.from || '';
    setReplyTo(prev => prev || defaultTo);
    if (latest.cc && !replyCc) {
      setReplyCc(latest.cc);
      setShowCc(true);
    }
    const draftMsg = messages.find((m) => m.isDraft);
    if (draftMsg?.body && !replyText) {
      setReplyText(draftMsg.body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReplyBox]);

  const handleReply = () => {
    if (!replyText.trim() || !replyTo.trim()) return;
    const subject = threadSubject ? `Re: ${threadSubject}` : '';
    // Encode Cc/Bcc into the body header so downstream consumers that only
    // accept (to, subject, body) still receive the routing info.
    const headerLines: string[] = [];
    if (replyCc.trim()) headerLines.push(`Cc: ${replyCc.trim()}`);
    if (replyBcc.trim()) headerLines.push(`Bcc: ${replyBcc.trim()}`);
    const body = headerLines.length ? `${headerLines.join('\n')}\n\n${replyText}` : replyText;
    onReply?.(replyTo.trim(), subject, body);
    setReplyText('');
    setReplyCc('');
    setReplyBcc('');
    setShowCc(false);
    setShowBcc(false);
    setShowReplyBox(false);
  };

  if (displayMessages.length === 0) return null;

  // Header badges (parsed-from chip only). Rendered next to the title in
  // IncidentSection's `badge` slot.
  const headerBadge = (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {sourceLabel && (
        <Tooltip title={`Parsed from structured ${sourceLabel} payload (unmapped_original)`} arrow>
          <Chip
            label={sourceLabel}
            size="small"
            variant="outlined"
            sx={{
              height: 18,
              fontSize: '0.65rem',
              bgcolor: 'transparent',
              borderColor: 'hsl(var(--border))',
              color: 'text.secondary',
              display: { xs: 'none', sm: 'inline-flex' },
            }}
          />
        </Tooltip>
      )}
      {allDrafts && (
        <Tooltip
          title="Every message in this thread is an unsent draft — do not treat it as a source of truth."
          arrow
        >
          <Chip
            label="Draft only"
            size="small"
            variant="outlined"
            sx={{
              height: 18,
              fontSize: '0.65rem',
              bgcolor: 'transparent',
              borderColor: 'hsl(var(--warning) / 0.5)',
              color: 'hsl(var(--warning))',
            }}
          />
        </Tooltip>
      )}
      {draftCount > 0 && !allDrafts && (
        <Tooltip
          title={`${draftCount} unsent draft${draftCount !== 1 ? 's' : ''} in this thread omitted from thread list until sent.`}
          arrow
        >
          <Chip
            label={`${draftCount} draft${draftCount !== 1 ? 's' : ''} omitted`}
            size="small"
            variant="outlined"
            sx={{
              height: 18,
              fontSize: '0.65rem',
              bgcolor: 'transparent',
              borderColor: 'hsl(var(--warning) / 0.5)',
              color: 'hsl(var(--warning))',
            }}
          />
        </Tooltip>
      )}
    </Box>
  );



  // Right-side action buttons (reply / forward / popout). Rendered in
  // IncidentSection's `actions` slot.
  const headerActions = (
    <>
      <Box sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
        <Tooltip title={rawMode ? 'Show threaded view' : 'Show raw email'}>
          <IconButton
            size="small"
            onClick={() => setRawMode(r => !r)}
            sx={{
              color: rawMode ? primaryColor : 'text.secondary',
              '&:hover': { color: primaryColor },
            }}
          >
            <CodeIcon size={17} />
          </IconButton>
        </Tooltip>
      </Box>

      {onReply && (
        <Tooltip title="Reply (disabled)">
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
            <IconButton size="small" disabled sx={{
              color: 'text.secondary',
            }}>
              <ReplyIcon size={18} />
            </IconButton>
          </Box>
        </Tooltip>
      )}
      {onForward && (
        <Tooltip title="Forwarding is not yet available">
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
            <IconButton size="small" disabled sx={{
              color: 'text.secondary',
              '&:hover': { color: primaryColor },
            }}>
              <ForwardIcon size={18} />
            </IconButton>
          </Box>
        </Tooltip>
      )}
      <Tooltip title={poppedOut ? 'Dock back inline' : 'Open in popout window'}>
        <IconButton
          size="small"
          onClick={() => {
            setPoppedOut(p => !p);
            if (!poppedOut) persistThreadOpen(true);
          }}
          sx={{
            display: { xs: 'none', sm: 'inline-flex' },
            color: poppedOut ? primaryColor : 'text.secondary',
            '&:hover': { color: primaryColor },
          }}
        >
          {poppedOut ? <CloseIcon size={18} /> : <OpenInNewIcon size={16} />}
        </IconButton>
      </Tooltip>
    </>
  );

  // Body of the email panel — subject line, message list, and the reply box.
  // Shared by both the inline IncidentSection and the popped-out floating
  // window so behaviour stays identical in both surfaces.
  const panelBody = (
    <>
      {/* Subject line — hidden on mobile; the raw view shows a labelled
          From/Subject block above the email body instead. */}
      {threadSubject && (
        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid hsl(var(--border))', display: { xs: 'none', sm: 'block' } }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {threadSubject}
          </Typography>
        </Box>
      )}

      {/* Messages — or the untouched original content in raw mode */}
      <Box sx={{ maxHeight: poppedOut ? 'none' : 500, flex: poppedOut ? 1 : 'unset', overflow: 'auto' }}>
        {rawMode ? (
          <Box sx={{ px: 2, py: 1.5 }}>
            <Box sx={{ display: { xs: 'flex', sm: 'none' }, flexDirection: 'column', gap: 0.25, mb: 1.5 }}>
              {(() => {
                const first = displayMessages[0];
                const parsed = extractEmail(first.from);
                const name = parsed.name || first.from;
                const email = parsed.email || first.fromEmail;
                const display = email ? (parsed.email && parsed.name ? `${name} <${email}>` : email) : name;
                return (
                  <Typography variant="caption" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    From: {display}
                  </Typography>
                );
              })()}
              {threadSubject && (
                <Typography variant="caption" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Subject: {threadSubject}
                </Typography>
              )}
            </Box>
            <EmailHtmlFrame html={rawHtml || plainTextToEmailHtml(rawText)} />
          </Box>

        ) : displayMessages.map((msg, idx) => {

          const isExpanded = msg.isLatest ? !expandedMessages.has(msg.id) : expandedMessages.has(msg.id);
          const parsed = extractEmail(msg.from);
          const name = parsed.name;
          // Prefer any address embedded in the display string; otherwise fall
          // back to the structured `fromEmail` from the adapter so we still
          // show the sender's address for values like `"'Brandon' via Shuffle Platform"`.
          const email = parsed.email || msg.fromEmail;
          const avatarColor = hashColor(msg.from);

          return (
            <Box key={msg.id} sx={{
              borderBottom: idx < displayMessages.length - 1 ? '1px solid hsl(var(--border))' : 'none',
            }}>
              <Box
                onClick={() => toggleMessage(msg.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1,
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  },
                  transition: 'background-color 0.15s',
                }}
              >
                <Avatar sx={{
                  width: 32,
                  height: 32,
                  bgcolor: avatarColor,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}>
                  {getInitials(name)}
                </Avatar>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography variant="body2" sx={{
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {name}
                    </Typography>
                    {email && (
                      <Typography variant="caption" sx={{
                        color: 'text.secondary',
                        fontSize: '0.7rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        &lt;{email}&gt;
                      </Typography>
                    )}
                    {msg.isLatest && !msg.isDraft && (
                      <Chip label="Latest" size="small" sx={{
                        height: 16,
                        fontSize: '0.6rem',
                        bgcolor: 'rgba(34, 197, 94, 0.15)',
                        color: '#22c55e',
                        ml: 0.5,
                      }} />
                    )}
                    {msg.isDraft && (
                      <Tooltip title="Unsent draft — not a source of truth" arrow>
                        <Chip label="Draft" size="small" sx={{
                          height: 16,
                          fontSize: '0.6rem',
                          bgcolor: 'hsl(var(--warning) / 0.15)',
                          color: 'hsl(var(--warning))',
                          ml: 0.5,
                        }} />
                      </Tooltip>
                    )}

                  </Box>
                  {!isExpanded && (
                    <Typography variant="caption" sx={{
                      color: 'text.disabled',
                      fontSize: '0.7rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                      maxWidth: 400,
                    }}>
                      {msg.body.substring(0, 120)}…
                    </Typography>
                  )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  {msg.date && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                      {msg.date}
                    </Typography>
                  )}
                  <IconButton size="small" sx={{ color: 'text.secondary' }}>
                    {isExpanded ? <ExpandLessIcon size={16} /> : <ExpandMoreIcon size={16} />}
                  </IconButton>
                </Box>
              </Box>

              <Collapse in={isExpanded}>
                <Box sx={{ px: 2, pb: 1.5 }}>
                  {(msg.to || msg.cc) && (
                    <Box sx={{ display: 'flex', gap: 2, mb: 1, flexWrap: 'wrap' }}>
                      {msg.to && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                          <strong>To:</strong> {msg.to}
                        </Typography>
                      )}
                      {msg.cc && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                          <strong>Cc:</strong> {msg.cc}
                        </Typography>
                      )}
                    </Box>
                  )}
                  <Box sx={{ pl: { xs: 0, sm: 5.5 } }}>
                    {/* Every message body — HTML or plain text — goes through
                        the same sandboxed frame so the thread renders
                        consistently instead of only the first message. */}
                    <EmailHtmlFrame html={msg.bodyHtml || plainTextToEmailHtml(msg.body)} />
                  </Box>

                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>

      {/* Reply box */}
      <Collapse in={showReplyBox}>
        <Box sx={{
          borderTop: '1px solid hsl(var(--border))',
          p: 2,
          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReplyIcon size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                Reply to {displayMessages[0]?.from || 'sender'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {!showCc && (
                <Button
                  size="small"
                  onClick={() => setShowCc(true)}
                  sx={{ fontSize: '0.7rem', textTransform: 'none', minWidth: 0, px: 0.75, py: 0, color: 'text.secondary', '&:hover': { color: '#ff6600', bgcolor: 'transparent' } }}
                >
                  + Cc
                </Button>
              )}
              {!showBcc && (
                <Button
                  size="small"
                  onClick={() => setShowBcc(true)}
                  sx={{ fontSize: '0.7rem', textTransform: 'none', minWidth: 0, px: 0.75, py: 0, color: 'text.secondary', '&:hover': { color: '#ff6600', bgcolor: 'transparent' } }}
                >
                  + Bcc
                </Button>
              )}
            </Box>
          </Box>

          <Stack spacing={0} sx={{
            mb: 1,
            border: '1px solid hsl(var(--border))',
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
          }}>
            <RecipientRow
              label="To"
              value={replyTo}
              onChange={setReplyTo}
              placeholder="recipient@example.com"
              autoFocus
            />
            {showCc && (
              <>
                <Divider sx={{ borderColor: 'hsl(var(--border))' }} />
                <RecipientRow
                  label="Cc"
                  value={replyCc}
                  onChange={setReplyCc}
                  placeholder="cc@example.com"
                  onRemove={() => { setShowCc(false); setReplyCc(''); }}
                />
              </>
            )}
            {showBcc && (
              <>
                <Divider sx={{ borderColor: 'hsl(var(--border))' }} />
                <RecipientRow
                  label="Bcc"
                  value={replyBcc}
                  onChange={setReplyBcc}
                  placeholder="bcc@example.com"
                  onRemove={() => { setShowBcc(false); setReplyBcc(''); }}
                />
              </>
            )}
            <Divider sx={{ borderColor: 'hsl(var(--border))' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', px: 1.25, py: 0.5, gap: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', minWidth: 32 }}>
                Subject
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {threadSubject ? `Re: ${threadSubject}` : '(no subject)'}
              </Typography>
            </Box>
          </Stack>

          <TextField
            multiline
            minRows={3}
            maxRows={8}
            fullWidth
            placeholder="Type your reply…"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            size="small"
            sx={{
              mb: 1,
              '& .MuiOutlinedInput-root': {
                fontSize: '0.82rem',
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
              },
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setShowReplyBox(false);
                setReplyText('');
                setReplyCc('');
                setReplyBcc('');
                setShowCc(false);
                setShowBcc(false);
              }}
              sx={{ fontSize: '0.75rem', textTransform: 'none' }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<SendIcon size={14} />}
              onClick={handleReply}
              disabled={!replyText.trim() || !replyTo.trim()}
              sx={{
                fontSize: '0.75rem',
                textTransform: 'none',
                bgcolor: primaryColor,
                '&:hover': { bgcolor: '#e55a00' },
              }}
            >
              Send Reply
            </Button>
          </Box>
        </Box>
      </Collapse>
    </>
  );

  // Inline panel — uses the canonical IncidentSection so it visually matches
  // Description / Timeline / Metadata (same border, radius, header height,
  // padding and chevron behaviour).
  const inlinePanel = (
    <IncidentSection
      title="Email Thread"
      icon={EmailIcon}
      iconColor={primaryColor}
      open={!threadCollapsed}
      onOpenChange={(o) => {
        persistThreadOpen(o);
        if (o) {
          try { window.dispatchEvent(new CustomEvent('demo:email-thread-opened')); } catch { /* ignore */ }
        }
      }}
      badge={headerBadge}
      actions={headerActions}
      bodyPadded={false}
      dataTour="incident-email-thread"
      sx={borderless ? { border: 'none', borderRadius: 0, overflow: 'visible' } : undefined}
    >
      {panelBody}
    </IncidentSection>
  );

  // Floating popout window keeps its custom chrome (drag handle, dock-back
  // button) — the IncidentSection shape is for in-page sections, not for a
  // floating window.
  const panel = (
    <Box
      data-tour="incident-email-thread"
      sx={{
        border: '1px solid hsl(var(--border))',
        borderRadius: 2,
        bgcolor: 'hsl(var(--card))',
        overflow: 'hidden',
        ...(poppedOut ? { display: 'flex', flexDirection: 'column', height: '100%' } : {}),
      }}
    >
      <Box
        onClick={() => persistThreadOpen(threadCollapsed)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2.5,
          py: 2,
          borderBottom: threadCollapsed ? 'none' : '1px solid hsl(var(--border))',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'hsl(var(--muted))' },
        }}
      >
        <EmailIcon size={20} style={{ color: '#ff6600' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Email Thread
        </Typography>
        {headerBadge}
        <Box sx={{ flex: 1 }} />
        <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {headerActions}
        </Box>
        {threadCollapsed
          ? <ExpandMoreIcon style={{ color: 'hsl(var(--muted-foreground))' }} />
          : <ExpandLessIcon style={{ color: 'hsl(var(--muted-foreground))' }} />}
      </Box>
      <Collapse in={!threadCollapsed}>
        {panelBody}
      </Collapse>
    </Box>
  );

  if (!poppedOut) return inlinePanel;

  // Popped out: render an inline placeholder so the user can see where the
  // thread "lives", and the real panel as a draggable floating window via
  // a portal. The portal target is document.body so the window sits above
  // every other dashboard surface and survives section scroll.
  return (
    <>
      <Box
        sx={{
          border: '1px dashed hsl(var(--border))',
          borderRadius: 1.5,
          bgcolor: 'transparent',
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <EmailIcon size={16} style={{ color: '#ff6600' }} />
          <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
            Email thread opened in popout window
          </Typography>
        </Box>
        <Button
          size="small"
          onClick={() => setPoppedOut(false)}
          sx={{
            fontSize: '0.7rem',
            textTransform: 'none',
            color: '#ff6600',
            '&:hover': { bgcolor: 'transparent', color: '#e55a00' },
          }}
        >
          Dock back inline
        </Button>
      </Box>
      {typeof document !== 'undefined' && createPortal(
        <Box
          sx={{
            position: 'fixed',
            top: popPos.y,
            left: popPos.x,
            width: popSize.w,
            height: popSize.h,

            zIndex: 1400,
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 1.5,
            boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Drag handle bar */}
          <Box
            onMouseDown={onDragStart}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              py: 0.75,
              cursor: 'move',
              userSelect: 'none',
              borderBottom: '1px solid hsl(var(--border))',
              bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            }}
          >
            <DragIndicatorIcon size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary', flex: 1 }}>
              {threadSubject || 'Email thread'} — drag to move
            </Typography>
            <Tooltip title="Dock back inline">
              <IconButton size="small" onClick={() => setPoppedOut(false)} sx={{ color: 'text.secondary', '&:hover': { color: '#ff6600' } }}>
                <CloseIcon size={16} />
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {panel}
          </Box>
          {/* Resize grip (bottom-right) — size is remembered across sessions */}
          <Box
            onMouseDown={onResizeStart}
            sx={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 18,
              height: 18,
              cursor: 'nwse-resize',
              zIndex: 2,
              '&::after': {
                content: '""',
                position: 'absolute',
                right: 3,
                bottom: 3,
                width: 9,
                height: 9,
                borderRight: '2px solid hsl(var(--border))',
                borderBottom: '2px solid hsl(var(--border))',
              },
            }}
          />

        </Box>,
        document.body,
      )}
    </>
  );
};

export default EmailThreadPanel;
