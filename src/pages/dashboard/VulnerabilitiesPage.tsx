import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { Box, Typography, Chip, IconButton, Avatar, Tooltip as MuiTooltip } from '@mui/material';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Plus, RefreshCw, Search, Zap, ArrowRight, ArrowUp, ArrowDown, ArrowUpDown, Wrench, Sparkles, AlertTriangle, Globe, LogIn, Loader2, MonitorCheck, Rocket as RocketLaunchIcon } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useVulnerabilities, Vulnerability, VulnSeverity, VulnCategory } from '@/hooks/useVulnerabilities';
import { useAppAuth } from '@/Shuffle-Core/useAppAuth';
import { isVulnScannerApp } from '@/Shuffle-Core/ingestionDetection';
import { askAI } from '@/services/ai';
import { toast } from '@/lib/toast';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsSupport } from '@/hooks/useIsSupport';
import { getApiUrl, getAuthHeader, getShuffleCoreWorkflowUrl } from '@/Shuffle-Core/api';
import { navigateToShuffleCore } from '@/lib/authHandoff';
import { VulnerabilityAutomationBanner } from '@/components/vulnerabilities/VulnerabilityAutomationBanner';
import { VulnerabilityReadinessBanner } from '@/components/vulnerabilities/VulnerabilityReadinessBanner';
import { VulnerabilitySidebar } from '@/components/vulnerabilities/VulnerabilitySidebar';

import { IngestionSourcesRow } from '@/components/ingestion/IngestionSourcesRow';
import { AddVulnerabilityDialog } from '@/components/vulnerabilities/AddVulnerabilityDialog';
import { CategoryAutomationsDialog } from '@shuffleio/shuffle-core';
import { useDatastore } from '@/hooks/useDatastore';
import { DATASTORE_CATEGORIES, CategoryAutomation } from '@/Shuffle-Core/datastore';
import { IconActionButton } from '@/components/common/IconActionButton';
import { useHostMonitorCount } from '@/hooks/useHostMonitorCount';


const SEVERITY_COLORS: Record<VulnSeverity, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  info: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

const SEVERITY_DOT_COLORS: Record<VulnSeverity, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
  info: 'bg-blue-500',
};

const CATEGORY_LABELS: Record<VulnCategory, string> = {
  software_cve: 'Software / CVE',
  user_identity: 'User / Identity',
  cloud_misconfig: 'Cloud Misconfig',
  code_dependency: 'Code / Deps',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  accepted: 'Accepted',
};

const VulnerabilitiesPage = () => {
  usePageMeta({ title: 'Vulnerabilities', description: 'Track and manage vulnerabilities across assets and users' });
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  if (authLoading) return null;
  if (!isAuthenticated) return <PublicVulnerabilitiesView />;
  return <AuthenticatedVulnerabilitiesView />;
};

const PublicVulnerabilitiesView = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const looksLikeId = /^(CVE-|GHSA-|PYSEC-|GO-|RUSTSEC-|MAL-|OSV-)/i.test(trimmed);
  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    navigate(`/vulnerabilities/${encodeURIComponent(trimmed)}`);
  };
  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            Vulnerabilities
            <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">Beta</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Look up any CVE, GHSA, or OSV advisory — public, no sign-in required.
          </p>
        </div>
      </div>

      <form onSubmit={handleLookup} className="rounded-lg border border-border bg-transparent backdrop-blur-md p-5 space-y-3">
        <label htmlFor="vuln-id" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Vulnerability ID
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="vuln-id"
              autoFocus
              placeholder="e.g. CVE-2024-12345 or GHSA-xxxx-xxxx-xxxx"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9 text-sm font-mono"
            />
          </div>
          <Button type="submit" size="sm" className="gap-1.5 h-9" disabled={!trimmed}>
            <ArrowRight size={14} />
            Open
          </Button>
        </div>
        {trimmed && !looksLikeId && (
          <p className="text-[0.7rem] text-muted-foreground">
            Tip: this doesn't look like a standard advisory ID — we'll still try to open it.
          </p>
        )}
        <p className="text-[0.7rem] text-muted-foreground flex items-center gap-1.5">
          <Globe size={11} />
          Powered by the public OSV.dev vulnerability database.
        </p>
      </form>

      <div className="rounded-lg border border-border bg-transparent backdrop-blur-md p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/15 text-primary shrink-0">
            <LogIn size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground mb-0.5">Track vulnerabilities in your environment</p>
            <p className="text-xs text-muted-foreground mb-3">
              Sign in to connect Shuffle to your hosts and see exactly which systems are affected by each advisory.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate('/login?view=%2Fvulnerabilities')}>
                <LogIn size={14} />
                Sign in
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/register')}>
                Create account
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const VULN_FILTERS_STORAGE_KEY = 'vulnerabilities-list-filters';

