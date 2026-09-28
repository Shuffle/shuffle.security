import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Switch,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Button,
  Collapse,
  Alert,
  Popover,
  Checkbox,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { Radar, Zap, Bell, Server, ShieldCheck, ShieldAlert, ShieldOff, Search, FileText, Globe, Ban, MonitorOff, UserX, KeyRound, Lightbulb, Database, Terminal, Settings2, Flame, Megaphone, AlertTriangle, Mail, Wifi, Monitor, Play, Laptop, ChevronDown as ExpandMoreIcon, ChevronUp as ExpandLessIcon, RotateCcw as RestoreIcon } from 'lucide-react';
import { useAgentPermissions, RiskLevel, AgentPermissionCategory, AgentPermission } from '@/hooks/useAgentPermissions';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import AssignedToolsSection from '@/components/agent/AssignedToolsSection';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Radar: <Radar size={20} />,
  Zap: <Zap size={20} />,
  Bell: <Bell size={20} />,
  Server: <Server size={20} />,
};

const CATEGORY_ICONS_COMPACT: Record<string, React.ReactNode> = {
  Radar: <Radar size={18} />,
  Zap: <Zap size={18} />,
  Bell: <Bell size={18} />,
  Server: <Server size={18} />,
};

const PERMISSION_ICONS: Record<string, React.ReactNode> = {
  scan_vulnerabilities: <Search size={18} />,
  analyze_logs: <FileText size={18} />,
  tune_detection_rules: <Settings2 size={18} />,
  block_ips: <Ban size={18} />,
  isolate_systems: <MonitorOff size={18} />,
  disable_accounts: <UserX size={18} />,
  force_password_reset: <KeyRound size={18} />,
  update_case_status: <FileText size={18} />,
  suggest_remediation: <Lightbulb size={18} />,
  manage_ioc_watchlists: <Database size={18} />,
  monitor_network_traffic: <Wifi size={18} />,
  send_alerts: <Megaphone size={18} />,
  escalate_incidents: <AlertTriangle size={18} />,
  email_reports: <Mail size={18} />,
  read_configs: <Settings2 size={18} />,
  modify_firewall: <Flame size={18} />,
  endpoint_control: <Terminal size={18} />,
};

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  low: {
    label: 'Low Risk',
    color: 'hsl(var(--severity-low))',
    bg: 'hsl(var(--severity-low) / 0.1)',
    icon: <ShieldCheck size={14} />,
  },
  medium: {
    label: 'Medium Risk',
    color: 'hsl(var(--severity-medium))',
    bg: 'hsl(var(--severity-medium) / 0.1)',
    icon: <ShieldAlert size={14} />,
  },
  high: {
    label: 'High Risk',
    color: 'hsl(var(--severity-high))',
    bg: 'hsl(var(--severity-high) / 0.1)',
    icon: <ShieldOff size={14} />,
  },
};

const RISK_ICON_BG: Record<RiskLevel, string> = {
  low: 'hsla(var(--severity-low) / 0.15)',
  medium: 'hsla(var(--severity-medium) / 0.15)',
  high: 'hsla(var(--severity-critical) / 0.15)',
};

const RISK_ICON_COLOR: Record<RiskLevel, string> = {
  low: 'hsl(var(--severity-low))',
  medium: 'hsl(var(--severity-medium))',
  high: 'hsl(var(--severity-critical))',
};

interface MonitoredHost {
  hostname: string;
  os: string;
  uuid: string;
  checkin: number;
  groupName: string;
  responseActions: string | boolean;
}

interface PermissionsPanelProps {
  /** Compact mode for sidebar/drawer usage */
  compact?: boolean;
}

