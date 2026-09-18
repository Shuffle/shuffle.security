import { Plus as AddIcon, Trash2 as DeleteIcon, Pencil as EditIcon, Search as SearchIcon, RefreshCw as RefreshIcon, Rss as RssFeedIcon, ExternalLink as OpenInNewIcon } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip,
  InputAdornment,
  Switch,
  Tooltip,
  Alert,
  MenuItem,
} from '@mui/material';
import { motion } from 'framer-motion';
import { useThreatFeeds, ThreatFeed, DEFAULT_THREAT_FEEDS } from '@/hooks/useThreatFeeds';
import { useIOCTypes } from '@/hooks/useIOCTypes';
import { useObservableCounts } from '@/hooks/useObservableCounts';
import { useEnrichmentStatus } from '@/hooks/useEnrichmentStatus';
import { toast } from '@/lib/toast';
import ThreatIntelAutomationBanner from '@/components/incidents/ThreatIntelAutomationBanner';
import { usePageMeta } from '@/hooks/usePageMeta';

// Datastore keys for onboarding config
const ONBOARDING_CONFIG_CATEGORY = 'shuffle-security_onboarding';
const AUTOMATION_CONFIG_KEY = 'automation_config';

const ThreatFeedsPage = () => {

  usePageMeta({
    title: 'Threat feeds',
    description: 'Manage threat intelligence feeds and IOC sources, including MISP integrations.',
    url: '/incidents/threat-feeds',
  });
  const { threatFeeds: feeds, isLoading, saveFeed, deleteFeed, toggleFeed, initializeDefaults, refetch } = useThreatFeeds();
  const { iocTypes } = useIOCTypes();
  const enrichmentStatus = useEnrichmentStatus();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<ThreatFeed | null>(null);
  const [formData, setFormData] = useState<Partial<ThreatFeed>>({
    name: '',
    url: '',
    description: '',
    enabled: true
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);

  // Canonical Threat Intel automation state — same hook used by the
  // onboarding "Threat Intel" toggle, so behaviour stays consistent.
  const automationEnabled = enrichmentStatus.active;
  const automationAction = enrichmentStatus.action;

  useEffect(() => {
    refetch();
  }, [refetch]);

  // No auto-initialization — the list must reflect the actual datastore.
  // Defaults are only seeded when the user clicks "Reset to Defaults" or
  // the empty-state CTA below.

  // Combined CTA: seed default feeds AND enable the Threat Intel automation
  // (which runs /api/v2/workflows/generate for the threat-feeds workflows)
  // so the user gets a working setup in one click.
  const handleEnableThreatFeeds = async () => {
    setIsInitializing(true);
    try {
      await initializeDefaults();
      try {
        await enrichmentStatus.enable();
      } catch (err) {
        console.error('Failed to enable threat intel automation:', err);
      }
      toast.success('Threat feeds enabled');
    } catch (err) {
      console.error('Failed to enable threat feeds:', err);
      toast.error('Failed to enable threat feeds');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleOpenDialog = (feed?: ThreatFeed) => {
    if (feed) {
      setEditingFeed(feed);
      setFormData(feed);
    } else {
      setEditingFeed(null);
      setFormData({ name: '', url: '', description: '', enabled: true });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.url) return;
    
    const feedToSave: ThreatFeed = {
      id: editingFeed?.id || `feed_${Date.now()}`,
      name: formData.name,
      url: formData.url,
      description: formData.description || '',
      type: formData.type || undefined,
      headers: formData.headers?.trim() || undefined,
      enabled: formData.enabled ?? true,
    };

    if (editingFeed && editingFeed.id !== feedToSave.id) {
      await deleteFeed(editingFeed.id);
    }
    
    await saveFeed(feedToSave);
    setDialogOpen(false);
    setFormData({ name: '', url: '', description: '', enabled: true });
  };

  const handleDelete = async (id: string) => {
    await deleteFeed(id);
  };

  const handleResetDefaults = async () => {
    setIsInitializing(true);
    try {
      // Re-seed the curated defaults without deleting any existing datastore
      // keys. Deletes on the threat-feed category can fan out into IOC cleanup
      // automation, which is not part of resetting feed configuration.
      await initializeDefaults();
      toast.success(`Restored ${DEFAULT_THREAT_FEEDS.length} default threat feeds`);
    } catch (err) {
      console.error('Failed to reset threat feeds:', err);
      toast.error('Failed to reset threat feeds');
    } finally {
      setIsInitializing(false);
    }
  };

  // Filter feeds by search query
  const filteredFeeds = useMemo(() => {
    const base = !searchQuery.trim()
      ? feeds
      : feeds.filter(f => {
          const query = searchQuery.toLowerCase();
          return (
            f.name.toLowerCase().includes(query) ||
            f.url.toLowerCase().includes(query) ||
            f.description?.toLowerCase().includes(query)
          );
        });
    // Default sort: enabled feeds first, then alphabetical by name.
    return [...base].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [feeds, searchQuery]);

  const enabledCount = useMemo(() => feeds.filter(f => f.enabled).length, [feeds]);

  // Per-IOC-type totals — counts the live `ioc_<type>` datastore categories
  // for every type that appears in at least one feed, plus the universally
  // useful defaults so the strip is never empty when feeds exist.
  const trackedIocNames = useMemo(() => {
    const set = new Set<string>();
    for (const f of feeds) {
      if (f.type) set.add(f.type);
    }
    // Always include the most common IOC types so the user sees a meaningful
    // overview even when feeds do not declare a type.
    ['url', 'ipv4', 'domain', 'hash_md5', 'hash_sha256'].forEach((n) => set.add(n));
    return Array.from(set);
  }, [feeds]);
  const { data: iocCounts = {} } = useObservableCounts(trackedIocNames);


  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ maxWidth: 1400, width: '100%', margin: '0 auto' }}>
      {/* Threat Intel automation CTA — placed at the top, only shown when not already active. */}
      {feeds.length > 0 && !automationEnabled && <ThreatIntelAutomationBanner />}

      {/* Header — matches the standard page header used on Incidents / Vulnerabilities */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <RssFeedIcon size={28} style={{ color: 'hsl(var(--primary))' }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, fontSize: '1.25rem' }}>Threat Feeds</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              External intelligence sources that enrich incidents with indicators of compromise
            </Typography>
          </Box>
          {isLoading && <CircularProgress size={18} />}
          {!isLoading && feeds.length > 0 && (
            <Chip
              label={enabledCount === feeds.length ? `${enabledCount} active feeds` : `${enabledCount}/${feeds.length} active feeds`}
              size="small"
              variant="outlined"
              sx={{
                height: 24,
                ml: 1,
                bgcolor: enabledCount > 0 ? 'hsl(var(--severity-low) / 0.12)' : 'transparent',
                color: enabledCount > 0 ? 'hsl(var(--severity-low))' : 'text.secondary',
                borderColor: enabledCount > 0 ? 'hsl(var(--severity-low) / 0.4)' : undefined,
              }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search feeds..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </InputAdornment>
              ),
              sx: { height: 36 },
            }}
            sx={{ minWidth: 220 }}
          />
          <Tooltip title="Refresh feeds">
            <IconButton onClick={() => refetch()} sx={{ height: 36, width: 36 }}>
              <RefreshIcon size={20} />
            </IconButton>
          </Tooltip>
          {feeds.length > 0 && (
            <Tooltip title="Restore the curated default feed list without removing existing threat intelligence">
              <span>
                <Button
                  variant="outlined"
                  onClick={handleResetDefaults}
                  disabled={isInitializing}
                  sx={{ height: 36 }}
                >
                  Reset to Defaults
                </Button>
              </span>
            </Tooltip>
          )}
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => handleOpenDialog()} sx={{ height: 36 }}>
            Add Feed
          </Button>
        </Box>
      </Box>




      <Card elevation={0} sx={{ bgcolor: 'transparent', backgroundImage: 'none', border: '1px solid hsl(var(--border))' }}>
        <CardContent sx={{ p: 0 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Enabled</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>URL</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredFeeds.map((feed) => (
                  <TableRow key={feed.id} hover sx={{ opacity: feed.enabled ? 1 : 0.6 }}>
                    <TableCell>
                      <Switch
                        checked={feed.enabled}
                        onChange={() => toggleFeed(feed.id)}
                        size="small"
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': {
                            color: 'success.main',
                          },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                            backgroundColor: 'success.main',
                          },
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <RssFeedIcon size={16} style={{ color: feed.enabled ? 'hsl(var(--primary))' : 'text.disabled' }} />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {feed.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {feed.type ? (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                          <Chip
                            label={feed.type}
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              fontFamily: 'JetBrains Mono, monospace',
                              borderColor: 'hsl(var(--primary) / 0.4)',
                              color: 'hsl(var(--primary))',
                              bgcolor: 'hsl(var(--primary) / 0.06)',
                              '& .MuiChip-label': { px: 0.75 },
                            }}
                          />
                          {typeof iocCounts[feed.type] === 'number' && (
                            <Tooltip title={`Total IOCs in ioc_${feed.type}`} arrow>
                              <Chip
                                label={iocCounts[feed.type].toLocaleString()}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  bgcolor: iocCounts[feed.type] > 0 ? 'hsl(var(--severity-low) / 0.15)' : 'hsl(var(--muted))',
                                  color: iocCounts[feed.type] > 0 ? 'hsl(var(--severity-low))' : 'text.secondary',
                                  '& .MuiChip-label': { px: 0.75 },
                                }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      ) : (
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                          auto
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            fontFamily: 'monospace', 
                            fontSize: '0.75rem', 
                            maxWidth: 400, 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {feed.url}
                        </Typography>
                        <Tooltip title="Open in new tab">
                          <IconButton 
                            size="small" 
                            onClick={() => window.open(feed.url, '_blank')}
                            sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                          >
                            <OpenInNewIcon size={14} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {feed.description || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleOpenDialog(feed)}>
                        <EditIcon size={20} />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDelete(feed.id)} color="error">
                        <DeleteIcon size={20} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredFeeds.length === 0 && !isLoading && !isInitializing && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6 }}>
                      {searchQuery ? (
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          No feeds match your search
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <RssFeedIcon size={40} style={{ color: 'hsl(var(--primary) / 0.5)' }} />
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                              No threat feeds configured
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 480 }}>
                              Load the curated default feed list and turn on automatic incident enrichment in one click.
                            </Typography>
                          </Box>
                          <Button
                            variant="outlined"
                            onClick={handleEnableThreatFeeds}
                            disabled={isInitializing}
                            startIcon={isInitializing ? <CircularProgress size={16} color="inherit" /> : <RssFeedIcon size={16} />}
                            sx={{ height: 32, mt: 1 }}
                          >
                            Enable Threat Feeds
                          </Button>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingFeed ? 'Edit Threat Feed' : 'Add Threat Feed'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Name"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            fullWidth
            placeholder="e.g., Abuse.ch SSL Blacklist"
          />
          <TextField
            label="URL"
            value={formData.url || ''}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            fullWidth
            placeholder="https://example.com/feed.csv"
            helperText="URL to the threat feed data (CSV, JSON, or text format)"
          />
          <TextField
            label="Description"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            fullWidth
            multiline
            rows={2}
            placeholder="Optional description of the feed contents"
          />
          <TextField
            select
            label="IOC Type"
            value={formData.type || ''}
            onChange={(e) => setFormData({ ...formData, type: e.target.value || undefined })}
            fullWidth
            helperText="The IOC type this feed contains. Leave empty to auto-detect per row."
          >
            <MenuItem value="">
              <em>Auto-detect (mixed feed)</em>
            </MenuItem>
            {iocTypes.map((t) => (
              <MenuItem key={t.name} value={t.name}>
                <Box component="span" sx={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>
                  {t.name}
                </Box>
                {t.description && (
                  <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                    — {t.description}
                  </Typography>
                )}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Custom Headers"
            value={formData.headers || ''}
            onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
            fullWidth
            placeholder="Authorization=Bearer abc123;X-Api-Key=xyz"
            helperText="Optional HTTP headers sent during ingest. Format: key=value;key2=value2"
            InputProps={{ sx: { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' } }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch
              checked={formData.enabled ?? true}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
            <Typography variant="body2">Enable this feed</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSave} 
            variant="contained" 
            disabled={!formData.name || !formData.url}
          >
            {editingFeed ? 'Save Changes' : 'Add Feed'}
          </Button>
        </DialogActions>
      </Dialog>
    </motion.div>
  );
};

export default ThreatFeedsPage;