const loadStoredFilters = (): Record<string, unknown> => {
  try {
    const raw = localStorage.getItem(VULN_FILTERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const AuthenticatedVulnerabilitiesView = () => {
  const isAdmin = useIsAdmin();
  const isSupport = useIsSupport();
  const stored = useState(loadStoredFilters)[0];
  const [searchQuery, setSearchQuery] = useState<string>(typeof stored.searchQuery === 'string' ? stored.searchQuery : '');
  const [severityFilter, setSeverityFilter] = useState<string>(typeof stored.severityFilter === 'string' ? stored.severityFilter : 'all');
  const [categoryFilter, setCategoryFilter] = useState<string>(typeof stored.categoryFilter === 'string' ? stored.categoryFilter : 'all');
  const [statusFilter, setStatusFilter] = useState<string>(typeof stored.statusFilter === 'string' ? stored.statusFilter : 'open');
  const [sourceFilter, setSourceFilter] = useState<string>(typeof stored.sourceFilter === 'string' ? stored.sourceFilter : 'all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(typeof stored.dateFrom === 'string' ? new Date(stored.dateFrom) : undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(typeof stored.dateTo === 'string' ? new Date(stored.dateTo) : undefined);
  const [sortKey, setSortKey] = useState<SortKey>(typeof stored.sortKey === 'string' ? (stored.sortKey as SortKey) : 'severity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(stored.sortDir === 'desc' ? 'desc' : 'asc');

  useEffect(() => {
    try {
      localStorage.setItem(VULN_FILTERS_STORAGE_KEY, JSON.stringify({
        searchQuery,
        severityFilter,
        categoryFilter,
        statusFilter,
        sourceFilter,
        dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
        dateTo: dateTo ? dateTo.toISOString() : undefined,
        sortKey,
        sortDir,
      }));
    } catch {
      // ignore quota errors
    }
  }, [searchQuery, severityFilter, categoryFilter, statusFilter, sourceFilter, dateFrom, dateTo, sortKey, sortDir]);

  const [aiScanOpen, setAiScanOpen] = useState(false);
  const [aiScanLoading, setAiScanLoading] = useState(false);
  const [aiScanResult, setAiScanResult] = useState<string | null>(null);
  const [addVulnOpen, setAddVulnOpen] = useState(false);

  const [automationsDialogOpen, setAutomationsDialogOpen] = useState(false);
  const [categoryAutomations, setCategoryAutomations] = useState<CategoryAutomation[]>([]);
  const { categoryConfig } = useDatastore({ category: DATASTORE_CATEGORIES.VULNERABILITIES });
  useEffect(() => {
    if (categoryConfig?.automations) setCategoryAutomations(categoryConfig.automations);
  }, [categoryConfig]);

  const navigate = useNavigate();


  const { vulnerabilities, severityCounts, isLoading, isRefreshing, refresh } = useVulnerabilities();
  const { authenticatedApps } = useAppAuth();
  const hostMonitorCount = useHostMonitorCount();
  const hasHostMonitors = (hostMonitorCount ?? 0) >= 1;

  // Filter connected vuln scanner apps
  const connectedScanners = (authenticatedApps || []).filter(a => a.app?.name && isVulnScannerApp(a.app.name) && (a.active || a.validation?.valid));

  // Filtered vulnerabilities
  const filtered = vulnerabilities.filter(v => {
    if (searchQuery && !v.title.toLowerCase().includes(searchQuery.toLowerCase()) && !v.asset_name?.toLowerCase().includes(searchQuery.toLowerCase()) && !v.cve_id?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (severityFilter !== 'all' && v.severity !== severityFilter) return false;
    if (categoryFilter !== 'all' && v.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    if (sourceFilter !== 'all' && (v.source || '') !== sourceFilter) return false;
    if (dateFrom || dateTo) {
      const ts = v.first_seen ? new Date(v.first_seen).getTime() : 0;
      if (!ts) return false;
      if (dateFrom && ts < new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate()).getTime()) return false;
      if (dateTo && ts > new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999).getTime()) return false;
    }
    return true;

  });


  const handleAiScan = useCallback(async () => {
    setAiScanLoading(true);
    setAiScanResult(null);
    setAiScanOpen(true);
    try {
      const resp = await askAI({
        query: 'Analyze my connected apps and infrastructure for potential vulnerabilities, misconfigurations, and identity issues. List each finding with severity (critical/high/medium/low), affected asset or user, and a short description. Format as a numbered list.',
      });
      if (resp.success && resp.result) {
        setAiScanResult(resp.result);
      } else {
        setAiScanResult(`AI scan failed: ${resp.error || 'Unknown error'}`);
      }
    } catch (err) {
      setAiScanResult('AI scan failed. Please try again.');
    } finally {
      setAiScanLoading(false);
    }
  }, []);

  const handleRemediate = () => {
    toast.info('Remediation workflows coming soon', {
      description: 'Automated remediation will let you run code on target machines to fix vulnerabilities.',
    });
  };


  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Vulnerability Automation */}
      <VulnerabilityAutomationBanner />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            Vulnerabilities
            <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">Beta</span>
          </h1>
          <p className="text-sm text-muted-foreground">Track and manage vulnerabilities across your assets and users</p>
        </div>
        <div className="flex items-center gap-2">
          <IngestionSourcesRow
            workflowLabel="Ingest Vulnerabilities"
            category="vulnerabilities"
            webhookLabel="vulnerabilities_webhook"
            webhookWorkflowName="Vulnerabilities Webhook"
            titleTooltip="Apps with authentication appear here. Verified apps show in green, unverified in yellow. Toggle them to control which tools automatically pull in vulnerabilities."
            addSubtitle="Search and authenticate vulnerability scanners and security tools to ingest from"
            searchPriorityQuery="vulnerability scanner cve snyk qualys tenable rapid7 trivy"
            onSourcesChanged={() => refresh()}
            afterWebhook={
              <MuiTooltip title="Add Host Monitor" placement="top" arrow>
                <IconButton
                  size="small"
                  onClick={() => navigate('/monitors?add_host=true')}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: hasHostMonitors ? 'hsl(var(--border))' : 'hsl(var(--primary))',
                    color: hasHostMonitors ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))',
                    bgcolor: hasHostMonitors ? 'transparent' : 'hsl(var(--primary) / 0.12)',
                    '&:hover': {
                      bgcolor: 'hsl(var(--primary) / 0.18)',
                      color: 'hsl(var(--primary))',
                    },
                  }}
                >
                  <MonitorCheck size={16} />
                </IconButton>
              </MuiTooltip>
            }
          />
          <IconActionButton
            tone="success"
            active={!!categoryAutomations?.some(a => a.enabled)}
            tooltip={(() => {
              const workflowAuto = categoryAutomations?.find(a => a.type === 'workflow' && a.enabled);
              const wfId = workflowAuto?.options?.find(o => o.key === 'workflow_id')?.value?.split(',')[0]?.trim();
              return wfId ? 'Click to open automation workflow' : 'Automation for Vulnerabilities';
            })()}
            onClick={async () => {
              const workflowAuto = categoryAutomations?.find(a => a.type === 'workflow' && a.enabled);
              const wfId = workflowAuto?.options?.find(o => o.key === 'workflow_id')?.value?.split(',')[0]?.trim();
              if (wfId) {
                await navigateToShuffleCore(getShuffleCoreWorkflowUrl(wfId), { newTab: true });
              } else {
                setAutomationsDialogOpen(true);
              }
            }}
          >
            <RocketLaunchIcon size={16} />
          </IconActionButton>
          <IconActionButton tooltip="Refresh" onClick={() => refresh()} disabled={isRefreshing}>
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </IconActionButton>
          <IconActionButton tooltip="Add Vulnerability" onClick={() => setAddVulnOpen(true)}>
            <Plus size={16} />
          </IconActionButton>
        </div>
      </div>






      {/* Main content + sidebar */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 320px' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {vulnerabilities.length > 0 || isLoading ? (
            <VulnTable
              vulnerabilities={filtered}
              isLoading={isLoading}
              onRemediate={handleRemediate}
              emptyIcon={<Shield size={48} className="text-muted-foreground/50 mx-auto mb-4" />}
              emptyTitle="No vulnerabilities found"
              emptyDescription="Connect a vulnerability scanner or sync from a package page to populate this list."
              sortKey={sortKey}
              sortDir={sortDir}
              onSortKeyChange={setSortKey}
              onSortDirChange={setSortDir}
              severityFilter={severityFilter}
              categoryFilter={categoryFilter}
              statusFilter={statusFilter}
              sourceFilter={sourceFilter}
              onSeverityChange={setSeverityFilter}
              onCategoryChange={setCategoryFilter}
              onStatusChange={setStatusFilter}
              onSourceChange={setSourceFilter}
            />
          ) : (
            <div className="rounded-lg border border-border bg-transparent backdrop-blur-md p-12 text-center">
              <Shield size={48} className="text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-base font-medium text-foreground mb-1">No vulnerability data yet</h3>
              <p className="text-sm text-muted-foreground mb-1 max-w-md mx-auto">
                Connect a source to start ingesting vulnerability data.
              </p>
              <p className="text-xs text-muted-foreground/70 mb-4 max-w-sm mx-auto">
                Supported: VMS tools (Qualys, Tenable, Rapid7), GitHub, Docker, Asset &amp; IAM platforms
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/monitors?add_host=true')}>
                <Plus size={14} />
                Add Source
              </Button>
            </div>
          )}
        </Box>

        <VulnerabilitySidebar
          vulnerabilities={vulnerabilities}
          severityFilter={severityFilter}
          onSeverityChange={setSeverityFilter}
          severityCounts={severityCounts as unknown as Record<string, number>}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          readiness={<VulnerabilityReadinessBanner />}
        />

      </Box>


      <AddVulnerabilityDialog
        open={addVulnOpen}
        onOpenChange={setAddVulnOpen}
        onAdded={() => refresh()}
      />

      <CategoryAutomationsDialog
        open={automationsDialogOpen}
        onClose={() => setAutomationsDialogOpen(false)}
        category={DATASTORE_CATEGORIES.VULNERABILITIES}
        automations={categoryAutomations}
        onAutomationsChange={setCategoryAutomations}
        initialSettings={categoryConfig?.settings}
        entityLabel={{ singular: 'vulnerability', plural: 'vulnerabilities' }}
      />
    </div>
  );
};

