import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material';
import { Printer as PrinterIcon } from 'lucide-react';
import ShuffleMarkdown from '@/Shuffle-Core/components/Markdown';
import { fetchDocMarkdown, fetchDocsList, resolveDocName } from '@/components/docs/remoteDocs';
import {
  extractHeadings,
  extractDocTitleAndBody,
  stripInContentToc,
  stripMarkdownInline,
  anchorKey,
  isTocHeading,
  type TocHeading,
} from '@/components/docs/tocUtils';
import { getDocGroup, getDocDisplayLabel } from '@/components/docs/docGroups';

interface PrintDocsDialogProps {
  /** Slug of the currently viewed doc. */
  slug: string;
  /** Optional human-readable title of the currently viewed doc (from MarkdownRenderer). */
  title?: string | null;
  /** Markdown of the currently viewed doc (used for the single page option). */
  currentMarkdown: string;
  /** Disabled while the page is still loading. */
  disabled?: boolean;
  /** API folder to fetch from (defaults to docs). */
  folder?: string;
}

const PRINT_CSS = `
  @page {
    size: A4 portrait;
    margin: 16mm 14mm 16mm 14mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    font-size: 11pt;
    line-height: 1.65;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .preview-wrapper {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px 20px 48px;
  }

  @media screen {
    body {
      background: #f1f5f9;
    }
    .preview-wrapper {
      background: #ffffff;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
      border-radius: 8px;
      margin: 24px auto;
      padding: 40px 48px;
    }
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #0f172a;
      color: #ffffff;
      padding: 12px 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      font-size: 14px;
    }
    .print-toolbar-btn {
      background: #f46a25;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .print-toolbar-btn:hover {
      background: #e05814;
    }
    .print-toolbar-btn-secondary {
      background: transparent;
      color: #cbd5e1;
      border: 1px solid #334155;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      margin-left: 8px;
    }
    .print-toolbar-btn-secondary:hover {
      background: #1e293b;
      color: #ffffff;
    }
  }

  @media print {
    .print-toolbar {
      display: none !important;
    }
    .preview-wrapper {
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
  }

  .doc {
    page-break-after: always;
    break-after: page;
    padding-bottom: 32px;
  }
  .doc:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .doc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    margin-bottom: 24px;
    border-bottom: 2px solid #f46a25;
  }
  .doc-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .doc-brand-title {
    font-size: 13pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.01em;
  }
  .doc-brand-meta {
    font-size: 9pt;
    color: #64748b;
    font-weight: 500;
  }

  .doc-title {
    font-size: 24pt;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 20px 0;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }

  /* Table of Contents based on H2 */
  .doc-toc {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 4px solid #f46a25;
    border-radius: 8px;
    padding: 18px 22px;
    margin: 20px 0 32px 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .doc-toc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
  }
  .doc-toc-title {
    font-size: 11pt;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .doc-toc-badge {
    font-size: 8.5pt;
    font-weight: 600;
    color: #64748b;
    background: #e2e8f0;
    padding: 2px 8px;
    border-radius: 12px;
  }
  .doc-toc-list {
    margin: 0;
    padding-left: 20px;
    color: #334155;
    font-size: 10.5pt;
    line-height: 1.8;
  }
  .doc-toc-item {
    margin-bottom: 4px;
  }
  .doc-toc-link {
    color: #0284c7;
    text-decoration: none;
    font-weight: 500;
  }
  .doc-toc-link:hover {
    text-decoration: underline;
  }
  .doc-toc-sublist {
    margin: 3px 0 6px 0;
    padding-left: 18px;
    font-size: 9.5pt;
    line-height: 1.6;
    color: #64748b;
    list-style-type: circle;
  }
  .doc-toc-subitem a {
    color: #475569;
    text-decoration: none;
  }
  .doc-toc-subitem a:hover {
    text-decoration: underline;
  }

  /* Headings with clear separation above H2 */
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
    color: #0f172a;
    line-height: 1.3;
  }
  h2 {
    font-size: 16pt;
    font-weight: 700;
    margin-top: 36px;
    margin-bottom: 14px;
    padding-top: 18px;
    border-top: 1px solid #e2e8f0;
  }
  h3 {
    font-size: 13pt;
    font-weight: 600;
    margin-top: 24px;
    margin-bottom: 10px;
    color: #1e293b;
  }
  h4 {
    font-size: 11.5pt;
    font-weight: 600;
    margin-top: 18px;
    margin-bottom: 8px;
    color: #334155;
  }

  p, li {
    color: #334155;
    font-size: 10.5pt;
  }
  p {
    margin: 0 0 12px 0;
  }
  ul, ol {
    margin: 0 0 14px 0;
    padding-left: 22px;
  }
  li {
    margin-bottom: 4px;
  }

  a {
    color: #ea580c;
    text-decoration: none;
    word-break: break-word;
  }
  a:hover {
    text-decoration: underline;
  }

  img, video, iframe {
    max-width: 100%;
    height: auto;
    border-radius: 2px;
    margin: 12px 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  pre {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px 14px;
    white-space: pre-wrap;
    word-break: break-word;
    page-break-inside: avoid;
    break-inside: avoid;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 9.5pt;
    line-height: 1.5;
    color: #0f172a;
    margin: 14px 0;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 9.5pt;
    background: #f1f5f9;
    padding: 2px 5px;
    border-radius: 4px;
    color: #0f172a;
  }
  pre code {
    background: transparent;
    padding: 0;
    border-radius: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    page-break-inside: avoid;
    break-inside: avoid;
    font-size: 10pt;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 8px 12px;
    text-align: left;
  }
  th {
    background: #f1f5f9;
    font-weight: 600;
    color: #0f172a;
  }
  tr:nth-child(even) td {
    background: #f8fafc;
  }

  blockquote {
    border-left: 4px solid #f46a25;
    background: #fff8f5;
    border-radius: 0 6px 6px 0;
    margin: 14px 0;
    padding: 10px 16px;
    color: #431407;
    font-size: 10.5pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  hr {
    border: 0;
    border-top: 1px solid #e2e8f0;
    margin: 28px 0;
  }

  .doc-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 36px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 8.5pt;
    color: #94a3b8;
  }
`;

