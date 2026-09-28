/**
 * AgentRunDiagnosisBanner — compact, dismissible "nudge" shown above an
 * agent run when it failed or its output looks suspicious.
 *
 * Designed to be unobtrusive: a single line with an icon, short message,
 * an optional jump-to-evidence affordance, and a dismiss (X) button that
 * permanently hides the banner for that exact execution.
 *
 * Returns `null` when the run has no failure / warning, or when the user
 * has already dismissed the banner for this execution id.
 */

import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { AlertTriangle, ArrowUpRight, ExternalLink, HelpCircle, Settings2, X } from 'lucide-react';
import AgentDiagnosisCtas, { diagnosisHasCtas } from '@/Shuffle-MCPs/components/AgentDiagnosisCtas';
import { useEffect, useMemo, useState } from 'react';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import {
  diagnoseOutputWarning,
  extractDecisionIndex,
  getFailureInfo,
  hasOutputWarning,
  parseRunResult,
  type DiagnosableRun,
} from '@/Shuffle-MCPs/agentDiagnosis';

interface Props extends ShuffleHostProps {
  run: DiagnosableRun | null | undefined;
  /** Outer padding wrapper. Defaults to `{ px: 2.5, pb: 0.5 }`. */
  sx?: Record<string, unknown>;
  /** When provided, the banner becomes clickable and asks the host to jump
   *  to the underlying decision (e.g. switch to the detailed timeline,
   *  expand that row, scroll to it). */
  onJumpToEvidence?: (decisionIndex: number) => void;
  /** When provided, the banner message becomes a CTA that focuses the
   *  run's continuation input area below. */
  onFocusContinue?: () => void;
  /** Stable id used to persist dismissals per-execution. Falls back to
   *  `run.execution_id` if present. When neither is available, dismiss
   *  still works for the current mount but is not persisted. */
  executionId?: string;
}

const DISMISS_PREFIX = 'agent-diagnosis-dismissed::';

const readDismissed = (key: string | null): boolean => {
  if (!key || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DISMISS_PREFIX + key) === '1';
  } catch {
    return false;
  }
};

const writeDismissed = (key: string | null) => {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_PREFIX + key, '1');
  } catch {
    /* ignore */
  }
};

