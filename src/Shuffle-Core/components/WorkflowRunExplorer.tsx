/**
 * WorkflowRunExplorer — Shuffle-Core surface for inspecting a single
 * workflow execution.
 *
 * This is the Shuffle-Security-friendly port of the original Shuffle
 * Automation sidebar (kept as reference at `./WorkflowRunExplorer.jsx`).
 * The .jsx file is a raw fragment lifted from Shuffle Automation and
 * references dozens of host-app symbols (theme, workflowExecutions,
 * apps, environments, executeWorkflow, ...). This file re-implements
 * the same visual/UX shape as a self-contained, host-agnostic
 * component that only needs an `executionId`.
 *
 * Public API:
 *   - <WorkflowRunExplorer executionId="..." /> — inline embedded view
 *   - <WorkflowRunExplorerDrawer open executionId onClose /> — drawer
 *
 * Both are re-exported through `src/Shuffle-Core/index.tsx` and wrapped
 * with `ShuffleCoreThemeProvider` so the surface matches every other
 * Shuffle-Core component (36px buttons, HSL tokens, dark by default).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Drawer,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Divider,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
  Launch as LaunchIcon,
  Close as CloseIcon,
  ArrowLeft as ArrowLeftIcon,
  Stop as StopIcon,
  ContentCopy as ContentCopyIcon,
  Link as LinkIcon,
  Notifications as NotificationsIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { getApiUrl, getAuthHeader, getShuffleCoreUrl, getShuffleCoreWorkflowUrl } from '../api';
import { navigateToShuffleCore } from '@/lib/authHandoff';
import NotificationsDrawer from './NotificationsDrawer';
import { useDrawerLayer } from '@/Shuffle-MCPs/drawerLayer';
import { AppFallbackIcon } from '@/Shuffle-MCPs/components/AppFallbackIcon';
import shuffleLogo from '@/assets/shuffle-logo.png';
import singulAgentIcon from '@/assets/singul-agent-icon.png';

const isAiAgentName = (name?: string) =>
  !!name && name.trim().toLowerCase().replace(/[_-]+/g, ' ') === 'ai agent';
import JsonView from 'react18-json-view';
import 'react18-json-view/src/style.css';
import 'react18-json-view/src/dark.css';
import { defaultCollapsed } from '@/lib/jsonView';


export interface WorkflowExecution {
  execution_id?: string;
  status?: string;
  started_at?: number;
  completed_at?: number;
  execution_source?: string;
  execution_argument?: string;
  execution_parent?: string;
  authgroup?: string;
  notifications_created?: number;
  results?: any[];
  workflow?: {
    id?: string;
    name?: string;
    actions?: Array<{ environment?: string }>;
  };
  [key: string]: any;
}

const IN_PROGRESS = new Set(['EXECUTING', 'WAITING', 'RUNNING']);
const isRunning = (s?: string) => IN_PROGRESS.has((s || '').toUpperCase());

const countRelevantErrors = (result: any): number => {
  if (!result?.action?.parameters?.length) return 0;
  const params = result.action.parameters;
  let count = 0;
  for (const param of params) {
    if (
      param?.name?.endsWith('_error') &&
      (param?.name?.startsWith('shuffle_') || param?.name?.startsWith('liquid_'))
    ) {
      count += 1;
    }
  }
  return count || 0;
};

export const fetchExecution = async (
  executionId: string,
  authorization?: string,
): Promise<WorkflowExecution | null> => {
  try {
    const resp = await fetch(getApiUrl('/api/v1/streams/results'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      // The execution authorization token is required for agent//streams runs.
      // Fall back to the execution id for runs opened without one.
      body: JSON.stringify({ execution_id: executionId, authorization: authorization || executionId }),
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    if (!text || text === '{}' || text === 'null') return null;
    return JSON.parse(text) as WorkflowExecution;
  } catch {
    return null;
  }
};

/** `execution_source` for datastore automations is `datastore|<category>|<key>`. */
const datastoreSourceParts = (exec: WorkflowExecution): { category: string; key: string } | null => {
  const raw = (exec.execution_source || '').trim();
  if (!raw.toLowerCase().startsWith('datastore')) return null;
  const parts = raw.split('|');
  if (parts.length < 3) return null;
  const category = parts[1].trim();
  const key = parts[2].trim();
  if (!category || !key) return null;
  return { category, key };
};

