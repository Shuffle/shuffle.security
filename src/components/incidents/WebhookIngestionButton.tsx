import { Webhook as WebhookIcon, Copy as ContentCopyIcon, Check as CheckIcon, CheckCircle as CheckCircleOutlineIcon, Ban as BlockIcon, Send as SendIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Popover, Typography, Tooltip, InputBase, Button, Chip, CircularProgress } from '@mui/material';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { trackPredefinedEvent, GA_EVENTS } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useDemo } from '@/context/DemoContext';

import { EntityHealth } from '@/services/workflowHealth';
import {
  sendSampleIncidentAndValidate,
  IngestionValidationResult,
  IngestionStage,
} from '@/services/incidentIngestValidation';

export interface WebhookIngestionInfo {
  /** Webhook URL to display (null if workflow doesn't exist yet) */
  url: string | null;
  /** Whether the workflow exists */
  exists: boolean;
  /** Whether the workflow is currently running (not stopped) */
  enabled: boolean;
  /** The workflow ID (needed for start/stop) */
  workflowId: string | null;
}

interface WebhookIngestionButtonProps {
  webhook: WebhookIngestionInfo;
  onToggled?: () => void;
  /** Workflow label used with /api/v2/workflows/generate to create/remove the
   *  webhook workflow. Defaults to 'Ingest Tickets_webhook' for incidents;
   *  the vulnerabilities row overrides this to 'Ingest Vulnerabilities_webhook'
   *  so both webhooks stay unique server-side. */
  workflowLabel?: string;
  isBlocked?: boolean;
  health?: EntityHealth | null;
}

