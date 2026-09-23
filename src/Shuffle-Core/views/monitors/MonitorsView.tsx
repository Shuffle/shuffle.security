import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Navigate } from '@/lib/router-compat';
import { useAuth } from '@/context/AuthContext';
import { terminalStorageKey, readStoredSession, registerHostIdentity } from '@/utils/terminalStorageKey';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Laptop, HardDrive, Lock, Package, Zap, Plus, Copy, Check, Activity, ChevronRight, ChevronDown, Radar, FolderOpen, Loader2, CheckCircle2, Send, RefreshCw, ShieldCheck, ShieldX, Cpu, Hash, Clock, Globe, Play, Terminal, Square, Maximize2, AlertTriangle, FileCode } from 'lucide-react';
// usePageMeta intentionally not imported here — owned by host wrapper.
import { toast } from '@/lib/toast';
import { getApiUrl, getAuthHeader, API_CONFIG } from '@/Shuffle-MCPs/api';
import { DEFAULT_AGENT_PERMISSIONS } from '@/hooks/useAgentPermissions';
import { fetchHostSupplements, mergeHosts } from '@/lib/mergeMonitorHosts';
import { HostDetailPanel } from './HostDetailPanel';
import { MonitorHostTable } from './MonitorHostTable';
import { trackPredefinedEvent, GA_EVENTS } from '@/Shuffle-Core/lib/analytics';
import { isDemoActive } from '@/services/demoMode';
import { DEMO_HOST_HOSTNAME } from '@/services/demoLiveEnvironment';
import { fetchEnvironmentsCached } from '../appsFetchCache';

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

const HOST_CHECK_OPTIONS = [
  { id: 'hd_encrypted' as const, label: 'HD Encrypted', description: 'Check if disk encryption is enabled (FileVault, BitLocker, LUKS)', icon: <HardDrive size={16} />, disabled: false },
  { id: 'screenlock' as const, label: 'Screenlock Enabled', description: 'Verify automatic screen lock is configured with max 15 min idle time', icon: <Lock size={16} />, disabled: false },
  { id: 'installed_software' as const, label: 'Installed Software', description: 'Inventory of installed applications and versions', icon: <Package size={16} />, disabled: false },
  { id: 'code_scanner_enabled' as const, label: 'Code Package Scanner', description: 'Scan project directories for language packages and dependencies', icon: <FileCode size={16} />, disabled: false },
  { id: 'response_actions' as const, label: 'Response Actions', description: 'Enable automated response actions on this host', icon: <Zap size={16} />, disabled: false },
  { id: 'log_forwarding' as const, label: 'Active Monitoring', description: 'Active monitoring of host activity (not generally available yet)', icon: <Send size={16} />, disabled: true },
];

// Tiles shown on the default (no hosts yet) overview. HD Encrypted + Screenlock are
// collapsed into a single generic "Compliance Checks" tile so the UI stays extendible
// as more posture checks are added.
const HOST_OVERVIEW_TILES = [
  { id: 'compliance_checks', label: 'Compliance Checks', description: 'Verify disk encryption, screen lock policies, and other posture controls', icon: <ShieldCheck size={16} /> },
  { id: 'installed_software', label: 'Installed Software', description: 'Inventory of installed applications and versions', icon: <Package size={16} /> },
  { id: 'code_scanner_enabled', label: 'Code Package Scanner', description: 'Scan project directories for language packages and dependencies', icon: <FileCode size={16} /> },
  { id: 'response_actions', label: 'Response Actions', description: 'Enable automated response actions on this host', icon: <Zap size={16} /> },
  { id: 'log_forwarding', label: 'Active Monitoring', description: 'Active monitoring of host activity (not generally available yet)', icon: <Send size={16} /> },
];

/** Single source of truth for active monitoring (formerly log forwarding) status */
const isActiveMonitoringEnabled = (host: { log_forwarding?: string }): boolean => !!host.log_forwarding;

const fmtRaw = (value: unknown): string => {
  if (value === undefined) return '(field not set)';
  if (value === null) return 'null';
  if (value === '') return '"" (empty string)';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const parseResponseActionsState = (value: unknown): { enabled: boolean; mode: 'full' | 'controlled' | null } => {
  const raw = String(value ?? '').toLowerCase().trim();
  const enabled = value !== undefined && value !== null && raw !== '' && raw !== 'false' && raw !== '0' && raw !== 'no' && raw !== 'off';
  return {
    enabled,
    mode: enabled ? (raw.includes('full') ? 'full' : 'controlled') : null,
  };
};

interface CodeScannerProject {
  path: string;
  type: string;
  packages: { name: string; version: string }[];
}

interface SensorHost {
  arch: string;
  automatic_screen_lock_enabled: boolean | string;
  checkin: number;
  elevated_access: boolean;
  hd_encrypted: boolean | string;
  hostname: string;
  installed_software: { name: string; [key: string]: unknown }[];
  code_scanner?: CodeScannerProject[];
  log_forwarding: string;
  os: string;
  sensor_mode: boolean;
  serial: string;
  uuid: string;
  [key: string]: unknown;
}

interface OrbEnvironment {
  Name: string;
  Type: string;
  id: string;
  sensor_group?: boolean;
  sensor_hosts?: SensorHost[];
  archived?: boolean;
  [key: string]: unknown;
}

interface MonitoringGroup {
  id: string;
  name: string;
  queue: string;
  auth: string;
  org_id: string;
  hosts: SensorHost[];
}

/** Fetch environments from the API and supplement hosts from datastore (sensors > assets > env). */
const fetchSensorGroups = async (): Promise<{ groups: MonitoringGroup[]; allEnvs: OrbEnvironment[]; error?: string }> => {
  try {
    const data = await fetchEnvironmentsCached(getApiUrl('/api/v1/getenvironments'), {
      credentials: 'include',
      headers: { ...getAuthHeader() },
    });
    const envs: OrbEnvironment[] = Array.isArray(data) ? data.filter((e: OrbEnvironment) => !e.archived) : [];

    // Cross-load sensor + asset datastores once for the whole set of groups.
    const supplements = await fetchHostSupplements();
    if (supplements.errors.length) {
      console.warn('[VulnAssets] Host supplement load issues:', supplements.errors);
    }

    // While demo mode is active, force the demo host's check-in to within
    // the last minute so /monitors always shows it as freshly online —
    // regardless of how stale the seeded datastore record may be.
    const demoActive = isDemoActive();
    const demoHostnameLower = DEMO_HOST_HOSTNAME.toLowerCase();
    const bumpDemoCheckin = <T extends Record<string, unknown>>(h: T): T => {
      if (!demoActive) return h;
      const hn = String((h as { hostname?: string }).hostname || '').toLowerCase().trim();
      if (hn !== demoHostnameLower) return h;
      const fresh = Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 55) - 5;
      return { ...h, checkin: fresh, last_checkin: fresh };
    };

    const groups = envs
      .filter(e => e.sensor_group === true)
      .map(e => ({
        id: e.id || e.Name,
        name: e.Name,
        queue: e.Name.replace(/ +/g, '-'),
        auth: String(e.auth || ''),
        org_id: String(e.org_id || ''),
        hosts: mergeHosts<SensorHost>(Array.isArray(e.sensor_hosts) ? e.sensor_hosts : [], supplements).map(bumpDemoCheckin),
      }));

    // Surface sensor-datastore-only hosts (records present in
    // shuffle-security_sensors that aren't backed by any env stub) so they
    // still show up on /monitors. Used by demo mode to inject a fake host
    // without mutating the user's environments via /api/v1/setenvironments.
    const knownHostnames = new Set<string>();
    for (const g of groups) {
      for (const h of g.hosts) {
        const hn = String((h as { hostname?: string }).hostname || '').toLowerCase().trim();
        if (hn) knownHostnames.add(hn);
      }
    }
    const orphanSensorHosts: SensorHost[] = [];
    for (const [hostname, sensor] of supplements.sensorsByHost.entries()) {
      if (knownHostnames.has(hostname)) continue;
      const stub = { hostname, ...(sensor as Record<string, unknown>) } as unknown as SensorHost;
      orphanSensorHosts.push(bumpDemoCheckin(stub));
    }
    if (orphanSensorHosts.length > 0) {
      if (groups.length > 0) {
        // Attach to the first sensor group so terminal actions get a valid
        // sensor_group when the user opens the host detail page.
        groups[0] = { ...groups[0], hosts: [...groups[0].hosts, ...orphanSensorHosts] };
      } else {
        groups.push({
          id: 'default_monitors',
          name: 'default_monitors',
          queue: 'default_monitors',
          auth: '',
          org_id: '',
          hosts: orphanSensorHosts,
        });
      }
    }

    return { groups, allEnvs: envs };
  } catch (err) {
    return { groups: [], allEnvs: [], error: `Failed to load monitors — could not reach the API` };
  }
};

/** Create a new sensor group environment by sending ALL environments + the new one */
const createSensorGroupEnv = async (name: string, allEnvs: OrbEnvironment[]): Promise<MonitoringGroup | null> => {
  try {
    const updatedEnvs = [
      ...allEnvs,
      { Name: name, Type: 'onprem', sensor_group: true },
    ];
    const res = await fetch(getApiUrl('/api/v1/setenvironments'), {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(updatedEnvs),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `HTTP ${res.status}`);
    }
    // Re-fetch to get the created env with its server-assigned id
    const envRes = await fetch(getApiUrl('/api/v1/getenvironments'), {
      credentials: 'include',
      headers: { ...getAuthHeader() },
    });
    if (envRes.ok) {
      const freshEnvs: OrbEnvironment[] = await envRes.json();
      const created = freshEnvs.find(e => e.Name === name && e.sensor_group === true);
      if (created) {
        return { id: created.id || name, name: created.Name, queue: created.Name.replace(/ +/g, '-'), auth: String(created.auth || ''), org_id: String(created.org_id || ''), hosts: Array.isArray(created.sensor_hosts) ? created.sensor_hosts : [] };
      }
    }
    return { id: name, name, queue: name.replace(/ +/g, '-'), auth: '', org_id: '', hosts: [] };
  } catch (err) {
    console.error('[VulnAssets] Failed to create sensor group env:', err);
    return null;
  }
};

/**
 * Public, unauthenticated explainer for /monitors. Mirrors the pattern used by
 * /vulnerabilities (PublicVulnerabilitiesView): give visitors enough context
 * to understand what Host Monitors do and a clear path to sign up / sign in.
 * Only the top-level /monitors route is public; detail/terminal subpaths
 * remain support-gated in App.tsx.
 */
