/**
 * MarkdownDescriptionEditor — WYSIWYG markdown editing.
 *
 * The value stored on the incident stays markdown text (so it round-trips
 * through the datastore unchanged), but editing happens on the *rendered*
 * document: bold text looks bold, headings look like headings, links look like
 * links. A small "Raw" toggle switches to the plain markdown source for people
 * who want to see or paste the syntax directly.
 *
 * Selecting text pops a small Medium-style bar. "Link" asks for the URL in the
 * bar itself instead of dumping markdown syntax into the text. Pasting or
 * dropping an image uploads it through the Shuffle file API and inserts it.
 *
 * Like the other incident inputs, the draft is local while typing and only
 * pushed upwards on blur to keep the (very large) incident page responsive.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  CircularProgress,
  Dialog,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  EditorContent,
  useEditor,
  type Editor,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { X as CloseIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  createAndUploadFile,
  resolveFileUrl,
  cacheFileBlob,
  getCachedFileBlob,
} from '@/services/files';

export interface MarkdownDescriptionEditorProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  minRows?: number;
  incidentId?: string;
  taskId?: string;
  compact?: boolean;
  rawButtonTop?: number | string;
}

type BarAction = {
  id: string;
  label: string;
  title: string;
  run: (editor: Editor) => void;
  active: (editor: Editor) => boolean;
};

/** Only http(s), mailto and relative app paths may become links. */
const isSafeHref = (raw: string): boolean => {
  const href = (raw || '').trim();
  if (!href) return false;
  if (/^[/#?]/.test(href)) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return true;
  return /^(https?:|mailto:)/i.test(href);
};

const TiptapImageNodeView = ({ node, selected }: NodeViewProps) => {
  const { src, alt, title } = node.attrs;
  const [resolvedSrc, setResolvedSrc] = useState<string>(() => {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('blob:')) return src;
    return getCachedFileBlob(src) || '';
  });
  const [loading, setLoading] = useState<boolean>(!resolvedSrc && !!src);
  const [error, setError] = useState<boolean>(false);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  useEffect(() => {
    if (!src) {
      setResolvedSrc('');
      setLoading(false);
      return;
    }
    if (src.startsWith('data:') || src.startsWith('blob:')) {
      setResolvedSrc(src);
      setLoading(false);
      return;
    }
    const cached = getCachedFileBlob(src);
    if (cached) {
      setResolvedSrc(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    resolveFileUrl(src)
      .then((url) => {
        if (!cancelled) {
          setResolvedSrc(url);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to resolve authenticated image:', err);
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <NodeViewWrapper
      as="span"
      className="tiptap-image-wrapper"
      style={{
        display: 'inline-block',
        maxWidth: '100%',
        margin: '6px 0',
        verticalAlign: 'middle',
      }}
    >
      {loading && (
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.75,
            borderRadius: 1.5,
            bgcolor: 'hsl(var(--muted) / 0.5)',
            border: '1px dashed hsl(var(--border))',
            color: 'hsl(var(--muted-foreground))',
            fontSize: '0.82rem',
          }}
        >
          <CircularProgress size={13} thickness={5} />
          <span>Loading {alt || 'image'}...</span>
        </Box>
      )}
      {!loading && error && (
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.5,
            py: 0.75,
            borderRadius: 1.5,
            bgcolor: 'hsl(var(--destructive) / 0.08)',
            border: '1px solid hsl(var(--destructive) / 0.3)',
            color: 'hsl(var(--destructive))',
            fontSize: '0.82rem',
          }}
        >
          <span>Failed to load image ({alt || 'image.png'})</span>
        </Box>
      )}
      {!loading && !error && resolvedSrc && (
        <Box
          component="span"
          sx={{
            display: 'inline-block',
            position: 'relative',
            maxWidth: '100%',
            borderRadius: 1.5,
            outline: selected ? '2px solid hsl(var(--primary))' : 'none',
            outlineOffset: 2,
          }}
        >
          <img
            src={resolvedSrc}
            alt={alt || ''}
            title={title || 'Click to view full image'}
            loading="lazy"
            onClick={(e) => {
              e.stopPropagation();
              setShowPreview(true);
            }}
            style={{
              maxWidth: '100%',
              height: 'auto',
              borderRadius: 6,
              display: 'block',
              cursor: 'pointer',
            }}
          />
          {showPreview && (
            <Dialog
              open={showPreview}
              onClose={(e: any) => {
                e?.stopPropagation?.();
                setShowPreview(false);
              }}
              maxWidth="xl"
              PaperProps={{
                sx: {
                  bgcolor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 2,
                  overflow: 'hidden',
                  p: 1.5,
                  maxWidth: '92vw',
                  maxHeight: '92vh',
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  {alt || 'Image preview'}
                </Typography>
                <Tooltip title="Close preview">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPreview(false);
                    }}
                    sx={{
                      p: 0.75,
                      borderRadius: 1.5,
                      border: '1px solid hsl(var(--border))',
                    }}
                  >
                    <CloseIcon size={18} />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'auto',
                  maxHeight: '80vh',
                }}
              >
                <img
                  src={resolvedSrc}
                  alt={alt || ''}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    borderRadius: 4,
                  }}
                />
              </Box>
            </Dialog>
          )}
        </Box>
      )}
    </NodeViewWrapper>
  );
};

const AuthenticatedImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TiptapImageNodeView);
  },
});

const ACTIONS: BarAction[] = [
  {
    id: 'bold',
    label: 'B',
    title: 'Bold',
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive('bold'),
  },
  {
    id: 'italic',
    label: 'I',
    title: 'Italic',
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive('italic'),
  },
  {
    id: 'strike',
    label: 'S',
    title: 'Strikethrough',
    run: (e) => e.chain().focus().toggleStrike().run(),
    active: (e) => e.isActive('strike'),
  },
  {
    id: 'code',
    label: 'Code',
    title: 'Inline code',
    run: (e) => e.chain().focus().toggleCode().run(),
    active: (e) => e.isActive('code'),
  },
  {
    id: 'h2',
    label: 'H2',
    title: 'Heading',
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive('heading', { level: 2 }),
  },
  {
    id: 'quote',
    label: 'Quote',
    title: 'Quote',
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive('blockquote'),
  },
  {
    id: 'list',
    label: 'List',
    title: 'Bullet list',
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive('bulletList'),
  },
];

const barButtonSx = (activeState: boolean) => ({
  border: 0,
  background: activeState ? 'hsl(var(--muted))' : 'transparent',
  cursor: 'pointer',
  px: 0.75,
  py: 0.25,
  borderRadius: 1,
  fontSize: '0.78rem',
  fontWeight: 600,
  color: activeState ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
  '&:hover': { bgcolor: 'hsl(var(--muted))' },
});

