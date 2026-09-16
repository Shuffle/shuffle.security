/**
 * Quick View Drawer — unified layout for all item types (notifications & runs).
 * Shows: title, severity, timestamp, error explanation, action timeline, and pending action.
 */

import InlineAgentQuestion from './InlineAgentQuestion';
import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Drawer,
  TextField,
  Chip,
} from '@mui/material';
import { CheckCircle, Settings, ArrowRight, HelpCircle, XCircle, Zap, Send, Mail, X as CloseIcon } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import {
  stripAgentTitlePrefix,
  parseAgentApprovalParams,
  type AgentNotification,
} from '@/services/notifications';
import AgentUI from '@/Shuffle-MCPs/components/AgentUI';
import type { AgentRun, AgentDecision } from '@/services/agentActivity';
import {
  parseDatastoreReference,
  isIncidentReference,
  getAgentRunOutput,
  getIncidentTitleFromRun,
  getIncidentSeverityFromRun,
  type SeverityInfo,
} from '@/lib/agentParsers';
import { hasOutputWarning, getFailureInfo } from '@/components/agent/AgentRunResultViewer';
import { getTimeAgo, formatDuration, getRunTitle } from '@/components/agent/AgentRunHeader';
import InlineMarkdown from '@/components/shared/InlineMarkdown';
import { getShuffleCoreFormUrl, isAgentApprovalFormUrl } from '@/Shuffle-MCPs/api';
import { navigateToShuffleCore, isShuffleCoreUrl } from '@/lib/authHandoff';
import { useEntityText } from '@/hooks/useEntityLabel';
import { useIsSupport } from '@/hooks/useIsSupport';
import { useDrawerLayer } from '@/Shuffle-MCPs/drawerLayer';

export type QuickViewItem =
  | { type: 'notification'; notification: AgentNotification }
  | { type: 'run'; run: AgentRun };

interface Props {
  open: boolean;
  onClose: () => void;
  item: QuickViewItem | null;
  entityBasePath: string;
  onApprove?: (notification: AgentNotification) => void;
  onDeny?: (notification: AgentNotification, note?: string) => void;
  onConfigureApprove?: (notificationId: string, modifiedAction?: string) => void;
  onSubmitAnswers?: (notificationId: string, answers: Record<number, string>) => void;
}

/** Build a unified data shape from either a notification or a run */
interface UnifiedData {
  title: string;
  severity: SeverityInfo | null;
  severityRaw: string | null;
  timestamp: string;
  errorExplanation: string | null;
  timeline: TimelineEntry[];
  pendingAction: string | null;
  incidentLink: string | null;
  /** Label for the bottom CTA — defaults to "View Full Incident" but
   *  switches to "Open Agent Approval" for /forms/{id} approval URLs. */
  incidentLinkLabel: string;
  /** When true, render the link as an external <a> in a new tab instead of
   *  an in-app react-router navigation. */
  incidentLinkExternal: boolean;
  isApproval: boolean;
  isQuestion: boolean;
  questions: string[];
  notification: AgentNotification | null;
}

interface TimelineEntry {
  label: string;
  detail?: string;
  status: 'completed' | 'failed' | 'pending' | 'active';
  tool?: string;
}

const SEVERITY_TOKEN_MAP: Record<string, string> = {
  critical: '--severity-critical',
  high: '--severity-high',
  medium: '--severity-medium',
  low: '--severity-low',
  info: '--severity-info',
  unknown: '--muted-foreground',
};

const buildFromNotification = (n: AgentNotification, entityBasePath: string): UnifiedData => {
  // Build timeline from available data
  const timeline: TimelineEntry[] = [];
  if (n.description) {
    timeline.push({ label: 'Issue detected', detail: n.description, status: 'completed' });
  }
  if (n.action) {
    timeline.push({ label: 'Proposed action', detail: n.action, status: 'pending' });
  }

  const hasQuestions = n.questions && n.questions.length > 0;

  // Resolve the bottom CTA link.
  //  • incident_id → in-app incident detail page
  //  • reference_url that points at /forms/{id} → original Shuffle Core
  //    agent approval form (always shuffler.io on cloud)
  //  • any other reference_url → use as-is
  let incidentLink: string | null = null;
  let incidentLinkLabel = 'View Full Incident';
  let incidentLinkExternal = false;
  if (n.incident_id) {
    incidentLink = `${entityBasePath}/${n.incident_id}`;
  } else if (n.reference_url) {
    if (isAgentApprovalFormUrl(n.reference_url)) {
      incidentLink = getShuffleCoreFormUrl(n.reference_url);
      incidentLinkLabel = 'Open Agent Approval';
      incidentLinkExternal = true;
    } else {
      incidentLink = n.reference_url;
      incidentLinkExternal = /^https?:\/\//i.test(n.reference_url);
    }
  }

  return {
    title: stripAgentTitlePrefix(n.title) || 'Agent Notification',
    severity: null,
    severityRaw: n.severity || null,
    timestamp: n.created_at ? new Date(n.created_at * 1000).toLocaleString() : '—',
    errorExplanation: n.description || null,
    timeline,
    pendingAction: n.action || n.description || null,
    incidentLink,
    incidentLinkLabel,
    incidentLinkExternal,
    isApproval: !hasQuestions,
    isQuestion: !!hasQuestions,
    questions: hasQuestions ? n.questions! : [],
    notification: n,
  };
};