const toLabel = (name: string): string =>
  name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const generateTocHtml = (headings: TocHeading[]): string => {
  if (!headings || headings.length === 0) return '';

  const renderItem = (item: TocHeading): string => {
    const hasChildren = item.children && item.children.length > 0;
    const subList = hasChildren
      ? `<ol class="doc-toc-sublist">${item.children
          .map(
            (child) => `
          <li class="doc-toc-subitem">
            <a href="#${child.id}">${escapeHtml(child.text)}</a>
          </li>
        `,
          )
          .join('')}</ol>`
      : '';

    return `
      <li class="doc-toc-item">
        <a href="#${item.id}" class="doc-toc-link">${escapeHtml(item.text)}</a>
        ${subList}
      </li>
    `;
  };

  return `
    <nav class="doc-toc" aria-label="Table of Contents">
      <div class="doc-toc-header">
        <span class="doc-toc-title">Table of Contents</span>
        <span class="doc-toc-badge">${headings.length} ${headings.length === 1 ? 'section' : 'sections'}</span>
      </div>
      <ol class="doc-toc-list">
        ${headings.map(renderItem).join('')}
      </ol>
    </nav>
  `;
};

/** Render markdown to static HTML using the standard renderer, off-screen. */
const renderMarkdownToHtml = async (markdown: string): Promise<string> => {
  if (!markdown || !markdown.trim()) return '';
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '800px';
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<ShuffleMarkdown disableBreaks>{markdown}</ShuffleMarkdown>);
  await new Promise((resolve) => setTimeout(resolve, 80));

  // Add IDs to all headings to match TOC anchors, and strip any leftover TOC nodes
  const headings = Array.from(host.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[];
  const seenKeys = new Map<string, number>();

  headings.forEach((heading) => {
    const clean = stripMarkdownInline(heading.textContent || '');
    if (isTocHeading(clean)) {
      const nextSibling = heading.nextElementSibling;
      if (nextSibling && (nextSibling.tagName === 'UL' || nextSibling.tagName === 'OL')) {
        nextSibling.remove();
      }
      heading.remove();
      return;
    }
    const baseKey = anchorKey(clean);
    if (baseKey) {
      const count = seenKeys.get(baseKey) || 0;
      seenKeys.set(baseKey, count + 1);
      const key = count === 0 ? baseKey : `${baseKey}_${count}`;
      heading.id = key;
    }
  });

  const html = host.innerHTML;
  root.unmount();
  host.remove();
  return html;
};

