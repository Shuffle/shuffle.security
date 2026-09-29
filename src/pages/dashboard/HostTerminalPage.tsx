import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from '@/lib/router-compat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, ArrowRight, ChevronDown, Loader2, Search, Terminal } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { usePageMeta } from '@/hooks/usePageMeta';
import { fetchHostSupplements } from '@/lib/mergeMonitorHosts';
import { getActiveUser, inferAgentPrivilege, type AgentPrivilege } from '@/components/monitors/hostActionDefinitions';
import { registerHostIdentity, terminalStorageKey, readStoredSession } from '@/utils/terminalStorageKey';
import { hostUrlSegment, parseHostUrlSegment } from '@/utils/hostUrlSegment';
import { useHostActions } from '@/hooks/useHostActions';
import { HostTerminalView } from '@/components/monitors/HostTerminalView';
import { DisableRceConfirmDialog } from '@/components/monitors/DisableRceConfirmDialog';
import { HostNameDisplay } from '@/components/monitors/HostNameDisplay';

interface HostOption {
  uuid: string;
  hostname: string;
  groupName: string;
  mode: string;
  os: string;
  arch?: string;
  checkin?: number;
}

const HostTerminalPage = () => {
  const { hostUuid } = useParams<{ hostUuid: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const hostState = location.state as { hostname?: string; groupName?: string; mode?: string; autoRunAction?: string } | null;

  const [allHosts, setAllHosts] = useState<HostOption[]>([]);
  const [hostsLoaded, setHostsLoaded] = useState(false);
  const [hostSearchQuery, setHostSearchQuery] = useState('');
  const [hostSwitcherOpen, setHostSwitcherOpen] = useState(false);
  const [singleEnvFallback, setSingleEnvFallback] = useState<string>('');
  const [datastoreLookupDone, setDatastoreLookupDone] = useState(false);
  const [datastoreResolvedHostname, setDatastoreResolvedHostname] = useState<string>('');
  const [activeUser, setActiveUser] = useState<string | null>(null);
  const [agentPrivilege, setAgentPrivilege] = useState<AgentPrivilege>('unknown');
  const [hostRaw, setHostRaw] = useState<unknown>(null);

  const stripDomain = (h: string) => h.toLowerCase().trim().replace(/\.(local|lan|home|internal|corp)$/i, '');
  const parsedSegment = parseHostUrlSegment(hostUuid);
  const idLower = parsedSegment.hostname.toLowerCase().trim();
  const idStripped = stripDomain(parsedSegment.hostname);
  const archHint = parsedSegment.arch;
  const groupHint = parsedSegment.group.toLowerCase();
  const matchHost = (h: HostOption) => {
    const hn = (h.hostname || '').toLowerCase().trim();
    return hn === idLower || stripDomain(h.hostname || '') === idStripped;
  };
  const matchGroup = (h: HostOption) =>
    !groupHint || (h.groupName || '').toLowerCase() === groupHint;
  // Resolution order: uuid → (group + arch + hostname) → (group + hostname) →
  // (arch + hostname) → (hostname). The group hint disambiguates when the
  // same hostname is registered in multiple sensor groups.
  const resolvedHost =
    allHosts.find(h => h.uuid === parsedSegment.raw) ||
    (groupHint && archHint
      ? allHosts.find(h => matchHost(h) && matchGroup(h) && String(h.arch || '').toLowerCase() === archHint)
      : undefined) ||
    (groupHint ? allHosts.find(h => matchHost(h) && matchGroup(h)) : undefined) ||
    (archHint
      ? allHosts.find(h => matchHost(h) && String(h.arch || '').toLowerCase() === archHint)
      : undefined) ||
    allHosts.find(matchHost);

  const hostname =
    hostState?.hostname ||
    resolvedHost?.hostname ||
    datastoreResolvedHostname ||
    (hostsLoaded ? (parsedSegment.hostname || 'Unknown Host') : '');
  const groupName = hostState?.groupName || resolvedHost?.groupName || parsedSegment.group || singleEnvFallback || '';
  const mode = hostState?.mode || resolvedHost?.mode || 'full';
  const isFull = mode === 'full';
  const needsLoading = !hostState?.hostname && !hostsLoaded;

  const hasResolvedHostname = Boolean(
    hostname &&
    hostname !== 'Unknown Host' &&
    (Boolean(resolvedHost) || Boolean(datastoreResolvedHostname) || Boolean(hostState?.hostname) || hostname === parsedSegment.hostname)
  );
  const hostLookupFailed = hostsLoaded && datastoreLookupDone && !hasResolvedHostname;
  const missingSensorGroup = hostsLoaded && datastoreLookupDone && hasResolvedHostname && !groupName;
  const canRunActions = hasResolvedHostname && Boolean(groupName) && !hostLookupFailed && !missingSensorGroup;
  const resolutionErrorMessage = hostLookupFailed
    ? `This terminal URL did not resolve to a monitor. We finished loading /getenvironments and the monitor datastores, but could not map ID ${parsedSegment.raw} to a hostname.`
    : missingSensorGroup
      ? `This monitor resolved as ${hostname}, but its environment Name was empty so no sensor_group could be sent.`
      : '';
  const displayHostname = hasResolvedHostname ? hostname : 'Unresolved monitor';

  // Map URL alias to canonical storage identity so the popover and full page
  // share the same `terminal_session_*` key.
  useEffect(() => {
    if (parsedSegment.raw && hostname && hostname !== 'Unknown Host') {
      registerHostIdentity(parsedSegment.raw, { hostname, arch: resolvedHost?.arch || archHint });
    }
  }, [parsedSegment.raw, hostname, resolvedHost?.arch, archHint]);

  const isDemoHost = /^demo-/i.test(hostUuid || '');
  useEffect(() => {
    if (!isDemoHost) return;
    window.dispatchEvent(new CustomEvent('demo-object-context', { detail: { active: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent('demo-object-context', { detail: { active: false } }));
    };
  }, [isDemoHost]);

  usePageMeta({ title: `Terminal · ${displayHostname}`, description: `Terminal session for ${displayHostname}` });

  // Shared action state — same hook the mini-popover uses.
  const hostActions = useHostActions();

  // Fetch envs for the host switcher + storage identity registration.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) { setHostsLoaded(true); return; }
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const envs = Array.isArray(data) ? data.filter((e: any) => !e.archived && e.sensor_group === true) : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hosts: HostOption[] = envs.flatMap((env: any) => {
          const groupHosts = Array.isArray(env.sensor_hosts) ? env.sensor_hosts : [];
          const checks = Array.isArray(env.sensor_checks) ? env.sensor_checks : [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hasResponseActions = checks.some((c: any) => c === 'response_actions');
          const modeStr = hasResponseActions ? 'full' : 'controlled';
          const grpName = typeof env.Name === 'string' && env.Name.trim() ? env.Name.trim() : '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return groupHosts.map((h: any) => ({
            uuid: h.uuid,
            hostname: h.hostname,
            groupName: grpName,
            mode: modeStr,
            os: h.os || '',
            arch: h.arch || '',
            checkin: h.checkin,
          }));
        });
        for (const h of hosts) {
          registerHostIdentity(h.uuid, { hostname: h.hostname, arch: h.arch });
        }
        setAllHosts(hosts);
        if (envs.length === 1 && typeof envs[0].Name === 'string' && envs[0].Name.trim()) {
          setSingleEnvFallback(envs[0].Name.trim());
        }
      } catch { /* ignore */ } finally {
        setHostsLoaded(true);
      }
    })();
  }, []);

  // Cross-load datastore for hostname/active-user/agent-privilege when env stub doesn't have them.
  useEffect(() => {
    if (!hostsLoaded || !hostUuid) return;
    let cancelled = false;
    (async () => {
      try {
        const supplements = await fetchHostSupplements();
        const search = (map: Map<string, Record<string, unknown>>) => {
          const directHostname = (resolvedHost?.hostname || hostState?.hostname || '').toLowerCase().trim();
          if (directHostname && map.has(directHostname)) return map.get(directHostname) || null;
          for (const [, val] of map.entries()) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const recUuid = String((val as any).uuid || '').trim();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const recHost = String((val as any).hostname || '').toLowerCase().trim();
            if ((recUuid && recUuid === hostUuid) || (recHost && recHost === idLower) || (recHost && stripDomain(recHost) === idStripped)) {
              return val;
            }
          }
          return null;
        };
        const foundRecord = search(supplements.sensorsByHost) || search(supplements.assetsByHost);
        if (!cancelled && foundRecord) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hn = String((foundRecord as any).hostname || '').trim();
          if (hn) setDatastoreResolvedHostname(hn);
          const au = getActiveUser(foundRecord);
          if (au) setActiveUser(au);
          setAgentPrivilege(inferAgentPrivilege(foundRecord));
          setHostRaw(foundRecord);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setDatastoreLookupDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, [hostsLoaded, hostUuid, hostState?.hostname, resolvedHost, idLower, idStripped]);

  // Auto-run an action passed via navigation state (e.g. "CBOM Scan").
  const autoRunFiredRef = useRef(false);
  useEffect(() => {
    if (autoRunFiredRef.current) return;
    const action = hostState?.autoRunAction;
    if (!action || !hostUuid) return;
    if (!hostname || hostname === 'Unknown Host') return;
    if (!groupName) return;
    autoRunFiredRef.current = true;
    hostActions.executeHostAction(action, action, hostname, groupName, hostUuid, false);
    navigate(location.pathname, { replace: true, state: { hostname, groupName, mode: hostState?.mode } });
  }, [hostState, hostUuid, hostname, groupName, hostActions, navigate, location.pathname]);

  const filteredHosts = allHosts
    .filter(h =>
      h.uuid !== hostUuid && (
        h.hostname.toLowerCase().includes(hostSearchQuery.toLowerCase()) ||
        h.groupName.toLowerCase().includes(hostSearchQuery.toLowerCase())
      )
    )
    .sort((a, b) => (b.checkin || 0) - (a.checkin || 0));

  const noHostInUrl = !hostUuid;
  useEffect(() => {
    if (!noHostInUrl || !hostsLoaded || allHosts.length === 0) return;
    const sorted = [...allHosts].sort((a, b) => (b.checkin || 0) - (a.checkin || 0));
    const target = sorted[0];
    const seg = hostUrlSegment({ hostname: target.hostname, arch: target.arch, uuid: target.uuid, groupName: target.groupName });
    if (seg) navigate(`/monitors/${encodeURIComponent(seg)}/terminal`, { replace: true });
  }, [noHostInUrl, hostsLoaded, allHosts, navigate]);

  if (noHostInUrl && hostsLoaded && allHosts.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] items-center justify-center gap-4 text-muted-foreground px-6 text-center">
        <Terminal size={32} className="text-muted-foreground/60" />
        <div>
          <p className="text-base font-medium text-foreground">No sensors found</p>
          <p className="text-sm mt-1">Install a host monitor to start using Remote Control.</p>
        </div>
        <Button onClick={() => navigate('/monitors')} className="gap-1.5">
          Add Host monitors <ArrowRight size={14} />
        </Button>
      </div>
    );
  }

  if (needsLoading || (noHostInUrl && allHosts.length > 0)) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 size={24} className="animate-spin" />
        <span className="text-sm">Loading host info…</span>
      </div>
    );
  }

  const runningCount = (hostUuid ? hostActions.actionHistoryMap.get(hostUuid) || [] : []).filter(
    e => e.status === 'sending' || e.status === 'polling'
  ).length;

  const checkinDate = resolvedHost?.checkin ? new Date(resolvedHost.checkin * 1000) : null;
  const isRecent = checkinDate ? (Date.now() - checkinDate.getTime()) < 5 * 60 * 1000 : false;

  // Demo mode: fake "Isolate Host" success without hitting the backend by
  // writing directly to the canonical session storage, then hydrating.
  const customChipHandler = (id: string): boolean => {
    if (!isDemoHost) return false;
    if (id === 'isolate_host' && hostUuid) {
      const startedAt = Date.now();
      const entryId = `${startedAt}-demo`;
      try {
        const key = terminalStorageKey(hostUuid);
        const stored = readStoredSession(hostUuid);
        stored.push({
          entryId, actionName: 'Isolate Host', status: 'success',
          startedAt, finishedAt: startedAt + 1200,
          actionOutput: `Network isolation policy applied to ${hostname}.\nAll outbound connections blocked except to the security platform.\nUser session preserved. Awaiting analyst review.`,
        });
        localStorage.setItem(key, JSON.stringify(stored));
        setTimeout(() => hostActions.hydrateHost(hostUuid), 300);
      } catch { /* ignore */ }
      return true;
    }
    return true; // every other predefined action is a no-op in demo
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Page header */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-background">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(hostUuid ? `/monitors/${encodeURIComponent(hostUuid)}` : '/monitors')}>
          <ArrowLeft size={16} />
        </Button>
        <Terminal size={18} className="text-primary" />
        <Popover open={hostSwitcherOpen} onOpenChange={setHostSwitcherOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 min-w-0 text-left hover:bg-muted/50 rounded-md px-2 py-1 transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold text-foreground truncate">
                    <HostNameDisplay hostname={hostname} />
                  </h1>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isRecent ? 'bg-[hsl(var(--severity-low))]' : 'bg-muted-foreground/40'}`} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {isFull ? 'Full control (RCE)' : 'Controlled'} · {groupName}
                  {checkinDate && <> · Last seen {checkinDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
                </p>
              </div>
              <ChevronDown size={14} className="text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search monitors…"
                  value={hostSearchQuery}
                  onChange={e => setHostSearchQuery(e.target.value)}
                  className="h-8 text-sm pl-8"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredHosts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No other monitors found</p>
              ) : (
                filteredHosts.map(h => {
                  const c = h.checkin ? new Date(h.checkin * 1000) : null;
                  const recent = c ? (Date.now() - c.getTime()) < 5 * 60 * 1000 : false;
                  return (
                    <button
                      key={h.uuid}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center gap-2"
                      onClick={() => {
                        setHostSwitcherOpen(false);
                        setHostSearchQuery('');
                        navigate(`/monitors/${encodeURIComponent(hostUrlSegment(h))}/terminal`, {
                          state: { hostname: h.hostname, groupName: h.groupName, mode: h.mode },
                          replace: true,
                        });
                      }}
                    >
                      <div className="relative shrink-0">
                        <Terminal size={12} className="text-muted-foreground" />
                        <div className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${recent ? 'bg-[hsl(var(--severity-low))]' : 'bg-muted-foreground/40'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          <HostNameDisplay hostname={h.hostname} />
                        </p>
                        <p className="text-[0.65rem] text-muted-foreground truncate">
                          {h.groupName} · {h.os}
                          {c && <> · {c.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex-1" />
        {runningCount > 0 && (
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">{runningCount} running</span>
          </div>
        )}
      </div>

      {/* Shared terminal body — IDENTICAL to the popover */}
      <HostTerminalView
        host={{
          uuid: hostUuid || '',
          hostname,
          groupName,
          arch: resolvedHost?.arch,
          os: resolvedHost?.os,
          raw: hostRaw,
          responseActions: isFull ? 'full' : 'controlled',
          activeUser,
          agentPrivilege,
        }}
        size="comfortable"
        hostActions={hostActions}
        topBanner={resolutionErrorMessage ? (
          <div className="mx-6 mt-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3">
            <p className="text-sm font-medium text-destructive">
              {hostLookupFailed ? 'Monitor resolution failed' : 'Sensor group missing'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{resolutionErrorMessage}</p>
          </div>
        ) : undefined}
        emptyState={!resolutionErrorMessage ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
            <Terminal size={40} className="opacity-30" />
            <p className="text-sm">No commands run yet. Type a command or use the predefined actions below.</p>
          </div>
        ) : undefined}
        disabled={!canRunActions}
        disabledReason="Monitor resolution required before running predefined actions"
        inputDisabled={!canRunActions || isDemoHost}
        inputPlaceholder={
          isDemoHost
            ? 'Custom commands are disabled in the demo — use "Isolate Host"'
            : canRunActions
              ? (isFull ? 'Type command…' : 'Custom action…')
              : 'Monitor resolution required before running commands'
        }
        customChipHandler={isDemoHost ? customChipHandler : undefined}
        footerNote={
          isDemoHost
            ? 'Demo terminal — only the "Isolate Host" predefined action is enabled.'
            : 'No session is created — each command is standalone. Full history is saved as Workflow Executions, with sessions stored locally in your browser.'
        }
      />

      <DisableRceConfirmDialog
        pending={hostActions.pendingDisableRce}
        onCancel={() => hostActions.setPendingDisableRce(null)}
        onConfirm={hostActions.confirmDisableRce}
      />
    </div>
  );
};

export default HostTerminalPage;
