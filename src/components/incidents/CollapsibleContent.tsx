import { ChevronDown as ExpandMoreIcon, ChevronUp as ExpandLessIcon } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button } from '@mui/material';
interface CollapsibleContentProps {
  children: React.ReactNode;
  /** Maximum height (px) before collapse kicks in. Default 240. */
  maxHeight?: number;
  /** Storage key to persist expanded state per item. Optional. */
  storageKey?: string;
}

/**
 * Wraps long-form content (timeline comments, AI agent replies) in a
 * height-limited container with an expand/collapse toggle. Only renders
 * the toggle when the inner content actually overflows `maxHeight`.
 */
const CollapsibleContent: React.FC<CollapsibleContentProps> = ({
  children,
  maxHeight = 240,
  storageKey,
}) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (!storageKey || typeof window === 'undefined') return false;
    try { return window.localStorage.getItem(storageKey) === '1'; } catch { return false; }
  });

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      setOverflowing(el.scrollHeight > maxHeight + 4);
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      try {
        ro = new ResizeObserver(measure);
        ro.observe(el);
      } catch {
        ro = null;
      }
    }
    return () => ro?.disconnect();
  }, [maxHeight, children]);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      if (storageKey && typeof window !== 'undefined') {
        try {
          if (next) window.localStorage.setItem(storageKey, '1');
          else window.localStorage.removeItem(storageKey);
        } catch { /* ignore */ }
      }
      return next;
    });
  };

  const collapsed = overflowing && !expanded;

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        ref={innerRef}
        sx={{
          maxHeight: collapsed ? `${maxHeight}px` : 'none',
          overflow: 'hidden',
          transition: 'max-height 0.2s ease',
          maskImage: collapsed
            ? 'linear-gradient(to bottom, black calc(100% - 48px), transparent 100%)'
            : 'none',
          WebkitMaskImage: collapsed
            ? 'linear-gradient(to bottom, black calc(100% - 48px), transparent 100%)'
            : 'none',
        }}
      >
        {children}
      </Box>
      {overflowing && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 0.5 }}>
          <Button
            size="small"
            onClick={toggle}
            startIcon={expanded ? <ExpandLessIcon size={14} /> : <ExpandMoreIcon size={14} />}
            sx={{
              fontSize: '0.7rem',
              textTransform: 'none',
              color: '#ff6600',
              minHeight: 24,
              py: 0.25,
              px: 0.75,
              '&:hover': { bgcolor: 'rgba(255, 102, 0, 0.08)' },
            }}
          >
            {expanded ? 'Show less' : 'Show more'}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default CollapsibleContent;