export const MarkdownDescriptionEditor = ({
  value,
  onCommit,
  placeholder = 'Add a description...',
  autoFocus,
  readOnly,
  minRows = 5,
  incidentId,
  taskId,
  compact = false,
  rawButtonTop,
}: MarkdownDescriptionEditorProps) => {
  const buttonTop = rawButtonTop !== undefined ? rawButtonTop : (compact ? -4 : -44);
  const [raw, setRaw] = useState(false);
  const [rawDraft, setRawDraft] = useState(value);
  const [bar, setBar] = useState<{ top: number; left: number; placement: 'above' | 'below' } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
  }, []);

  const commit = useCallback(
    (next: string) => {
      if (commitTimer.current) {
        clearTimeout(commitTimer.current);
        commitTimer.current = null;
      }
      latest.current = next;
      if (next !== valueRef.current) onCommit(next);
    },
    [onCommit],
  );

  const scheduleCommit = useCallback(
    (next: string) => {
      latest.current = next;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => {
        commitTimer.current = null;
        if (latest.current !== valueRef.current) {
          onCommit(latest.current);
        }
      }, 400);
    },
    [onCommit],
  );

  const insertImagesRef = useRef<(files: File[]) => Promise<void>>(async () => {});

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? 'end' : false,
    editable: !readOnly,
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: readOnly ? true : false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
        validate: (href: string) => isSafeHref(href),
      }),
      AuthenticatedImage,
      Placeholder.configure({
        placeholder: readOnly ? '' : placeholder,
        showOnlyWhenEditable: true,
        emptyNodeClass: 'is-empty',
        emptyEditorClass: 'is-editor-empty',
      }),
      Markdown.configure({ html: false, transformPastedText: true, linkify: true, breaks: true }),
    ],
    content: value,
    onUpdate: ({ editor: instance }) => {
      const markdown = instance.storage.markdown.getMarkdown();
      scheduleCommit(markdown);
    },
    onBlur: ({ editor: instance }) => {
      commit(instance.storage.markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: 'markdown-wysiwyg',
      },
      handlePaste: (_view, event) => {
        const images = imagesFromDataTransfer(event.clipboardData);
        if (images.length) {
          event.preventDefault();
          void insertImagesRef.current(images);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const images = imagesFromDataTransfer(event.dataTransfer);
        if (images.length) {
          event.preventDefault();
          void insertImagesRef.current(images);
          return true;
        }
        return false;
      },
    },
  });

  // Keep the editor in sync when the incident value changes from the outside
  // (a reload, a merge, another user's save) without clobbering active edits.
  useEffect(() => {
    if (!editor || raw) return;
    if (value === latest.current) return;
    if (editor.isFocused) return;
    editor.commands.setContent(value || '', false);
    latest.current = value || '';
  }, [editor, value, raw]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  /** Position the format bar just above or below the current selection. */
  const refreshBar = useCallback(() => {
    if (!editor || readOnly) return setBar(null);
    const { from, to, empty } = editor.state.selection;
    if (empty || from === to) {
      setBar(null);
      setLinkOpen(false);
      return;
    }
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to, -1);
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;

    // Position above by default; if selection is too close to viewport top, position below
    const isAbove = start.top > 54;
    const center = (start.left + end.right) / 2 - box.left;
    const clampOffset = linkOpen ? 150 : 80;

    setBar({
      top: isAbove ? start.top - box.top - 8 : end.bottom - box.top + 8,
      left: Math.min(Math.max(center, clampOffset), Math.max(box.width - clampOffset, clampOffset)),
      placement: isAbove ? 'above' : 'below',
    });
  }, [editor, readOnly, linkOpen]);

  // Dismiss format bar when the routing rule popover opens to avoid screen clutter
  useEffect(() => {
    const onRulePopoverOpen = () => {
      setBar(null);
      setLinkOpen(false);
    };
    window.addEventListener('selection-rule:popover-open', onRulePopoverOpen);
    return () => window.removeEventListener('selection-rule:popover-open', onRulePopoverOpen);
  }, []);

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      refreshBar();
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new Event('selectionchange'));
      }
    };
    editor.on('selectionUpdate', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('selectionUpdate', handler);
      editor.off('transaction', handler);
    };
  }, [editor, refreshBar]);

  const openLink = useCallback(() => {
    if (!editor) return;
    setLinkUrl(editor.getAttributes('link').href || '');
    setLinkOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const href = linkUrl.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else if (!isSafeHref(href)) {
      // Ignore anything that could execute (javascript:, data:text/html, ...).
      return;
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  const insertImages = useCallback(
    async (files: File[]) => {
      if (!files.length || readOnly || !editor) return;
      setUploading(true);
      try {
        const labels: string[] = [];
        if (incidentId) labels.push(incidentId);
        if (taskId) {
          labels.push(`task-${taskId}`);
          labels.push(taskId);
        }
        labels.push(taskId ? 'task-image' : 'description-image');

        for (const file of files) {
          const result = await createAndUploadFile(file, 'incidents', labels);
          if (result.success && result.file?.id) {
            const fileSrc = `/api/v1/files/${result.file.id}/content`;
            // Cache local object URL so it renders immediately
            const localBlob = URL.createObjectURL(file);
            cacheFileBlob(fileSrc, localBlob);

            editor
              .chain()
              .focus()
              .setImage({ src: fileSrc, alt: file.name })
              .run();
          } else {
            toast.error(result.reason || `Failed to upload ${file.name}`);
          }
        }
        latest.current = editor.storage.markdown.getMarkdown();
        if (raw) {
          setRawDraft(latest.current);
        }
        commit(latest.current);
      } catch (err) {
        console.error('Failed to upload image:', err);
        toast.error('Failed to upload image');
      } finally {
        setUploading(false);
      }
    },
    [editor, readOnly, commit, incidentId, taskId, raw],
  );

  useEffect(() => {
    insertImagesRef.current = insertImages;
  }, [insertImages]);

  const imagesFromDataTransfer = (data: DataTransfer | null) =>
    Array.from(data?.files || []).filter((f) => f.type.startsWith('image/'));

  /** Switch between rendered editing and the plain markdown source. */
  const toggleRaw = useCallback(() => {
    if (!raw) {
      setRawDraft(latest.current);
      setRaw(true);
      setBar(null);
      setLinkOpen(false);
      return;
    }
    latest.current = rawDraft;
    editor?.commands.setContent(rawDraft, false);
    commit(rawDraft);
    setRaw(false);
  }, [commit, editor, raw, rawDraft]);

  if (readOnly && !value?.trim()) {
    return (
      <Typography sx={{ fontSize: compact ? '0.82rem' : '0.95rem', lineHeight: 1.8, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
        No description provided.
      </Typography>
    );
  }

  return (
    <Box
      ref={containerRef}
      data-incident-field="description"
      onClick={(event) => {
        if (!readOnly && editor && !editor.isFocused) {
          const target = event.target as HTMLElement;
          if (!target.closest('button') && !target.closest('input') && !target.closest('a')) {
            editor.commands.focus('end');
          }
        }
      }}
      sx={{
        position: 'relative',
        cursor: readOnly ? 'default' : 'text',
        minHeight: readOnly ? 'auto' : compact ? minRows * 20 : minRows * 28,
        '&:hover .raw-toggle-btn': { opacity: raw ? 1 : 0.85 },
      }}
    >
      {!readOnly && (
        <Box
          component="button"
          type="button"
          className="raw-toggle-btn"
          aria-label={raw ? 'Switch to rich text' : 'Edit raw markdown'}
          title={raw ? 'Switch to rich text' : 'Edit raw markdown'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleRaw}
          sx={{
            position: 'absolute',
            top: buttonTop,
            right: 0,
            zIndex: 5,
            border: raw
              ? '1px solid hsla(var(--primary) / 0.32)'
              : '1px solid transparent',
            background: raw
              ? 'hsla(var(--primary) / 0.12)'
              : 'transparent',
            cursor: 'pointer',
            px: 0.85,
            py: 0.25,
            borderRadius: 1,
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: raw ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            opacity: raw ? 1 : 0.45,
            boxShadow: raw ? '0 0 6px hsla(var(--primary) / 0.12)' : 'none',
            transition: 'all 0.15s ease',
            '&:hover': {
              bgcolor: raw
                ? 'hsla(var(--primary) / 0.18)'
                : 'hsl(var(--muted))',
              borderColor: raw
                ? 'hsla(var(--primary) / 0.45)'
                : 'hsl(var(--border))',
              color: raw
                ? 'hsl(var(--primary))'
                : 'hsl(var(--foreground))',
              opacity: 1,
            },
          }}
        >
          RAW
        </Box>
      )}

      {raw ? (
        <TextField
          value={rawDraft}
          onChange={(event) => {
            const next = event.target.value;
            setRawDraft(next);
            scheduleCommit(next);
          }}
          onBlur={() => {
            commit(rawDraft);
          }}
          onPaste={(event) => {
            const images = imagesFromDataTransfer(event.clipboardData);
            if (images.length) {
              event.preventDefault();
              void insertImages(images);
            }
          }}
          onDrop={(event) => {
            const images = imagesFromDataTransfer(event.dataTransfer);
            if (images.length) {
              event.preventDefault();
              void insertImages(images);
            }
          }}
          fullWidth
          multiline
          minRows={minRows}
          placeholder={placeholder}
          variant="standard"
          autoFocus
          inputProps={{ readOnly }}
          sx={{
            '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
            '& textarea': {
              fontSize: compact ? '0.82rem' : '0.9rem',
              lineHeight: compact ? 1.55 : 1.7,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: 'hsl(var(--foreground))',
            },
          }}
        />
      ) : (
        <Box
          onPaste={(event) => {
            const images = imagesFromDataTransfer(event.clipboardData);
            if (images.length) {
              event.preventDefault();
              void insertImages(images);
            }
          }}
          onDrop={(event) => {
            const images = imagesFromDataTransfer(event.dataTransfer);
            if (images.length) {
              event.preventDefault();
              void insertImages(images);
            }
          }}
          sx={{
            minHeight: readOnly ? 'auto' : compact ? minRows * 20 : minRows * 28,
            '& .markdown-wysiwyg': {
              outline: 'none',
              fontSize: compact ? '0.84rem' : '0.95rem',
              lineHeight: compact ? 1.6 : 1.8,
              minHeight: readOnly ? 'auto' : compact ? minRows * 20 : minRows * 28,
              color: 'hsl(var(--foreground))',
            },
            '& .ProseMirror:focus, & .markdown-wysiwyg:focus': { outline: 'none' },
            '& .markdown-wysiwyg p': { m: 0, mb: compact ? 0.75 : 1.25 },
            '& .markdown-wysiwyg p:last-child': { mb: 0 },
            '& .markdown-wysiwyg h1, & .markdown-wysiwyg h2, & .markdown-wysiwyg h3': {
              fontWeight: 700,
              lineHeight: 1.35,
              mt: 2,
              mb: 1,
            },
            '& .markdown-wysiwyg h1': { fontSize: '1.25rem' },
            '& .markdown-wysiwyg h2': { fontSize: '1.1rem' },
            '& .markdown-wysiwyg h3': { fontSize: '1rem' },
            '& .markdown-wysiwyg ul': { listStyleType: 'disc', pl: 3, mt: 0, mb: 1.25 },
            '& .markdown-wysiwyg ol': { listStyleType: 'decimal', pl: 3, mt: 0, mb: 1.25 },
            '& .markdown-wysiwyg li': { mb: 0.35 },
            '& .markdown-wysiwyg li p': { mb: 0.25 },
            '& .markdown-wysiwyg blockquote': {
              borderLeft: '2px solid hsl(var(--border))',
              pl: 1.5,
              ml: 0,
              color: 'hsl(var(--muted-foreground))',
            },
            '& .markdown-wysiwyg code': {
              bgcolor: 'hsl(var(--muted))',
              px: 0.5,
              borderRadius: 0.75,
              fontSize: '0.85em',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            },
            '& .markdown-wysiwyg pre': {
              bgcolor: 'hsl(var(--muted))',
              p: 1.5,
              borderRadius: 1,
              overflowX: 'auto',
            },
            '& .markdown-wysiwyg pre code': { bgcolor: 'transparent', p: 0 },
            '& .markdown-wysiwyg a': { color: 'hsl(var(--primary))', textDecoration: 'underline' },
            '& .markdown-wysiwyg img': { maxWidth: '100%', borderRadius: 6 },
            '& .markdown-wysiwyg hr': { border: 0, borderTop: '1px solid hsl(var(--border))' },
            '& .markdown-wysiwyg p.is-empty::before, & .markdown-wysiwyg.is-editor-empty p:first-of-type::before': {
              content: 'attr(data-placeholder)',
              color: 'hsl(var(--muted-foreground))',
              float: 'left',
              height: 0,
              pointerEvents: 'none',
            },
          }}
        >
          <EditorContent editor={editor} />
        </Box>
      )}

      {bar && editor && !raw && (
        <Box
          data-markdown-format-bar="1"
          data-selection-rule-ignore="1"
          data-format-bar-placement={bar.placement}
          onMouseDown={(event) => event.preventDefault()}
          sx={{
            position: 'absolute',
            top: bar.top,
            left: bar.left,
            transform: bar.placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            px: 0.5,
            py: 0.25,
            borderRadius: 1.5,
            bgcolor: 'hsl(var(--background-elevated, var(--card)))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 6px 20px hsl(var(--foreground) / 0.18)',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}
        >
          {linkOpen ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5 }}>
              <TextField
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyLink();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setLinkOpen(false);
                  }
                }}
                placeholder="Paste or type a URL"
                variant="standard"
                autoFocus
                sx={{
                  width: 220,
                  '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
                  '& input': { fontSize: '0.78rem' },
                }}
              />
              <Box component="button" type="button" onClick={applyLink} sx={barButtonSx(false)}>
                Apply
              </Box>
              <Box
                component="button"
                type="button"
                onClick={() => setLinkOpen(false)}
                sx={barButtonSx(false)}
              >
                Cancel
              </Box>
            </Box>
          ) : (
            <>
              {ACTIONS.map((action) => (
                <Tooltip key={action.id} title={action.title} arrow>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => action.run(editor)}
                    sx={{
                      ...barButtonSx(action.active(editor)),
                      fontWeight: action.id === 'bold' ? 700 : 500,
                      fontStyle: action.id === 'italic' ? 'italic' : 'normal',
                      textDecoration: action.id === 'strike' ? 'line-through' : 'none',
                    }}
                  >
                    {action.label}
                  </Box>
                </Tooltip>
              ))}
              <Tooltip title="Link" arrow>
                <Box
                  component="button"
                  type="button"
                  onClick={openLink}
                  sx={barButtonSx(editor.isActive('link'))}
                >
                  Link
                </Box>
              </Tooltip>
            </>
          )}
        </Box>
      )}

      {uploading && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 1,
            fontSize: '0.8rem',
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          <CircularProgress size={12} />
          Uploading image...
        </Box>
      )}
    </Box>
  );
};

export default MarkdownDescriptionEditor;