export const WebhookIngestionButton = ({
  webhook,
  onToggled,
  workflowLabel = 'Ingest Tickets_webhook',
  isBlocked = false,
  health,
}: WebhookIngestionButtonProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const popoverOpen = Boolean(anchorEl);
  const optimisticTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const { drawerOpen: demoDrawerOpen, setStepCompleted: setDemoStepCompleted } = useDemo();

  const isEnabled = optimisticEnabled !== null ? optimisticEnabled : webhook.enabled;

  // Clear the optimistic override only once the real prop catches up to it.
  // This prevents the UI from snapping back to the stale value while the
  // backend is still propagating the change.
  useEffect(() => {
    if (optimisticEnabled !== null && webhook.enabled === optimisticEnabled) {
      setOptimisticEnabled(null);
      if (optimisticTimeoutRef.current) {
        clearTimeout(optimisticTimeoutRef.current);
        optimisticTimeoutRef.current = null;
      }
    }
  }, [webhook.enabled, optimisticEnabled]);

  // Cleanup any pending safety timeout on unmount.
  useEffect(() => {
    return () => {
      if (optimisticTimeoutRef.current) clearTimeout(optimisticTimeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (!webhook.url) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(webhook.url);
      }
      setCopied(true);
      toast.success('Webhook URL copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const isIncidentWebhook =
    !workflowLabel ||
    workflowLabel === 'Ingest Tickets_webhook' ||
    workflowLabel.toLowerCase().includes('ticket') ||
    (!workflowLabel.toLowerCase().includes('vulnerabilit') && !workflowLabel.toLowerCase().includes('asset'));

  const [validationStage, setValidationStage] = useState<IngestionStage>('idle');
  const [lastValidationResult, setLastValidationResult] = useState<IngestionValidationResult | null>(null);

  const handleSendSampleIncident = async () => {
    if (!webhook.url || !isEnabled || isBlocked || validationStage !== 'idle') return;
    setValidationStage('sending');
    setLastValidationResult(null);

    try {
      const result = await sendSampleIncidentAndValidate({
        webhookUrl: webhook.url,
        workflowId: webhook.workflowId,
        onProgress: (p) => {
          setValidationStage(p.stage);
        },
      });

      setLastValidationResult(result);

      if (result.success) {
        const execSnippet = result.executionId ? ` (Execution ${result.executionId.slice(0, 8)})` : '';
        toast.success(`Ingested test incident (${result.alert.sourceName})${execSnippet}`);
        queryClient.invalidateQueries({ queryKey: ['incidents'] });
        onToggled?.();
      } else {
        toast.error(result.errorMessage || 'Ingest validation encountered an issue');
      }
    } catch (error: any) {
      console.error('Failed to validate ingest:', error);
      toast.error(error?.message ? `Failed to send alert: ${error.message}` : 'Failed to send test incident to webhook');
    } finally {
      setValidationStage('idle');
    }
  };

  const handleToggle = async () => {
    const willBeEnabled = !isEnabled;
    setOptimisticEnabled(willBeEnabled);
    setAnchorEl(null);
    trackPredefinedEvent(GA_EVENTS.INCIDENT_INGESTION_TOGGLE, 'webhook', willBeEnabled ? 1 : 0);

    // If the demo tour is open, flip the `ingest-webhook` step state right
    // away so the tour reacts in real time. The DemoCompletionWatcher will
    // re-confirm against the live workflow state once it refetches, but we
    // don't want the user to wait for that to feel the change.
    if (demoDrawerOpen) {
      setDemoStepCompleted('ingest-webhook', willBeEnabled);
    }

    try {
      if (willBeEnabled) {
        // Generate/enable the webhook workflow
        const res = await fetch(getApiUrl('/api/v2/workflows/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: workflowLabel,
          }),
        });
        if (!res.ok) throw new Error('Failed to create webhook workflow');
      } else {
        // Remove the webhook by calling generate with action: remove
        const res = await fetch(getApiUrl('/api/v2/workflows/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: workflowLabel,
            action_name: 'remove',
          }),
        });
        if (!res.ok) throw new Error('Failed to remove webhook workflow');
      }

      toast.success(willBeEnabled ? 'Ingestion Webhook enabled' : 'Ingestion Webhook disabled');
      // Do NOT clear optimisticEnabled here — keep the optimistic state until
      // the parent's refetch reports the new value (handled by the effect
      // above). Otherwise the UI snaps back to the stale prop.
      onToggled?.();
      // Also bust the shared workflows cache so global consumers (e.g. the
      // WebhookActiveChip in the top bar) update immediately.
      queryClient.invalidateQueries({ queryKey: ['workflows'] });

      // Safety net: if the backend never catches up (e.g. failed refetch),
      // release the optimistic lock after 15s so the UI doesn't get stuck.
      if (optimisticTimeoutRef.current) clearTimeout(optimisticTimeoutRef.current);
      optimisticTimeoutRef.current = setTimeout(() => {
        setOptimisticEnabled(null);
        optimisticTimeoutRef.current = null;
      }, 15000);
    } catch (error) {
      setOptimisticEnabled(null);
      // Roll back the demo step flip so the tour mirrors the real (failed) state.
      if (demoDrawerOpen) {
        setDemoStepCompleted('ingest-webhook', !willBeEnabled);
      }
      console.error('Failed to toggle webhook:', error);
      toast.error('Failed to update webhook status');
    }
  };

  return (
    <Box sx={{ position: 'relative' }} data-tour="webhook-ingestion-button">
      <Tooltip title={isEnabled ? (isBlocked ? 'Ingestion Webhook (blocked - runtime offline)' : 'Ingestion Webhook (push)') : 'Ingestion Webhook (inactive)'} placement="bottom">
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          size="small"
          sx={{
            width: 30,
            height: 30,
            border: isBlocked
              ? '1px solid hsl(var(--destructive))'
              : isEnabled
                ? '1px solid hsl(var(--severity-low))'
                : '1px solid hsl(var(--border))',
            bgcolor: isBlocked
              ? 'hsl(var(--destructive) / 0.15)'
              : isEnabled
                ? 'hsl(var(--severity-low) / 0.14)'
                : 'hsl(var(--card))',
            borderRadius: 1,
            opacity: (isEnabled || isBlocked) ? 1 : 0.45,
            filter: (isEnabled || isBlocked) ? 'none' : 'grayscale(1)',
            transition: 'opacity 0.15s ease, filter 0.15s ease',
            '&:hover': {
              bgcolor: isBlocked
                ? 'hsl(var(--destructive) / 0.25)'
                : isEnabled
                  ? 'hsl(var(--severity-low) / 0.22)'
                  : 'hsl(var(--accent))',
              opacity: 1,
              filter: 'none',
            },
          }}
        >
          <WebhookIcon size={16} style={{ color: isBlocked ? 'hsl(var(--destructive))' : isEnabled ? 'hsl(var(--severity-low))' : 'hsl(var(--muted-foreground))' }} />
        </IconButton>
      </Tooltip>
      <Popover
        open={popoverOpen}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              bgcolor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 1.5,
              p: 1.5,
              minWidth: 280,
              maxWidth: 400,
            },
          },
        }}
      >
        {isBlocked && (
          <Box sx={{
            p: 1.25,
            mb: 1.25,
            borderRadius: 1,
            bgcolor: 'hsla(var(--destructive) / 0.1)',
            border: '1px solid hsla(var(--destructive) / 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'hsl(var(--destructive))' }} />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--destructive))' }}>
                Runtime Location Offline
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.35 }}>
              {health?.primaryProblem?.description || 'The runtime location assigned to this webhook is offline. Ingestion events cannot be received.'}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              href={health?.primaryProblem?.actionUrl || '/admin/runtime-locations'}
              sx={{
                fontSize: '0.7rem',
                py: 0.25,
                px: 1,
                alignSelf: 'flex-start',
                borderColor: 'hsl(var(--destructive))',
                color: 'hsl(var(--destructive))',
                textTransform: 'none',
                '&:hover': {
                  borderColor: 'hsl(var(--destructive))',
                  bgcolor: 'hsla(var(--destructive) / 0.1)',
                },
              }}
            >
              Fix Runtime Location &rarr;
            </Button>
          </Box>
        )}
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', mb: 0.5, display: 'block' }}>
          Ingestion Webhook
          {isBlocked ? (
            <Chip label="Blocked" size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'hsla(var(--destructive) / 0.15)', color: 'hsl(var(--destructive))', border: '1px solid hsla(var(--destructive) / 0.3)' }} />
          ) : !isEnabled ? (
            <Chip label="Not Active" size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }} />
          ) : null}
        </Typography>
        <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', mb: 1, display: 'block', lineHeight: 1.4 }}>
          {isEnabled
            ? 'Send alerts to this URL to push incidents directly.'
            : webhook.exists
              ? 'This webhook is currently stopped. Enable it to receive pushed alerts.'
              : 'Enable to create a webhook endpoint for pushing alerts.'}
        </Typography>

        {/* Show URL field only when enabled and URL exists */}
        {isEnabled && webhook.url && (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: 'hsl(var(--muted) / 0.5)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 1,
            px: 1,
            py: 0.5,
            mb: 1,
          }}>
            <InputBase
              value={webhook.url}
              readOnly
              fullWidth
              sx={{
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                color: 'hsl(var(--foreground))',
                '& input': { p: 0 },
              }}
            />
            <IconButton size="small" onClick={handleCopy} sx={{ p: 0.5, color: 'hsl(var(--muted-foreground))' }}>
              {copied ? <CheckIcon size={14} style={{ color: 'success.main' }} /> : <ContentCopyIcon size={14} />}
            </IconButton>
          </Box>
        )}

        {/* Action buttons stack */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
          {/* Send Test Incident button (incidents webhook only, above Disable Webhook) */}
          {isIncidentWebhook && (
            <Tooltip
              title={
                !isEnabled
                  ? 'Enable the webhook to send a test incident'
                  : !webhook.url
                    ? 'Webhook URL is not yet available'
                    : isBlocked
                      ? 'Webhook runtime is offline'
                      : 'Send a raw alert from a cybersecurity tool (CrowdStrike, Defender, SentinelOne, Wazuh, etc.) to the webhook'
              }
              placement="top"
            >
              <Box component="span" sx={{ display: 'block', width: '100%' }}>
                <Button
                  size="small"
                  fullWidth
                  startIcon={
                    validationStage !== 'idle' ? (
                      <CircularProgress size={14} sx={{ color: 'inherit' }} />
                    ) : (
                      <SendIcon size={14} />
                    )
                  }
                  disabled={!isEnabled || !webhook.url || isBlocked || validationStage !== 'idle'}
                  onClick={handleSendSampleIncident}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    color: 'hsl(var(--foreground))',
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    '&:hover': {
                      bgcolor: 'hsl(var(--accent) / 0.5)',
                    },
                    '&.Mui-disabled': {
                      opacity: 0.45,
                      color: 'hsl(var(--muted-foreground))',
                    },
                  }}
                >
                  {validationStage === 'sending'
                    ? 'Sending alert…'
                    : validationStage === 'validating'
                      ? 'Validating ingest…'
                      : validationStage === 'polling'
                        ? 'Polling incident…'
                        : 'Send Test Incident'}
                </Button>
              </Box>
            </Tooltip>
          )}

          {/* Enable / Disable button */}
          <Button
            size="small"
            fullWidth
            startIcon={isEnabled ? <BlockIcon size={14} /> : <CheckCircleOutlineIcon size={14} />}
            onClick={handleToggle}
            sx={{
              justifyContent: 'flex-start',
              textTransform: 'none',
              fontSize: '0.75rem',
              color: isEnabled ? 'hsl(var(--destructive))' : 'hsl(var(--severity-low))',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              '&:hover': {
                bgcolor: isEnabled
                  ? 'hsl(var(--destructive) / 0.1)'
                  : 'hsl(var(--severity-low) / 0.1)',
              },
            }}
          >
            {isEnabled ? 'Disable Webhook' : 'Enable Webhook'}
          </Button>
        </Box>

        {/* Ingestion validation feedback */}
        {isIncidentWebhook && lastValidationResult && (
          <Box
            sx={{
              mt: 1,
              p: 0.75,
              borderRadius: 1,
              border: '1px solid',
              borderColor: lastValidationResult.success
                ? 'hsl(140 60% 45% / 0.35)'
                : 'hsl(var(--destructive) / 0.4)',
              bgcolor: lastValidationResult.success
                ? 'hsl(140 60% 45% / 0.08)'
                : 'hsl(var(--destructive) / 0.08)',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                fontWeight: 600,
                color: lastValidationResult.success ? 'hsl(140 60% 55%)' : 'hsl(var(--destructive))',
              }}
            >
              {lastValidationResult.success
                ? `Verified Ingestion: ${lastValidationResult.alert.sourceName}`
                : 'Ingestion Issue Detected'}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                color: 'hsl(var(--muted-foreground))',
                wordBreak: 'break-word',
                lineHeight: 1.25,
                mt: 0.25,
              }}
            >
              {lastValidationResult.success
                ? `${lastValidationResult.executionId ? `Execution ${lastValidationResult.executionId.slice(0, 8)} Passed` : 'Execution Passed'}${lastValidationResult.incidentKey ? ' • Incident Materialized' : ''}`
                : lastValidationResult.errorMessage || 'Execution encountered an error'}
            </Typography>
          </Box>
        )}
      </Popover>
    </Box>
  );
};
