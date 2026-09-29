/**
 * AgentQuestionDialog — modal wrapper around the ONE shared agent question
 * component (`InlineAgentQuestion`).
 *
 * There is deliberately no separate question form here: every place that
 * answers an agent handoff (incident timeline, dashboard, handoff toasts,
 * agent quick view) renders the same component, so submission behaviour —
 * sequential questions, node_id resolution, abort/ignore — stays identical.
 */

import { Box, Typography, IconButton, Dialog, DialogContent } from '@mui/material';
import { X as CloseIcon } from 'lucide-react';
import AgentIcon from '@/Shuffle-Core/components/AgentIcon';
import InlineAgentQuestion from './InlineAgentQuestion';
import { stripAgentTitlePrefix, type AgentNotification } from '@/services/notifications';

interface Props {
  open: boolean;
  onClose: () => void;
  notification: AgentNotification | null;
  /** Called after an answer is submitted (or the run is aborted). */
  onSubmitted?: () => void;
}

const AgentQuestionDialog = ({ open, onClose, notification, onSubmitted }: Props) => {
  if (!notification) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'hsl(var(--card))',
          backgroundImage: 'none',
          border: '1px solid hsl(var(--border))',
          borderRadius: 3,
          maxHeight: '85vh',
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{
          px: 3,
          pt: 2.5,
          pb: 2,
          borderBottom: '1px solid hsl(var(--border))',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
        }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <AgentIcon size={16} />
              <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'hsl(var(--foreground))' }}>
                Agent Needs Your Input
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
              {stripAgentTitlePrefix(notification.title)}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" sx={{ color: 'hsl(var(--muted-foreground))', mt: -0.5 }}>
            <CloseIcon size={20} />
          </IconButton>
        </Box>

        <Box sx={{ px: 3, py: 2.5 }}>
          <InlineAgentQuestion
            notification={notification}
            onSubmitted={onSubmitted}
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default AgentQuestionDialog;
