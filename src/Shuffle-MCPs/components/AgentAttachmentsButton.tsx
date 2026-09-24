/**
 * AgentAttachmentsButton — top-bar control that surfaces the image attachments
 * found in an agent run's `llm_requests`. Shows a count badge, a thumbnail
 * grid in a popover, and a full-screen zoom for a single image.
 */

import { useEffect, useState } from 'react';
import { Badge, Box, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import { Image as ImageIcon } from 'lucide-react';
import type { LlmImageAttachment } from '@/Shuffle-MCPs/agentAttachments';
import { getTopSurfaceZIndex } from '@/Shuffle-MCPs/drawerLayer';

const toSrc = (url: string): string => {
  const s = (url || '').trim();
  if (!s) return '';
  if (/^(data:|https?:|blob:)/i.test(s)) return s;
  return `data:image/png;base64,${s.replace(/\s+/g, '')}`;
};

interface AgentAttachmentsButtonProps {
  attachments: LlmImageAttachment[];
}

const AgentAttachmentsButton = ({ attachments }: AgentAttachmentsButtonProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setZoomed(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  if (!attachments.length) return null;

  return (
    <>
      <Tooltip title={`${attachments.length} image ${attachments.length === 1 ? 'attachment' : 'attachments'} sent to the model`}>
        <span>
          <IconButton
            size="small"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{
              color: anchorEl ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
              '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'hsl(var(--muted))' },
            }}
          >
            <Badge
              badgeContent={attachments.length}
              sx={{
                '& .MuiBadge-badge': {
                  bgcolor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  fontSize: '0.6rem',
                  height: 15,
                  minWidth: 15,
                },
              }}
            >
              <ImageIcon size={18} />
            </Badge>
          </IconButton>
        </span>
      </Tooltip>

      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              p: 1.5,
              width: 340,
              maxHeight: 420,
              overflowY: 'auto',
              bgcolor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
              backgroundImage: 'none',
            },
          },
        }}
      >
        <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', mb: 1 }}>
          Images sent with this prompt
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          {attachments.map((att, i) => {
            const src = toSrc(att.url);
            return (
              <Box key={`${i}-${att.url.slice(0, 40)}`}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setZoomed(src)}
                  sx={{
                    display: 'block',
                    width: '100%',
                    p: 0,
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 1,
                    overflow: 'hidden',
                    bgcolor: 'hsl(var(--muted))',
                    cursor: 'zoom-in',
                    '&:hover': { borderColor: 'hsl(var(--primary))' },
                  }}
                >
                  <Box
                    component="img"
                    src={src}
                    alt={`Attachment ${i + 1}`}
                    sx={{ display: 'block', width: '100%', height: 96, objectFit: 'cover' }}
                  />
                </Box>
                <Typography
                  sx={{
                    mt: 0.5,
                    fontSize: '0.62rem',
                    color: 'hsl(var(--muted-foreground))',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {[att.role, att.model].filter(Boolean).join(' · ') || `Image ${i + 1}`}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Popover>

      {zoomed && (
        <Box
          onClick={() => setZoomed(null)}
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: Math.max(getTopSurfaceZIndex() + 20, 10060),
            bgcolor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 4,
            cursor: 'zoom-out',
          }}
        >
          <Box
            component="img"
            src={zoomed}
            alt="Attachment"
            sx={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 1 }}
          />
        </Box>
      )}
    </>
  );
};

export default AgentAttachmentsButton;