const AgentRunDiagnosisBanner = ({ run, sx, onJumpToEvidence, onFocusContinue, executionId }: Props) => {
  const dismissKey = useMemo(() => {
    if (executionId) return executionId;
    const fromRun = (run as any)?.execution_id;
    return typeof fromRun === 'string' && fromRun ? fromRun : null;
  }, [executionId, run]);

  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed(dismissKey));

  // Re-sync if the underlying execution changes.
  useEffect(() => {
    setDismissed(readDismissed(dismissKey));
  }, [dismissKey]);


  if (!run || dismissed) return null;

  const status = (run.status || '').toUpperCase();
  const isFailed = status === 'FAILED' || status === 'ABORTED';
  const failureInfo = isFailed ? getFailureInfo(run) : null;
  const outputWarning = !isFailed && hasOutputWarning(run);
  const diagnosis = outputWarning ? diagnoseOutputWarning(run) : null;

  if (!failureInfo && !diagnosis) return null;

  // A finished run cannot fail AI model provider authentication. Suppress any residual ai_auth diagnosis.
  if (status === 'FINISHED' && (diagnosis?.kind === 'ai_auth' || diagnosis?.isAiAuth)) {
    return null;
  }

  // Generic "Authentication failed" (pointing to Apps -> Authentication) is strictly
  // for intermediate tool/action decisions failing (e.g. Jira, Slack 401).
  // If the run is finished and the failure does not originate from an intermediate decision, suppress it.
  if (status === 'FINISHED' && diagnosis?.kind === 'auth') {
    const firstEvidence = diagnosis?.evidence?.[0] || null;
    const jumpDecisionIndex = firstEvidence ? extractDecisionIndex(firstEvidence.path) : null;
    if (jumpDecisionIndex === null) return null;
    const { parsed } = parseRunResult(run);
    const decs = parsed?.decisions || (run as any)?.decisions;
    if (Array.isArray(decs) && decs[jumpDecisionIndex]) {
      const d = decs[jumpDecisionIndex];
      const action = String(d?.action || d?.details?.action || '').toLowerCase();
      const category = String(d?.category || '').toLowerCase();
      if (['finish', 'finalise'].includes(action) || ['finish', 'finalise'].includes(category)) {
        return null;
      }
    }
  }

  const isCritical = !!failureInfo || diagnosis?.kind === 'token_limit' || diagnosis?.kind === 'ai_auth' || Boolean(diagnosis?.isAiAuth);
  const tone = isCritical ? 'critical' : 'medium';
  const Icon = isCritical ? AlertTriangle : HelpCircle;

  // Surface a plain, actionable CTA for failures that can be continued,
  // while keeping the full diagnosis in the expanded details block.
  const message = failureInfo && onFocusContinue
    ? 'Something went wrong with this decision. Please continue in the area below.'
    : failureInfo
      ? failureInfo.reason
      : `${diagnosis!.title} — ${diagnosis!.explanation}`;

  const canFocusContinue = !!onFocusContinue && failureInfo != null;



  const firstEvidence = diagnosis?.evidence?.[0] || null;
  const jumpDecisionIndex = firstEvidence ? extractDecisionIndex(firstEvidence.path) : null;
  const canJump = !!(onJumpToEvidence && jumpDecisionIndex !== null);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    writeDismissed(dismissKey);
    setDismissed(true);
  };

  const handleJump = () => {
    if (canJump) onJumpToEvidence!(jumpDecisionIndex!);
  };

  const handleFocusContinue = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation?.();
    if (canFocusContinue) onFocusContinue!();
  };

  const showCtas = diagnosisHasCtas(diagnosis);

  return (
    <Box sx={{ px: 2.5, pb: 0.5, ...(sx || {}) }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          px: 1.25,
          py: 0.75,
          borderRadius: 2,
          bgcolor: `hsla(var(--severity-${tone}) / 0.06)`,
          border: `1px solid hsla(var(--severity-${tone}) / 0.18)`,
        }}
      >
        <Box
          {...(canJump
            ? {
                role: 'button' as const,
                tabIndex: 0,
                onClick: handleJump,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleJump();
                  }
                },
              }
            : {})}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: canJump ? 'pointer' : 'default',
            borderRadius: 1,
            transition: 'background 0.15s ease',
            ...(canJump && {
              '&:hover': {
                bgcolor: `hsla(var(--severity-${tone}) / 0.08)`,
              },
              '&:focus-visible': {
                outline: 'none',
                boxShadow: `0 0 0 2px hsla(var(--severity-${tone}) / 0.25)`,
              },
            }),
          }}
        >
          <Icon
            size={13}
            style={{ color: `hsl(var(--severity-${tone}))`, flexShrink: 0 }}
          />
          <Typography
            component={canFocusContinue ? 'span' : 'span'}
            role={canFocusContinue ? 'button' : undefined}
            tabIndex={canFocusContinue ? 0 : undefined}
            onClick={canFocusContinue ? handleFocusContinue : undefined}
            onKeyDown={
              canFocusContinue
                ? (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleFocusContinue(e);
                    }
                  }
                : undefined
            }
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: '0.74rem',
              color: canFocusContinue ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              ...(canFocusContinue && {
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
                '&:hover': { color: 'hsl(var(--primary))' },
              }),
            }}
            title={message}
          >
            {message}
          </Typography>
          {canJump && (
            <Tooltip title={`Open Decision #${(jumpDecisionIndex ?? 0) + 1} in detailed timeline`} placement="top" arrow>
              <ArrowUpRight
                size={13}
                style={{ color: `hsl(var(--severity-${tone}))`, flexShrink: 0 }}
              />
            </Tooltip>
          )}
          {canJump && (
            <Typography
              component="span"
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); handleJump(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleJump();
                }
              }}
              sx={{
                fontSize: '0.7rem',
                fontWeight: 500,
                color: 'hsl(var(--primary))',
                cursor: 'pointer',
                flexShrink: 0,
                ml: 0.5,
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              Show details
            </Typography>
          )}
          <Tooltip title="Dismiss for this execution" placement="top" arrow>
            <IconButton
              size="small"
              onClick={handleDismiss}
              sx={{
                p: 0.25,
                ml: 0.25,
                color: 'hsl(var(--muted-foreground))',
                '&:hover': {
                  color: 'hsl(var(--foreground))',
                  bgcolor: 'hsla(var(--foreground) / 0.06)',
                },
              }}
              aria-label="Dismiss diagnosis"
            >
              <X size={12} />
            </IconButton>
          </Tooltip>

        </Box>
        {showCtas && (

          <Box sx={{ pl: 2.5, pt: 0.25 }}>
            <AgentDiagnosisCtas diagnosis={diagnosis} tone={tone} />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default AgentRunDiagnosisBanner;