interface PreparedDoc {
  title: string;
  html: string;
}

const prepareDoc = async (
  rawOrBodyMarkdown: string,
  fallbackName: string,
  explicitTitle?: string | null,
): Promise<PreparedDoc> => {
  // 1. Strip any legacy handwritten in-content TOC
  const stripped = stripInContentToc(rawOrBodyMarkdown);

  // 2. Extract H1 document title if present
  const { title: extractedH1, content: bodyMarkdown } = extractDocTitleAndBody(stripped);
  const docTitle = (explicitTitle && explicitTitle.trim()) || extractedH1 || toLabel(fallbackName);

  // 3. Extract headings for TOC based on H2
  const headings = extractHeadings(bodyMarkdown);
  const hasToc = headings.length >= 2 || (headings.length === 1 && (headings[0].children?.length ?? 0) >= 2);
  const tocHtml = hasToc ? generateTocHtml(headings) : '';

  // 4. Render markdown body to HTML with anchor IDs
  const contentHtml = await renderMarkdownToHtml(bodyMarkdown);

  // 5. Construct full document markup
  const fullHtml = `
    <article class="doc">
      <header class="doc-header">
        <div class="doc-brand">
          <svg class="doc-logo" viewBox="0 0 56 56" width="22" height="22" fill="none">
            <path d="M14 14h28v6H20v16h16v-10h-8v-6h14v22H14V14z" fill="#f46a25" />
          </svg>
          <span class="doc-brand-title">Shuffle Documentation</span>
        </div>
        <div class="doc-brand-meta">shuffler.io/docs</div>
      </header>

      <h1 class="doc-title">${escapeHtml(docTitle)}</h1>

      ${tocHtml}

      <div class="doc-body">
        ${contentHtml}
      </div>

      <footer class="doc-footer">
        <span>Shuffle Documentation &bull; https://shuffler.io/docs</span>
        <span>Exported documentation</span>
      </footer>
    </article>
  `;

  return { title: docTitle, html: fullHtml };
};

