import { ArrowRight as ArrowForwardIcon, Database as StorageIcon, Radio as SensorsIcon, Webhook as WebhookIcon, AlertTriangle as ReportProblemIcon, Forward as ForwardToInboxIcon, CheckCircle2 as CheckCircleIcon, AlertCircle as ErrorOutlineIcon } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Chip, Tooltip, CircularProgress } from '@mui/material';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { useWorkflows } from '@/hooks/useWorkflows';

interface StageInfo {
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  status: 'active' | 'warning' | 'inactive' | 'loading';
  tooltip?: string;
}

interface ProductionPipelineStatusProps {
  /** Selected environment from parent */
  environment?: {
    id: string;
    Name: string;
    Type: string;
    checkin: number;
    running_ip?: string;
    data_lake?: { enabled: boolean; pipelines: any };
  };
  /** Whether sensor is running */
  sensorRunning: boolean;
  /** Whether detection pipeline is ready */
  pipelineReady: boolean;
}

const ProductionPipelineStatus = ({ environment, sensorRunning, pipelineReady }: ProductionPipelineStatusProps) => {
  const { data: workflows, isLoading: workflowsLoading } = useWorkflows();
  const [webhookExecStatus, setWebhookExecStatus] = useState<'loading' | 'active' | 'inactive' | 'none'>('loading');
  const [lastExecTime, setLastExecTime] = useState<string | null>(null);
  const [incidentCount, setIncidentCount] = useState<number | null>(null);
  const [incidentLoading, setIncidentLoading] = useState(true);

  // Find webhook workflow
  const webhookWorkflow = useMemo(() => {
    return workflows?.find(w => w.name === 'Ingestion Webhook');
  }, [workflows]);

  const forwardWorkflow = useMemo(() => {
    return workflows?.find(w => w.name === 'Forward Tickets');
  }, [workflows]);

  // Check webhook execution recency
  useEffect(() => {
    if (!webhookWorkflow?.id) {
      setWebhookExecStatus('none');
      return;
    }

    const checkExecs = async () => {
      setWebhookExecStatus('loading');
      try {
        const res = await fetch(
          getApiUrl(`/api/v1/workflows/${webhookWorkflow.id}/executions?limit=1`),
          { credentials: 'include', headers: { ...getAuthHeader() } }
        );
        if (res.ok) {
          const data = await res.json();
          const execs = Array.isArray(data) ? data : (data.executions || []);
          if (execs.length > 0) {
            const latest = execs[0];
            const ts = latest.started_at || latest.completed_at || latest.created_at;
            if (ts) {
              const execTime = typeof ts === 'number' ? ts : Math.floor(new Date(ts).getTime() / 1000);
              const now = Math.floor(Date.now() / 1000);
              const diffHours = (now - execTime) / 3600;
              
              // Active if execution within last 24h
              setWebhookExecStatus(diffHours < 24 ? 'active' : 'inactive');
              
              // Format relative time
              if (diffHours < 1) {
                setLastExecTime(`${Math.floor(diffHours * 60)}m ago`);
              } else if (diffHours < 24) {
                setLastExecTime(`${Math.floor(diffHours)}h ago`);
              } else {
                setLastExecTime(`${Math.floor(diffHours / 24)}d ago`);
              }
            } else {
              setWebhookExecStatus('inactive');
            }
          } else {
            setWebhookExecStatus('inactive');
            setLastExecTime(null);
          }
        } else {
          setWebhookExecStatus('inactive');
        }
      } catch {
        setWebhookExecStatus('inactive');
      }
    };
    checkExecs();
  }, [webhookWorkflow?.id]);

  // Check incident count
  useEffect(() => {
    const fetchIncidents = async () => {
      setIncidentLoading(true);
      try {
        const res = await fetch(getApiUrl('/api/v1/incidents'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.incidents || data.cases || []);
          setIncidentCount(Array.isArray(list) ? list.length : 0);
        }
      } catch {
        setIncidentCount(null);
      } finally {
        setIncidentLoading(false);
      }
    };
    fetchIncidents();
  }, []);

  // Webhook trigger status
  const webhookEnabled = useMemo(() => {
    if (!webhookWorkflow) return false;
    const trigger = (webhookWorkflow.triggers || []).find(
      (t: any) => t.trigger_type === 'WEBHOOK' || t.app_name === 'Webhook'
    );
    return trigger ? (trigger.status || '').toLowerCase() !== 'stopped' : false;
  }, [webhookWorkflow]);

  // Forward workflow status
  const forwardEnabled = useMemo(() => {
    if (!forwardWorkflow) return false;
    return forwardWorkflow.is_valid !== false;
  }, [forwardWorkflow]);

  // Build stages
  const stages: StageInfo[] = useMemo(() => {
    const loading = workflowsLoading;

    // Stage 1: Logs/Events (sensor)
    const logsStage: StageInfo = {
      label: 'Logs / Events',
      sublabel: environment?.Name,
      icon: <StorageIcon size={20} />,
      status: !environment ? 'inactive' : sensorRunning ? 'active' : 'inactive',
      tooltip: sensorRunning
        ? `Log ingestion "${environment?.Name}" is running and receiving logs`
        : 'No active log ingestion — logs are not being received',
    };

    // Stage 2: Detection Pipeline
    const pipelineStage: StageInfo = {
      label: 'Detection Pipeline',
      sublabel: pipelineReady ? 'Enabled' : 'Not configured',
      icon: <SensorsIcon size={20} />,
      status: !sensorRunning ? 'inactive' : pipelineReady ? 'active' : 'warning',
      tooltip: pipelineReady
        ? 'Detection pipeline is processing events with Sigma rules'
        : 'Detection pipeline is not yet configured on this log ingestion',
    };

    // Stage 3: Webhook
    const webhookStage: StageInfo = {
      label: 'Webhook',
      sublabel: loading ? 'Checking...' : !webhookWorkflow
        ? 'Not configured'
        : webhookEnabled
          ? (webhookExecStatus === 'active' ? `Last: ${lastExecTime}` : (lastExecTime ? `Last: ${lastExecTime}` : 'No executions'))
          : 'Disabled',
      icon: <WebhookIcon size={20} />,
      status: loading ? 'loading'
        : !webhookWorkflow ? 'inactive'
        : !webhookEnabled ? 'inactive'
        : webhookExecStatus === 'active' ? 'active'
        : 'warning',
      tooltip: !webhookWorkflow
        ? 'Ingestion Webhook workflow not found — alerts won\'t create incidents'
        : !webhookEnabled
        ? 'Webhook trigger is stopped — alerts are not being forwarded'
        : webhookExecStatus === 'active'
        ? 'Webhook is active and recently received alerts'
        : 'Webhook exists but has no recent executions — check pipeline forwarding',
    };

    // Stage 4: Incidents
    const incidentStage: StageInfo = {
      label: 'Incidents',
      sublabel: incidentLoading ? 'Checking...' : incidentCount !== null ? `${incidentCount} total` : 'Unknown',
      icon: <ReportProblemIcon size={20} />,
      status: incidentLoading ? 'loading'
        : incidentCount !== null && incidentCount > 0 ? 'active'
        : 'warning',
      tooltip: incidentCount !== null && incidentCount > 0
        ? `${incidentCount} incidents in the system`
        : 'No incidents created yet',
    };

    // Stage 5: Forward
    const forwardStage: StageInfo = {
      label: 'Forward',
      sublabel: loading ? 'Checking...' : forwardEnabled ? 'Configured' : 'Not configured',
      icon: <ForwardToInboxIcon size={20} />,
      status: loading ? 'loading' : forwardEnabled ? 'active' : 'inactive',
      tooltip: forwardEnabled
        ? 'Forward Tickets workflow is active — incidents are forwarded to external systems'
        : 'No Forward Tickets workflow configured — incidents stay local',
    };

    return [logsStage, pipelineStage, webhookStage, incidentStage, forwardStage];
  }, [environment, sensorRunning, pipelineReady, webhookWorkflow, webhookEnabled,
      webhookExecStatus, lastExecTime, forwardEnabled, workflowsLoading, incidentLoading, incidentCount]);

  // Find the first broken stage (for the "cut off" indicator)
  const firstBrokenIndex = stages.findIndex(s => s.status === 'inactive' || s.status === 'warning');

  const statusColors: Record<StageInfo['status'], string> = {
    active: 'hsl(var(--severity-low))',
    warning: 'hsl(var(--severity-medium))',
    inactive: 'hsl(var(--muted-foreground))',
    loading: 'hsl(var(--muted-foreground))',
  };

  const statusBg: Record<StageInfo['status'], string> = {
    active: 'hsla(var(--severity-low) / 0.1)',
    warning: 'hsla(var(--severity-medium) / 0.1)',
    inactive: 'hsla(var(--muted-foreground) / 0.06)',
    loading: 'hsla(var(--muted-foreground) / 0.06)',
  };

  return (
    <Box>
      <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))', mb: 2 }}>
        Data flows from left to right. A break in the chain means data is not reaching downstream stages.
      </Typography>

      {/* Pipeline visualization */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        overflowX: 'auto',
        pb: 1,
      }}>
        {stages.map((stage, i) => {
          const color = statusColors[stage.status];
          const bg = statusBg[stage.status];
          const isBroken = firstBrokenIndex >= 0 && i >= firstBrokenIndex && stage.status !== 'active';
          const isAfterBreak = firstBrokenIndex >= 0 && i > firstBrokenIndex;

          return (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center' }}>
              {/* Arrow connector */}
              {i > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', mx: 0.5 }}>
                  <Box sx={{
                    width: 24,
                    height: 2,
                    bgcolor: isAfterBreak ? 'hsl(var(--border))' : color,
                    opacity: isAfterBreak ? 0.4 : 0.6,
                    transition: 'all 0.3s',
                  }} />
                  <ArrowForwardIcon size={16} style={{ color: isAfterBreak ? 'hsl(var(--border))' : color, opacity: isAfterBreak ? 0.4 : 0.6, marginLeft: '-4px' }} />
                </Box>
              )}

              {/* Stage node */}
              <Tooltip title={stage.tooltip || ''} placement="top" arrow>
                <Box sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: bg,
                  border: `1px solid ${color}`,
                  borderStyle: stage.status === 'inactive' ? 'dashed' : 'solid',
                  opacity: isAfterBreak ? 0.5 : 1,
                  transition: 'all 0.3s',
                  minWidth: 110,
                  position: 'relative',
                  cursor: 'default',
                }}>
                  {/* Status dot */}
                  <Box sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: stage.status === 'loading' ? 'transparent' : color,
                    boxShadow: stage.status === 'active' ? `0 0 6px ${color}` : 'none',
                  }}>
                    {stage.status === 'loading' && (
                      <CircularProgress size={8} sx={{ color: 'hsl(var(--muted-foreground))' }} />
                    )}
                  </Box>

                  <Box sx={{ color }}>{stage.icon}</Box>
                  <Typography sx={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'hsl(var(--foreground))',
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}>
                    {stage.label}
                  </Typography>
                  {stage.sublabel && (
                    <Typography sx={{
                      fontSize: '0.65rem',
                      color: 'hsl(var(--muted-foreground))',
                      textAlign: 'center',
                      lineHeight: 1.2,
                    }}>
                      {stage.sublabel}
                    </Typography>
                  )}
                </Box>
              </Tooltip>
            </Box>
          );
        })}
      </Box>

      {/* Status summary */}
      {firstBrokenIndex >= 0 && (
        <Box sx={{
          mt: 2,
          px: 2,
          py: 1.5,
          borderRadius: 1.5,
          bgcolor: 'hsla(var(--severity-medium) / 0.08)',
          border: '1px solid hsla(var(--severity-medium) / 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <ErrorOutlineIcon size={16} style={{ color: 'hsl(var(--severity-medium))' }} />
          <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--foreground))' }}>
            Data flow breaks at <strong>{stages[firstBrokenIndex].label}</strong>
            {stages[firstBrokenIndex].status === 'warning'
              ? ' — check configuration or recent activity'
              : ' — this stage is not configured'}
          </Typography>
        </Box>
      )}

      {firstBrokenIndex === -1 && (
        <Box sx={{
          mt: 2,
          px: 2,
          py: 1.5,
          borderRadius: 1.5,
          bgcolor: 'hsla(var(--severity-low) / 0.08)',
          border: '1px solid hsla(var(--severity-low) / 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <CheckCircleIcon size={16} style={{ color: 'hsl(var(--severity-low))' }} />
          <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--foreground))' }}>
            All pipeline stages are active — detection data is flowing end-to-end
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ProductionPipelineStatus;
