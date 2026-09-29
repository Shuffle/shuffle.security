/**
 * InlineAgentQuestion — renders a workflow's stuck "Question" handoff inline
 * inside the incident Timeline, so the user can answer without opening the
 * global handoff dialog.
 *
 * Behaviour:
 *  - Provenance header makes it obvious WHERE the question came from
 *    (workflow / agent name, execution id, when it was raised).
 *  - Question text and description are rendered as markdown.
 *  - Multiple questions are handled ONE AT A TIME. Each answer is submitted
 *    in realtime (`continueAgentExecution` with `{question_N: answer}`) before
 *    moving on to the next question.
 *  - Every question can be skipped with "Ignore". Ignoring the last remaining
 *    question dismisses the notification.
 */
import { useState } from 'react';
import { Box, Typography, Button, TextField, CircularProgress, Tooltip, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { Send, X, Check, ExternalLink } from 'lucide-react';
import AgentIcon from '@/Shuffle-Core/components/AgentIcon';
import { toast } from '@/lib/toast';
import InlineMarkdown from '@/components/shared/InlineMarkdown';
import { getApiUrl, shuffleFetch } from '@/Shuffle-Core/api';
import {
  approveAgentAction,
  continueAgentExecution,
  dismissNotification,
  stripAgentTitlePrefix,
  type AgentNotification,
} from '@/services/notifications';


interface Props {
  notification: AgentNotification;
  /** Opens the full agent run / execution details for this question. */
  onOpenDetails?: (executionId: string) => void;
  onSubmitted?: () => void;
}

const toMs = (ts?: number | string): number => {
  if (!ts) return 0;
  if (typeof ts === 'string' && /[^0-9.]/.test(ts)) {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const n = typeof ts === 'string' ? Number(ts) : ts;
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1e12) return n * 1000;
  if (n < 1e15) return n;
  if (n < 1e18) return n / 1000;
  return n / 1e6;
};

const relativeTime = (raw?: number | string): string => {
  const ms = toMs(raw);
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (!Number.isFinite(diff) || diff < 0) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const InlineAgentQuestion = ({ notification, onOpenDetails, onSubmitted }: Props) => {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [done, setDone] = useState(false);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [aborting, setAborting] = useState(false);


  const questions = notification.questions && notification.questions.length > 0
    ? notification.questions
    : [stripAgentTitlePrefix(notification.title) || notification.description || 'Provide an answer to continue'];

  const total = questions.length;
  const current = questions[index];

  const advance = () => {
    if (index + 1 < total) {
      setIndex(index + 1);
      setAnswer('');
    } else {
      setDone(true);
      onSubmitted?.();
    }
  };

  const handleSubmit = async () => {
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    try {
      await continueAgentExecution({
        notification,
        approve: true,
        note: { [`question_${index}`]: answer.trim() },
      });
      if (index + 1 >= total) {
        await approveAgentAction(notification.id).catch(() => { /* non-fatal */ });
      }
      setAnsweredCount((c) => c + 1);
      toast.success(total > 1 ? `Answer ${index + 1} of ${total} submitted.` : 'Answer submitted — the workflow will continue.');
      onSubmitted?.();
      advance();
    } catch (err) {
      console.error('[InlineAgentQuestion] submit failed:', err);
      toast.error('Failed to submit answer. Please contact support@shuffler.io if this persists.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  /** Ignoring a question aborts the underlying workflow execution. */
  const handleIgnore = async () => {
    if (submitting || aborting) return;
    setAborting(true);
    try {
      if (notification.workflow_id && notification.execution_id) {
        const resp = await shuffleFetch(
          getApiUrl(`/api/v1/workflows/${notification.workflow_id}/executions/${notification.execution_id}/abort`),
        );
        if (!resp.ok) {
          console.error('[InlineAgentQuestion] abort failed:', resp.status);
        }
        try {
          window.dispatchEvent(new CustomEvent('workflow-run:changed', {
            detail: { executionId: notification.execution_id, reason: 'aborted' },
          }));
        } catch { /* ignore */ }
      }
      await dismissNotification(notification.id).catch(() => { /* non-fatal */ });
      setIgnoredCount((c) => c + 1);
      toast.success('Execution aborted.');
      onSubmitted?.();
      setDone(true);
    } catch (err) {
      console.error('[InlineAgentQuestion] abort error:', err);
      toast.error('Failed to abort the execution. Please contact support@shuffler.io if this persists.');
    } finally {
      setAborting(false);
      setConfirmAbort(false);
    }
  };




  if (done) {
    return (
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          mt: 0.75,
          px: 1.5,
          py: 1,
          borderRadius: 1.5,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--muted) / 0.35)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Check size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
        <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>
          {answeredCount > 0
            ? `${answeredCount} answer${answeredCount === 1 ? '' : 's'} submitted${ignoredCount ? `, ${ignoredCount} ignored` : ''}.`
            : 'Question ignored.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      onClick={(e) => e.stopPropagation()}
      sx={{
        mt: 0.75,
        p: 2,
        borderRadius: 1.5,
        border: '1px solid hsl(var(--severity-info) / 0.5)',
        bgcolor: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      {/* Header — it is always the AI Agent asking */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AgentIcon size={15} />
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          The AI Agent needs your input to continue
        </Typography>
        {total > 1 && (
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>
            {index + 1} of {total}
          </Typography>
        )}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {relativeTime(notification.created_at) && (
            <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
              {relativeTime(notification.created_at)}
            </Typography>
          )}
          {notification.execution_id && onOpenDetails && (
            <Tooltip title="Show agent run details" arrow>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onOpenDetails(String(notification.execution_id)); }}
                sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--foreground))' } }}
              >
                <ExternalLink size={14} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {notification.description && (
        <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.55 }}>
          <InlineMarkdown text={notification.description} />
        </Typography>
      )}

      <Box>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))', mb: 0.75, lineHeight: 1.5 }}>
          <InlineMarkdown text={current} />
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={6}
          autoFocus={total > 1 && index > 0}
          placeholder="Your answer here…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
          helperText="Shift + Enter to submit"
          FormHelperTextProps={{ sx: { fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))', mx: 0.5 } }}
          disabled={submitting}

          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '0.85rem',
              bgcolor: 'hsl(var(--background))',
              '& fieldset': { borderColor: 'hsl(var(--border))' },
              '&:hover fieldset': { borderColor: 'hsl(var(--primary) / 0.5)' },
              '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
            },
            '& .MuiOutlinedInput-input': { color: 'hsl(var(--foreground))' },
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button
          onClick={() => setConfirmAbort(true)}
          disabled={submitting || aborting}
          size="small"
          variant="outlined"
          startIcon={aborting ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <X size={13} />}
          sx={{
            fontSize: '0.78rem',
            textTransform: 'none',
            fontWeight: 600,
            height: 32,
            px: 2,
            color: 'hsl(var(--muted-foreground))',
            borderColor: 'hsl(var(--border))',
            '&:hover': { borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted) / 0.4)' },
          }}
        >
          {aborting ? 'Aborting…' : 'Ignore'}
        </Button>

        <Button
          onClick={handleSubmit}
          disabled={!answer.trim() || submitting}
          size="small"
          variant="contained"
          startIcon={submitting ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <Send size={13} />}
          sx={{
            fontSize: '0.78rem',
            textTransform: 'none',
            fontWeight: 600,
            height: 32,
            px: 2,
            boxShadow: 'none',
            backgroundColor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)', boxShadow: 'none' },
            '&.Mui-disabled': { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
          }}
        >
          {submitting ? 'Submitting…' : index + 1 < total ? 'Submit & next' : 'Submit answer'}
        </Button>
      </Box>

      <Dialog open={confirmAbort} onClose={() => setConfirmAbort(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>Abort this execution?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.85rem' }}>
            Ignoring this question aborts the underlying workflow execution. Any pending actions will be stopped and the AI Agent will not continue.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmAbort(false)}
            size="small"
            sx={{ textTransform: 'none', fontWeight: 600, height: 32, color: 'hsl(var(--muted-foreground))' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleIgnore}
            disabled={aborting}
            size="small"
            variant="contained"
            color="error"
            sx={{ textTransform: 'none', fontWeight: 600, height: 32, boxShadow: 'none' }}
          >
            {aborting ? 'Aborting…' : 'Abort execution'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>

  );
};

export default InlineAgentQuestion;
