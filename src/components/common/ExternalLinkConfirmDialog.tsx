/**
 * ExternalLinkConfirmDialog — global singleton MUI dialog that confirms
 * navigation to untrusted links inside email bodies, AI output, etc.
 * Triggered via requestExternalLinkConfirm() from safeExternalLinks.
 */
import { AlertTriangle as WarningAmberRoundedIcon, ExternalLink as OpenInNewIcon, X as CloseIcon, Link as LinkIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  Stack,
  Chip,
} from '@mui/material';
import {
  onExternalLinkConfirmRequest,
  openExternalLink,
  type ExternalLinkConfirmDetail,
} from '@/utils/safeExternalLinks';
import { getTopSurfaceZIndex } from '@/Shuffle-MCPs/drawerLayer';

const ExternalLinkConfirmDialog = () => {
  const [pending, setPending] = useState<ExternalLinkConfirmDetail | null>(null);

  useEffect(() => {
    return onExternalLinkConfirmRequest((detail) => setPending(detail));
  }, []);

  const close = () => setPending(null);
  const confirm = () => {
    if (pending) openExternalLink(pending.url);
    setPending(null);
  };

  const open = pending !== null;

  return (
    <Dialog
      open={open}
      onClose={close}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          border: '1px solid hsl(var(--border))',
        },
      }}
      sx={{ zIndex: (_theme: any) => Math.max(getTopSurfaceZIndex() + 10, 10060) }}
    >
      <DialogTitle sx={{ pr: 6, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'hsl(var(--warning) / 0.15)',
            color: 'hsl(var(--warning))',
            flexShrink: 0,
          }}
        >
          <WarningAmberRoundedIcon size={20} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            Open external link?
          </Typography>
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            This link came from an untrusted source.
          </Typography>
        </Box>
        <IconButton
          aria-label="Close"
          onClick={close}
          size="small"
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseIcon size={20} />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ borderColor: 'hsl(var(--border))' }}>
        {pending && (
          <Stack spacing={2}>
            <Box>
              <Typography
                variant="caption"
                sx={{
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  color: 'hsl(var(--muted-foreground))',
                  fontWeight: 600,
                }}
              >
                Domain
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <Chip
                  label={pending.host}
                  size="small"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    height: 28,
                    backgroundColor: 'hsl(var(--muted))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </Box>
            </Box>

            <Box>
              <Typography
                variant="caption"
                sx={{
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  color: 'hsl(var(--muted-foreground))',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                <LinkIcon size={14} /> Full URL
              </Typography>
              <Box
                sx={{
                  mt: 0.5,
                  p: 1.25,
                  borderRadius: 1,
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--muted) / 0.4)',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  wordBreak: 'break-all',
                  color: 'hsl(var(--foreground))',
                  maxHeight: 160,
                  overflow: 'auto',
                }}
              >
                {pending.url}
              </Box>
            </Box>

            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Are you sure you want to visit{' '}
              <Box component="span" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                {pending.host}
              </Box>
              ? It will open in a new tab.
            </Typography>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button
          onClick={close}
          variant="outlined"
          sx={{
            height: 36,
            textTransform: 'none',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={confirm}
          variant="contained"
          startIcon={<OpenInNewIcon />}
          sx={{
            height: 36,
            textTransform: 'none',
            backgroundColor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)' },
          }}
        >
          Open link
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExternalLinkConfirmDialog;
