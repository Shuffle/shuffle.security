import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Laptop, HardDrive, Lock, Package, Zap, Plus, Copy, Check,
  ChevronRight, FolderOpen, Loader2, CheckCircle2, Send, FileCode,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { getApiUrl, getAuthHeader, API_CONFIG } from '@/Shuffle-MCPs/api';
import { trackPredefinedEvent, GA_EVENTS } from '@/Shuffle-Core/lib/analytics';

export interface MonitoringGroupLike {
  id?: string;
  name?: string;
  Name?: string;
  queue?: string;
  auth?: string;
  org_id?: string;
  sensor_hosts?: unknown[];
  hosts?: unknown[];
  [key: string]: unknown;
}

export interface AddHostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * If provided, targets this specific monitoring group directly (hiding or locking
   * the group selector).
   */
  group?: MonitoringGroupLike;
  /**
   * Available monitoring groups when group is not fixed.
   */
  groups?: MonitoringGroupLike[];
  /**
   * Called when a host is detected or the dialog is finished with a new sensor.
   */
  onHostDetected?: () => void;
  /**
   * Called to request a reload of groups/environments.
   */
  onRefresh?: () => void;
}

export const HOST_CHECK_OPTIONS = [
  { id: 'hd_encrypted' as const, label: 'HD Encrypted', description: 'Check if disk encryption is enabled (FileVault, BitLocker, LUKS)', icon: <HardDrive size={16} />, disabled: false },
  { id: 'screenlock' as const, label: 'Screenlock Enabled', description: 'Verify automatic screen lock is configured with max 15 min idle time', icon: <Lock size={16} />, disabled: false },
  { id: 'installed_software' as const, label: 'Installed Software', description: 'Inventory of installed applications and versions', icon: <Package size={16} />, disabled: false },
  { id: 'code_scanner_enabled' as const, label: 'Code Package Scanner', description: 'Scan project directories for language packages and dependencies', icon: <FileCode size={16} />, disabled: false },
  { id: 'response_actions' as const, label: 'Response Actions', description: 'Enable automated response actions on this host', icon: <Zap size={16} />, disabled: false },
  { id: 'log_forwarding' as const, label: 'Active Monitoring', description: 'Active monitoring of host activity (not generally available yet)', icon: <Send size={16} />, disabled: true },
];

export const AddHostDialog = ({
  open,
  onOpenChange,
  group,
  groups: propGroups,
  onHostDetected,
  onRefresh,
}: AddHostDialogProps) => {
  const [addHostStep, setAddHostStep] = useState<'checks' | 'deploy'>('checks');
  const [hostPlatform, setHostPlatform] = useState<'linux' | 'macos' | 'windows'>('linux');
  const [winRunAsAdmin, setWinRunAsAdmin] = useState(true);
  const [installMode, setInstallMode] = useState<'easy' | 'custom'>('easy');
  const [hostChecks, setHostChecks] = useState<Record<string, boolean>>({
    hd_encrypted: true,
    screenlock: true,
    installed_software: true,
    code_scanner_enabled: true,
    response_actions: true,
    log_forwarding: false,
  });
  const [logForwardingEndpoint, setLogForwardingEndpoint] = useState('');
  const [responseActionMode, setResponseActionMode] = useState<'controlled' | 'full'>('full');
  const [copied, setCopied] = useState(false);
  const [sensorDetected, setSensorDetected] = useState(false);
  const [, setSensorPolling] = useState(false);
  const [pollingActivated, setPollingActivated] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineHostCountRef = useRef<number | null>(null);
  const detectedFiredRef = useRef(false);
  const dialogOpenRef = useRef(false);

  // Group selection state (when group prop is not fixed)
  const [internalGroups, setInternalGroups] = useState<MonitoringGroupLike[]>(propGroups || []);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(group?.id || '');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroupLoading, setCreatingGroupLoading] = useState(false);

  const detectPlatform = (): 'linux' | 'macos' | 'windows' => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    if (ua.includes('win')) return 'windows';
    if (ua.includes('mac')) return 'macos';
    return 'linux';
  };

  // Sync propGroups to internal state
  useEffect(() => {
    if (propGroups) {
      setInternalGroups(propGroups);
    }
  }, [propGroups]);

  // Load groups if not supplied and no fixed group
  useEffect(() => {
    if (open && !group && (!propGroups || propGroups.length === 0)) {
      setGroupsLoading(true);
      fetch(getApiUrl('/api/v1/getenvironments'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      })
        .then(res => (res.ok ? res.json() : []))
        .then((envs: any[]) => {
          const sensorGroups = (Array.isArray(envs) ? envs : [])
            .filter(e => e.sensor_group === true && !e.archived)
            .map(e => ({
              id: e.id || e.Name,
              name: e.Name || e.name,
              queue: e.queue || (e.Name || e.name || '').replace(/ +/g, '-'),
              auth: String(e.auth || ''),
              org_id: String(e.org_id || ''),
              hosts: Array.isArray(e.sensor_hosts) ? e.sensor_hosts : [],
            }));
          setInternalGroups(sensorGroups);
          if (sensorGroups.length > 0 && !selectedGroupId) {
            setSelectedGroupId(sensorGroups[0].id);
          }
        })
        .catch(() => {})
        .finally(() => setGroupsLoading(false));
    }
  }, [open, group, propGroups, selectedGroupId]);

  // Determine current active group
  const activeGroup = group
    ? {
        id: group.id || '',
        name: group.name || group.Name || '',
        queue: group.queue || (group.name || group.Name || '').replace(/ +/g, '-'),
        auth: group.auth || '',
        org_id: group.org_id || '',
        hosts: (group.sensor_hosts || group.hosts || []) as unknown[],
      }
    : internalGroups.find(g => g.id === selectedGroupId) || internalGroups[0] || null;

  // Reset state on open
  useEffect(() => {
    if (open) {
      setAddHostStep('checks');
      setHostPlatform(detectPlatform());
      setHostChecks({
        hd_encrypted: true,
        screenlock: true,
        installed_software: true,
        code_scanner_enabled: true,
        response_actions: true,
        log_forwarding: false,
      });
      setLogForwardingEndpoint('');
      setCopied(false);
      setSensorDetected(false);
      setPollingActivated(false);
      setIsCreatingGroup(false);
      setNewGroupName('');
      detectedFiredRef.current = false;
      dialogOpenRef.current = true;
      trackPredefinedEvent(GA_EVENTS.MONITOR_ADD_HOST_OPEN);

      if (group?.id) {
        setSelectedGroupId(group.id);
      }
    } else {
      if (dialogOpenRef.current) {
        dialogOpenRef.current = false;
        if (!detectedFiredRef.current) {
          trackPredefinedEvent(GA_EVENTS.MONITOR_ADD_HOST_DISMISS, addHostStep);
        }
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (activationTimerRef.current) {
        clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
      }
    }
  }, [open, group]);

  const stopSensorPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setSensorPolling(false);
  }, []);

  const startSensorPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setSensorDetected(false);
    setSensorPolling(true);

    const targetGroupId = group?.id || selectedGroupId;
    const targetGroup = activeGroup;
    baselineHostCountRef.current = targetGroup && Array.isArray(targetGroup.hosts) ? targetGroup.hosts.length : 0;

    const checkSensor = async () => {
      try {
        const res = await fetch(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) return;
        const envs: any[] = await res.json();
        const env = envs.find(e => (e.id === targetGroupId || e.Name === targetGroup?.name) && e.sensor_group === true);
        if (env) {
          const hosts = Array.isArray(env.sensor_hosts) ? env.sensor_hosts : [];
          const currentHostCount = hosts.length;
          const baseline = baselineHostCountRef.current ?? 0;
          const thirtyMinAgo = Date.now() / 1000 - 30 * 60;

          const hasNewHost = currentHostCount > baseline;
          const hasRecentCheckin = hosts.some((h: any) => {
            const lastCheckin = h.last_checkin || h.updated || 0;
            return lastCheckin > thirtyMinAgo;
          });

          if (hasNewHost || hasRecentCheckin) {
            setSensorDetected(true);
            setSensorPolling(false);
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            if (!detectedFiredRef.current) {
              detectedFiredRef.current = true;
              trackPredefinedEvent(
                GA_EVENTS.MONITOR_ADD_HOST_DETECTED,
                targetGroup?.name,
                hasNewHost ? currentHostCount - baseline : 0,
              );
            }
            onHostDetected?.();
          }
        }
      } catch {
        /* continue polling */
      }
    };

    pollRef.current = setInterval(checkSensor, 5000);
  }, [group?.id, selectedGroupId, activeGroup, onHostDetected]);

  // Activate polling timer
  useEffect(() => {
    if (addHostStep === 'deploy' && open) {
      activationTimerRef.current = setTimeout(() => {
        setPollingActivated(true);
      }, 30000);
    } else {
      if (activationTimerRef.current) {
        clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
      }
      setPollingActivated(false);
    }
    return () => {
      if (activationTimerRef.current) {
        clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
      }
    };
  }, [addHostStep, open]);

  // Start/stop polling based on activation
  useEffect(() => {
    if (pollingActivated && addHostStep === 'deploy' && open) {
      startSensorPolling();
    } else if (!pollingActivated) {
      stopSensorPolling();
    }
    return () => stopSensorPolling();
  }, [pollingActivated, addHostStep, open, startSensorPolling, stopSensorPolling]);

  const activatePolling = useCallback(() => {
    if (!pollingActivated) setPollingActivated(true);
  }, [pollingActivated]);

  const getDeployCommand = () => {
    const baseUrl = API_CONFIG.baseUrl;
    const parts: string[] = [];
    parts.push(`base_url=${baseUrl}`);
    parts.push('sensor_mode=true');
    if (activeGroup) {
      parts.push(`queue=${activeGroup.queue}`);
      if (activeGroup.org_id) parts.push(`org_id=${activeGroup.org_id}`);
    }
    parts.push(`software_list_enabled=${hostChecks.installed_software}`);
    parts.push(`hd_encrypted_check=${hostChecks.hd_encrypted}`);
    parts.push(`screenlock_check=${hostChecks.screenlock}`);
    parts.push(`code_scanner_enabled=${hostChecks.code_scanner_enabled}`);
    parts.push(`response_actions=${hostChecks.response_actions ? responseActionMode : 'false'}`);
    parts.push(`log_forwarding=${hostChecks.log_forwarding && logForwardingEndpoint.trim() ? logForwardingEndpoint.trim() : 'false'}`);

    const authHeader = activeGroup?.auth ? `-H 'Auth: ${activeGroup.auth}'` : '';
    const downloadUrl = 'https://shuffler.io/api/v1/orborus';

    if (hostPlatform === 'windows') {
      parts.push('os=windows');
      if (!winRunAsAdmin) parts.push('admin=false');
      const winAuthHeader = activeGroup?.auth ? ` -Headers @{'Auth'='${activeGroup?.auth}'}` : '';
      return `powershell -ExecutionPolicy Bypass -Command "& {iex (irm '${downloadUrl}?${parts.join('&')}'${winAuthHeader})}"`.replace(/  +/g, ' ');
    }

    return `curl '${downloadUrl}?${parts.join('&')}' ${authHeader} | sh`.replace(/  +/g, ' ');
  };

  const handleCopyCommand = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(getDeployCommand()).catch(() => {});
      }
    } catch {}
    setCopied(true);
    activatePolling();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroupLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/v1/getenvironments'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      const allEnvs: any[] = res.ok ? await res.json() : [];
      const updatedEnvs = [
        ...allEnvs,
        { Name: newGroupName.trim(), Type: 'onprem', sensor_group: true },
      ];
      const putRes = await fetch(getApiUrl('/api/v1/setenvironments'), {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(updatedEnvs),
      });
      if (!putRes.ok) throw new Error('Failed to create group');

      const freshRes = await fetch(getApiUrl('/api/v1/getenvironments'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      if (freshRes.ok) {
        const freshEnvs: any[] = await freshRes.json();
        const sensorGroups = freshEnvs
          .filter(e => e.sensor_group === true && !e.archived)
          .map(e => ({
            id: e.id || e.Name,
            name: e.Name || e.name,
            queue: e.queue || (e.Name || e.name || '').replace(/ +/g, '-'),
            auth: String(e.auth || ''),
            org_id: String(e.org_id || ''),
            hosts: Array.isArray(e.sensor_hosts) ? e.sensor_hosts : [],
          }));
        setInternalGroups(sensorGroups);
        const created = sensorGroups.find(g => g.name === newGroupName.trim());
        if (created) {
          setSelectedGroupId(created.id);
        }
      }
      setIsCreatingGroup(false);
      setNewGroupName('');
      onRefresh?.();
      toast.success('Monitoring group created');
    } catch {
      toast.error('Failed to create monitoring group');
    } finally {
      setCreatingGroupLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Laptop size={18} className="text-primary" />
            Add Host Monitor
          </DialogTitle>
          <DialogDescription>
            Deploy a lightweight monitor on a host to continuously check its security posture.
          </DialogDescription>
        </DialogHeader>

        {addHostStep === 'checks' ? (
          <div className="space-y-5 mt-2">
            {/* Monitoring Group Display / Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <FolderOpen size={13} className="text-muted-foreground" />
                Monitoring Group
              </Label>
              <p className="text-xs text-muted-foreground">
                Each monitoring group uses a Runtime Location as the sensor group.
              </p>

              {group ? (
                /* Group is explicitly supplied from parent (e.g. focused Monitoring Group) */
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-muted/30">
                  <span className="text-sm text-foreground font-medium">{activeGroup?.name || group.name || group.Name || 'Default Group'}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    queue: {activeGroup?.queue || group.queue || ''}
                  </span>
                </div>
              ) : !isCreatingGroup ? (
                <div className="flex gap-2">
                  {groupsLoading ? (
                    <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-muted-foreground">
                      <Loader2 size={13} className="animate-spin" />
                      <span className="text-sm">Loading…</span>
                    </div>
                  ) : internalGroups.length === 0 ? (
                    <div className="flex-1 flex items-center h-9 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground">
                      No groups found — create one
                    </div>
                  ) : (
                    <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select a group" />
                      </SelectTrigger>
                      <SelectContent className="z-[9999]">
                        {internalGroups.map(g => (
                          <SelectItem key={g.id || g.name} value={g.id || g.name || ''}>
                            <div className="flex items-center gap-2">
                              <span>{g.name || g.Name}</span>
                              <span className="text-muted-foreground text-xs">({g.queue})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreatingGroup(true)}
                    className="shrink-0 gap-1.5"
                  >
                    <Plus size={13} />
                    New
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
                  <div className="space-y-1">
                    <Label className="text-xs">Group Name</Label>
                    <Input
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      placeholder="e.g. Engineering"
                      className="h-8 text-sm"
                    />
                    <p className="text-[0.65rem] text-muted-foreground">
                      This will create a new Monitoring group with the same name as the queue.
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsCreatingGroup(false);
                        setNewGroupName('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateGroup}
                      disabled={!newGroupName.trim() || creatingGroupLoading}
                    >
                      {creatingGroupLoading && <Loader2 size={13} className="animate-spin mr-1.5" />}
                      Create Group
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Checks */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Checks to Enable</Label>
              <div className="grid grid-cols-2 gap-2">
                {HOST_CHECK_OPTIONS.map(check => (
                  <div key={check.id}>
                    <label
                      className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors ${
                        check.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={hostChecks[check.id]}
                        disabled={check.disabled}
                        onCheckedChange={v => setHostChecks(prev => ({ ...prev, [check.id]: !!v }))}
                      />
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-muted-foreground shrink-0">{check.icon}</span>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground block">
                            {check.label}
                            {check.disabled ? ' (Coming soon)' : ''}
                          </span>
                          <span className="text-xs text-muted-foreground">{check.description}</span>
                        </div>
                      </div>
                    </label>
                    {check.id === 'response_actions' && hostChecks.response_actions && (
                      <div className="mt-1.5 mb-1 ml-9 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Control level:</span>
                        <div className="flex gap-1.5">
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled
                                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground opacity-40 cursor-not-allowed"
                                >
                                  Controlled
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <p className="text-xs">Coming soon — Predefined files are downloaded and executed</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                    responseActionMode === 'full'
                                      ? 'border-primary bg-primary/10 text-foreground'
                                      : 'border-border text-muted-foreground hover:bg-muted/50'
                                  }`}
                                  onClick={() => setResponseActionMode('full')}
                                >
                                  Full Control
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <p className="text-xs">Full remote command execution (RCE)</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    )}
                    {check.id === 'log_forwarding' && hostChecks.log_forwarding && (
                      <div className="ml-9 mt-1.5 mb-1">
                        <Input
                          value={logForwardingEndpoint}
                          onChange={e => setLogForwardingEndpoint(e.target.value)}
                          placeholder="e.g. https://siem.example.com:514"
                          className="h-8 text-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5 mt-2">
            {/* Group summary */}
            {activeGroup && (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-muted/30">
                <FolderOpen size={14} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground font-medium">{activeGroup.name}</span>
                <span className="text-xs text-muted-foreground font-mono">queue: {activeGroup.queue}</span>
              </div>
            )}

            {/* Install mode toggle */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Install Method</Label>
              <div className="flex gap-2">
                {[
                  { value: 'easy' as const, label: 'Easy Install' },
                  { value: 'custom' as const, label: 'Custom Install' },
                ].map(m => (
                  <Button
                    key={m.value}
                    variant="outline"
                    size="sm"
                    className={`flex-1 ${installMode === m.value ? 'border-primary text-primary' : ''}`}
                    onClick={() => setInstallMode(m.value)}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Platform</Label>
              <div className="flex gap-2">
                {[
                  { value: 'linux' as const, label: 'Linux' },
                  { value: 'macos' as const, label: 'macOS' },
                  { value: 'windows' as const, label: 'Windows' },
                ].map(p => (
                  <Button
                    key={p.value}
                    variant="outline"
                    size="sm"
                    className={`flex-1 ${hostPlatform === p.value ? 'border-primary text-primary' : ''}`}
                    onClick={() => setHostPlatform(p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>

              {/* Run as Admin toggle – Windows only */}
              {hostPlatform === 'windows' && (
                <div className="flex items-center justify-between pt-2">
                  <Label className="text-xs font-medium">Run as Administrator</Label>
                  <Switch checked={winRunAsAdmin} onCheckedChange={setWinRunAsAdmin} />
                </div>
              )}
            </div>

            {installMode === 'easy' ? (
              /* Easy: one-liner */
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Run this on the monitoring targets
                  {hostPlatform === 'windows' ? ' with PowerShell as Administrator' : ''}
                </Label>
                <div className="relative">
                  <pre className="text-xs bg-muted rounded-lg p-4 pr-12 border border-border overflow-x-auto font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed max-h-40">
                    {getDeployCommand()}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={handleCopyCommand}
                  >
                    {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Downloads, configures, and starts the monitor automatically.
                </p>
              </div>
            ) : (
              /* Custom: binary download + env command */
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">1. Download the binary</Label>
                  <p className="text-xs text-muted-foreground">
                    Get the latest release from{' '}
                    <a
                      href="https://github.com/Shuffle/orborus/releases"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      github.com/Shuffle/orborus/releases
                    </a>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">2. Run the monitor</Label>
                  <div className="relative">
                    <pre className="text-xs bg-muted rounded-lg p-4 pr-12 border border-border font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed">
{(() => {
  const flags: string[] = [];
  flags.push(`--base_url=${API_CONFIG.baseUrl}`);
  flags.push('--sensor_mode=true');
  if (activeGroup) {
    flags.push(`--queue=${activeGroup.queue}`);
    if (activeGroup.org_id) flags.push(`--org_id=${activeGroup.org_id}`);
    if (activeGroup.auth) flags.push(`--auth=${activeGroup.auth}`);
  }
  flags.push(`--software_list_enabled=${hostChecks.installed_software}`);
  flags.push(`--hd_encrypted_check=${hostChecks.hd_encrypted}`);
  flags.push(`--screenlock_check=${hostChecks.screenlock}`);
  flags.push(`--code_scanner_enabled=${hostChecks.code_scanner_enabled}`);
  if (hostChecks.response_actions) flags.push(`--response_actions=${responseActionMode}`);
  if (hostChecks.log_forwarding && logForwardingEndpoint.trim()) {
    flags.push(`--log_forwarding=${logForwardingEndpoint.trim()}`);
  }
  const bin = hostPlatform === 'windows' ? '.\\orborus.exe' : './orborus';
  return `${bin} ${flags.join(' ')}`;
})()}
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7"
                      onClick={() => {
                        const flags: string[] = [];
                        flags.push(`--base_url=${API_CONFIG.baseUrl}`);
                        flags.push('--sensor_mode=true');
                        if (activeGroup) {
                          flags.push(`--queue=${activeGroup.queue}`);
                          if (activeGroup.org_id) flags.push(`--org_id=${activeGroup.org_id}`);
                          if (activeGroup.auth) flags.push(`--auth=${activeGroup.auth}`);
                        }
                        flags.push(`--software_list_enabled=${hostChecks.installed_software}`);
                        flags.push(`--hd_encrypted_check=${hostChecks.hd_encrypted}`);
                        flags.push(`--screenlock_check=${hostChecks.screenlock}`);
                        flags.push(`--code_scanner_enabled=${hostChecks.code_scanner_enabled}`);
                        if (hostChecks.response_actions) flags.push(`--response_actions=${responseActionMode}`);
                        if (hostChecks.log_forwarding && logForwardingEndpoint.trim()) {
                          flags.push(`--log_forwarding=${logForwardingEndpoint.trim()}`);
                        }
                        const bin = hostPlatform === 'windows' ? '.\\orborus.exe' : './orborus';
                        try {
                          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(`${bin} ${flags.join(' ')}`).catch(() => {});
                          }
                        } catch {}
                        setCopied(true);
                        activatePolling();
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">3. Run as a background service</Label>
                  <p className="text-xs text-muted-foreground">
                    To keep the monitor running persistently, configure the command above as a system service.{' '}
                    {hostPlatform === 'linux' ? (
                      <a
                        href="https://www.freedesktop.org/software/systemd/man/systemd.service.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        systemd docs
                      </a>
                    ) : hostPlatform === 'macos' ? (
                      <a
                        href="https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        launchd docs
                      </a>
                    ) : (
                      <a
                        href="https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Task Scheduler docs
                      </a>
                    )}
                  </p>
                </div>
              </>
            )}

            {/* Sensor detection status */}
            {(pollingActivated || sensorDetected) && (
              <div
                className={`rounded-lg border px-3 py-3 flex items-center gap-3 ${
                  sensorDetected
                    ? 'border-[hsl(var(--severity-low))]/30 bg-[hsl(var(--severity-low))]/[0.06]'
                    : 'border-border bg-muted/30'
                }`}
              >
                {sensorDetected ? (
                  <>
                    <CheckCircle2 size={18} className="text-[hsl(var(--severity-low))] shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Sensor detected</p>
                      <p className="text-xs text-muted-foreground">
                        A host has checked in and is reporting results to group "{activeGroup?.name}".
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Loader2 size={18} className="animate-spin text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Waiting for sensor…</p>
                      <p className="text-xs text-muted-foreground">
                        Run the command on your target host. Once connected, it will run the selected checks and report results back automatically.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-2">
          {addHostStep === 'checks' ? (
            <Button
              size="sm"
              onClick={() => {
                trackPredefinedEvent(GA_EVENTS.MONITOR_ADD_HOST_DEPLOY, hostPlatform);
                setAddHostStep('deploy');
              }}
              disabled={Object.values(hostChecks).every(v => !v) || !activeGroup}
            >
              Next: Deploy
              <ChevronRight size={14} className="ml-1" />
            </Button>
          ) : (
            <div className="flex gap-2 w-full justify-between">
              <Button variant="outline" size="sm" onClick={() => setAddHostStep('checks')}>
                Back
              </Button>
              {sensorDetected && (
                <Button
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    toast.success('Host monitor connected', {
                      description: `Sensor active in group "${activeGroup?.name}".`,
                    });
                    onHostDetected?.();
                  }}
                >
                  Done
                </Button>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddHostDialog;