const PermissionsPanel = ({ compact = false }: PermissionsPanelProps) => {
  const [selectedSkill, setSelectedSkill] = useState<string>('incident-handler');

  const {
    categories,
    isLoading,
    isSaving,
    error,
    totalPermissions,
    enabledPermissions,
    togglePermission,
    toggleCategory,
    resetToDefaults,
  } = useAgentPermissions(selectedSkill);

  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    () => categories.map(c => c.id)
  );

  // Host action state
  const [monitoredHosts, setMonitoredHosts] = useState<MonitoredHost[]>([]);
  const [hostsLoaded, setHostsLoaded] = useState(false);
  const [hostPopover, setHostPopover] = useState<{ anchor: HTMLElement; perm: AgentPermission } | null>(null);
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hostFilter, setHostFilter] = useState('');

  /** Status dot color based on last check-in time, matching Monitors page logic */
  const getCheckinStatus = (checkin: number): { color: string; label: string } => {
    if (!checkin || checkin === 0) return { color: 'hsl(var(--muted-foreground) / 0.4)', label: 'Unknown' };
    const diffSec = Date.now() / 1000 - checkin;
    if (diffSec < 300) return { color: 'hsl(var(--severity-low))', label: 'Active (< 5m ago)' };
    if (diffSec < 1800) return { color: 'hsl(var(--severity-medium))', label: 'Stale (< 30m ago)' };
    return { color: 'hsl(var(--severity-high))', label: 'Offline (> 30m ago)' };
  };

  // Fetch monitored hosts from environments API
  const fetchHosts = useCallback(async () => {
    if (hostsLoaded) return;
    try {
      const resp = await fetch(getApiUrl('/api/v1/getenvironments'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      if (resp.ok) {
        const envs = await resp.json();
        const hosts: MonitoredHost[] = [];
        (Array.isArray(envs) ? envs : []).forEach((env: any) => {
          if (env.sensor_group && Array.isArray(env.sensor_hosts)) {
            env.sensor_hosts.forEach((h: any) => {
              if (h.hostname) {
                hosts.push({
                  hostname: h.hostname,
                  os: h.os || '',
                  uuid: h.uuid || h.hostname,
                  checkin: h.checkin || 0,
                  groupName: env.Name || '',
                  responseActions: h.response_actions || false,
                });
              }
            });
          }
        });
        setMonitoredHosts(hosts);
      }
    } catch {
      // silent
    }
    setHostsLoaded(true);
  }, [hostsLoaded]);

  const handleHostAction = (e: React.MouseEvent<HTMLElement>, perm: AgentPermission) => {
    e.stopPropagation();
    fetchHosts();
    setSelectedHosts(new Set());
    setExecuteResult(null);
    setHostFilter('');
    setHostPopover({ anchor: e.currentTarget as HTMLElement, perm });
  };

  const executeOnHosts = useCallback(async () => {
    if (!hostPopover || selectedHosts.size === 0) return;
    setIsExecuting(true);
    setExecuteResult(null);
    try {
      const selectedHostObjects = monitoredHosts.filter(h => selectedHosts.has(h.uuid));
      const hostnames = selectedHostObjects.map(h => h.hostname);
      // Use the group of the first selected host (hosts within one popover share a group context)
      const sensorGroup = selectedHostObjects[0]?.groupName || '';

      const resp = await fetch(getApiUrl('/api/v1/apps/sensors/run'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          app_id: 'sensors',
          app_name: 'sensors',
          name: 'run_action',
          parameters: [
            { name: 'action', value: `script:${hostPopover.perm.id}` },
            { name: 'hosts', value: hostnames.join(',') },
            { name: 'sensor_group', value: sensorGroup },
          ],
        }),
      });

      if (resp.ok) {
        setExecuteResult({ success: true, message: `Action sent to ${hostnames.length} host${hostnames.length > 1 ? 's' : ''}` });
        setTimeout(() => setHostPopover(null), 1500);
      } else {
        const text = await resp.text().catch(() => '');
        setExecuteResult({ success: false, message: text || `Request failed (${resp.status})` });
      }
    } catch (err) {
      setExecuteResult({ success: false, message: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setIsExecuting(false);
    }
  }, [hostPopover, selectedHosts, monitoredHosts]);

  const toggleHostSelection = (uuid: string) => {
    setSelectedHosts(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid); else next.add(uuid);
      return next;
    });
  };

  const OsIcon = ({ os, size = 14, className = '' }: { os: string; size?: number; className?: string }) => {
    const lower = (os || '').toLowerCase();
    if (lower.includes('darwin') || lower.includes('mac') || lower.includes('ios')) {
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
      );
    }
    if (lower.includes('windows') || lower.includes('win')) {
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
          <path d="M3 12V6.5l8-1.1V12H3zm10 0V5.2l8-1.2V12h-8zM3 13h8v6.7l-8-1.1V13zm10 0h8v6.9l-8 1.2V13z"/>
        </svg>
      );
    }
    if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('debian') || lower.includes('centos') || lower.includes('redhat') || lower.includes('fedora')) {
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor" aria-label="Linux">
          <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.077 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.484 14.35c.296 0 .523.043.682.13.158.085.226.214.205.387l-.022.135-.13.612c-.097.456-.222.823-.376 1.103a1.31 1.31 0 01-.602.59c-.247.118-.566.176-.957.176s-.71-.058-.957-.176a1.31 1.31 0 01-.602-.59c-.154-.28-.28-.647-.376-1.103l-.13-.612-.022-.135c-.02-.173.047-.302.205-.387.16-.087.387-.13.682-.13zm-2.31-7.45c.27 0 .493.092.67.276.176.184.265.41.265.677 0 .268-.089.494-.265.678a.886.886 0 01-.67.276.886.886 0 01-.67-.276.945.945 0 01-.265-.678c0-.267.089-.493.265-.677a.886.886 0 01.67-.276zm4.62 0c.267 0 .493.092.67.276.176.184.264.41.264.677 0 .268-.088.494-.264.678a.886.886 0 01-.67.276.886.886 0 01-.67-.276.945.945 0 01-.266-.678c0-.267.09-.493.266-.677a.886.886 0 01.67-.276z"/>
        </svg>
      );
    }
    return <Laptop size={size} className={className} />;
  };

  const toggleExpand = (categoryId: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const getCategoryStats = (cat: AgentPermissionCategory) => {
    const enabled = cat.permissions.filter(p => p.enabled).length;
    const total = cat.permissions.length;
    return { enabled, total, allEnabled: enabled === total, noneEnabled: enabled === 0 };
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: compact ? 8 : 12 }}>
        <CircularProgress sx={{ color: 'hsl(var(--primary))' }} size={compact ? 28 : 40} />
      </Box>
    );
  }

  // Shared host action button renderer — always visible for host-actionable perms
  const renderHostActionButton = (perm: AgentPermission, _isDisabled: boolean) => {
    if (!perm.hostActionable) return null;
    return (
      <Tooltip title="Run on monitored hosts">
        <IconButton
          size="small"
          onClick={(e) => handleHostAction(e, perm)}
          sx={{
            width: 28,
            height: 28,
            flexShrink: 0,
            border: '1px solid hsl(var(--border))',
            borderRadius: 1,
            color: 'hsl(var(--muted-foreground))',
            '&:hover': {
              bgcolor: 'hsl(var(--primary) / 0.1)',
              borderColor: 'hsl(var(--primary) / 0.4)',
              color: 'hsl(var(--primary))',
            },
          }}
        >
          <Monitor size={14} />
        </IconButton>
      </Tooltip>
    );
  };

  // Shared host popover
  const renderHostPopover = () => (
    <Popover
      open={!!hostPopover}
      anchorEl={hostPopover?.anchor}
      onClose={() => setHostPopover(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{
        paper: {
          sx: {
            mt: 0.5,
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            minWidth: 280,
            maxWidth: 360,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          },
        },
      }}
    >
      {hostPopover && (
        <Box>
          <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid hsl(var(--border))' }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              {hostPopover.perm.name}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mt: 0.25 }}>
              Select hosts to run this action on
            </Typography>
          </Box>

          {!hostsLoaded ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={20} sx={{ color: 'hsl(var(--primary))' }} />
            </Box>
          ) : monitoredHosts.length === 0 ? (
            <Box sx={{ px: 2.5, py: 3, textAlign: 'center' }}>
              <Laptop size={24} className="mx-auto mb-2 text-muted-foreground/40" />
              <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>
                No monitored hosts found
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', mt: 0.5, opacity: 0.7 }}>
                Deploy a sensor to start monitoring hosts
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setHostPopover(null);
                  window.location.href = '/monitors';
                }}
                sx={{
                  mt: 1.5,
                  fontSize: '0.7rem',
                  textTransform: 'none',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--primary))',
                  '&:hover': { bgcolor: 'hsl(var(--primary) / 0.08)', borderColor: 'hsl(var(--primary) / 0.4)' },
                }}
              >
                Set up Monitors
              </Button>
            </Box>
          ) : (
            <>
              {/* Filter input */}
              <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid hsl(var(--border) / 0.3)' }}>
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 1.5,
                  border: '1px solid hsl(var(--border))',
                  bgcolor: 'hsl(var(--muted) / 0.3)',
                }}>
                  <Search size={14} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="Filter hosts…"
                    value={hostFilter}
                    onChange={(e) => setHostFilter(e.target.value)}
                    autoFocus
                    style={{
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: 'hsl(var(--foreground))',
                      fontSize: '0.8rem',
                      width: '100%',
                    }}
                  />
                </Box>
              </Box>

              <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                {monitoredHosts
                  .filter(h => !hostFilter || h.hostname.toLowerCase().includes(hostFilter.toLowerCase()) || h.os.toLowerCase().includes(hostFilter.toLowerCase()) || h.groupName.toLowerCase().includes(hostFilter.toLowerCase()))
                  .map((host) => {
                    const status = getCheckinStatus(host.checkin);
                    return (
                      <Box
                        key={host.uuid}
                        onClick={() => {
                          if (host.responseActions) toggleHostSelection(host.uuid);
                        }}
                        sx={{
                          px: 2.5,
                          py: 1.25,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          cursor: host.responseActions ? 'pointer' : 'not-allowed',
                          opacity: host.responseActions ? 1 : 0.45,
                          borderBottom: '1px solid hsl(var(--border) / 0.3)',
                          '&:hover': host.responseActions ? { bgcolor: 'hsl(var(--muted) / 0.3)' } : {},
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={selectedHosts.has(host.uuid)}
                          disabled={!host.responseActions}
                          sx={{
                            p: 0,
                            color: 'hsl(var(--muted-foreground))',
                            '&.Mui-checked': { color: 'hsl(var(--primary))' },
                          }}
                        />
                        <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'hsl(var(--muted-foreground))' }}>
                          <OsIcon os={host.os} size={16} />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            color: 'hsl(var(--foreground))',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {host.hostname}
                          </Typography>
                          {!host.responseActions && (
                            <Typography sx={{ fontSize: '0.6rem', color: 'hsl(var(--muted-foreground))' }}>
                              Response Actions not enabled
                            </Typography>
                          )}
                        </Box>
                        <Tooltip title={host.responseActions ? status.label : 'Response Actions not enabled'} placement="left">
                          <Box sx={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            bgcolor: status.color,
                            flexShrink: 0,
                          }} />
                        </Tooltip>
                      </Box>
                    );
                  })}
                {monitoredHosts.length > 0 && hostFilter && monitoredHosts.filter(h => h.hostname.toLowerCase().includes(hostFilter.toLowerCase()) || h.os.toLowerCase().includes(hostFilter.toLowerCase()) || h.groupName.toLowerCase().includes(hostFilter.toLowerCase())).length === 0 && (
                  <Box sx={{ px: 2.5, py: 2.5, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                      No hosts match "{hostFilter}"
                    </Typography>
                  </Box>
                )}
              </Box>

              <Box sx={{ px: 2.5, py: 1.5, borderTop: '1px solid hsl(var(--border))' }}>
                {executeResult && (
                  <Alert
                    severity={executeResult.success ? 'success' : 'error'}
                    sx={{ mb: 1.5, fontSize: '0.75rem', py: 0.25 }}
                  >
                    {executeResult.message}
                  </Alert>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                    {selectedHosts.size} selected
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={selectedHosts.size === 0 || isExecuting}
                    startIcon={isExecuting ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <Play size={12} />}
                    onClick={executeOnHosts}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.75rem',
                      bgcolor: 'hsl(var(--primary))',
                      color: 'hsl(var(--primary-foreground))',
                      borderRadius: 1.5,
                      px: 2,
                      '&:hover': { bgcolor: 'hsl(var(--primary))', filter: 'brightness(1.1)' },
                      '&.Mui-disabled': { bgcolor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
                    }}
                  >
                    {isExecuting ? 'Running…' : 'Run'}
                  </Button>
                </Box>
              </Box>
            </>
          )}
        </Box>
      )}
    </Popover>
  );

  if (compact) {
    return (
      <>
        {error && (
          <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>{error}</Alert>
        )}

        <AssignedToolsSection compact onSkillChange={setSelectedSkill} />

        {/* Categories — compact drawer style */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {categories.map((cat) => {
            const stats = getCategoryStats(cat);
            const isExpanded = expandedCategories.includes(cat.id);
            const isCatDisabled = !!cat.disabled;

            return (
              <Box key={cat.id} sx={{ opacity: isCatDisabled ? 0.5 : 1 }}>
                {/* Category header */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 1.5,
                    cursor: isCatDisabled ? 'default' : 'pointer',
                  }}
                  onClick={() => !isCatDisabled && toggleExpand(cat.id)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ color: 'hsl(var(--primary))', display: 'flex' }}>
                      {CATEGORY_ICONS_COMPACT[cat.icon] || <Server size={18} />}
                    </Box>
                    <Typography sx={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'hsl(var(--muted-foreground))',
                    }}>
                      {cat.label}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {isCatDisabled && (
                      <Chip
                        label="Coming soon"
                        size="small"
                        sx={{
                          fontSize: '0.65rem',
                          fontWeight: 500,
                          height: 20,
                          bgcolor: 'hsl(var(--muted) / 0.6)',
                          color: 'hsl(var(--muted-foreground))',
                        }}
                      />
                    )}
                    <Chip
                      label={`${stats.enabled}/${stats.total}`}
                      size="small"
                      sx={{
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        height: 22,
                        bgcolor: stats.allEnabled
                          ? 'hsl(var(--severity-low) / 0.12)'
                          : stats.noneEnabled
                          ? 'hsl(var(--severity-high) / 0.12)'
                          : 'hsl(var(--primary) / 0.12)',
                        color: stats.allEnabled
                          ? 'hsl(var(--severity-low))'
                          : stats.noneEnabled
                          ? 'hsl(var(--severity-high))'
                          : 'hsl(var(--primary))',
                      }}
                    />
                    <Tooltip title={isCatDisabled ? 'Coming soon' : stats.allEnabled ? 'Disable all' : 'Enable all'}>
                      <span>
                        <Switch
                          size="small"
                          checked={stats.allEnabled}
                          disabled={isCatDisabled}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleCategory(cat.id, !stats.allEnabled);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {
                              color: 'hsl(var(--primary))',
                            },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                              bgcolor: 'hsl(var(--primary))',
                            },
                          }}
                        />
                      </span>
                    </Tooltip>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); toggleExpand(cat.id); }}
                      sx={{ color: 'hsl(var(--muted-foreground))', width: 24, height: 24 }}
                    >
                      {isExpanded ? <ExpandLessIcon size={16} /> : <ExpandMoreIcon size={16} />}
                    </IconButton>
                  </Box>
                </Box>

                {/* Permission cards */}
                <Collapse in={isExpanded}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <AnimatePresence>
                      {cat.permissions.map((perm) => {
                        const riskCfg = RISK_CONFIG[perm.risk];
                        const isPermDisabled = isCatDisabled || !!perm.disabled;
                        return (
                          <motion.div
                            key={perm.id}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5,
                                px: 2,
                                py: 1.5,
                                borderRadius: 2,
                                border: '1px solid',
                                borderColor: perm.enabled ? 'hsl(var(--border))' : 'hsla(var(--border) / 0.5)',
                                bgcolor: perm.enabled ? 'hsla(var(--card) / 0.6)' : 'transparent',
                                opacity: perm.enabled && !isPermDisabled ? 1 : 0.55,
                                transition: 'all 0.2s ease',
                              }}
                            >
                              {/* Icon */}
                              <Box sx={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: RISK_ICON_BG[perm.risk],
                                color: RISK_ICON_COLOR[perm.risk],
                                flexShrink: 0,
                              }}>
                                {PERMISSION_ICONS[perm.id] || <Server size={18} />}
                              </Box>

                              {/* Text */}
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                                  <Typography sx={{
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    color: 'hsl(var(--foreground))',
                                  }}>
                                    {perm.name}
                                  </Typography>
                                  <Chip
                                    label={riskCfg.label.split(' ')[0].toUpperCase()}
                                    size="small"
                                    sx={{
                                      height: 18,
                                      fontSize: '0.55rem',
                                      fontWeight: 700,
                                      letterSpacing: '0.04em',
                                      bgcolor: riskCfg.bg,
                                      color: riskCfg.color,
                                      borderRadius: 1,
                                      '& .MuiChip-label': { px: 0.75 },
                                    }}
                                  />
                                </Box>
                                <Typography sx={{
                                  fontSize: '0.75rem',
                                  color: 'hsl(var(--muted-foreground))',
                                  lineHeight: 1.3,
                                }}>
                                  {perm.description}
                                </Typography>
                              </Box>

                              {/* Host action button */}
                              {renderHostActionButton(perm, isPermDisabled)}

                              {/* Toggle */}
                              <Switch
                                size="small"
                                checked={perm.enabled}
                                disabled={isPermDisabled}
                                onChange={() => togglePermission(cat.id, perm.id)}
                                sx={{
                                  flexShrink: 0,
                                  '& .MuiSwitch-switchBase.Mui-checked': {
                                    color: perm.risk === 'high'
                                      ? 'hsl(var(--severity-high))'
                                      : 'hsl(var(--primary))',
                                  },
                                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    bgcolor: perm.risk === 'high'
                                      ? 'hsl(var(--severity-high))'
                                      : 'hsl(var(--primary))',
                                  },
                                }}
                              />
                            </Box>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>

        {renderHostPopover()}
      </>
    );
  }

  // ── Full page variant ──
  return (
    <>
      <AssignedToolsSection onSkillChange={setSelectedSkill} />
      {/* Summary bar */}
      <Box
        sx={{
          px: 3,
          py: 1.5,
          mb: 3,
          bgcolor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
          Enabled
        </Typography>
        <Chip
          label={`${enabledPermissions}/${totalPermissions}`}
          size="small"
          sx={{
            fontWeight: 600,
            bgcolor: enabledPermissions === totalPermissions
              ? 'hsl(var(--severity-low) / 0.15)'
              : 'hsl(var(--primary) / 0.15)',
            color: enabledPermissions === totalPermissions
              ? 'hsl(var(--severity-low))'
              : 'hsl(var(--primary))',
          }}
        />
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          {(['low', 'medium', 'high'] as RiskLevel[]).map(risk => {
            const cfg = RISK_CONFIG[risk];
            const count = categories.reduce(
              (sum, cat) => sum + cat.permissions.filter(p => p.risk === risk).length,
              0
            );
            return (
              <Chip
                key={risk}
                icon={<span style={{ display: 'flex', color: cfg.color }}>{cfg.icon}</span>}
                label={`${count} ${cfg.label.split(' ')[0]}`}
                size="small"
                variant="outlined"
                sx={{
                  borderColor: cfg.color + '40',
                  color: cfg.color,
                  fontSize: '0.7rem',
                }}
              />
            );
          })}
        </Box>
        <Tooltip title="Reset all permissions to defaults">
          <Button
            variant="outlined"
            size="small"
            startIcon={<RestoreIcon size={16} />}
            onClick={resetToDefaults}
            sx={{
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--muted-foreground))',
              textTransform: 'none',
              '&:hover': {
                borderColor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary))',
              },
            }}
          >
            Reset
          </Button>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      )}

      {/* Category sections */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <AnimatePresence>
          {categories.map((cat) => {
            const stats = getCategoryStats(cat);
            const isExpanded = expandedCategories.includes(cat.id);
            const isCatDisabled = !!cat.disabled;

            return (
              <motion.div
                key={cat.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Box
                  sx={{
                    bgcolor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 1,
                    overflow: 'hidden',
                    opacity: isCatDisabled ? 0.5 : 1,
                  }}
                >
                  {/* Category header */}
                  <Box
                    sx={{
                      px: 3,
                      py: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'hsl(var(--muted) / 0.3)' },
                    }}
                    onClick={() => toggleExpand(cat.id)}
                  >
                    <Box sx={{ color: 'hsl(var(--primary))', display: 'flex' }}>
                      {CATEGORY_ICONS[cat.icon] || <Server size={20} />}
                    </Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', flex: 1 }}>
                      {cat.label}
                    </Typography>
                    {isCatDisabled && (
                      <Chip
                        label="Coming soon"
                        size="small"
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          height: 22,
                          bgcolor: 'hsl(var(--muted) / 0.6)',
                          color: 'hsl(var(--muted-foreground))',
                        }}
                      />
                    )}
                    <Chip
                      label={`${stats.enabled}/${stats.total}`}
                      size="small"
                      sx={{
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        bgcolor: stats.allEnabled
                          ? 'hsl(var(--severity-low) / 0.12)'
                          : stats.noneEnabled
                          ? 'hsl(var(--severity-high) / 0.12)'
                          : 'hsl(var(--primary) / 0.12)',
                        color: stats.allEnabled
                          ? 'hsl(var(--severity-low))'
                          : stats.noneEnabled
                          ? 'hsl(var(--severity-high))'
                          : 'hsl(var(--primary))',
                      }}
                    />
                    <Tooltip title={isCatDisabled ? 'Coming soon' : stats.allEnabled ? 'Disable all' : 'Enable all'}>
                      <span>
                        <Switch
                          size="small"
                          checked={stats.allEnabled}
                          disabled={isCatDisabled}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleCategory(cat.id, !stats.allEnabled);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {
                              color: 'hsl(var(--primary))',
                            },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                              bgcolor: 'hsl(var(--primary))',
                            },
                          }}
                        />
                      </span>
                    </Tooltip>
                    <IconButton size="small" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                      {isExpanded ? <ExpandLessIcon size={20} /> : <ExpandMoreIcon size={20} />}
                    </IconButton>
                  </Box>

                  {/* Permission items */}
                  <Collapse in={isExpanded}>
                    <Box sx={{ borderTop: '1px solid hsl(var(--border))' }}>
                      {cat.permissions.map((perm, idx) => {
                        const riskCfg = RISK_CONFIG[perm.risk];
                        const isPermDisabled = isCatDisabled || !!perm.disabled;
                        return (
                          <Box
                            key={perm.id}
                            sx={{
                              px: 3,
                              py: 1.5,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 2,
                              borderBottom: idx < cat.permissions.length - 1
                                ? '1px solid hsl(var(--border) / 0.5)'
                                : 'none',
                              opacity: perm.enabled && !isPermDisabled ? 1 : 0.55,
                              transition: 'opacity 0.2s',
                              '&:hover': {
                                bgcolor: 'hsl(var(--muted) / 0.2)',
                              },
                            }}
                          >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 500,
                                    color: 'hsl(var(--foreground))',
                                  }}
                                >
                                  {perm.name}
                                </Typography>
                                <Chip
                                  icon={<span style={{ display: 'flex', color: riskCfg.color }}>{riskCfg.icon}</span>}
                                  label={perm.risk}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.65rem',
                                    fontWeight: 500,
                                    bgcolor: riskCfg.bg,
                                    color: riskCfg.color,
                                    textTransform: 'capitalize',
                                    '& .MuiChip-icon': { ml: 0.5 },
                                  }}
                                />
                              </Box>
                              <Typography
                                variant="caption"
                                sx={{ color: 'hsl(var(--muted-foreground))' }}
                              >
                                {perm.description}
                              </Typography>
                            </Box>

                            {/* Host action button */}
                            {renderHostActionButton(perm, isPermDisabled)}

                            <Switch
                              size="small"
                              checked={perm.enabled}
                              disabled={isPermDisabled}
                              onChange={() => togglePermission(cat.id, perm.id)}
                              sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                  color: perm.risk === 'high'
                                    ? 'hsl(var(--severity-high))'
                                    : 'hsl(var(--primary))',
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                  bgcolor: perm.risk === 'high'
                                    ? 'hsl(var(--severity-high))'
                                    : 'hsl(var(--primary))',
                                },
                              }}
                            />
                          </Box>
                        );
                      })}
                    </Box>
                  </Collapse>
                </Box>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </Box>

      {renderHostPopover()}
    </>
  );
};

export default PermissionsPanel;
