/**
 * PopupTextEditor — shared text-input component with an "expand to popup editor"
 * affordance. Use this anywhere we have a free-form text field that benefits
 * from a larger editing surface (prompts, descriptions, rules, pipelines, …).
 *
 * Why share it:
 *  - One place to add features (variables, AI rewrite, syntax highlighting, …)
 *  - Consistent UX (icon, keyboard shortcuts, layout)
 *  - Cheap to upgrade later (drop in Monaco/CodeMirror without changing call sites)
 *
 * Usage:
 *   <PopupTextEditor
 *     value={value}
 *     onChange={setValue}
 *     placeholder="Prompt 1…"
 *     title="Edit prompt 1"
 *     subtitle="Full editor for the AI Agent prompt."
 *     // optional
 *     mode="multiline"        // or "single"
 *     syntax="plain"          // or "yaml" | "json" | "markdown" — for future highlighting
 *     inlineRows={1}          // collapsed height
 *     popupMinRows={14}
 *     popupMaxRows={28}
 *     toolbar={<… extra buttons …>}
 *   />
 */

import { X as CloseIcon, Maximize2 as OpenInFullIcon } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  TextField,
  Typography,
  type TextFieldProps,
} from '@mui/material';
import { getTopSurfaceZIndex } from '@/Shuffle-MCPs/drawerLayer';
export type PopupTextEditorSyntax = 'plain' | 'yaml' | 'json' | 'markdown';

export interface PopupTextEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Inline placeholder. */
  placeholder?: string;
  /** Title shown in the popup editor header. */
  title?: string;
  /** Optional subtitle/help text shown under the title. */
  subtitle?: string;
  /** Inline field mode. Defaults to "single". */
  mode?: 'single' | 'multiline';
  /** Reserved for future syntax-aware editing. */
  syntax?: PopupTextEditorSyntax;
  /** Inline collapsed rows when `mode="multiline"`. Defaults to 2. */
  inlineRows?: number;
  /** Inline max rows when `mode="multiline"`. Defaults to 6. */
  inlineMaxRows?: number;
  /** Popup editor min rows. Defaults to 14. */
  popupMinRows?: number;
  /** Popup editor max rows. Defaults to 28. */
  popupMaxRows?: number;
  /** Extra buttons rendered in the popup actions bar (e.g. "Insert variable"). */
  toolbar?: React.ReactNode;
  /** Disable both inline + popup. */
  disabled?: boolean;
  /** Forwarded to the inline TextField. */
  size?: TextFieldProps['size'];
  /** Extra props for the inline TextField. */
  inlineTextFieldProps?: Partial<TextFieldProps>;
  /** Optional className on the outer wrapper. */
  className?: string;
  /** Hide the expand icon (rare — opts out of popup). */
  hideExpandButton?: boolean;
  /** When false, don't render the inline TextField — only the popup Dialog.
   *  Combine with `open`/`onOpenChange` to control the popup from a custom trigger
   *  (e.g. a chip button). Defaults to true. */
  renderInline?: boolean;
  /** Controlled open state for the popup. If provided, PopupTextEditor becomes controlled. */
  open?: boolean;
  /** Controlled open change handler. Required when `open` is provided. */
  onOpenChange?: (open: boolean) => void;
}

const monoFont = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * Whether to use a monospace editor surface in the popup.
 * Plain language gets a normal font; structured content gets monospace.
 */
const isStructuredSyntax = (s: PopupTextEditorSyntax | undefined) =>
  s === 'yaml' || s === 'json';

export const PopupTextEditor: React.FC<PopupTextEditorProps> = ({
  value,
  onChange,
  placeholder,
  title,
  subtitle,
  mode = 'single',
  syntax = 'plain',
  inlineRows = 2,
  inlineMaxRows = 6,
  popupMinRows = 14,
  popupMaxRows = 28,
  toolbar,
  disabled = false,
  size = 'small',
  inlineTextFieldProps,
  className,
  hideExpandButton = false,
  renderInline = true,
  open: controlledOpen,
  onOpenChange,
}) => {
  const isControlled = typeof controlledOpen === 'boolean';
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? (controlledOpen as boolean) : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };
  const [draft, setDraft] = useState(value);

  // Sync draft when popup opens (so we always start from the latest committed value)
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  // Cmd/Ctrl + Enter to apply, Esc to close (Dialog handles Esc natively)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onChange(draft);
      setOpen(false);
    }
  };

  const expandButton = !hideExpandButton && (
    <IconButton
      size="small"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      title="Open editor"
      sx={{
        color: 'hsl(var(--muted-foreground))',
        '&:hover': { color: 'hsl(var(--primary))' },
        mr: -0.5,
        alignSelf: mode === 'multiline' ? 'flex-start' : 'center',
        mt: mode === 'multiline' ? 0.25 : 0,
      }}
    >
      <OpenInFullIcon size={14} />
    </IconButton>
  );

  const useMono = isStructuredSyntax(syntax);

  return (
    <Box className={className} sx={{ width: '100%' }}>
      {renderInline && (
        <TextField
          size={size}
          fullWidth
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          multiline={mode === 'multiline'}
          minRows={mode === 'multiline' ? inlineRows : undefined}
          maxRows={mode === 'multiline' ? inlineMaxRows : undefined}
          {...inlineTextFieldProps}
          InputProps={{
            ...(inlineTextFieldProps?.InputProps || {}),
            endAdornment: (
              <>
                {inlineTextFieldProps?.InputProps?.endAdornment}
                {expandButton}
              </>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'hsl(var(--background))',
              fontSize: '0.85rem',
              ...(useMono && mode === 'multiline' ? { fontFamily: monoFont } : {}),
            },
            ...(inlineTextFieldProps?.sx as object || {}),
          }}
        />
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
        sx={{ zIndex: (_theme: any) => Math.max(getTopSurfaceZIndex() + 10, 10060) }}
        PaperProps={{
          sx: {
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, pb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: 'hsl(var(--foreground))' }}>
              {title || 'Edit'}
            </Typography>
            {subtitle && (
              <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', mt: 0.25 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          <IconButton
            size="small"
            onClick={() => setOpen(false)}
            sx={{ color: 'hsl(var(--muted-foreground))' }}
          >
            <CloseIcon size={20} />
          </IconButton>
        </DialogTitle>
        <Divider sx={{ borderColor: 'hsl(var(--border))' }} />
        <DialogContent sx={{ pt: 2.5 }} onKeyDown={handleKeyDown}>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={popupMinRows}
            maxRows={popupMaxRows}
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'hsl(var(--background))',
                fontFamily: useMono ? monoFont : undefined,
                fontSize: '0.85rem',
                lineHeight: 1.55,
                alignItems: 'flex-start',
              },
            }}
          />
        </DialogContent>
        <Divider sx={{ borderColor: 'hsl(var(--border))' }} />
        <DialogActions sx={{ px: 3, py: 2, gap: 1, justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', gap: 1, flex: 1, minWidth: 0 }}>{toolbar}</Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Typography
              sx={{
                fontSize: '0.7rem',
                color: 'hsl(var(--muted-foreground))',
                alignSelf: 'center',
                mr: 1,
                display: { xs: 'none', sm: 'block' },
              }}
            >
              ⌘/Ctrl + Enter to apply
            </Typography>
            <Button onClick={() => setOpen(false)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
              sx={{ textTransform: 'none' }}
            >
              Apply
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PopupTextEditor;