const sourceLabel = (exec: WorkflowExecution): string => {
  const src = exec.execution_source || '';
  if (src.startsWith('datastore')) return 'Datastore Automation';
  if (src === 'authgroups' || exec.authgroup) return `Auth Group${exec.authgroup ? ` '${exec.authgroup}'` : ''}`;
  if (exec.execution_parent) return 'Parent Workflow';
  if (['questions', 'web', 'form', 'forms'].includes(src)) return 'Form';
  return src || 'default';
};

const shuffleUrlForExecution = (exec: WorkflowExecution): string | null => {
  const wfId = exec.workflow?.id;
  const execId = exec.execution_id;
  if (!execId) return null;
  if (wfId) return getShuffleCoreWorkflowUrl(wfId, { execution_id: execId });
  return getShuffleCoreUrl(`/admin?admin_tab=workflow_runs&execution_id=${encodeURIComponent(execId)}`);
};

/** Make action labels readable in the sidebar while leaving action names as-is
 *  because they are function references (e.g., `get_health`, `runQuestions`). */
const humanizeLabel = (label?: string | null): string | null => {
  if (!label || typeof label !== 'string') return null;
  const spaced = label
    .replace(/[_\-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
  if (!spaced) return null;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export interface WorkflowRunExplorerProps {
  /** Execution id to inspect. Required. */
  executionId: string;
  /** Execution authorization token. Required for agent / stream executions. */
  authorization?: string;
  /** Optional close handler (renders a small breadcrumb back button). */
  onClose?: () => void;
  /** Polling interval in ms for in-progress runs. Defaults to 3000. */
  pollIntervalMs?: number;
}

export const WorkflowRunExplorer: React.FC<WorkflowRunExplorerProps> = ({
  executionId,
  authorization,
  onClose,
  pollIntervalMs = 3000,
}) => {
const [exec, setExec] = useState<WorkflowExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const [aborting, setAborting] = useState(false);
  const [debugResult, setDebugResult] = useState<any | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const load = React.useCallback(async () => {
    let data = await fetchExecution(executionId, authorization);
    // Retry without the token if it was rejected: some executions are
    // readable through the session/API key alone.
    if (!data && authorization) data = await fetchExecution(executionId);
    if (cancelledRef.current) return;
    // Keep the last good snapshot if a poll fails transiently.
    setExec((prev) => data || prev);
    setLoading(false);
  }, [executionId, authorization]);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    setExec(null);
    load();
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [executionId, load]);

  // Polling for in-progress runs.
  useEffect(() => {
    if (!exec || !isRunning(exec.status)) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { load(); }, pollIntervalMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [exec, load, pollIntervalMs]);

const openInShuffle = async () => {
    if (!exec) return;
    const url = shuffleUrlForExecution(exec);
    if (url) await navigateToShuffleCore(url, { newTab: true });
  };

  const copyExecutionLink = () => {
    if (!exec?.execution_id) return;
    const auth = authorization || exec.execution_id;
    const url = exec.workflow?.id
      ? getShuffleCoreWorkflowUrl(exec.workflow.id, {
          execution_id: exec.execution_id,
          authorization: auth,
        })
      : getShuffleCoreUrl(`/admin?admin_tab=workflow_runs&execution_id=${encodeURIComponent(exec.execution_id)}`);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* ignore */ });
  };

  const abortExecution = async () => {
    if (!exec?.execution_id || !exec?.workflow?.id) return;
    if (!window.confirm('Abort this workflow execution? Any pending actions will be stopped.')) return;
    setAborting(true);
    try {
      const resp = await fetch(
        getApiUrl(`/api/v1/workflows/${exec.workflow.id}/executions/${exec.execution_id}/abort`),
        {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        },
      );
      if (!resp.ok) {
        console.error('Abort failed', resp.status, await resp.text().catch(() => ''));
      }
      await load();
      // Notify host surfaces (e.g. incident timeline) that this execution
      // just changed state so they can refetch their workflow-run lists
      // without waiting for the next poll cycle.
      try {
        window.dispatchEvent(new CustomEvent('workflow-run:changed', {
          detail: { executionId: exec.execution_id, reason: 'aborted' },
        }));
      } catch { /* ignore */ }

    } catch (e) {
      console.error('Abort error', e);
    } finally {
      setAborting(false);
    }
  };

  return (
    <Box
      sx={{
        bgcolor: 'hsl(var(--card))',
        color: 'hsl(var(--foreground))',
        p: { xs: '0 10px 50px 10px', sm: '25px 15px 150px 15px' },
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Breadcrumb / back */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {onClose && (
          <IconButton onClick={onClose} size="small" sx={{ color: 'hsl(var(--foreground))', mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography
          variant="h6"
          onClick={onClose}
          sx={{ cursor: onClose ? 'pointer' : 'default', color: 'hsl(var(--foreground))', fontWeight: 600 }}
        >
          Back to all runs
        </Typography>
      </Box>
      <Divider sx={{ my: 1.5, bgcolor: 'hsl(var(--border))' }} />

      {/* Details header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.25,
          py: 1,
          border: '1px solid hsl(var(--border))',
          borderRadius: 1.5,
          mb: 1.5,
          position: 'sticky',
          top: 0,
          zIndex: 3,
          bgcolor: 'hsl(var(--card))',
        }}
      >
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 600 }}>Details</Typography>
        {exec && Number(exec.notifications_created) > 0 && (
          <Tooltip
            title={`${Number(exec.notifications_created)} notification${Number(exec.notifications_created) === 1 ? '' : 's'} — click to view`}
            arrow
          >
            <span>
              <IconButton
                size="small"
                onClick={() => setNotificationsOpen(true)}
              >
                <Badge
                  badgeContent={Number(exec.notifications_created)}
                  sx={{
                    '& .MuiBadge-badge': {
                      fontSize: '0.625rem',
                      height: 16,
                      minWidth: 16,
                    },
                  }}
                >
                  <NotificationsIcon fontSize="small" />
                </Badge>
              </IconButton>
            </span>
          </Tooltip>
        )}

        {exec && isRunning(exec.status) && (
          <Tooltip title="Abort workflow" arrow>
            <span>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={abortExecution}
                disabled={aborting}
                startIcon={aborting ? <CircularProgress size={12} /> : <StopIcon fontSize="small" />}
                sx={{
                  height: 28,
                  textTransform: 'none',
                  mr: 0.5,
                  borderColor: 'hsl(var(--destructive))',
                  color: 'hsl(var(--destructive))',
                  '&:hover': {
                    borderColor: 'hsl(var(--destructive))',
                    bgcolor: 'hsla(var(--destructive) / 0.1)',
                  },
                }}
              >
                {aborting ? 'Aborting…' : 'Abort Workflow'}
              </Button>
            </span>
          </Tooltip>
        )}
        <Tooltip title="Refresh" arrow>
          <span>
            <IconButton size="small" onClick={load} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
{exec && (
          <Tooltip title={copied ? 'Copied!' : 'Copy execution link'} arrow>
            <span>
              <IconButton
                size="small"
                onClick={copyExecutionLink}
                disabled={!exec.execution_id}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {exec && (
          <Tooltip title="Open in Shuffle" arrow>
            <span>
              <IconButton size="small" onClick={openInShuffle}>
                <LaunchIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {onClose && (
          <Tooltip title="Close" arrow>
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {loading && !exec && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {!loading && !exec && (
        <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', px: 1 }}>
          Execution not found or is no longer available.
        </Typography>
      )}

      {exec && (() => {
        const startedMs = exec.started_at ? exec.started_at * 1000 : 0;
        const longRunning = isRunning(exec.status) && startedMs > 0 && (Date.now() - startedMs) > 5 * 60 * 1000;


        return (
        <Box sx={{ px: 1 }}>
          {exec.status && (
            <MetaRow
              label="Status"
              value={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {exec.status}
                  {isRunning(exec.status) && (
                    <CircularProgress size={12} thickness={4} sx={{ color: longRunning ? 'hsl(var(--severity-medium))' : '#FF8544' }} />
                  )}
                </Box>
              }
            />
          )}
          {/* Notifications are surfaced as a clickable icon in the Details header */}

          {(exec.execution_source || exec.authgroup) && (() => {
            const ds = datastoreSourceParts(exec);
            if (ds) {
              const href = getShuffleCoreUrl(`/admin?tab=datastore&category=${encodeURIComponent(ds.category)}&key=${encodeURIComponent(ds.key)}`);
              return (
                <MetaRow
                  label="Source"
                  accent
                  value={
                    <Tooltip
                      title={`Category: ${ds.category}\nKey: ${ds.key}`}
                      placement="top"
                      arrow
                      componentsProps={{ tooltip: { sx: { whiteSpace: 'pre-line' } } }}
                    >
                      <Box
                        component="a"
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={async (e: React.MouseEvent) => {
                          e.preventDefault();
                          await navigateToShuffleCore(href, { newTab: true });
                        }}
                        sx={{ color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
                      >
                        Datastore Automation
                      </Box>
                    </Tooltip>
                  }
                />
              );
            }
            const label = sourceLabel(exec);
            // Auth Group — tooltip with the group name (checked before parent per sourceLabel)
            if (exec.authgroup) {
              return (
                <MetaRow
                  label="Source"
                  accent
                  value={
                    <Tooltip
                      title={`Auth group: ${exec.authgroup}`}
                      placement="top"
                      arrow
                    >
                      <Box component="span" sx={{ cursor: 'default' }}>
                        {label}
                      </Box>
                    </Tooltip>
                  }
                />
              );
            }
            // Parent Workflow — the parent workflow id lives in execution_source
            if (exec.execution_parent) {
              const parentWorkflowId = (exec.execution_source || '').trim();
              const href = parentWorkflowId
                ? getShuffleCoreWorkflowUrl(parentWorkflowId, { view: 'executions', execution_id: exec.execution_parent })
                : getShuffleCoreUrl(`/admin?admin_tab=workflow_runs&execution_id=${encodeURIComponent(exec.execution_parent)}`);
              return (
                <MetaRow
                  label="Source"
                  accent
                  value={
                    <Tooltip
                      title={`Parent execution: ${exec.execution_parent}`}
                      placement="top"
                      arrow
                    >
                      <Box
                        component="a"
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={async (e: React.MouseEvent) => {
                          e.preventDefault();
                          await navigateToShuffleCore(href, { newTab: true });
                        }}
                        sx={{ color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
                      >
                        {label}
                      </Box>
                    </Tooltip>
                  }
                />
              );
            }
            // Generic source — tooltip with the raw value
            return (
              <MetaRow
                label="Source"
                accent
                value={
                  <Tooltip
                    title={exec.execution_source || 'default'}
                    placement="top"
                    arrow
                  >
                    <Box component="span" sx={{ cursor: 'default' }}>
                      {label}
                    </Box>
                  </Tooltip>
                }
              />
            );
          })()}

          {exec.started_at ? (
            <MetaRow
              label="Started"
              value={new Date(exec.started_at * 1000).toLocaleString('en-GB')}
            />
          ) : null}
          {exec.completed_at ? (
            <MetaRow
              label="Finished"
              value={new Date(exec.completed_at * 1000).toLocaleString('en-GB')}
            />
          ) : null}
          {exec.workflow?.actions?.[0]?.environment && (
            <MetaRow
              label="Location"
              accent
              value={
                <Tooltip
                  title={`Environment: ${exec.workflow.actions[0].environment}`}
                  placement="top"
                  arrow
                >
                  <Box
                    component="a"
                    href={getShuffleCoreUrl('/admin?tab=locations')}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={async (e: React.MouseEvent) => {
                      e.preventDefault();
                      await navigateToShuffleCore(getShuffleCoreUrl('/admin?tab=locations'), { newTab: true });
                    }}
                    sx={{ color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    {exec.workflow.actions[0].environment}
                  </Box>
                </Tooltip>
              }
            />
          )}


          {exec.execution_argument && exec.execution_argument.length > 1 && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <Tooltip title={<Typography variant="body2">Expand debug window. Errors: 0</Typography>} arrow>
                  <IconButton
                    size="small"
                    onClick={() => setDebugResult({
                      action: {
                        label: 'Execution argument',
                        name: exec.workflow?.name || 'execution_argument',
                        app_name: exec.workflow?.name,
                        parameters: [
                          { name: 'source', value: sourceLabel(exec) },
                          ...(exec.execution_parent ? [{ name: 'execution_parent', value: exec.execution_parent }] : []),
                          ...(exec.authgroup ? [{ name: 'authgroup', value: exec.authgroup }] : []),
                        ],
                      },
                      result: exec.execution_argument,
                      status: exec.status,
                      __isExecutionArgument: true,
                    })}
                    sx={{ color: 'hsl(var(--foreground))', p: 0.5 }}
                  >
                    <ArrowLeftIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Typography variant="subtitle2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  Execution argument
                </Typography>
              </Box>
              <ResultRenderer value={exec.execution_argument} baseName="$exec" />
            </Box>
          )}

          <Divider sx={{ my: 2, bgcolor: 'hsl(var(--border))' }} />

          <Typography variant="subtitle2" sx={{ mb: 1, color: 'hsl(var(--muted-foreground))' }}>
            Results {exec.results ? `(${exec.results.length})` : ''}
          </Typography>
          {(!exec.results || exec.results.length === 0) && isRunning(exec.status) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                Waiting for results…
              </Typography>
            </Box>
          )}
          {exec.results?.map((r, idx) => {
            const wfAction = exec.workflow?.actions?.find((a: any) =>
              (r?.action?.id && a?.id === r.action.id) ||
              (r?.action?.app_name && a?.app_name === r.action.app_name) ||
              (r?.action?.label && a?.label === r.action.label)
            );
            const appName = r?.action?.app_name || (wfAction as any)?.app_name;
            const imgSrc = isAiAgentName(appName)
              ? singulAgentIcon
              : (r?.action?.large_image ||
                (wfAction as any)?.large_image ||
                r?.action?.small_image ||
                (wfAction as any)?.small_image ||
                '');
            return (
            <Box
              key={r?.action?.id || idx}
              sx={{
                border: '1px solid hsl(var(--border))',
                borderRadius: 1,
                p: 1.25,
                mb: 1,
                bgcolor: 'hsl(var(--card))',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                {(() => {
                  const errorCount = countRelevantErrors(r);
                  return (
                    <Tooltip
                      title={
                        <Typography variant="body2">
                          Expand debug window. Errors: {errorCount}
                        </Typography>
                      }
                      arrow
                    >
                      <IconButton
                        size="small"
                        onClick={() => setDebugResult(r)}
                        sx={{
                          color: errorCount > 0 ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))',
                          p: 0.5,
                        }}
                      >
                        <ArrowLeftIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  );
                })()}
                {appName ? (
                  <Tooltip title={r?.status ? `${appName.replace(/[_\-]+/g, ' ')} — ${r.status}` : appName.replace(/[_\-]+/g, ' ')} arrow>
                    <Box
                      component={r?.action?.app_id ? 'a' : 'span'}
                      {...(r?.action?.app_id
                        ? { href: `/apps/${r.action.app_id}`, target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                      sx={{ display: 'inline-flex', lineHeight: 0, cursor: r?.action?.app_id ? 'pointer' : 'default' }}
                    >
                      <AppFallbackIcon
                        name={appName}
                        imageUrl={imgSrc}
                        size={28}
                        alt={appName.replace(/[_\-]+/g, ' ')}
                        style={{
                          borderRadius: '50%',
                          border: `2px solid ${
                            r?.status === 'SUCCESS' || r?.status === 'FINISHED'
                              ? 'hsl(var(--severity-low))'
                              : r?.status === 'FAILURE' || r?.status === 'ABORTED'
                              ? 'hsl(var(--destructive))'
                              : r?.status
                              ? 'hsl(var(--severity-medium))'
                              : 'hsl(var(--border))'
                          }`,
                        }}
                      />
                    </Box>
                  </Tooltip>
                ) : null}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                    {humanizeLabel(r?.action?.label) || r?.action?.name || `Step ${idx + 1}`}
                  </Typography>
                  {r?.action?.name && r?.action?.label && r.action.name !== r.action.label && (
                    <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                      {r.action.name}
                    </Typography>
                  )}
                </Box>
                {(() => {
                  const idMatched = r?.action?.id
                    ? (exec.workflow?.actions || []).find((a: any) => a?.id === r.action.id)
                    : undefined;
                  const delay = Number(
                    (idMatched as any)?.execution_delay ??
                    (wfAction as any)?.execution_delay ??
                    (r as any)?.action?.execution_delay ??
                    (r as any)?.action?.delay ??
                    (wfAction as any)?.delay ??
                    0
                  );
                  if (!Number.isFinite(delay) || delay <= 0) return null;

                  const label = delay >= 3600
                    ? `${Math.floor(delay / 3600)}h ${Math.floor((delay % 3600) / 60)}m`
                    : delay >= 60
                    ? `${Math.floor(delay / 60)}m ${delay % 60}s`
                    : `${delay}s`;
                  return (
                    <Tooltip title={`Delayed by ${label} before running`} arrow>
                      <ScheduleIcon
                        fontSize="small"
                      />
                    </Tooltip>
                  );
                })()}
              </Box>
              {r?.result && (
                <Box sx={{ mt: 0.5 }}>
                  <ResultRenderer value={r.result} baseName={r?.action?.name || r?.action?.label} />
                </Box>
              )}
            </Box>
            );
          })}
        </Box>
        );
      })()}



      <Dialog
        open={Boolean(debugResult)}
        onClose={() => setDebugResult(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
          },
        }}
      >
        {(() => {
          if (!debugResult) return null;
          const wfAction = exec?.workflow?.actions?.find((a: any) =>
            (debugResult?.action?.id && a?.id === debugResult.action.id) ||
            (debugResult?.action?.app_name && a?.app_name === debugResult.action.app_name) ||
            (debugResult?.action?.label && a?.label === debugResult.action.label)
          );
          const appName = debugResult?.action?.app_name || (wfAction as any)?.app_name;
          const imgSrc = isAiAgentName(appName)
            ? singulAgentIcon
            : (debugResult?.action?.large_image ||
              (wfAction as any)?.large_image ||
              debugResult?.action?.small_image ||
              (wfAction as any)?.small_image ||
              '');
          const label = debugResult?.action?.label || debugResult?.action?.name || 'Step result';
          const actionName = debugResult?.action?.name;
          const allParams: any[] = Array.isArray(debugResult?.action?.parameters) ? debugResult.action.parameters : [];
          const variableParams = allParams.filter((p) =>
            p && p.name && !(p.name.endsWith('_error') && (p.name.startsWith('shuffle_') || p.name.startsWith('liquid_')))
          );
          const errorParams = allParams.filter((p) =>
            p && p.name && p.name.endsWith('_error') && (p.name.startsWith('shuffle_') || p.name.startsWith('liquid_'))
          );
          const status = debugResult?.status;
          const statusColor =
            status === 'SUCCESS' || status === 'FINISHED' ? 'hsl(140 60% 55%)'
              : status === 'FAILURE' || status === 'ABORTED' ? 'hsl(var(--destructive))'
              : 'hsl(45 90% 55%)';
          return (
            <>
              <DialogTitle sx={{ borderBottom: '1px solid hsl(var(--border))', p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <IconButton size="small" onClick={() => setDebugResult(null)} sx={{ color: 'hsl(var(--foreground))' }}>
                    <ArrowLeftIcon />
                  </IconButton>
                  {debugResult?.__isExecutionArgument ? (
                    <Box
                      component="img"
                      src={shuffleLogo}
                      alt="Shuffle Core"
                      sx={{ width: 40, height: 40, borderRadius: 1, border: '1px solid hsl(var(--border))', objectFit: 'contain', bgcolor: 'hsl(var(--muted))' }}
                    />
                  ) : (
                    (appName || imgSrc) && (
                      <AppFallbackIcon
                        name={appName || label}
                        imageUrl={imgSrc}
                        size={40}
                        alt={appName || label}
                        style={{ borderRadius: 8, border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--muted))' }}
                      />
                    )
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {humanizeLabel(label) || label}
                    </Typography>
                    {actionName && (
                      <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                        {actionName}
                      </Typography>
                    )}
                  </Box>
                  {status && (
                    <Typography
                      variant="caption"
                      sx={{ textTransform: 'uppercase', fontWeight: 600, color: statusColor, mr: 1 }}
                    >
                      Status {status}
                    </Typography>
                  )}
                  <IconButton size="small" onClick={() => setDebugResult(null)} sx={{ color: 'hsl(var(--foreground))' }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              </DialogTitle>
              <DialogContent sx={{ p: 2, minHeight: 300 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'hsl(var(--muted-foreground))' }}>
                  Result
                </Typography>
                <Box
                  sx={{
                    maxHeight: '55vh',
                    overflow: 'auto',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 1,
                    p: 1,
                    bgcolor: 'hsl(var(--muted) / 0.4)',
                  }}
                >
                  <JsonViewWithReference
                    src={deepParseJson(
                      debugResult?.__isExecutionArgument ? debugResult.result : debugResult
                    ) as object}
                    baseName={debugResult?.__isExecutionArgument ? '$exec' : (actionName || label)}
                    dark
                    collapsed={defaultCollapsed}
                    collapseStringMode="word"
                    collapseStringsAfterLength={120}
                    enableClipboard
                    displaySize
                  />
                </Box>

                {(variableParams.length > 0 || errorParams.length > 0) && (
                  <>
                    <Typography variant="subtitle1" sx={{ mt: 2.5, mb: 1, fontWeight: 700 }}>
                      Variable &amp; Debug info{' '}
                      <Typography component="span" variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                        ({variableParams.length + errorParams.length})
                      </Typography>
                    </Typography>
                    <Box sx={{ border: '1px solid hsl(var(--border))', borderRadius: 1, p: 1.25, bgcolor: 'hsl(var(--muted) / 0.4)' }}>
                      {variableParams.map((p, i) => (
                        <Box key={`v-${i}`} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.5, borderBottom: i < variableParams.length - 1 || errorParams.length > 0 ? '1px dashed hsl(var(--border))' : 'none' }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 160, wordBreak: 'break-all' }}>
                            {p.name}:
                          </Typography>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <DebugParamValue value={p.value} baseName={p.name} />
                          </Box>
                        </Box>
                      ))}
                      {errorParams.map((p, i) => (
                        <Box key={`e-${i}`} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.5, borderBottom: i < errorParams.length - 1 ? '1px dashed hsl(var(--border))' : 'none' }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 160, wordBreak: 'break-all', color: 'hsl(var(--destructive))' }}>
                            {p.name}:
                          </Typography>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <DebugParamValue value={p.value} baseName={p.name} destructive />
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </>
                )}
              </DialogContent>
              <DialogActions sx={{ borderTop: '1px solid hsl(var(--border))' }}>
                <Button onClick={() => setDebugResult(null)} sx={{ color: 'hsl(var(--foreground))' }}>
                  Close
                </Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      <NotificationsDrawer
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        executionId={executionId}
        workflowId={exec?.workflow?.id}
      />
    </Box>

  );
};

const MetaRow: React.FC<{ label: string; value: React.ReactNode; accent?: boolean }> = ({ label, value, accent }) => (
  <Box sx={{ display: 'flex', gap: 1, ml: 1, py: 0.25 }}>
    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 80 }}>{label}</Typography>
    <Typography variant="body2" sx={{ color: accent ? '#FF8544' : 'hsl(var(--muted-foreground))' }}>
      {value}
    </Typography>
  </Box>
);

/** Renders a debug param value. If the value is (or contains) JSON,
 *  parse it and render with the interactive JSON viewer so users can
 *  drill in and copy references. Falls back to plain text otherwise. */
const DebugParamValue: React.FC<{ value: unknown; baseName?: string; destructive?: boolean }> = ({ value, baseName, destructive }) => {
  const parsed = React.useMemo(() => deepParseJson(value), [value]);
  const isStructured = parsed !== null && typeof parsed === 'object';
  if (isStructured) {
    return (
      <JsonViewWithReference
        src={parsed as object}
        baseName={baseName}
        dark
        collapsed={defaultCollapsed}
        collapseStringMode="word"
        collapseStringsAfterLength={120}
        enableClipboard
        displaySize
      />
    );
  }
  const text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
  return (
    <Typography variant="body2" sx={{ color: destructive ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {text}
    </Typography>
  );
};


/** Try hard to turn a value into structured JSON. Handles double-encoded
 *  strings, code-fenced blocks, and recursively parses string properties
 *  whose contents also look like JSON. */
const deepParseJson = (input: unknown, depth = 0): unknown => {
  if (depth > 5) return input;
  if (input == null) return input;
  if (typeof input === 'string') {
    let s = input.trim();
    if (!s) return input;
    // Strip ```json fences
    if (s.startsWith('```')) {
      s = s.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    }
    // Unwrap surrounding quotes on already-quoted JSON strings
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      try { const inner = JSON.parse(s); if (typeof inner === 'string') s = inner; } catch { /* ignore */ }
    }
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        return deepParseJson(parsed, depth + 1);
      } catch { /* fall through */ }
    }
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((v) => deepParseJson(v, depth + 1));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = deepParseJson(v, depth + 1);
    }
    return out;
  }
  return input;
};

const safeBaseName = (name?: string | null): string => {
  if (!name) return 'workflow';
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'workflow';
};

type JsonViewWithReferenceProps = React.ComponentProps<typeof JsonView> & { baseName?: string };

const JsonViewWithReference: React.FC<JsonViewWithReferenceProps> = ({ baseName, ...props }) => {
  const copyModeRef = useRef<'value' | 'reference'>('value');
  const effectiveBaseName = safeBaseName(baseName);

  const customizeCopy = React.useCallback(
    (node: any, nodeMeta?: any) => {
      const mode = copyModeRef.current;
      copyModeRef.current = 'value';

      if (mode === 'reference') {
        const path = nodeMeta?.currentPath ?? nodeMeta?.parentPath ?? [];
        const segments = path.map((seg: string | number) =>
          typeof seg === 'number' || /^\d+$/.test(String(seg)) ? '#' : seg
        );
        return segments.length ? `$${effectiveBaseName}.${segments.join('.')}` : `$${effectiveBaseName}`;
      }

      if (typeof node === 'string') return node;
      if (node === null || node === undefined) return '';
      try {
        return JSON.stringify(node, null, 2);
      } catch {
        return String(node);
      }
    },
    [effectiveBaseName]
  );

  const CopyComponent = React.useCallback(
    ({ onClick, className }: { onClick: (e: React.MouseEvent) => void; className: string }) => (
      <span className={className} style={{ display: 'inline-flex', gap: 2, alignItems: 'center', verticalAlign: 'middle' }}>
        <Tooltip title="Copy value" arrow>
          <ContentCopyIcon
            fontSize="inherit"
            onClick={onClick}
            sx={{ cursor: 'pointer', width: 14, height: 14, opacity: 0.7, '&:hover': { opacity: 1 } }}
          />
        </Tooltip>
        <Tooltip title="Copy reference" arrow>
          <LinkIcon
            fontSize="inherit"
            onClick={(e) => {
              copyModeRef.current = 'reference';
              onClick(e);
            }}
            sx={{ cursor: 'pointer', width: 14, height: 14, opacity: 0.7, '&:hover': { opacity: 1 } }}
          />
        </Tooltip>
      </span>
    ),
    []
  );

  return <JsonView {...props} customizeCopy={customizeCopy} CopyComponent={CopyComponent} />;
};

const ResultRenderer: React.FC<{ value: unknown; baseName?: string }> = ({ value, baseName }) => {
  const parsed = deepParseJson(value);
  if (parsed && typeof parsed === 'object') {
    return (
      <Box sx={{ maxHeight: 320, overflow: 'auto', border: '1px solid hsl(var(--border))', borderRadius: 1, p: 1, bgcolor: 'hsl(var(--muted) / 0.4)' }}>
        <JsonViewWithReference src={parsed as object} baseName={baseName} dark collapsed={defaultCollapsed} collapseStringMode="word" collapseStringsAfterLength={120} enableClipboard displaySize />
      </Box>
    );
  }
  return (
    <Box
      sx={{
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: 'hsl(var(--muted-foreground))',
        maxHeight: 260,
        overflow: 'auto',
        border: '1px solid hsl(var(--border))',
        borderRadius: 1,
        p: 1,
        bgcolor: 'hsl(var(--muted) / 0.4)',
      }}
    >
      {typeof value === 'string' ? value : String(value ?? '')}
    </Box>
  );
};


export interface WorkflowRunExplorerDrawerProps extends WorkflowRunExplorerProps {
  open: boolean;
  /** Drawer width in px. Defaults to 720. */
  width?: number;
  /** Minimum drawer width in px. Defaults to 480. */
  minWidth?: number;
  /** Maximum drawer width in px. Defaults to 900. */
  maxWidth?: number;
  /** Optional theme override ('light' | 'dark') */
  theme?: string;
  /** Optional user profile context */
  userdata?: any;
  /** Optional API host URL override */
  globalUrl?: string;
}

export const WorkflowRunExplorerDrawer: React.FC<WorkflowRunExplorerDrawerProps> = ({
  open,
  executionId,
  authorization,
  onClose,
  width = 720,
  minWidth = 480,
  maxWidth = 900,
  pollIntervalMs,
}) => {
  const drawerWidth = `min(${width}px, 100vw)`;
  const drawerMinWidth = `min(${minWidth}px, 100vw)`;
  const drawerMaxWidth = `min(${maxWidth}px, 100vw)`;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: drawerWidth,
          minWidth: drawerMinWidth,
          maxWidth: drawerMaxWidth,
          flex: `0 0 ${drawerWidth}`,
          background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
          color: 'hsl(var(--foreground))',
          borderLeft: '1px solid hsl(var(--border))',
        },
      }}
      sx={{
        // This drawer is commonly launched from another drawer (app details,
        // agent results, incidents). It must always sit above its opener.
        zIndex: drawerZIndex,
        '& .MuiDrawer-paper': {
          boxSizing: 'border-box',
          width: `${drawerWidth} !important`,
          minWidth: `${drawerMinWidth} !important`,
          maxWidth: `${drawerMaxWidth} !important`,
          flex: `0 0 ${drawerWidth} !important`,
        },
      }}
    >
      {open && executionId && (
        <WorkflowRunExplorer
          executionId={executionId}
          authorization={authorization}
          onClose={onClose}
          pollIntervalMs={pollIntervalMs}
        />
      )}
    </Drawer>
  );
};

export default WorkflowRunExplorer;
