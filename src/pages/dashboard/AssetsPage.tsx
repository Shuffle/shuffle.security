import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { Search, Plus, RefreshCw, Trash2, MonitorSmartphone, Server, Monitor, Smartphone, Laptop, Tablet, Wifi, HardDrive, Network } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useMultiDatastore } from '@/hooks/useMultiDatastore';
import { setDatastoreItem, deleteDatastoreItem, DatastoreItem } from '@/Shuffle-MCPs/datastore';
import { ASSET_CATEGORIES, ASSET_CATEGORY_BY_ID, LEGACY_ASSETS_KEY, AssetCategory } from '@/config/assetCategories';
import { CreateAssetDialog } from '@/components/assets/CreateAssetDialog';
import { OCSFDeviceInventory, DEVICE_TYPES, RISK_LEVELS } from '@/config/ocsfAssetSchema';
import { HostDetailPanel } from '@/components/monitors/HostDetailPanel';
import { MonitorHostTable } from '@/components/monitors/MonitorHostTable';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useParams, useNavigate } from '@/lib/router-compat';

// ── Helpers ─────────────────────────────────────────────────────────────────
const DEFAULT_TAB = 'mobile';
const SENSORS_KEY = 'shuffle-security_sensors';

const deviceIcon = (typeId: number, size = 18) => {
  switch (typeId) {
    case 1: return <Server size={size} />;
    case 2: return <Monitor size={size} />;
    case 3: return <Laptop size={size} />;
    case 4: return <Tablet size={size} />;
    case 5: return <Smartphone size={size} />;
    case 6: return <HardDrive size={size} />;
    case 9: case 10: case 11: case 12: case 13: case 14: case 15:
      return <Wifi size={size} />;
    default: return <MonitorSmartphone size={size} />;
  }
};

const riskColor = (id?: number): 'default' | 'info' | 'success' | 'warning' | 'error' => {
  switch (id) {
    case 4: return 'error';
    case 3: case 2: return 'warning';
    case 1: return 'success';
    default: return 'default';
  }
};

interface ParsedAsset {
  key: string;
  categoryId: string;
  raw: unknown;
  // Best-effort normalized fields for the unified table
  name: string;
  identifier?: string; // IP, ARN, region, repo URL, etc.
  type?: string;
  risk?: string;
  riskId?: number;
  owner?: string;
  lastSeen?: string;
  createdTs: number;
  // OCSF device passthrough (only present for endpoints/mobile/compute)
  device?: OCSFDeviceInventory;
}

const parseItem = (item: DatastoreItem, category: AssetCategory): ParsedAsset | null => {
  let value: Record<string, unknown> = {};
  try {
    const v = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
    value = (v && typeof v === 'object') ? (v as Record<string, unknown>) : { raw: v };
  } catch {
    // Non-JSON string — keep as raw so we still surface the entry instead of dropping it.
    value = { raw: item.value };
  }

  // OCSF device shape
  const device = value as unknown as OCSFDeviceInventory;
  const isDevice = typeof device.hostname === 'string';

  const name =
    (device.hostname as string) ||
    (value.name as string) ||
    (value.title as string) ||
    (value.id as string) ||
    item.key;

  const identifier =
    (device.ip as string) ||
    (value.arn as string) ||
    (value.url as string) ||
    (value.email as string) ||
    (value.region as string) ||
    (value.uid as string) ||
    undefined;

  const createdTs = (device.created_time)
    ? new Date(device.created_time).getTime()
    : (item.created ? item.created * 1000 : 0);

  return {
    key: item.key,
    categoryId: category.id,
    raw: value,
    name,
    identifier,
    type: device.type || (value.type as string) || (value.kind as string),
    risk: device.risk_level || (value.risk_level as string),
    riskId: device.risk_level_id,
    owner: device.owner?.name || device.owner?.email || (value.owner as string),
    lastSeen: device.last_seen_time || (value.last_seen as string),
    createdTs,
    device: isDevice ? device : undefined,
  };
};

const AssetsPage = () => {
  usePageMeta({ title: 'Assets', description: 'Unified inventory across endpoints, cloud, identity, and code' });

  const { tab: tabParam } = useParams();
  const navigate = useNavigate();

  // URL <-> tab mapping. Supports aliases like computer/computers, containers, users, etc.
  const slugToTab = useMemo(() => {
    const map: Record<string, string> = {
      users: 'identity_users',
      user: 'identity_users',
      endpoints: 'mobile',
      endpoint: 'mobile',
      computer: 'compute',
      computers: 'compute',
      container: 'containers',
    };
    ASSET_CATEGORIES.forEach(c => { map[c.id] = c.id; });
    return map;
  }, []);
  const tabToSlug = useCallback((id: string) => (id === 'identity_users' ? 'users' : id), []);

  const activeTab = slugToTab[(tabParam || '').toLowerCase()] || DEFAULT_TAB;
  const setActiveTab = useCallback((id: string) => {
    navigate(`/assets/${tabToSlug(id)}`);
  }, [navigate, tabToSlug]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ParsedAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { states, fetchKey, refetch } = useMultiDatastore();

  // Lazily fetch only the active tab. The mobile tab also pulls the legacy
  // `shuffle-security_assets` key so existing devices keep showing up.
  useEffect(() => {
    const cat = ASSET_CATEGORY_BY_ID[activeTab];
    if (cat) fetchKey(cat.datastoreKey);
    if (activeTab === 'mobile') {
      fetchKey(LEGACY_ASSETS_KEY);
      fetchKey(SENSORS_KEY);
    }
  }, [activeTab, fetchKey]);

  // Parse sensors (host monitors) for the mobile tab — fed straight into HostDetailPanel.
  const sensorHosts = useMemo(() => {
    if (activeTab !== 'mobile') return [];
    const items = states[SENSORS_KEY]?.items || [];
    return items
      .map(it => {
        try {
          const v = typeof it.value === 'string' ? JSON.parse(it.value) : it.value;
          if (!v || typeof v !== 'object') return null;
          return { key: it.key, host: v as Record<string, unknown> };
        } catch { return null; }
      })
      .filter(Boolean) as { key: string; host: Record<string, unknown> }[];
  }, [activeTab, states]);

  const [expandedSensors, setExpandedSensors] = useState<Set<string>>(new Set());
  const toggleSensor = useCallback((k: string) => {
    setExpandedSensors(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  // Parse only what's loaded for the active tab
  const visibleAssets = useMemo(() => {
    const cat = ASSET_CATEGORY_BY_ID[activeTab];
    if (!cat) return [];
    const items: DatastoreItem[] = [...(states[cat.datastoreKey]?.items || [])];
    if (activeTab === 'mobile') {
      const legacy = states[LEGACY_ASSETS_KEY]?.items || [];
      const seen = new Set(items.map(i => i.key));
      legacy.forEach(i => { if (!seen.has(i.key)) items.push(i); });
    }
    const parsed = items.map(it => parseItem(it, cat)).filter(Boolean) as ParsedAsset[];
    parsed.sort((a, b) => b.createdTs - a.createdTs);
    if (!search.trim()) return parsed;
    const q = search.toLowerCase();
    return parsed.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.identifier?.toLowerCase().includes(q) ||
      a.type?.toLowerCase().includes(q) ||
      a.owner?.toLowerCase().includes(q),
    );
  }, [activeTab, states, search]);

  const activeCount = visibleAssets.length;

  const handleCreateAsset = useCallback(async (asset: OCSFDeviceInventory) => {
    const key = asset.metadata?.uid || asset.uid || `asset-${Date.now()}`;
    // Route by active tab.
    const targetKey =
      ASSET_CATEGORY_BY_ID[activeTab]?.datastoreKey ||
      (asset.type_id === 1 ? ASSET_CATEGORY_BY_ID.compute.datastoreKey : ASSET_CATEGORY_BY_ID.mobile.datastoreKey);

    const res = await setDatastoreItem(key, JSON.stringify(asset), targetKey);
    if (res.success) {
      const label = activeTab === 'identity_users' ? 'User added' : 'Asset added';
      toast.success(label, { description: asset.hostname });
      await refetch(targetKey);
    } else {
      toast.error(activeTab === 'identity_users' ? 'Failed to add user' : 'Failed to add asset');
    }
  }, [refetch, activeTab]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const cat = ASSET_CATEGORY_BY_ID[deleteTarget.categoryId];
    if (!cat) return;
    setDeleting(true);
    let res = await deleteDatastoreItem(deleteTarget.key, cat.datastoreKey);
    // Legacy mobile records live in the old shared assets key.
    if (!res.success && deleteTarget.categoryId === 'mobile') {
      res = await deleteDatastoreItem(deleteTarget.key, LEGACY_ASSETS_KEY);
    }
    setDeleting(false);
    if (res.success) {
      toast.success(deleteTarget.categoryId === 'identity_users' ? 'User deleted' : 'Asset deleted', { description: deleteTarget.name });
      setDeleteTarget(null);
      await refetch(cat.datastoreKey);
      if (deleteTarget.categoryId === 'mobile') await refetch(LEGACY_ASSETS_KEY);
    } else {
      toast.error('Failed to delete', { description: res.error });
    }
  }, [deleteTarget, refetch]);

  const formatTime = (ts?: string) => {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const activeCategory: AssetCategory | null = ASSET_CATEGORY_BY_ID[activeTab] || null;
  const ActiveIcon = activeCategory?.icon;
  const activeState = activeCategory ? states[activeCategory.datastoreKey] : undefined;
  const activeLoading = !!activeState?.isLoading || (activeTab === 'mobile' && !!states[LEGACY_ASSETS_KEY]?.isLoading);

  const handleRefreshActive = useCallback(() => {
    if (!activeCategory) return;
    refetch(activeCategory.datastoreKey);
    if (activeTab === 'mobile') {
      refetch(LEGACY_ASSETS_KEY);
      refetch(SENSORS_KEY);
    }
  }, [activeCategory, activeTab, refetch]);

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, width: '100%', mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1.2 }}>Assets</Typography>
            <Chip
              label="Beta"
              size="small"
              sx={{
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 22,
                color: 'hsl(var(--primary))',
                backgroundColor: 'hsl(var(--primary) / 0.1)',
                border: '1px solid hsl(var(--primary) / 0.25)',
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Unified inventory across endpoints, cloud, identity, and code
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={handleRefreshActive} sx={{ height: 36, width: 36 }}>
              <RefreshCw size={16} />
            </IconButton>
          </Tooltip>
          <Button variant="contained" size="small" startIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)} sx={{ height: 36 }}>
            {activeTab === 'identity_users' ? 'Add User' : 'Add Asset'}
          </Button>
        </Box>
      </Box>

      {/* Cross-correlation blurb */}
      <Card
        variant="outlined"
        sx={{
          mb: 3,
          p: 2,
          bgcolor: 'action.hover',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
        }}
      >
        <Network size={20} className="text-primary mt-0.5 shrink-0" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.25 }}>
            Cross-Asset Correlation
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Assets across endpoints, cloud infrastructure, identities, and code repositories are cross-correlated in real time with vulnerability discoveries, host telemetry, and security alerts. This contextual fabric links affected hosts, users, and resources directly to active incidents for automated investigation and containment.
          </Typography>
        </Box>
      </Card>

      {/* Category tabs */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          slotProps={{ scrollButtons: { sx: { '&.Mui-disabled': { width: 0, display: 'none' } } } }}
          sx={{
            minHeight: 40,
            '& .MuiTabs-flexContainer': { gap: 0 },
            '& .MuiTabs-scrollButtons.Mui-disabled': { width: 0, display: 'none' },
            '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontSize: '0.8rem', py: 1, px: 1.5 },
            '& .MuiTab-root:first-of-type': { pl: 0 },
          }}
        >
          {ASSET_CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const state = states[cat.datastoreKey];
            const loading = state?.isLoading;
            const count = state?.hasFetched ? state.items.length : null;
            return (
              <Tab
                key={cat.id}
                value={cat.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {loading ? <CircularProgress size={12} /> : <Icon size={14} />}
                    <span>{cat.short}</span>
                    {count != null && (
                      <Chip
                        label={count}
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                      />
                    )}
                  </Box>
                }
              />
            );
          })}
        </Tabs>
      </Box>

      {/* Active category description */}
      {activeCategory && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, color: 'text.secondary' }}>
          {ActiveIcon && <ActiveIcon size={14} />}
          <Typography variant="caption">{activeCategory.description}</Typography>
          {activeState?.error && (
            <Tooltip
              title={
                <Box sx={{ maxWidth: 360 }}>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
                    Failed to load <code>{activeCategory.datastoreKey}</code>
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {activeState.error}
                  </Typography>
                </Box>
              }
              arrow
            >
              <Chip
                label="Source error"
                size="small"
                color="error"
                sx={{ height: 18, fontSize: '0.65rem', cursor: 'help' }}
              />
            </Tooltip>
          )}
        </Box>
      )}

      {/* Search */}
      <Box sx={{ mb: 3 }}>
        <TextField
          size="small"
          fullWidth
          placeholder={`Search ${activeCategory?.label.toLowerCase() || 'assets'}…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><Search size={16} /></InputAdornment>
            ),
          }}
          sx={{ maxWidth: 480 }}
        />
      </Box>

      {/* Sensors (host monitors) — only on the Mobile/Endpoints tab. Same list UI as /monitors. */}
      {activeTab === 'mobile' && sensorHosts.length > 0 && (() => {
        const q = search.trim().toLowerCase();
        const filtered = q
          ? sensorHosts.filter(({ host }) =>
              String(host.hostname || '').toLowerCase().includes(q) ||
              String(host.os || '').toLowerCase().includes(q) ||
              String(host.serial || '').toLowerCase().includes(q),
            )
          : sensorHosts;
        return (
          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Host Monitors</Typography>
              <Chip label={filtered.length} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                from <code>{SENSORS_KEY}</code>
              </Typography>
            </Box>
            <MonitorHostTable hosts={filtered.map(s => s.host as any)} hideHeader={true} />
          </Box>
        );
      })()}


      {activeLoading && visibleAssets.length === 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={32} />
        </Box>
      )}

      {/* Empty */}
      {!activeLoading && visibleAssets.length === 0 && (
        <Card variant="outlined" sx={{ textAlign: 'center', py: 8 }}>
          <CardContent>
            {activeCategory ? (
              <>
                {ActiveIcon && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2, color: 'text.secondary' }}>
                    <ActiveIcon size={42} />
                  </Box>
                )}
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                  No {activeCategory.short.toLowerCase()} yet
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  Connect a source or push records to <code>{activeCategory.datastoreKey}</code>.
                </Typography>
              </>
            ) : (
              <>
                <MonitorSmartphone size={42} className="text-muted-foreground mb-3" />
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>No assets yet</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  Add devices manually or let host monitors auto-register them.
                </Typography>
              </>
            )}
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
              {activeTab === 'identity_users' ? 'Add User' : 'Add Asset'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Asset list */}
      {visibleAssets.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Header row */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '40px 1.6fr 1fr 0.9fr 0.8fr 0.9fr 1fr 44px',
              gap: 1,
              px: 2,
              py: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <span />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Name</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Identifier</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Type
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Risk</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Owner</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Last Seen</Typography>
            <span />
          </Box>

          {visibleAssets.map(asset => {
            const cat = ASSET_CATEGORY_BY_ID[asset.categoryId];
            const CatIcon = cat?.icon || MonitorSmartphone;
            const showCategory = false;
            return (
              <Card
                key={`${asset.categoryId}:${asset.key}`}
                variant="outlined"
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.15s',
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1.6fr 1fr 0.9fr 0.8fr 0.9fr 1fr 44px',
                    gap: 1,
                    px: 2,
                    py: 1.5,
                    alignItems: 'center',
                  }}
                >
                  <Box sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'center' }}>
                    {asset.device ? deviceIcon(asset.device.type_id) : <CatIcon size={18} />}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {asset.name}
                    </Typography>
                    {asset.device?.name && asset.device.name !== asset.name && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {asset.device.name}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.identifier || '—'}
                  </Typography>
                  {showCategory ? (
                    <Chip
                      icon={<CatIcon size={12} />}
                      label={cat?.short || asset.categoryId}
                      size="small"
                      sx={{ fontSize: '0.7rem', height: 22, '& .MuiChip-icon': { ml: 0.75, mr: -0.25 } }}
                    />
                  ) : (
                    <Chip
                      label={asset.type || (asset.device ? DEVICE_TYPES.find(t => t.id === asset.device!.type_id)?.label : null) || '—'}
                      size="small"
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />
                  )}
                  <Chip
                    label={asset.risk || (asset.device ? RISK_LEVELS.find(r => r.id === asset.device!.risk_level_id)?.label : null) || '—'}
                    size="small"
                    color={riskColor(asset.riskId)}
                    sx={{ fontSize: '0.7rem', height: 22 }}
                  />
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.owner || '—'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {formatTime(asset.lastSeen)}
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(asset); }}
                        sx={{ width: 28, height: 28, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Card>
            );
          })}
        </Box>
      )}

      <Dialog open={!!deleteTarget} onClose={() => (deleting ? null : setDeleteTarget(null))} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {deleteTarget?.categoryId === 'identity_users' ? 'Delete user' : 'Delete asset'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.875rem' }}>
            This will permanently remove <strong>{deleteTarget?.name}</strong> from the inventory. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => setDeleteTarget(null)} disabled={deleting} sx={{ height: 36 }}>Cancel</Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <Trash2 size={14} />}
            sx={{ height: 36 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <CreateAssetDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateAsset}
        kind={activeTab === 'identity_users' ? 'user' : 'device'}
      />
    </Box>
  );
};

export default AssetsPage;