const buildFromRun = (run: AgentRun, entityBasePath: string): UnifiedData => {
  const status = run.status?.toUpperCase() || '';
  const runFailed = status === 'FAILED' || status === 'ABORTED';
  const isUnsure = hasOutputWarning(run);
  const isCompleted = status === 'FINISHED' || status === 'SUCCESS';
  const incidentTitle = getIncidentTitleFromRun(run);
  const output = getAgentRunOutput(run);
  const failureInfo = runFailed ? getFailureInfo(run) : null;
  const severity = getIncidentSeverityFromRun(run);
  const ref = parseDatastoreReference(run);
  const incidentKey = ref && isIncidentReference(ref) ? ref.key : null;

  // Error explanation
  let errorExplanation: string | null = null;
  if (runFailed) {
    errorExplanation = failureInfo?.reason || (output ? output.replace(/[#*`]/g, '').trim() : 'The agent encountered an error and could not complete this task.');
  } else if (isUnsure) {
    errorExplanation = output ? output.replace(/[#*`]/g, '').trim() : 'The agent flagged uncertainty in its analysis.';
  } else if (isCompleted && output) {
    errorExplanation = null; // no error for completed
  }

  // Build timeline from decisions or results
  const timeline: TimelineEntry[] = [];

  if (run.decisions && run.decisions.length > 0) {
    for (const d of run.decisions) {
      timeline.push({
        label: d.title || d.action || 'Action',
        detail: d.description || d.result || undefined,
        status: d.status?.toLowerCase() === 'failed' ? 'failed' : 'completed',
        tool: d.tool,
      });
    }
  } else if (run.results && run.results.length > 0) {
    for (const r of run.results) {
      const appName = r.action?.app_name || r.action?.label || 'Action';
      let detail: string | undefined;
      if (r.result) {
        try {
          const parsed = JSON.parse(r.result);
          detail = parsed?.output || parsed?.message || undefined;
        } catch {
          // skip
        }
      }
      timeline.push({
        label: appName,
        detail: detail ? (detail.length > 120 ? detail.slice(0, 120) + '…' : detail) : undefined,
        status: r.status?.toLowerCase() === 'failed' ? 'failed' : 'completed',
      });
    }
  }

  // If no timeline entries, create a generic one
  if (timeline.length === 0) {
    if (run.workflow?.name) {
      timeline.push({ label: `Workflow: ${run.workflow.name}`, status: isCompleted ? 'completed' : runFailed ? 'failed' : 'active' });
    }
    if (output) {
      timeline.push({ label: 'Agent output', detail: output.replace(/[#*`]/g, '').trim(), status: isCompleted ? 'completed' : 'active' });
    }
  }

  // Extract proposed next action — must be a remediation, NOT the error description
  let pendingAction: string | null = null;
  if ((runFailed || isUnsure) && output) {
    const cleanOutput = output.replace(/[#*`]/g, '').trim();
    // Try to find explicit recommendations in the output
    const actionPatterns = [
      /(?:recommend|suggest|propos|next step|remediat|resolution|fix)[:\s]+(.+)/i,
      /(?:should|need to|try|consider)[:\s]+(.+)/i,
      /(?:action[:\s]|plan[:\s]|to resolve)[:\s]*(.+)/i,
    ];
    for (const pattern of actionPatterns) {
      const match = cleanOutput.match(pattern);
      if (match && match[1]?.trim().length > 10) {
        pendingAction = match[1].trim();
        if (pendingAction.length > 200) pendingAction = pendingAction.slice(0, 200) + '…';
        break;
      }
    }
    // Fallback: generate a contextual remediation based on failure info
    if (!pendingAction) {
      const workflowName = run.workflow?.name || 'the workflow';
      const nodeMatch = failureInfo?.reason?.match(/node[:\s]*'([^']+)'/i) || failureInfo?.reason?.match(/node[:\s]*"([^"]+)"/i);
      if (nodeMatch) {
        pendingAction = `Re-run node '${nodeMatch[1]}' in ${workflowName} with corrected parameters, or disable the failing node and route to a fallback path.`;
      } else if (runFailed) {
        pendingAction = `Investigate and re-execute ${workflowName} after reviewing the error logs and correcting the root cause.`;
      } else {
        pendingAction = `Review the flagged output of ${workflowName} and confirm whether the result is valid or needs manual intervention.`;
      }
    }
  }

  // Add proposed next action as a pending timeline entry
  if (pendingAction) {
    timeline.push({
      label: 'Proposed next action',
      detail: pendingAction,
      status: 'pending',
    });
  }

  return {
    title: incidentTitle || run.workflow?.name || getRunTitle(run),
    severity,
    severityRaw: null,
    timestamp: run.started_at ? new Date(run.started_at).toLocaleString() : '—',
    errorExplanation,
    timeline,
    pendingAction,
    incidentLink: incidentKey ? `${entityBasePath}/${incidentKey}?agent_action=${run.execution_id}` : null,
    incidentLinkLabel: 'View Full Incident',
    incidentLinkExternal: false,
    isApproval: false,
    isQuestion: false,
    questions: [],
    notification: null,
  };
};

// ── Visible timeline count before expand ──
const VISIBLE_TIMELINE_COUNT = 3;

const AgentQuickViewDrawer = ({ open, onClose, item, entityBasePath, onApprove, onDeny, onConfigureApprove, onSubmitAnswers }: Props) => {
  const t = useEntityText();
  const isSupport = useIsSupport();
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [modifiedAction, setModifiedAction] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const drawerZIndex = useDrawerLayer(open && Boolean(item));

  if (!item) return null;

  const data = item.type === 'notification'
    ? buildFromNotification(item.notification, entityBasePath)
    : buildFromRun(item.run, entityBasePath);

  const handleClose = () => {
    setIsConfiguring(false);
    setModifiedAction('');
    setQuestionAnswers({});
    onClose();
  };

  const handleSubmitAnswers = () => {
    if (data.notification) onSubmitAnswers?.(data.notification.id, questionAnswers);
    setQuestionAnswers({});
    handleClose();
  };

  const handleApprove = () => {
    if (data.notification) onApprove?.(data.notification);
    handleClose();
  };

  const handleDeny = () => {
    if (data.notification) onDeny?.(data.notification);
    handleClose();
  };

  const handleConfigureSubmit = () => {
    if (data.notification) onConfigureApprove?.(data.notification.id, modifiedAction);
    setModifiedAction('');
    setIsConfiguring(false);
    onClose();
  };

  // Determine severity chip data
  const sevToken = data.severity
    ? data.severity.colorToken
    : data.severityRaw
      ? (SEVERITY_TOKEN_MAP[data.severityRaw.toLowerCase()] || '--severity-high')
      : null;
  const sevLabel = data.severity?.label || data.severityRaw || null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      sx={{
        zIndex: drawerZIndex,
        '& .MuiDrawer-paper': {
          boxSizing: 'border-box',
          width: { xs: '100vw', sm: 720 },
          minWidth: { xs: '100vw', sm: 480 },
          maxWidth: { xs: '100vw', sm: 960 },
        },
      }}
      PaperProps={{ sx: drawerPaperSx }}
    >
      {/* Header — title instead of "Quick View" */}
      <Box sx={{
        px: 3, py: 2.5,
        borderBottom: '1px solid hsl(var(--border))',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2,
      }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="div" sx={{
            fontWeight: 600, fontSize: '1rem', color: 'hsl(var(--foreground))',
            lineHeight: 1.4, wordBreak: 'break-word',
          }}>
            <InlineMarkdown text={data.title} />
          </Typography>
          {/* Severity & status chips */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
            {sevLabel && sevToken && (
              <Chip label={sevLabel} size="small" sx={{
                height: 20, fontSize: '0.68rem', fontWeight: 600,
                backgroundColor: `hsl(var(${sevToken}) / 0.12)`,
                color: `hsl(var(${sevToken}))`,
              }} />
            )}
            {item.type === 'run' && (() => {
              const s = item.run.status?.toUpperCase() || '';
              if (s === 'FAILED' || s === 'ABORTED') return (
                <Chip icon={<XCircle size={12} />} label={s === 'ABORTED' ? 'Aborted' : 'Failed'} size="small" sx={statusChipSx('--severity-critical')} />
              );
              if (hasOutputWarning(item.run)) return (
                <Chip icon={<HelpCircle size={12} />} label="Unsure" size="small" sx={statusChipSx('--severity-medium')} />
              );
              if (s === 'FINISHED' || s === 'SUCCESS') return (
                <Chip icon={<CheckCircle size={12} />} label="Resolved" size="small" sx={statusChipSx('--severity-low')} />
              );
              return null;
            })()}
            {data.isQuestion && (
              <Chip icon={<HelpCircle size={12} />} label="Pending Question" size="small" sx={statusChipSx('--severity-info')} />
            )}
          </Box>
          {/* Timestamp */}
          <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', mt: 0.75 }}>
            {data.timestamp}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small" sx={{ color: 'hsl(var(--muted-foreground))', mt: -0.5 }}>
          <CloseIcon size={20} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 3, flex: 1, overflow: 'auto' }}>

        {/* Agent execution — canonical Simple/Detailed view from Shuffle-MCPs */}
        {(() => {
          const fromUrl = item.type === 'notification'
            ? parseAgentApprovalParams(item.notification.reference_url)
            : null;
          const execId = item.type === 'notification'
            ? (item.notification.execution_id || fromUrl?.executionId || '')
            : item.run.execution_id;
          const auth = item.type === 'notification'
            ? (fromUrl?.authorization || '')
            : (item.run.authorization || '');
          if (!execId) return null;
          if (item.type === 'run') {
            return (
              <AgentUI
                key={execId}
                initialExecution={{
                  execution_id: item.run.execution_id,
                  status: item.run.status,
                  started_at: item.run.started_at ? Number(item.run.started_at) : undefined,
                  completed_at: item.run.completed_at ? Number(item.run.completed_at) : undefined,
                  results: item.run.results,
                  workflow: item.run.workflow,
                  authorization: item.run.authorization,
                }}
                isSupport={isSupport}
                readUrlParams={false}
                autoLoadApps={false}
                hideHeroIcon
                hideAppPicker
                hideAttach
                compact
                maxWidth={680}
              />
            );
          }
          // notification — fetch via execution_id + authorization (when present)
          if (!auth) return null;
          return (
            <AgentUI
              key={execId}
              executionId={execId}
              authorization={auth}
              isSupport={isSupport}
              readUrlParams={false}
              autoLoadApps={false}
              hideHeroIcon
              hideAppPicker
              hideAttach
              compact
              maxWidth={680}
            />
          );
        })()}

        {/* Questions — same shared component used in timelines and dialogs */}
        {data.isQuestion && data.notification && (
          <Box>
            <SectionLabel>Agent Needs Your Input</SectionLabel>
            <InlineAgentQuestion
              notification={data.notification}
              onSubmitted={() => onSubmitAnswers?.(data.notification!.id, {})}
            />
          </Box>
        )}


        {/* Proposed Next Action — only for approval items, not questions */}
        {data.pendingAction && !data.isQuestion && (
          <Box>
            <SectionLabel>Proposed Next Action</SectionLabel>
            <Box sx={{
              px: 2.5, py: 2, borderRadius: 2,
              background: 'var(--agent-gradient-subtle)',
              borderLeft: '3px solid var(--agent-mid)',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                <Zap size={14} style={{ color: 'var(--agent-mid)' }} />
                <Typography sx={{
                  fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                  background: 'var(--agent-gradient)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  Agent recommends
                </Typography>
              </Box>
              <Typography sx={{
                fontSize: '0.85rem', color: 'hsl(var(--foreground))',
                lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {data.pendingAction}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Configure section */}
        {isConfiguring && (
          <Box>
            <SectionLabel>Modify Action</SectionLabel>
            <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', mb: 1.5 }}>
              Provide an alternative action for the agent to execute instead.
            </Typography>
            <TextField
              fullWidth multiline minRows={3} maxRows={6}
              placeholder="Describe the modified action…"
              value={modifiedAction}
              onChange={(e) => setModifiedAction(e.target.value)}
              sx={textFieldSx}
            />
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
              <Button onClick={() => { setIsConfiguring(false); setModifiedAction(''); }} size="small"
                sx={{ fontSize: '0.78rem', textTransform: 'none', color: 'hsl(var(--muted-foreground))' }}>
                Cancel
              </Button>
              <Button onClick={handleConfigureSubmit} size="small" variant="contained" disabled={!modifiedAction.trim()}
                startIcon={<Settings size={14} />}
                sx={{ fontSize: '0.78rem', textTransform: 'none', fontWeight: 600, backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: 'none', '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)', boxShadow: 'none' } }}>
                Submit Modified Action
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* Footer actions */}
      <Box sx={footerSx}>
        {/* Questions are answered inline above via InlineAgentQuestion */}

        {data.isApproval && data.notification && (
          <>
            <Box sx={{
              display: 'flex', alignItems: 'flex-start', gap: 1,
              px: 1.5, py: 1, borderRadius: 1.5,
              backgroundColor: 'hsl(var(--severity-info) / 0.08)',
              border: '1px solid hsl(var(--severity-info) / 0.2)',
            }}>
              <Mail size={14} style={{ color: 'hsl(var(--severity-info))', marginTop: 2, flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--foreground))', lineHeight: 1.5 }}>
                We have also emailed you this approval request — you can allow or deny it directly from your inbox.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button onClick={handleApprove} fullWidth variant="contained" startIcon={<CheckCircle size={15} />}
                sx={approveButtonSx}>
                Approve
              </Button>
              <Button
                onClick={handleDeny}
                fullWidth
                variant="outlined"
                startIcon={<XCircle size={15} />}
                sx={{
                  ...outlineButtonSx,
                  borderColor: 'hsl(var(--severity-high) / 0.4)',
                  color: 'hsl(var(--severity-high))',
                  '&:hover': {
                    borderColor: 'hsl(var(--severity-high))',
                    backgroundColor: 'hsl(var(--severity-high) / 0.08)',
                  },
                }}
              >
                Deny
              </Button>
              {!isConfiguring && (
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<Settings size={15} />}
                  disabled
                  sx={outlineButtonSx}
                  title="Configure is temporarily disabled"
                >
                  Configure
                </Button>
              )}
            </Box>
          </>
        )}
        {data.incidentLink && (
          data.incidentLinkExternal ? (
            <Button
              component="a"
              href={data.incidentLink}
              target="_blank"
              rel="noopener noreferrer"
              fullWidth
              variant="outlined"
              endIcon={<ArrowRight size={14} />}
              sx={outlineButtonSx}
              onClick={async (e) => {
                if (data.incidentLink && isShuffleCoreUrl(data.incidentLink)) {
                  e.preventDefault();
                  await navigateToShuffleCore(data.incidentLink, { newTab: true });
                }
              }}
            >
              {t(data.incidentLinkLabel)}
            </Button>
          ) : (
            <Button component={Link} to={data.incidentLink} fullWidth variant="outlined"
              endIcon={<ArrowRight size={14} />} sx={outlineButtonSx}>
              {t(data.incidentLinkLabel)}
            </Button>
          )
        )}
      </Box>
    </Drawer>
  );
};

// ── Shared sub-components & styles ──

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Typography sx={{
    fontSize: '0.72rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))',
    textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.75,
  }}>
    {children}
  </Typography>
);

const statusChipSx = (token: string) => ({
  height: 20, fontSize: '0.68rem', fontWeight: 700,
  backgroundColor: `hsl(var(${token}) / 0.12)`,
  color: `hsl(var(${token}))`,
  border: `1px solid hsl(var(${token}) / 0.35)`,
  '& .MuiChip-icon': { color: 'inherit' },
});

const drawerPaperSx = {
  width: { xs: '100%', sm: 720 },
  minWidth: { xs: '100vw', sm: 480 },
  maxWidth: { xs: '100vw', sm: 960 },
  boxSizing: 'border-box',
  bgcolor: 'hsl(var(--background))',
  backgroundImage: 'none',
  borderLeft: '1px solid hsl(var(--border))',
};

const footerSx = {
  px: 3, py: 2.5, borderTop: '1px solid hsl(var(--border))',
  display: 'flex', flexDirection: 'column', gap: 1.5,
};

const approveButtonSx = {
  fontSize: '0.8rem', textTransform: 'none', fontWeight: 600,
  backgroundColor: 'hsl(var(--primary))',
  color: 'hsl(var(--primary-foreground))',
  py: 1, boxShadow: 'none',
  '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)', boxShadow: 'none' },
};

const outlineButtonSx = {
  fontSize: '0.8rem', textTransform: 'none', fontWeight: 500,
  borderColor: 'hsl(var(--border))',
  color: 'hsl(var(--foreground))',
  py: 1,
  '&:hover': { borderColor: 'hsl(var(--primary) / 0.5)', backgroundColor: 'hsl(var(--primary) / 0.08)' },
};

const textFieldSx = {
  '& .MuiOutlinedInput-root': {
    fontSize: '0.85rem', bgcolor: 'hsl(var(--card))',
    '& fieldset': { borderColor: 'hsl(var(--border))' },
    '&:hover fieldset': { borderColor: 'hsl(var(--primary) / 0.5)' },
    '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
  },
  '& .MuiOutlinedInput-input': { color: 'hsl(var(--foreground))' },
};

export default AgentQuickViewDrawer;