const PublicMonitorsView = () => {
  const navigate = useNavigate();
  const features = [
    {
      icon: <ShieldCheck size={16} />,
      title: 'Compliance Checks',
      desc: 'Verify disk encryption, screen lock policies and other posture controls across every host.',
    },
    {
      icon: <Package size={16} />,
      title: 'Installed Software',
      desc: 'Continuous inventory of installed applications and versions for vulnerability correlation.',
    },
    {
      icon: <FileCode size={16} />,
      title: 'Code Package Scanner',
      desc: 'Discover language packages and dependencies in source directories on each host.',
    },
    {
      icon: <Zap size={16} />,
      title: 'Response Actions',
      desc: 'Run pre-approved remediation actions on a target host straight from an incident.',
    },
    {
      icon: <Terminal size={16} />,
      title: 'Remote Terminal',
      desc: 'Open an interactive shell to a deployed host for hands-on investigation.',
    },
    {
      icon: <Send size={16} />,
      title: 'Active Monitoring',
      desc: 'Stream host activity and forward logs (preview — not generally available yet).',
    },
  ];

  const platforms = [
    { id: 'linux', label: 'Linux', desc: 'Single-line install script for Debian, Ubuntu, RHEL and CentOS.' },
    { id: 'macos', label: 'macOS', desc: 'Pkg installer that registers the monitor as a launchd service.' },
    { id: 'windows', label: 'Windows', desc: 'Run-as-admin installer that registers a Windows service.' },
  ];

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            Host Monitors
            <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">Beta</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Lightweight agents you deploy to laptops and servers for posture, inventory and response.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-transparent p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/15 text-primary shrink-0">
            <Activity size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground mb-0.5">What you can do with Host Monitors</p>
            <p className="text-xs text-muted-foreground">
              Each monitor is a small agent that reports back to Shuffle. Pick the checks you want, deploy the
              installer, and the host shows up here within seconds.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center gap-2 mb-1.5 text-foreground">
                <span className="text-primary">{f.icon}</span>
                <span className="text-sm font-semibold">{f.title}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-transparent p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/15 text-primary shrink-0">
            <HardDrive size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground mb-0.5">Supported platforms</p>
            <p className="text-xs text-muted-foreground">
              Deploy with a single installer on any of the major desktop and server operating systems.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {platforms.map((p) => (
            <div key={p.id} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center gap-2 mb-1.5 text-foreground">
                <OsIcon os={p.id} size={14} className="text-primary" />
                <span className="text-sm font-semibold">{p.label}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-transparent p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/15 text-primary shrink-0">
            <Plus size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground mb-0.5">Get started with Host Monitors</p>
            <p className="text-xs text-muted-foreground mb-3">
              Sign in to generate your install command and see deployed hosts as they connect. Creating an
              account is free.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" className="gap-1.5" onClick={() => navigate('/register?view=%2Fmonitors')}>
                <Plus size={14} />
                Create account
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate('/login?view=%2Fmonitors')}>
                Sign in
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/vulnerabilities')}>
                Browse vulnerabilities instead
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export type MonitorsViewMode = 'page' | 'add-host-dialog';

export interface MonitorsViewProps {
  /**
   * - `'page'` (default) — full monitors page: header, host table, dialog.
   * - `'add-host-dialog'` — render ONLY the Add Host Monitor dialog (no
   *   header/table chrome). The dialog opens immediately on mount; closing
   *   it calls `onClose`. Used by the usecase sidebar to embed Add Host
   *   without leaving the current page.
   */
  mode?: MonitorsViewMode;
  /** Called when the dialog closes (only meaningful in dialog modes). */
  onClose?: () => void;
}

const MonitorsView = ({ mode = 'page', onClose }: MonitorsViewProps = {}) => {
  // Page-level metadata is owned by the host wrapper (MonitorsPage), not
  // here — so embedding MonitorsView in dialog mode doesn't clobber the
  // host page's title.
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  if (authLoading) return null;
  if (!isAuthenticated) return mode === 'page' ? <PublicMonitorsView /> : null;
  return <AuthenticatedMonitorsView mode={mode} onClose={onClose} />;
};

const AuthenticatedMonitorsView = ({ mode = 'page', onClose }: MonitorsViewProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [addHostOpen, setAddHostOpen] = useState(false);
  const [addHostStep, setAddHostStep] = useState<'checks' | 'deploy'>('checks');
  const [hostPlatform, setHostPlatform] = useState<'linux' | 'macos' | 'windows'>('linux');
  const [winRunAsAdmin, setWinRunAsAdmin] = useState(true);
  const [installMode, setInstallMode] = useState<'easy' | 'custom'>('easy');
  const [hostChecks, setHostChecks] = useState({
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
  const [sensorPolling, setSensorPolling] = useState(false);
  const [pollingActivated, setPollingActivated] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // GA funnel guards: ensure DETECTED fires once per dialog session, and that
  // DISMISS only fires when the user closed the dialog without success.
  const detectedFiredRef = useRef(false);
  const dialogOpenRef = useRef(false);
  // Auto-create-default guard: when Add Host opens for the first time and the
  // org has zero monitoring groups, we silently spin up "shuffle_sensors" so
  // the user never has to click "+ New group" before deploying. One-shot per
  // page mount — if creation fails the user can still create one manually.
  const autoCreatedDefaultRef = useRef(false);

  // Monitoring groups (from API)
  const [groups, setGroups] = useState<MonitoringGroup[]>([]);
  // Register every host's hostname+arch identity so terminal_session_*
  // keys are stable across the mini popover and the full terminal page.
  useEffect(() => {
    for (const g of groups) {
      for (const h of g.hosts || []) {
        const uuid = (h as any).uuid;
        const hostname = (h as any).hostname;
        if (uuid && hostname) registerHostIdentity(uuid, { hostname, arch: (h as any).arch });
      }
    }
  }, [groups]);
  const [allEnvs, setAllEnvs] = useState<OrbEnvironment[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroupLoading, setCreatingGroupLoading] = useState(false);
  const [syncGroupId, setSyncGroupId] = useState<string>('');
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const toggleSort = (col: string) => {
    if (sortCol === col) {
      if (sortAsc) setSortAsc(false);
      else { setSortCol(null); setSortAsc(true); }
    } else { setSortCol(col); setSortAsc(true); }
  };
  const sortArrow = (col: string) => sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : '';
  const [actionExecuting, setActionExecuting] = useState<Set<string>>(new Set()); // host uuids being acted on
  const [pendingDisableRce, setPendingDisableRce] = useState<null | { actionId: string; actionName: string; hostname: string; groupName: string; hostUuid: string; isPredefined: boolean }>(null);
  const [customAction, setCustomAction] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Hydrate actionHistoryMap from localStorage for a single host (called lazily on popover open)
  const hydrateHost = useCallback((hostUuid: string) => {
    setActionHistoryMap(prev => {
      if ((prev.get(hostUuid) || []).length > 0) return prev;
      try {
        const stored = readStoredSession(hostUuid);
        if (Array.isArray(stored) && stored.length > 0) {
          const next = new Map(prev);
          next.set(hostUuid, stored.map((e: any, i: number) => ({
            entryId: e.entryId || `${e.startedAt || i}-${Math.random().toString(36).slice(2, 8)}`,
            actionName: e.actionName || '',
            status: e.status || 'error',
            startedAt: e.startedAt || 0,
            finishedAt: e.finishedAt,
            executionId: e.executionId,
            authorization: e.authorization,
            actionOutput: e.actionOutput,
            error: e.error,
            hostUuid,
            hostname: '',
            requestBody: {},
          } as ActionDebugEntry)));
          return next;
        }
      } catch { /* ignore */ }
      return prev;
    });
  }, []);

  const getCommandHistory = (hostUuid: string): string[] => {
    try {
      const stored = readStoredSession(hostUuid);
      // Fall back to old cmd_history_ key
      if (!Array.isArray(stored) || stored.length === 0) {
        const old = JSON.parse(localStorage.getItem(`cmd_history_${hostUuid}`) || '[]');
        if (Array.isArray(old) && old.length > 0) return old;
        return [];
      }
      const cmds: string[] = [];
      for (let i = stored.length - 1; i >= 0; i--) {
        if (stored[i]?.actionName) cmds.push(stored[i].actionName);
      }
      return cmds;
    } catch { return []; }
  };
  const pushCommandHistory = (_hostUuid: string, _cmd: string) => {
    // No-op: terminal_session_ is saved by HostTerminalPage and VulnAssetsPage action history
  };

  type ActionDebugEntry = {
    entryId: string;
    hostUuid: string;
    actionName: string;
    hostname: string;
    status: 'sending' | 'polling' | 'success' | 'error';
    requestBody: object;
    responseStatus?: number;
    responseBody?: string;
    startedAt: number;
    finishedAt?: number;
    error?: string;
    executionId?: string;
    authorization?: string;
    /** Parsed output from results[0].result.output */
    actionOutput?: string;
    /** Whether the action result reported success */
    actionSuccess?: boolean;
  };
  const [actionHistoryMap, setActionHistoryMap] = useState<Map<string, ActionDebugEntry[]>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const pollingActiveRef = useRef<Map<string, boolean>>(new Map());

  /** Get the latest (current) debug entry for a host */
  const getLatestDebug = (hostUuid: string): ActionDebugEntry | undefined => {
    const history = actionHistoryMap.get(hostUuid);
    return history?.[history.length - 1];
  };

  const pushHostDebug = (hostUuid: string, entry: ActionDebugEntry) => {
    setActionHistoryMap(prev => {
      const next = new Map(prev);
      const existing = next.get(hostUuid) || [];
      next.set(hostUuid, [...existing, entry]);
      return next;
    });
    // Persist immediately so running commands survive refresh
    try {
      const key = terminalStorageKey(hostUuid);
      const stored = readStoredSession(hostUuid);
      const persistEntry = {
        entryId: entry.entryId,
        actionName: entry.actionName,
        status: entry.status,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt,
        executionId: entry.executionId,
        authorization: entry.authorization,
      };
      const dupIdx = stored.findIndex((e: any) => e?.entryId && e.entryId === entry.entryId);
      if (dupIdx >= 0) stored[dupIdx] = { ...stored[dupIdx], ...persistEntry }; else stored.push(persistEntry);
      if (stored.length > 200) stored.splice(0, stored.length - 200);
      localStorage.setItem(key, JSON.stringify(stored));
    } catch { /* ignore */ }
  };
  const updateHostDebug = (hostUuid: string, targetEntryId: string, update: Partial<ActionDebugEntry>) => {
    setActionHistoryMap(prev => {
      const history = prev.get(hostUuid);
      if (!history || history.length === 0) return prev;
      const idx = history.findIndex(e => e.entryId === targetEntryId);
      if (idx < 0) return prev;
      const next = new Map(prev);
      const latest = { ...history[idx], ...update };
      const updated = [...history];
      updated[idx] = latest;
      next.set(hostUuid, updated);

      // Update the persisted entry in localStorage (was already added on push)
      if (latest.status === 'success' || latest.status === 'error') {
        try {
          const key = terminalStorageKey(hostUuid);
          const stored = readStoredSession(hostUuid);
          const idx = stored.findIndex((e: any) => e.entryId === latest.entryId);
          if (idx >= 0) {
            stored[idx] = { ...stored[idx], status: latest.status, finishedAt: latest.finishedAt, executionId: latest.executionId, authorization: latest.authorization };
          } else {
            stored.push({ entryId: latest.entryId, actionName: latest.actionName, status: latest.status, startedAt: latest.startedAt, finishedAt: latest.finishedAt, executionId: latest.executionId, authorization: latest.authorization });
            if (stored.length > 200) stored.splice(0, stored.length - 200);
          }
          localStorage.setItem(key, JSON.stringify(stored));
        } catch { /* ignore */ }
      }

      return next;
    });
  };

  /** Parse action result from poll data: results[0].result → JSON → output/success/error */
  const parseActionResult = (data: unknown): { success: boolean; output: string | null; error: string | null } => {
    try {
      if (!data || typeof data !== 'object') return { success: true, output: null, error: null };
      const obj = data as Record<string, unknown>;
      const results = obj.results as Array<{ result?: string }> | undefined;
      const firstResult = results?.[0]?.result;
      if (!firstResult || typeof firstResult !== 'string') return { success: true, output: null, error: null };
      const parsed = JSON.parse(firstResult);
      return {
        success: parsed.success !== false,
        output: typeof parsed.output === 'string' ? parsed.output : null,
        error: typeof parsed.error === 'string' ? parsed.error : null,
      };
    } catch {
      return { success: true, output: null, error: null };
    }
  };

  /**
   * Newer remote control runners return the full output directly in a top-level
   * `result` field. Returns null when there is no usable direct result, so the
   * caller falls back to execution_id polling.
   */
  const parseDirectRunResult = (data: unknown): { success: boolean; output: string | null; error: string | null } | null => {
    if (!data || typeof data !== 'object') return null;
    const raw = (data as Record<string, unknown>).result;
    if (raw === undefined || raw === null || raw === '') return null;
    let inner: unknown = raw;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try { inner = JSON.parse(trimmed); } catch { return { success: true, output: trimmed, error: null }; }
    }
    if (!inner || typeof inner !== 'object') return { success: true, output: String(inner), error: null };
    const o = inner as Record<string, unknown>;
    const output =
      typeof o.output === 'string' ? o.output :
      typeof o.result === 'string' ? o.result :
      JSON.stringify(inner, null, 2);
    return { success: o.success !== false, output, error: typeof o.error === 'string' ? o.error : null };
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  // Get host-actionable permissions from defaults
  const hostActionablePerms = DEFAULT_AGENT_PERMISSIONS
    .flatMap(c => c.permissions)
    .filter(p => p.hostActionable && !p.disabled);

  const executeHostAction = async (actionId: string, actionName: string, hostname: string, groupName: string, hostUuid: string, isPredefined = false, skipConfirm = false) => {
    // Confirm gate for the irreversible disable_rce script
    const normalized = (isPredefined ? `script:${actionId}` : actionId).trim().toLowerCase();
    if (!skipConfirm && normalized === 'script:disable_rce') {
      setPendingDisableRce({ actionId, actionName, hostname, groupName, hostUuid, isPredefined });
      return;
    }
    // Set up abort controller
    const controller = new AbortController();
    abortControllersRef.current.set(hostUuid, controller);
    pollingActiveRef.current.set(hostUuid, true);

    setActionExecuting(prev => new Set(prev).add(hostUuid));
    const requestBody = {
      app_id: 'sensors',
      app_name: 'sensors',
      name: 'run_action',
      parameters: [
        { name: 'action', value: isPredefined ? `script:${actionId}` : actionId },
        { name: 'hosts', value: hostname },
        { name: 'sensor_group', value: groupName },
      ],
    };
    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pushHostDebug(hostUuid, {
      entryId,
      hostUuid,
      actionName,
      hostname,
      status: 'sending',
      requestBody,
      startedAt: Date.now(),
    });
    try {
      const resp = await fetch(getApiUrl('/api/v1/apps/sensors/run'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const text = await resp.text().catch(() => '');
      if (!resp.ok) {
        updateHostDebug(hostUuid, entryId, { status: 'error', responseStatus: resp.status, responseBody: text, finishedAt: Date.now(), error: text || `HTTP ${resp.status}` });
        toast.error('Action failed', { description: text || `HTTP ${resp.status}` });
        return;
      }

      // Check if response is an execution stub that needs polling
      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { /* not JSON */ }

      // 1) Preferred: the runner returned the full result directly.
      const direct = parseDirectRunResult(parsed);
      if (direct) {
        updateHostDebug(hostUuid, entryId, {
          status: direct.success ? 'success' : 'error',
          responseStatus: resp.status,
          responseBody: text,
          executionId: (parsed as any)?.execution_id as string | undefined,
          authorization: (parsed as any)?.authorization as string | undefined,
          finishedAt: Date.now(),
          actionOutput: direct.output || undefined,
          actionSuccess: direct.success,
          error: direct.success ? undefined : (direct.error || direct.output || 'Action reported failure'),
        });
        return;
      }

      // 2) Fallback: execution stub → poll /api/v1/streams/results.
      if (
        parsed && typeof parsed === 'object' && parsed !== null &&
        typeof (parsed as Record<string, unknown>).execution_id === 'string' &&
        (parsed as Record<string, unknown>).execution_id
      ) {
        const execId = (parsed as Record<string, unknown>).execution_id as string;
        updateHostDebug(hostUuid, entryId, { status: 'polling', responseStatus: resp.status, responseBody: text, executionId: execId, authorization: ((parsed as any).authorization as string) || execId });

        // Poll streams/results for the real output (30 min timeout)
        const maxAttempts = 900; // 900 * 2s = 30 minutes
        const intervalMs = 2000;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (!pollingActiveRef.current.get(hostUuid)) return;
          // Abortable sleep: resolve early if polling is stopped
          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, intervalMs);
            controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
          });
          if (!pollingActiveRef.current.get(hostUuid)) return;
          try {
            const pollResp = await fetch(getApiUrl('/api/v1/streams/results'), {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
              body: JSON.stringify({ execution_id: execId, authorization: execId }),
              signal: controller.signal,
            });
            if (!pollResp.ok) {
              if (pollResp.status >= 400 && pollResp.status < 500) {
                updateHostDebug(hostUuid, entryId, { status: 'error', responseBody: `Poll error ${pollResp.status}`, finishedAt: Date.now(), error: `HTTP ${pollResp.status}` });
                toast.error('Action failed', { description: `Poll error ${pollResp.status}` });
                return;
              }
              continue;
            }
            const pollText = await pollResp.text();
            if (!pollText || pollText === '{}' || pollText === 'null') continue;

            let pollData: unknown = null;
            try { pollData = JSON.parse(pollText); } catch { /* not JSON */ }

            if (pollData && typeof pollData === 'object') {
              const st = (pollData as Record<string, unknown>).status;
              if (st === 'EXECUTING' || st === 'WAITING') continue;
            }

            // Got a real result — parse results[0].result for output/success/error
            const parsed = parseActionResult(pollData);
            updateHostDebug(hostUuid, entryId, {
              status: parsed.success ? 'success' : 'error',
              responseBody: pollText,
              finishedAt: Date.now(),
              actionOutput: parsed.output || undefined,
              actionSuccess: parsed.success,
              error: parsed.success ? undefined : (parsed.error || parsed.output || 'Action reported failure'),
            });
            // Result + error are already surfaced in the action output panel — no toast needed.
            return;
          } catch {
            if (!pollingActiveRef.current.get(hostUuid)) return;
            continue;
          }
        }
        // Timed out
        if (pollingActiveRef.current.get(hostUuid)) {
          updateHostDebug(hostUuid, entryId, { status: 'error', finishedAt: Date.now(), error: 'Timed out waiting for execution result (30 min).' });
          toast.error('Action timed out', { description: 'No result after 30 minutes.' });
        }
      } else {
        // Immediate result (no execution_id)
        updateHostDebug(hostUuid, entryId, { status: 'success', responseStatus: resp.status, responseBody: text, finishedAt: Date.now() });
      }
    } catch (err) {
      if (!pollingActiveRef.current.get(hostUuid)) return;
      const msg = err instanceof Error ? err.message : 'Request error';
      updateHostDebug(hostUuid, entryId, { status: 'error', finishedAt: Date.now(), error: msg });
      toast.error('Action failed', { description: msg });
    } finally {
      pollingActiveRef.current.delete(hostUuid);
      abortControllersRef.current.delete(hostUuid);
      setActionExecuting(prev => { const next = new Set(prev); next.delete(hostUuid); return next; });
      loadGroups();
    }
  };

  const abortHostAction = (hostUuid: string) => {
    // Immediately stop polling
    pollingActiveRef.current.set(hostUuid, false);
    // Abort any in-flight fetch
    const controller = abortControllersRef.current.get(hostUuid);
    if (controller) controller.abort();
    abortControllersRef.current.delete(hostUuid);

    // Send server-side abort if we have an execution_id
    const debugEntry = getLatestDebug(hostUuid);
    if (debugEntry?.executionId) {
      fetch(getApiUrl(`/api/v1/workflows/${debugEntry.executionId}/executions/${debugEntry.executionId}/abort`), {
        method: 'GET',
        credentials: 'include',
        headers: { ...getAuthHeader() },
      }).catch(() => { /* best effort */ });
    }

    // Immediately update UI
    if (debugEntry?.entryId) {
      updateHostDebug(hostUuid, debugEntry.entryId, { status: 'error', finishedAt: Date.now(), error: 'Aborted by user' });
    }
    // Don't remove from actionExecuting immediately — keep popover open to show debug info.
  };

  // Aggregate all hosts across all sensor groups. Dedup by composite key:
  // hostname + arch + sensor group. UUID alone is unreliable since the same
  // physical host can appear with different uuids across env/sensor records.
  const allHostsRaw = Array.from(
    groups.flatMap(g => g.hosts.map(h => ({ ...h, groupName: g.name, groupId: g.id })))
      .reduce((map, h) => {
        const hostname = (h.hostname || '').toLowerCase().trim();
        const arch = String((h as any).arch || '').toLowerCase().trim();
        const group = String(h.groupId || '').toLowerCase().trim();
        const key = `${hostname}::${arch}::${group}`;
        if (!map.has(key)) map.set(key, h);
        return map;
      }, new Map<string, any>())
      .values()
  );
  const defaultSort = (a: any, b: any) => {
    // Most recent check-in first, then alphabetical hostname
    const ca = a.checkin || 0, cb = b.checkin || 0;
    if (cb !== ca) return cb - ca;
    return (a.hostname || '').localeCompare(b.hostname || '');
  };
  const allHosts = !sortCol ? [...allHostsRaw].sort(defaultSort) : [...allHostsRaw].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'os': cmp = (a.os || '').localeCompare(b.os || ''); break;
      case 'hostname': cmp = (a.hostname || '').localeCompare(b.hostname || ''); break;
      case 'hd': cmp = Number(a.hd_encrypted === true || a.hd_encrypted === 'true') - Number(b.hd_encrypted === true || b.hd_encrypted === 'true'); break;
      case 'screenlock': cmp = Number(a.automatic_screen_lock_enabled === true || a.automatic_screen_lock_enabled === 'true') - Number(b.automatic_screen_lock_enabled === true || b.automatic_screen_lock_enabled === 'true'); break;
      case 'software': cmp = (Array.isArray(a.installed_software) ? a.installed_software.length : 0) - (Array.isArray(b.installed_software) ? b.installed_software.length : 0); break;
      case 'codescan': cmp = (Array.isArray(a.code_scanner) ? a.code_scanner.length : 0) - (Array.isArray(b.code_scanner) ? b.code_scanner.length : 0); break;
      case 'response': cmp = Number(parseResponseActionsState((a as any).response_actions).enabled) - Number(parseResponseActionsState((b as any).response_actions).enabled); break;
      case 'logfwd': cmp = Number(!!a.log_forwarding) - Number(!!b.log_forwarding); break;
      case 'group': cmp = ((a as any).groupName || '').localeCompare((b as any).groupName || ''); break;
      case 'checkin': cmp = (a.checkin || 0) - (b.checkin || 0); break;
    }
    return sortAsc ? cmp : -cmp;
  });


  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setLoadError(null);
    const { groups: fetched, allEnvs: envs, error } = await fetchSensorGroups();
    if (error) {
      setLoadError(error);
    }
    setGroups(fetched);
    setAllEnvs(envs);
    if (fetched.length > 0) {
      setSelectedGroupId(prev => {
        if (prev && fetched.some(g => g.id === prev)) return prev;
        return fetched[0].id;
      });
      // Auto-select sync group: prefer one with a check-in < 10min
      setSyncGroupId(prev => {
        if (prev && fetched.some(g => g.id === prev)) return prev;
        const now = Date.now() / 1000;
        const recent = fetched.find(g => {
          if (g.hosts.length === 0) return false;
          const latest = Math.max(...g.hosts.map(h => h.checkin || 0));
          return (now - latest) < 600;
        });
        return recent ? recent.id : fetched[0].id;
      });
    }
    setGroupsLoading(false);
  }, []);

  // Load groups on mount
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const getDeployCommand = () => {
    const baseUrl = API_CONFIG.baseUrl;
    const parts: string[] = [];
    parts.push(`base_url=${baseUrl}`);
    parts.push('sensor_mode=true');
    if (selectedGroup) {
      parts.push(`queue=${selectedGroup.queue}`);
      if (selectedGroup.org_id) parts.push(`org_id=${selectedGroup.org_id}`);
    }
    parts.push(`software_list_enabled=${hostChecks.installed_software}`);
    parts.push(`hd_encrypted_check=${hostChecks.hd_encrypted}`);
    parts.push(`screenlock_check=${hostChecks.screenlock}`);
    parts.push(`code_scanner_enabled=${hostChecks.code_scanner_enabled}`);
    parts.push(`response_actions=${hostChecks.response_actions ? responseActionMode : 'false'}`);
    parts.push(`log_forwarding=${hostChecks.log_forwarding && logForwardingEndpoint.trim() ? logForwardingEndpoint.trim() : 'false'}`);

    const authHeader = selectedGroup?.auth ? `-H 'Auth: ${selectedGroup.auth}'` : '';
    const downloadUrl = 'https://shuffler.io/api/v1/orborus';

    if (hostPlatform === 'windows') {
      parts.push('os=windows');
      if (!winRunAsAdmin) parts.push('admin=false');
      const headers = selectedGroup?.auth ? `-H "Auth: ${selectedGroup.auth}"` : '';
      const authHeader = selectedGroup?.auth ? ` -Headers @{'Auth'='${selectedGroup.auth}'}` : '';
      return `powershell -ExecutionPolicy Bypass -Command "& {iex (irm '${downloadUrl}?${parts.join('&')}'${authHeader ? ` -Headers @{'Auth'='${selectedGroup?.auth}'}` : ''})}"`.replace(/  +/g, ' ');
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

  // Poll for NEW sensor hosts when on deploy step
  const baselineHostCountRef = useRef<number | null>(null);

  const startSensorPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setSensorDetected(false);
    setSensorPolling(true);

    // Capture baseline host count for the selected group at poll start
    const currentGroup = groups.find(g => g.id === selectedGroupId);
    baselineHostCountRef.current = currentGroup ? currentGroup.hosts.length : 0;

    const checkSensor = async () => {
      try {
        const res = await fetch(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        if (!res.ok) return;
        const envs: OrbEnvironment[] = await res.json();
        const env = envs.find(e => (e.id === selectedGroupId || e.Name === selectedGroup?.name) && e.sensor_group === true);
        if (env) {
          const hosts = Array.isArray(env.sensor_hosts) ? env.sensor_hosts : [];
          const currentHostCount = hosts.length;
          const baseline = baselineHostCountRef.current ?? 0;
          const thirtyMinAgo = Date.now() / 1000 - 30 * 60;

          // Detect new host OR existing host that recently checked in (within 30 min)
          const hasNewHost = currentHostCount > baseline;
          const hasRecentCheckin = hosts.some((h: any) => {
            const lastCheckin = h.last_checkin || h.updated || 0;
            return lastCheckin > thirtyMinAgo;
          });

          if (hasNewHost || hasRecentCheckin) {
            setSensorDetected(true);
            setSensorPolling(false);
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            // GA: success — fire DETECTED exactly once per dialog session.
            if (!detectedFiredRef.current) {
              detectedFiredRef.current = true;
              trackPredefinedEvent(
                GA_EVENTS.MONITOR_ADD_HOST_DETECTED,
                selectedGroup?.name,
                hasNewHost ? currentHostCount - baseline : 0,
              );
            }
          }
        }
      } catch { /* continue polling */ }
    };
    // Don't check immediately — wait one interval so the baseline is stable
    pollRef.current = setInterval(checkSensor, 5000);
  }, [selectedGroupId, selectedGroup?.name, groups]);

  const stopSensorPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setSensorPolling(false);
  }, []);

  // Activate polling after user interaction or 30s timeout
  const activatePolling = useCallback(() => {
    if (!pollingActivated) setPollingActivated(true);
  }, [pollingActivated]);

  // Start 30s auto-activation timer when deploy step opens
  useEffect(() => {
    if (addHostStep === 'deploy' && addHostOpen) {
      activationTimerRef.current = setTimeout(() => {
        setPollingActivated(true);
      }, 30000);
    } else {
      if (activationTimerRef.current) { clearTimeout(activationTimerRef.current); activationTimerRef.current = null; }
      setPollingActivated(false);
    }
    return () => {
      if (activationTimerRef.current) { clearTimeout(activationTimerRef.current); activationTimerRef.current = null; }
    };
  }, [addHostStep, addHostOpen]);

  // Start/stop polling based on activation
  useEffect(() => {
    if (pollingActivated && addHostStep === 'deploy' && addHostOpen) {
      startSensorPolling();
    } else if (!pollingActivated) {
      stopSensorPolling();
    }
    return () => stopSensorPolling();
  }, [pollingActivated, addHostStep, addHostOpen, startSensorPolling, stopSensorPolling]);

  const detectPlatform = (): 'linux' | 'macos' | 'windows' => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return 'windows';
    if (ua.includes('mac')) return 'macos';
    return 'linux';
  };

  const handleOpenAddHost = () => {
    setAddHostStep('checks');
    setHostPlatform(detectPlatform());
    setHostChecks({ hd_encrypted: true, screenlock: true, installed_software: true, code_scanner_enabled: true, response_actions: false, log_forwarding: false });
    setLogForwardingEndpoint('');
    setCopied(false);
    setSensorDetected(false);
    setPollingActivated(false);
    setIsCreatingGroup(false);
    setNewGroupName('');
    setAddHostOpen(true);
    // Reset GA funnel guards for a fresh Add-Host session
    detectedFiredRef.current = false;
    dialogOpenRef.current = true;
    trackPredefinedEvent(GA_EVENTS.MONITOR_ADD_HOST_OPEN);
    loadGroups();
  };

  // GA: when the Add Host dialog closes (manually, ESC, click-outside, or page
  // navigation that unmounts this component), fire DISMISS unless the user
  // actually got a sensor detection. Covers both "closed dialog" and
  // "left page before sensor connected" failure paths.
  useEffect(() => {
    if (addHostOpen) {
      dialogOpenRef.current = true;
      return;
    }
    if (dialogOpenRef.current) {
      dialogOpenRef.current = false;
      if (!detectedFiredRef.current) {
        trackPredefinedEvent(
          GA_EVENTS.MONITOR_ADD_HOST_DISMISS,
          addHostStep, // 'checks' | 'deploy' — tells you how far they got
        );
      }
      // Always re-pull /getenvironments on close so any host that connected
      // (or any group created) while the dialog was open is reflected in the
      // list immediately — no manual Refresh needed.
      loadGroups();
    }
  }, [addHostOpen, addHostStep]);

  // Unmount-time safety net: if the user navigates away with the dialog still
  // open and no detection, count it as a dismissal.
  useEffect(() => {
    return () => {
      if (dialogOpenRef.current && !detectedFiredRef.current) {
        trackPredefinedEvent(GA_EVENTS.MONITOR_ADD_HOST_DISMISS, 'unmount');
      }
    };
  }, []);

  // Auto-open Add Host dialog when ?add_host=true is present in the URL
  // (small delay so users can see the page they navigated to first)
  useEffect(() => {
    if (searchParams.get('add_host') === 'true' && !addHostOpen) {
      const timer = setTimeout(() => {
        handleOpenAddHost();
        const next = new URLSearchParams(searchParams);
        next.delete('add_host');
        setSearchParams(next, { replace: true });
      }, 600);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Dialog-only mode: open Add Host immediately on mount, and propagate
  // close events to the host (e.g. so the usecase sidebar can dismiss the
  // dialog without leaving the current page).
  const dialogOnly = mode === 'add-host-dialog';
  useEffect(() => {
    if (dialogOnly && !addHostOpen) {
      handleOpenAddHost();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOnly]);
  useEffect(() => {
    if (dialogOnly && !addHostOpen && onClose) {
      // Defer so any internal click handlers finish before unmount.
      const t = setTimeout(() => onClose(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [dialogOnly, addHostOpen, onClose]);



  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroupLoading(true);
    const created = await createSensorGroupEnv(newGroupName.trim(), allEnvs);
    if (created) {
      await loadGroups(); // Re-fetch all to stay in sync
      setSelectedGroupId(created.id);
      setIsCreatingGroup(false);
      setNewGroupName('');
      toast.success('Monitoring group created', { description: `Queue "${created.queue}" is ready.` });
    } else {
      toast.error('Failed to create monitoring group');
    }
    setCreatingGroupLoading(false);
  };

  // Auto-create a default "default_monitors" group the first time the Add Host
  // dialog opens on an org with no existing groups. We wait for /getenvironments
  // to finish (`!groupsLoading`) and snapshot via `autoCreatedDefaultRef` so we
  // never POST the same env twice. Errors fall through silently — the user can
  // still hit "+ New group" by hand.
  useEffect(() => {
    if (!addHostOpen) return;
    if (groupsLoading) return;
    if (loadError) return;
    if (groups.length > 0) return;
    if (creatingGroupLoading) return;
    if (autoCreatedDefaultRef.current) return;
    autoCreatedDefaultRef.current = true;
    (async () => {
      setCreatingGroupLoading(true);
      const created = await createSensorGroupEnv('default_monitors', allEnvs);
      if (created) {
        await loadGroups();
        setSelectedGroupId(created.id);
      }
      setCreatingGroupLoading(false);
    })();
  }, [addHostOpen, groupsLoading, loadError, groups.length, creatingGroupLoading, allEnvs, loadGroups]);

  return (
    <div className={dialogOnly ? '' : 'p-6 max-w-[1400px] mx-auto space-y-6'}>
      {!dialogOnly && (<>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            Monitors
            <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">Beta</span>
          </h1>
          <p className="text-sm text-muted-foreground">Monitor host compliance and security posture across your endpoints</p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => loadGroups()} disabled={groupsLoading}>
            <RefreshCw size={14} className={groupsLoading ? 'animate-spin' : ''} />
            Refresh
          </Button>

          {/* Monitoring Group Validator Dropdown — only when groups exist */}
          {groups.length > 0 && (() => {
            const syncGroup = groups.find(g => g.id === syncGroupId) || groups[0];
            const latestCheckin = syncGroup.hosts.length > 0
              ? Math.max(...syncGroup.hosts.map(h => h.checkin || 0))
              : 0;
            const checkinAge = latestCheckin ? (Date.now() / 1000) - latestCheckin : Infinity;
            const status = syncGroup.hosts.length === 0
              ? 'none'
              : checkinAge < 300
                ? 'healthy'
                : checkinAge < 1800
                  ? 'stale'
                  : 'offline';
            const dotColor = status === 'healthy'
              ? 'bg-green-500'
              : status === 'stale'
                ? 'bg-yellow-500'
                : status === 'offline'
                  ? 'bg-destructive'
                  : 'bg-muted-foreground/40';
            const timeAgo = latestCheckin
              ? checkinAge < 60
                ? `${Math.round(checkinAge)}s ago`
                : checkinAge < 3600
                  ? `${Math.round(checkinAge / 60)}m ago`
                  : `${Math.round(checkinAge / 3600)}h ago`
              : '';

            return (
              <Select value={syncGroupId} onValueChange={setSyncGroupId}>
                <SelectTrigger className="w-auto min-w-[180px] h-9 gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                    <span className="text-xs font-medium truncate max-w-[100px]">{syncGroup.name}</span>
                    {timeAgo && (
                      <span className="text-[0.6rem] text-muted-foreground">{timeAgo}</span>
                    )}
                  </div>
                </SelectTrigger>
                <SelectContent align="end">
                  {groups.map(g => {
                    const gLatest = g.hosts.length > 0
                      ? Math.max(...g.hosts.map(h => h.checkin || 0))
                      : 0;
                    const gAge = gLatest ? (Date.now() / 1000) - gLatest : Infinity;
                    const gStatus = g.hosts.length === 0
                      ? 'none'
                      : gAge < 300 ? 'healthy' : gAge < 1800 ? 'stale' : 'offline';
                    const gDot = gStatus === 'healthy'
                      ? 'bg-green-500'
                      : gStatus === 'stale'
                        ? 'bg-yellow-500'
                        : gStatus === 'offline'
                          ? 'bg-destructive'
                          : 'bg-muted-foreground/40';
                    const gLabel = gStatus === 'stale' ? 'Stale' : gStatus === 'offline' ? 'Offline' : gStatus === 'none' ? 'No hosts' : '';
                    const gTime = gLatest
                      ? gAge < 60 ? `${Math.round(gAge)}s` : gAge < 3600 ? `${Math.round(gAge / 60)}m` : `${Math.round(gAge / 3600)}h`
                      : '';
                    return (
                      <SelectItem key={g.id} value={g.id}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${gDot}`} />
                          <span className="text-sm">{g.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {gLabel}{gTime ? ` · ${gTime}` : ''} · {g.hosts.length} host{g.hosts.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            );
          })()}
        </div>
      </div>

      {/* Host Monitors section */}
      {loadError && !groupsLoading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-md border border-destructive/30 bg-destructive/5 text-destructive mb-4">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="text-sm flex-1">{loadError}</span>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => loadGroups()}>
            <RefreshCw size={13} />
            Retry
          </Button>
        </div>
      )}

      {groupsLoading && allHosts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-16 flex flex-col items-center text-center gap-3">
            <Loader2 size={28} className="text-muted-foreground animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Loading monitors…</p>
              <p className="text-xs text-muted-foreground">Fetching monitoring groups, hosts, and supplements.</p>
            </div>
          </div>
        </div>
      ) : allHosts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Laptop size={18} className="text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Host Monitors</h3>
                <p className="text-xs text-muted-foreground">Deploy lightweight monitors on endpoints to check compliance & posture</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleOpenAddHost}>
                <Plus size={14} />
                Add Host
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-0 divide-x divide-border">
            {HOST_OVERVIEW_TILES.map(check => (
              <div key={check.id} className="px-4 py-4 flex flex-col items-center text-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  {check.icon}
                </div>
                <span className="text-xs font-medium text-foreground">{check.label}</span>
                <span className="text-[0.65rem] text-muted-foreground leading-tight">{check.description}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-5 py-16 flex flex-col items-center text-center gap-4">
            <Activity size={36} className="text-muted-foreground/25" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No hosts monitored yet</p>
              <p className="text-xs text-muted-foreground">Deploy a lightweight monitor on an endpoint to start checking compliance and posture.</p>
            </div>
            <Button size="lg" className="gap-2 mt-2" onClick={handleOpenAddHost}>
              <Plus size={16} />
              Add Host
            </Button>
          </div>
        </div>
      ) : (
        <MonitorHostTable hosts={allHosts as any} onRefresh={loadGroups} />
      )}
      </>)}

      {/* Add Host Monitor Dialog */}
      <Dialog open={addHostOpen} onOpenChange={setAddHostOpen}>
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
              {/* Monitoring Group */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <FolderOpen size={13} className="text-muted-foreground" />
                  Monitoring Group
                </Label>
                <p className="text-xs text-muted-foreground">Each monitoring group uses a Runtime Location as the sensor group.</p>
                {!isCreatingGroup ? (
                  <div className="flex gap-2">
                    {groupsLoading ? (
                      <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-muted-foreground">
                        <Loader2 size={13} className="animate-spin" />
                        <span className="text-sm">Loading…</span>
                      </div>
                    ) : groups.length === 0 ? (
                      <div className="flex-1 flex items-center h-9 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground">
                        No groups — create one →
                      </div>
                    ) : (
                      <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select a group" />
                        </SelectTrigger>
                        <SelectContent className="z-[9999]">
                          {groups.map(g => (
                            <SelectItem key={g.id} value={g.id}>
                              <div className="flex items-center gap-2">
                                <span>{g.name}</span>
                                <span className="text-muted-foreground text-xs">({g.queue})</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setIsCreatingGroup(true)} className="shrink-0 gap-1.5">
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
                      <p className="text-[0.65rem] text-muted-foreground">This will create a new Monitoring group with the same name as the queue.</p>
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <Button variant="ghost" size="sm" onClick={() => { setIsCreatingGroup(false); setNewGroupName(''); }}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleCreateGroup} disabled={!newGroupName.trim() || creatingGroupLoading}>
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
                        className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors ${check.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
                      >
                        <Checkbox
                          checked={hostChecks[check.id]}
                          disabled={check.disabled}
                          onCheckedChange={(v) => setHostChecks(prev => ({ ...prev, [check.id]: !!v }))}
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-muted-foreground shrink-0">{check.icon}</span>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-foreground block">{check.label}{check.disabled ? ' (Coming soon)' : ''}</span>
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
                                <TooltipContent side="bottom"><p className="text-xs">Coming soon — Predefined files are downloaded and executed</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${responseActionMode === 'full' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                                    onClick={() => setResponseActionMode('full')}
                                  >
                                    Full Control
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom"><p className="text-xs">Full remote command execution (RCE)</p></TooltipContent>
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
              {selectedGroup && (
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-muted/30">
                  <FolderOpen size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground font-medium">{selectedGroup.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">queue: {selectedGroup.queue}</span>
                </div>
              )}

              {/* Install mode toggle */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Install Method</Label>
                <div className="flex gap-2">
                  {([
                    { value: 'easy' as const, label: 'Easy Install' },
                    { value: 'custom' as const, label: 'Custom Install' },
                  ]).map(m => (
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
                  {([
                    { value: 'linux' as const, label: 'Linux' },
                    { value: 'macos' as const, label: 'macOS' },
                    { value: 'windows' as const, label: 'Windows' },
                  ]).map(p => (
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
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Run as Administrator</Label>
                  <Switch checked={winRunAsAdmin} onCheckedChange={setWinRunAsAdmin} />
                </div>
              )}
              </div>

              {installMode === 'easy' ? (
                <>
                  {/* Easy: one-liner */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Run this on the monitoring targets{hostPlatform === 'windows' ? ' with PowerShell as Administrator' : ''}</Label>
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
                    <p className="text-xs text-muted-foreground">Downloads, configures, and starts the monitor automatically.</p>
                  </div>
                </>
              ) : (
                <>
                  {/* Custom: binary download + env command */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">1. Download the binary</Label>
                    <p className="text-xs text-muted-foreground">
                      Get the latest release from{' '}
                      <a href="https://github.com/Shuffle/orborus/releases" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
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
  if (selectedGroup) {
    flags.push(`--queue=${selectedGroup.queue}`);
    if (selectedGroup.org_id) flags.push(`--org_id=${selectedGroup.org_id}`);
    if (selectedGroup.auth) flags.push(`--auth=${selectedGroup.auth}`);
  }
  flags.push(`--software_list_enabled=${hostChecks.installed_software}`);
  flags.push(`--hd_encrypted_check=${hostChecks.hd_encrypted}`);
  flags.push(`--screenlock_check=${hostChecks.screenlock}`);
  flags.push(`--code_scanner_enabled=${hostChecks.code_scanner_enabled}`);
  if (hostChecks.response_actions) flags.push(`--response_actions=${responseActionMode}`);
  if (hostChecks.log_forwarding && logForwardingEndpoint.trim()) flags.push(`--log_forwarding=${logForwardingEndpoint.trim()}`);
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
                          if (selectedGroup) {
                            flags.push(`--queue=${selectedGroup.queue}`);
                            if (selectedGroup.org_id) flags.push(`--org_id=${selectedGroup.org_id}`);
                            if (selectedGroup.auth) flags.push(`--auth=${selectedGroup.auth}`);
                          }
                          flags.push(`--software_list_enabled=${hostChecks.installed_software}`);
                          flags.push(`--hd_encrypted_check=${hostChecks.hd_encrypted}`);
                          flags.push(`--screenlock_check=${hostChecks.screenlock}`);
                          flags.push(`--code_scanner_enabled=${hostChecks.code_scanner_enabled}`);
                          if (hostChecks.response_actions) flags.push(`--response_actions=${responseActionMode}`);
                          if (hostChecks.log_forwarding && logForwardingEndpoint.trim()) flags.push(`--log_forwarding=${logForwardingEndpoint.trim()}`);
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
                      To keep the monitor running persistently, set up the command above as a service.{' '}
                      {hostPlatform === 'linux' ? (
                        <a href="https://www.freedesktop.org/software/systemd/man/systemd.service.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          systemd docs →
                        </a>
                      ) : hostPlatform === 'macos' ? (
                        <a href="https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          launchd docs →
                        </a>
                      ) : (
                        <a href="https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          Task Scheduler docs →
                        </a>
                      )}
                    </p>
                  </div>
                </>
              )}

              {/* Sensor detection status */}
              {(pollingActivated || sensorDetected) && (
                <div className={`rounded-lg border px-3 py-3 flex items-center gap-3 ${sensorDetected ? 'border-[hsl(var(--severity-low))]/30 bg-[hsl(var(--severity-low))]/[0.06]' : 'border-border bg-muted/30'}`}>
                  {sensorDetected ? (
                    <>
                      <CheckCircle2 size={18} className="text-[hsl(var(--severity-low))] shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Sensor detected!</p>
                        <p className="text-xs text-muted-foreground">A host has checked in and is reporting results to this monitoring group.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Loader2 size={18} className="animate-spin text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Waiting for sensor…</p>
                        <p className="text-xs text-muted-foreground">Run the command on your target host. Once connected, it will run the selected checks and report results back automatically.</p>
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
                disabled={Object.values(hostChecks).every(v => !v) || !selectedGroupId}
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
                  <Button size="sm" onClick={() => { setAddHostOpen(false); toast.success('Host monitor connected', { description: `Sensor active in group "${selectedGroup?.name}".` }); }}>
                    Done
                  </Button>
                )}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <AlertDialog open={!!pendingDisableRce} onOpenChange={(o) => { if (!o) setPendingDisableRce(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Remote Code Execution?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you 100% sure? This will disable RCE on <span className="font-mono text-foreground">{pendingDisableRce?.hostname}</span>.
              You will <strong>not</strong> be able to turn it back on without restarting the agent on the host.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const p = pendingDisableRce;
                setPendingDisableRce(null);
                if (p) executeHostAction(p.actionId, p.actionName, p.hostname, p.groupName, p.hostUuid, p.isPredefined, true);
              }}
            >
              Yes, disable RCE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MonitorsView;
export { MonitorsView };