const openPrintWindow = (title: string, bodyHtml: string) => {
  const win = window.open('', '_blank', 'width=950,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div class="print-toolbar">
    <div style="display:flex;align-items:center;gap:10px;">
      <svg viewBox="0 0 56 56" width="20" height="20" fill="none">
        <path d="M14 14h28v6H20v16h16v-10h-8v-6h14v22H14V14z" fill="#f46a25" />
      </svg>
      <strong>Shuffle Documentation</strong> &bull; Print &amp; Export Preview
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button onclick="window.print()" class="print-toolbar-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;">
          <polyline points="6 9 6 2 18 2 18 9"></polyline>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
          <rect x="6" y="14" width="12" height="8"></rect>
        </svg>
        Print / Save as PDF
      </button>
      <button onclick="window.close()" class="print-toolbar-btn-secondary">Close</button>
    </div>
  </div>
  <div class="preview-wrapper">
    ${bodyHtml}
  </div>
</body>
</html>`,
  );
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch {
      // ignore
    }
  }, 600);
  return true;
};

export const PrintDocsDialog = ({
  slug,
  title,
  currentMarkdown,
  disabled,
  folder,
}: PrintDocsDialogProps) => {
  const [open, setOpen] = useState(false);
  const group = getDocGroup(slug);
  const [scope, setScope] = useState<'current' | 'category' | 'all'>('current');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePrint = async () => {
    setBusy(true);
    setError(null);
    try {
      if (scope === 'current') {
        const resolvedName = (await resolveDocName(slug, false, folder)) ?? slug;
        const doc = await prepareDoc(currentMarkdown, resolvedName, title);
        const ok = openPrintWindow(
          `${doc.title} - Shuffle Documentation`,
          doc.html,
        );
        if (!ok) throw new Error('popup-blocked');
        setOpen(false);
        return;
      }

      if (scope === 'category' && group) {
        setProgress({ done: 0, total: group.slugs.length });
        const sections: string[] = [];
        for (let i = 0; i < group.slugs.length; i += 1) {
          const docSlugValue = group.slugs[i];
          let markdown = '';
          let docTitle = getDocDisplayLabel(docSlugValue);
          if (docSlugValue === slug && currentMarkdown) {
            markdown = currentMarkdown;
            docTitle = title || docTitle;
          } else {
            const resolvedName = (await resolveDocName(docSlugValue, false, folder)) ?? docSlugValue;
            markdown = (await fetchDocMarkdown(resolvedName, false, folder)) || '';
          }
          if (markdown) {
            const doc = await prepareDoc(markdown, docSlugValue, docTitle);
            sections.push(doc.html);
          }
          setProgress({ done: i + 1, total: group.slugs.length });
        }
        if (sections.length === 0) throw new Error('no-docs');
        const ok = openPrintWindow(`Shuffle Documentation - ${group.label}`, sections.join(''));
        if (!ok) throw new Error('popup-blocked');
        setOpen(false);
        return;
      }

      const list = await fetchDocsList(false, folder);
      if (list.length === 0) throw new Error('no-docs');
      setProgress({ done: 0, total: list.length });
      const sections: string[] = [];
      for (let i = 0; i < list.length; i += 1) {
        const entry = list[i];
        const markdown = await fetchDocMarkdown(entry.name, false, folder);
        if (markdown) {
          const doc = await prepareDoc(markdown, entry.name);
          sections.push(doc.html);
        }
        setProgress({ done: i + 1, total: list.length });
      }
      if (sections.length === 0) throw new Error('no-docs');
      const ok = openPrintWindow('Shuffle Documentation', sections.join(''));
      if (!ok) throw new Error('popup-blocked');
      setOpen(false);
    } catch (err: any) {
      setError(
        err?.message === 'popup-blocked'
          ? 'The print window was blocked. Please allow popups and try again.'
          : 'Could not prepare the documentation for printing.',
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        onClick={() => setOpen(true)}
        disabled={disabled}
        startIcon={<PrinterIcon size={14} />}
        sx={{
          textTransform: 'none',
          height: 36,
          borderColor: 'hsl(var(--border))',
          color: 'text.primary',
          '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
        }}
      >
        Print / Export
      </Button>

      <Dialog open={open} onClose={() => (busy ? null : setOpen(false))} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>Print / Export documentation</DialogTitle>
        <DialogContent>
          <RadioGroup
            value={scope}
            onChange={(e) => setScope(e.target.value as 'current' | 'category' | 'all')}
          >
            <FormControlLabel
              value="current"
              control={<Radio size="small" />}
              disabled={busy}
              label={<Typography variant="body2">This page only</Typography>}
            />
            {group ? (
              <FormControlLabel
                value="category"
                control={<Radio size="small" />}
                disabled={busy}
                label={<Typography variant="body2">All pages in {group.label}</Typography>}
              />
            ) : null}
            <FormControlLabel
              value="all"
              control={<Radio size="small" />}
              disabled={busy}
              label={<Typography variant="body2">All documentation pages</Typography>}
            />
          </RadioGroup>

          {progress && (
            <Stack spacing={0.75} sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Loading pages {progress.done} / {progress.total}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={progress.total ? (progress.done / progress.total) * 100 : 0}
              />
            </Stack>
          )}

          {error && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 2 }}>
              {error}
            </Typography>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            A print and export view opens in a new tab. Choose "Save as PDF" in your browser's print dialog to save as a PDF.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handlePrint} disabled={busy} sx={{ textTransform: 'none' }}>
            {busy ? 'Preparing…' : 'Print / Export'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PrintDocsDialog;