// --- VulnTable sub-component ---

interface VulnTableProps {
  vulnerabilities: Vulnerability[];
  isLoading: boolean;
  onRemediate: () => void;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSortKeyChange: (k: SortKey) => void;
  onSortDirChange: (d: 'asc' | 'desc') => void;
  severityFilter: string;
  categoryFilter: string;
  statusFilter: string;
  sourceFilter: string;
  onSeverityChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onSourceChange: (v: string) => void;
}

const SEVERITY_ORDER: Record<VulnSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

type SortKey = 'severity' | 'title' | 'category' | 'source' | 'status' | 'first_seen';

const VulnTable = ({
  vulnerabilities,
  isLoading,
  onRemediate,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  sortKey,
  sortDir,
  onSortKeyChange,
  onSortDirChange,
  severityFilter,
  categoryFilter,
  statusFilter,
  sourceFilter,
  onSeverityChange,
  onCategoryChange,
  onStatusChange,
  onSourceChange,
}: VulnTableProps) => {
  const navigate = useNavigate();

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      onSortDirChange(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSortKeyChange(key);
      onSortDirChange('asc');
    }
  };

  /** Click a cell value to filter by it; click again to clear. */
  const FilterCellButton = ({
    label,
    active,
    onToggle,
    className,
  }: { label: string; active: boolean; onToggle: () => void; className?: string }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={active ? 'Clear this filter' : `Filter by ${label}`}
      className={`text-left rounded px-1 -mx-1 transition-colors hover:bg-muted/50 hover:text-foreground ${active ? 'text-foreground font-medium' : ''} ${className || ''}`}
    >
      {label}
    </button>
  );



  const sorted = [...vulnerabilities].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'severity') {
      cmp = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    } else if (sortKey === 'first_seen') {
      cmp = (a.first_seen ? new Date(a.first_seen).getTime() : 0) - (b.first_seen ? new Date(b.first_seen).getTime() : 0);
    } else if (sortKey === 'title') {
      cmp = (a.title || '').localeCompare(b.title || '');
    } else if (sortKey === 'category') {
      cmp = (CATEGORY_LABELS[a.category] || a.category || '').localeCompare(CATEGORY_LABELS[b.category] || b.category || '');
    } else if (sortKey === 'source') {
      cmp = (a.source || '').localeCompare(b.source || '');
    } else if (sortKey === 'status') {
      cmp = (STATUS_LABELS[a.status] || a.status || '').localeCompare(STATUS_LABELS[b.status] || b.status || '');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortHead = ({ label, sortKeyValue, className }: { label: string; sortKeyValue: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(sortKeyValue)}
        className="inline-flex items-center gap-1 text-inherit hover:text-foreground transition-colors"
      >
        {label}
        {sortKey === sortKeyValue ? (
          sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        ) : (
          <ArrowUpDown size={12} className="opacity-30" />
        )}
      </button>
    </TableHead>
  );
  const openDetail = (id: string, e?: React.MouseEvent) => {
    // Strip "::hostname" expansion suffix to get the canonical OSV id used as datastore key.
    const baseId = String(id).split('::')[0];
    const url = `/vulnerabilities/${encodeURIComponent(baseId)}`;
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) { window.open(url, '_blank'); return; }
    navigate(url);
  };
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-transparent backdrop-blur-md p-12 text-center">
        <RefreshCw size={24} className="animate-spin text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Loading vulnerabilities...</p>
      </div>
    );
  }

  if (vulnerabilities.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-transparent backdrop-blur-md p-12 text-center">
        {emptyIcon}
        <h3 className="text-base font-medium text-foreground mb-1">{emptyTitle}</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">{emptyDescription}</p>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus size={14} />
          Connect Scanner
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-transparent backdrop-blur-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="Severity" sortKeyValue="severity" className="w-[100px]" />
            <SortHead label="Title" sortKeyValue="title" />
            <SortHead label="Category" sortKeyValue="category" className="w-[140px]" />
            <SortHead label="Source" sortKeyValue="source" className="w-[110px]" />
            <SortHead label="Status" sortKeyValue="status" className="w-[100px]" />
            <SortHead label="First Seen" sortKeyValue="first_seen" className="w-[110px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(vuln => (
            <TableRow
              key={vuln.id}
              className="cursor-pointer hover:bg-muted/30"
              onClick={(e) => openDetail(vuln.id, e)}
              onAuxClick={(e) => e.button === 1 && window.open(`/vulnerabilities/${encodeURIComponent(String(vuln.id).split('::')[0])}`, '_blank')}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onSeverityChange(severityFilter === vuln.severity ? 'all' : vuln.severity)}
                  title={severityFilter === vuln.severity ? 'Clear this filter' : `Filter by ${vuln.severity}`}
                >
                  <Badge variant="outline" className={`text-xs capitalize cursor-pointer ${SEVERITY_COLORS[vuln.severity]} ${severityFilter === vuln.severity ? 'ring-1 ring-current' : ''}`}>
                    {vuln.severity}
                  </Badge>
                </button>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{vuln.title}</span>
                  {vuln.cve_id && <span className="text-xs text-muted-foreground font-mono">{vuln.cve_id}</span>}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <FilterCellButton
                  label={CATEGORY_LABELS[vuln.category] || vuln.category}
                  active={categoryFilter === vuln.category}
                  onToggle={() => onCategoryChange(categoryFilter === vuln.category ? 'all' : vuln.category)}
                />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {vuln.source ? (
                  <FilterCellButton
                    label={vuln.source}
                    active={sourceFilter === vuln.source}
                    onToggle={() => onSourceChange(sourceFilter === vuln.source ? 'all' : (vuln.source as string))}
                  />
                ) : '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <FilterCellButton
                  label={STATUS_LABELS[vuln.status] || vuln.status}
                  active={statusFilter === vuln.status}
                  onToggle={() => onStatusChange(statusFilter === vuln.status ? 'all' : vuln.status)}
                />
              </TableCell>

              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {vuln.first_seen ? new Date(vuln.first_seen).toLocaleDateString() : '—'}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>

      </Table>
    </div>
  );
};

export default VulnerabilitiesPage;
