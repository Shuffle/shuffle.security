/**
 * Utilities for dynamically managing and injecting documentation context into
 * AI Agent prompts when on documentation pages (/docs/*, /legal/*).
 */

import { stripInContentToc } from '../components/docs/tocUtils';
import { getCachedGroupDocs } from '../components/docs/docGroups';
import { getDocGroup } from './docGroups';

export interface GroupDocSnippet {
  slug: string;
  title: string;
  content: string;
}

export interface ActiveDocInfo {
  title: string;
  content: string;
  slug?: string;
  basePath?: string;
  pathname?: string;
  groupId?: string;
  groupLabel?: string;
  groupDocs?: GroupDocSnippet[];
  /** Specific excerpt marked/highlighted by the user in the documentation */
  selectedText?: string;
}

export const DOC_SELECTION_EVENT = 'shuffle:doc-selection-change';
const GLOBAL_DOC_SELECTION_KEY = '__shuffleActiveDocSelection';

/**
 * Normalizes and truncates marked text to a clean single-line preview for
 * "Ask about X" buttons and headers.
 */
export const truncateDocSelectionPreview = (text: string, maxChars = 36): string => {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars).trimEnd()}…`;
};

// Global window / globalThis key so any component can access the active doc even across bundles
const GLOBAL_DOC_KEY = '__shuffleActiveDocInfo';

const getGlobalScope = (): any => {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof window !== 'undefined') return window;
  if (typeof global !== 'undefined') return global;
  return null;
};

/**
 * Registers the active document context (title, raw markdown, slug, pathname) globally.
 */
export const setActiveDocPromptContext = (info: ActiveDocInfo | null) => {
  const scope = getGlobalScope();
  if (!scope) return;
  if (info) {
    const prevSelection = scope[GLOBAL_DOC_SELECTION_KEY];
    scope[GLOBAL_DOC_KEY] = {
      ...info,
      selectedText: info.selectedText !== undefined ? info.selectedText : prevSelection,
    };
  } else {
    delete scope[GLOBAL_DOC_KEY];
    delete scope[GLOBAL_DOC_SELECTION_KEY];
  }
};

/**
 * Sets or clears the currently marked/selected text in the active documentation page
 * and notifies listeners (such as AskAiWidget and AskAiSidePanel).
 */
export const setActiveDocSelectedText = (
  selectedText: string | null,
  options?: { explicitClear?: boolean },
) => {
  const scope = getGlobalScope();
  if (!scope) return;
  const cleaned = (selectedText || '').trim();
  if (cleaned) {
    scope[GLOBAL_DOC_SELECTION_KEY] = cleaned;
    if (scope[GLOBAL_DOC_KEY] && typeof scope[GLOBAL_DOC_KEY] === 'object') {
      scope[GLOBAL_DOC_KEY].selectedText = cleaned;
    }
  } else {
    delete scope[GLOBAL_DOC_SELECTION_KEY];
    if (scope[GLOBAL_DOC_KEY] && typeof scope[GLOBAL_DOC_KEY] === 'object') {
      delete scope[GLOBAL_DOC_KEY].selectedText;
    }
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent(DOC_SELECTION_EVENT, {
          detail: {
            selectedText: cleaned || null,
            explicitClear: Boolean(options?.explicitClear),
          },
        }),
      );
    } catch {
      /* ignore */
    }
  }
};

/**
 * Retrieves the currently marked/selected text in the active documentation page.
 */
export const getActiveDocSelectedText = (): string | null => {
  const scope = getGlobalScope();
  if (!scope) return null;
  const sel = scope[GLOBAL_DOC_SELECTION_KEY] || scope[GLOBAL_DOC_KEY]?.selectedText;
  return typeof sel === 'string' && sel.trim().length > 0 ? sel.trim() : null;
};

/**
 * Retrieves the currently active document context.
 */
export const getActiveDocPromptContext = (): ActiveDocInfo | null => {
  const scope = getGlobalScope();
  if (!scope) return null;
  const info = scope[GLOBAL_DOC_KEY];
  if (info && typeof info === 'object') {
    return info as ActiveDocInfo;
  }
  return null;
};

/**
 * Clears the active document context.
 */
export const clearActiveDocPromptContext = () => {
  setActiveDocPromptContext(null);
};

/**
 * Checks whether a given pathname is a documentation route (/docs, /docs/*, /legal/*, /articles/*).
 */
export const isDocsRoute = (pathname?: string): boolean => {
  if (!pathname) return false;
  return (
    pathname === '/docs' ||
    pathname.startsWith('/docs/') ||
    pathname === '/legal' ||
    pathname.startsWith('/legal/') ||
    pathname === '/articles' ||
    pathname.startsWith('/articles/')
  );
};

export const DOC_PROMPT_DELIMITER_START = '--- BEGIN DOCUMENTATION ---';
export const DOC_PROMPT_DELIMITER_END = '--- END DOCUMENTATION ---';
// Matches every doc-prompt header, including the short form used while a
// page is still loading ("Answer the users question about Shuffle X:").
const DOC_PROMPT_PREFIX_REGEX = /^Answer the users? question about [^\n]*?(?: based on(?: on)? the following [^\n]*?)?:\s*(?:\n|$)/i;

/**
 * Sanitizes markdown content for inclusion in an LLM prompt:
 * - Strips YAML frontmatter
 * - Strips in-content TOC tables/headings
 * - Strips HTML comments, script tags, style tags, and iframes
 * - Replaces huge base64 data URIs with concise placeholders
 * - Normalizes excessive whitespace / newlines
 * - Caps maximum length safely (~35,000 chars) to prevent context exhaustion
 */
export const sanitizeDocMarkdown = (markdown: string, maxChars: number = 35000): string => {
  if (!markdown || typeof markdown !== 'string') return '';

  let cleaned = markdown;

  // 1. Strip YAML frontmatter at beginning of file
  cleaned = cleaned.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '');

  // 2. Strip legacy in-content TOC
  cleaned = stripInContentToc(cleaned);

  // 3. Strip HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // 4. Strip <script>, <style>, and <iframe> elements
  cleaned = cleaned.replace(/<(script|style|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // 5. Replace massive base64 image data URIs
  cleaned = cleaned.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g, '[embedded image]');

  // 6. Condense excessive blank lines (3+ to 2)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  cleaned = cleaned.trim();

  // 7. Maximum length safety cutoff to prevent context exhaustion
  if (cleaned.length > maxChars) {
    const cut = cleaned.lastIndexOf('\n\n', maxChars);
    const splitIndex = cut > maxChars * 0.7 ? cut : maxChars;
    cleaned = `${cleaned.slice(0, splitIndex).trim()}\n\n[Documentation content truncated for length...]`;
  }

  return cleaned;
};

/**
 * Checks if a prompt string has already been wrapped with doc context.
 */
export const isDocInjectedPrompt = (prompt?: string | null): boolean => {
  if (!prompt || typeof prompt !== 'string') return false;
  return (
    prompt.includes(DOC_PROMPT_DELIMITER_START) ||
    DOC_PROMPT_PREFIX_REGEX.test(prompt)
  );
};

import { extractCleanIncidentPrompt, isIncidentInjectedPrompt } from './incidentPromptContext';
import { extractCleanUsecasePrompt, isUsecaseInjectedPrompt } from './usecasePromptContext';
import { extractCleanAppPrompt, isAppInjectedPrompt } from './appPromptContext';

/**
 * Removes internal backend `[System note: ...]` annotations that may have been
 * appended to the prompt for the LLM so they are never rendered to the user.
 */
export const stripSystemNotes = (text?: string | null): string => {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\n*\s*\[System note:[\s\S]*?\]\s*$/gi, '').replace(/\[System note:[\s\S]*?\]/gi, '').trim();
};

/**
 * Extracts the user's actual question from a doc-injected, incident-injected,
 * usecase-injected, or app-injected prompt, so the UI header, chat thread,
 * and rerun forms stay completely clean.
 */
export const extractCleanDisplayPrompt = (prompt?: string | null): string => {
  if (!prompt || typeof prompt !== 'string') return '';
  let trimmed = stripSystemNotes(prompt);

  if (isAppInjectedPrompt(trimmed)) {
    trimmed = stripSystemNotes(extractCleanAppPrompt(trimmed));
  }

  if (isUsecaseInjectedPrompt(trimmed)) {
    trimmed = stripSystemNotes(extractCleanUsecasePrompt(trimmed));
  }

  // If this is an incident-injected prompt or task assignment, clean it cleanly
  if (isIncidentInjectedPrompt(trimmed)) {
    trimmed = stripSystemNotes(extractCleanIncidentPrompt(trimmed));
  }

  if (!isDocInjectedPrompt(trimmed)) return stripSystemNotes(trimmed);

  // 1. If delimited by --- END DOCUMENTATION ---
  if (trimmed.includes(DOC_PROMPT_DELIMITER_END)) {
    const parts = trimmed.split(DOC_PROMPT_DELIMITER_END);
    const after = parts[parts.length - 1]?.trim() || '';
    const cleaned = stripSystemNotes(after.replace(/^(?:User\s+Question:\s*|Question:\s*)/i, '').trim());
    if (cleaned) return cleaned;
  }

  // 2. Fallback: split by double newline and check the last section
  if (DOC_PROMPT_PREFIX_REGEX.test(trimmed)) {
    const paragraphs = trimmed.split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length > 1) {
      const last = paragraphs[paragraphs.length - 1].trim();
      const cleaned = stripSystemNotes(last.replace(/^(?:User\s+Question:\s*|Question:\s*)/i, '').trim());
      if (cleaned) return cleaned;
    }
  }

  return stripSystemNotes(trimmed);
};

/**
 * Normalizes document title for prompt injection, preventing
 * awkward repetitions like "Answer the users question about About...".
 */
export const normalizeDocPromptTitle = (title?: string): string => {
  const t = (title || '').trim();
  if (!t || t.toLowerCase() === 'index' || t.toLowerCase() === 'documentation' || t.toLowerCase() === 'docs') {
    return 'Shuffle documentation';
  }
  const lower = t.toLowerCase();
  if (
    lower === 'about' ||
    lower === 'about shuffle' ||
    lower === 'about us' ||
    lower === 'about-shuffle' ||
    lower === 'about-us'
  ) {
    return 'Shuffle';
  }
  if (/^about\s+/i.test(t)) {
    const stripped = t.replace(/^about\s+/i, '').trim();
    return stripped || 'Shuffle';
  }
  return t;
};

/**
 * Pre-injects current document markdown (and sibling documents in the same group)
 * into the prompt payload sent to the agent.
 */
export const composeDocPromptInput = (
  userQuestion: string,
  pathname?: string,
  fallbackTitle?: string,
  overrideDocInfo?: ActiveDocInfo | null,
): string => {
  const trimmedQuestion = (userQuestion || '').trim();
  if (!trimmedQuestion) return '';

  // Avoid double-wrapping
  if (isDocInjectedPrompt(trimmedQuestion)) {
    return trimmedQuestion;
  }

  const activeDoc = overrideDocInfo ?? getActiveDocPromptContext();
  const rawTitle = (
    activeDoc?.title ||
    fallbackTitle ||
    getGlobalScope()?.__shuffleActiveEntityTitle ||
    'Shuffle documentation'
  ).trim();
  const title = normalizeDocPromptTitle(rawTitle);

  const groupLabel = activeDoc?.groupLabel;
  const groupId = activeDoc?.groupId;
  const currentSlug = (activeDoc?.slug || '').toLowerCase().replace(/_+/g, '-');

  // 1. Gather all documents from this category
  let categoryDocs = activeDoc?.groupDocs || [];
  if (categoryDocs.length === 0 && groupId) {
    categoryDocs = getCachedGroupDocs(groupId);
  }
  if (categoryDocs.length === 0 && currentSlug) {
    const groupDef = getDocGroup(currentSlug);
    if (groupDef) {
      categoryDocs = getCachedGroupDocs(groupDef.id);
    }
  }

  const groupDef = currentSlug ? getDocGroup(currentSlug) : null;
  const categoryName = groupLabel || groupDef?.label || title;
  // Avoid "Shuffle Shuffle documentation" when the name already starts with Shuffle.
  const subject = /^shuffle\b/i.test(categoryName) ? categoryName : `Shuffle ${categoryName}`;

  // 2. Build list of all documents in the category
  const rawMarkdown = activeDoc?.content || '';
  const renderedDocs: Array<{ title: string; slug?: string; content: string; isCurrent: boolean }> = [];

  if (categoryDocs.length > 0) {
    for (const doc of categoryDocs) {
      const docSlugClean = (doc.slug || '').toLowerCase().replace(/_+/g, '-');
      const isCurrent = docSlugClean === currentSlug;
      const contentToUse = isCurrent && rawMarkdown ? rawMarkdown : doc.content;
      renderedDocs.push({
        title: doc.title || title,
        slug: doc.slug,
        content: sanitizeDocMarkdown(contentToUse, 16000),
        isCurrent,
      });
    }
  } else if (rawMarkdown) {
    renderedDocs.push({
      title,
      slug: activeDoc?.slug,
      content: sanitizeDocMarkdown(rawMarkdown, 30000),
      isCurrent: true,
    });
  }

  let docSection = '';
  if (renderedDocs.length > 0) {
    const docBlocks = renderedDocs
      .filter((d) => d.content && d.content.trim().length > 0)
      .map((d) => {
        const marker = d.isCurrent ? ' (Currently Viewed)' : '';
        return `## Document: ${d.title}${marker}\n\n${d.content}`;
      })
      .join('\n\n---\n\n');

    docSection = `# Documentation Category: ${categoryName}\n\n${docBlocks}`;
  }

  const markedExcerpt = (activeDoc?.selectedText || getActiveDocSelectedText() || '').trim();
  const excerptBlock = markedExcerpt
    ? `\n\n## User-Marked Excerpt (Focus of Question)\nThe user highlighted the following text in "${title}":\n"""\n${markedExcerpt.slice(0, 4000)}\n"""`
    : '';

  if (docSection) {
    return `Answer the users question about ${subject} based on the following complete documentation for the ${categoryName} category:
${DOC_PROMPT_DELIMITER_START}
${docSection}${excerptBlock}
${DOC_PROMPT_DELIMITER_END}

User Question:
${trimmedQuestion}`;
  }

  if (markedExcerpt) {
    return `Answer the users question about ${subject} based on the following content:
${DOC_PROMPT_DELIMITER_START}
${excerptBlock.trim()}
${DOC_PROMPT_DELIMITER_END}

User Question:
${trimmedQuestion}`;
  }

  // Fallback when markdown is empty or still loading. Uses the same
  // "User Question:" marker so the display cleaner always strips it.
  return `Answer the users question about ${subject}:

User Question:
${trimmedQuestion}`;
};

/**
 * Sets global doc prompt context for an entire documentation group (e.g. from clicking
 * "Ask about Automation" on the sidebar group header).
 */
export const activateGroupDocPromptContext = (
  groupId: string,
  groupLabel: string,
  groupDocs: GroupDocSnippet[],
) => {
  setActiveDocPromptContext({
    title: `Shuffle ${groupLabel}`,
    content: '',
    groupId,
    groupLabel,
    groupDocs,
    pathname: `/docs?group=${groupId}`,
  });
  const scope = getGlobalScope();
  if (scope) {
    scope.__shuffleActiveEntityTitle = `Shuffle ${groupLabel}`;
  }
};
