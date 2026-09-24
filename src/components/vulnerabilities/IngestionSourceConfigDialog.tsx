/**
 * IngestionSourceConfigDialog
 *
 * Universal, platform-agnostic configuration dialog for vulnerability ingestion
 * sources. Allows granular control over streams (e.g. code_scanning,
 * dependabot_alerts, secret_scanning, container_image) and scoping parameters
 * (e.g. repositories, organization, account, severity threshold) per tenant.
 *
 * Complies strictly with AGENTS.md: zero emojis, plain text badges,
 * unified button heights, and clean engineering typography.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { X as CloseIcon, RefreshCw as RefreshIcon } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/context/AuthContext';
import { useIsSupport } from '@/hooks/useIsSupport';
import { discoverVulnerabilityStreams } from '@/services/vulnerabilityStreamDiscovery';
import {
  getOrDiscoverAppIngestionConfig,
  saveAppIngestionConfig,
} from '@/services/vulnerabilityStreamStorage';
import type {
  AppIngestionConfig,
  VulnerabilityCategory,
  VulnerabilityIngestionStream,
} from '@/types/vulnerabilityStreamTypes';
import { CATEGORY_LABELS } from '@/types/vulnerabilityStreamTypes';

interface IngestionSourceConfigDialogProps {
  open: boolean;
  onClose: () => void;
  appName: string;
  appId?: string;
  validated?: boolean;
  onConfigSaved?: (config: AppIngestionConfig) => void;
}

const CATEGORY_CHIP_COLORS: Record<
  VulnerabilityCategory,
  { bg: string; text: string; border: string }
> = {
  software_cve: {
    bg: 'hsla(var(--severity-medium) / 0.12)',
    text: 'hsl(var(--severity-medium))',
    border: 'hsla(var(--severity-medium) / 0.3)',
  },
  code_vulnerability: {
    bg: 'hsla(var(--severity-high) / 0.12)',
    text: 'hsl(var(--severity-high))',
    border: 'hsla(var(--severity-high) / 0.3)',
  },
  cloud_misconfig: {
    bg: 'hsla(var(--primary) / 0.12)',
    text: 'hsl(var(--primary))',
    border: 'hsla(var(--primary) / 0.3)',
  },
  endpoint_finding: {
    bg: 'hsla(var(--severity-critical) / 0.12)',
    text: 'hsl(var(--severity-critical))',
    border: 'hsla(var(--severity-critical) / 0.3)',
  },
  container_image: {
    bg: 'hsla(210, 80%, 55%, 0.12)',
    text: 'hsl(210, 80%, 65%)',
    border: 'hsla(210, 80%, 55%, 0.3)',
  },
  secret: {
    bg: 'hsla(var(--destructive) / 0.12)',
    text: 'hsl(var(--destructive))',
    border: 'hsla(var(--destructive) / 0.3)',
  },
  advisory: {
    bg: 'hsl(var(--muted))',
    text: 'hsl(var(--muted-foreground))',
    border: 'hsl(var(--border))',
  },
  general_finding: {
    bg: 'hsla(var(--severity-low) / 0.12)',
    text: 'hsl(var(--severity-low))',
    border: 'hsla(var(--severity-low) / 0.3)',
  },
};

export const IngestionSourceConfigDialog = ({
  open,
  onClose,
  appName,
  appId,
  validated = false,
  onConfigSaved,
}: IngestionSourceConfigDialogProps) => {
  const isSupport = useIsSupport();
  const { userInfo } = useAuth();
  const currentOrgId: string | undefined = (userInfo as any)?.active_org?.id;

  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AppIngestionConfig | null>(null);

  // Form states
  const [repositoriesInput, setRepositoriesInput] = useState('');
  const [organizationInput, setOrganizationInput] = useState('');
  const [accountIdInput, setAccountIdInput] = useState('');
  const [projectKeyInput, setProjectKeyInput] = useState('');
  const [minSeverity, setMinSeverity] = useState('medium');

  const displayName = appName.replace(/_/g, ' ');

  const loadConfig = useCallback(async () => {
    if (!open || !appName || !isSupport) return;
    setLoading(true);
    try {
      const cfg = await getOrDiscoverAppIngestionConfig(appName, appId, currentOrgId);
      setConfig(cfg);
      setRepositoriesInput((cfg.global_parameters?.repositories || []).join(', '));
      setOrganizationInput(cfg.global_parameters?.organization || '');
      setAccountIdInput(cfg.global_parameters?.account_id || '');
      setProjectKeyInput(cfg.global_parameters?.project_key || '');
      setMinSeverity(cfg.global_parameters?.min_severity || 'medium');
    } catch (err) {
      console.error('Failed to load ingestion config:', err);
      toast.error('Failed to load ingestion configuration');
    } finally {
      setLoading(false);
    }
  }, [open, appName, appId, currentOrgId, isSupport]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleRunDiscovery = async () => {
    if (discovering || !appName || !isSupport) return;
    setDiscovering(true);
    try {
      const fresh = await discoverVulnerabilityStreams(appName, appId, currentOrgId);
      // Preserve any existing parameters and enabled flags where matching stream id exists
      if (config) {
        const existingMap = new Map(config.streams.map((s) => [s.id, s]));
        fresh.streams = fresh.streams.map((freshStream) => {
          const matched = existingMap.get(freshStream.id);
          if (matched) {
            return {
              ...freshStream,
              enabled: matched.enabled,
              configured_values: matched.configured_values || {},
            };
          }
          return freshStream;
        });
        fresh.global_parameters = { ...config.global_parameters };
      }
      setConfig(fresh);
      toast.success(
        `Discovered ${fresh.streams.length} stream${fresh.streams.length === 1 ? '' : 's'} (${fresh.discovered_via === 'llm' ? 'via local LLM' : 'via heuristic inspection'})`,
      );
    } catch (err) {
      console.error('Stream discovery failed:', err);
      toast.error('Stream discovery failed');
    } finally {
      setDiscovering(false);
    }
  };

  const handleToggleStream = (streamId: string) => {
    if (!config) return;
    setConfig({
      ...config,
      streams: config.streams.map((s) =>
        s.id === streamId ? { ...s, enabled: !s.enabled } : s,
      ),
    });
  };

  const handleSave = async () => {
    if (!config || !isSupport) return;
    setSaving(true);
    try {
      const parsedRepos = repositoriesInput
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);

      const updatedConfig: AppIngestionConfig = {
        ...config,
        global_parameters: {
          ...config.global_parameters,
          repositories: parsedRepos,
          organization: organizationInput.trim(),
          account_id: accountIdInput.trim(),
          project_key: projectKeyInput.trim(),
          min_severity: minSeverity,
        },
      };

      const result = await saveAppIngestionConfig(updatedConfig, currentOrgId);
      if (result.success) {
        toast.success(`Ingestion configuration for ${displayName} saved`);
        onConfigSaved?.(updatedConfig);
        onClose();
      } else {
        toast.error(result.error || 'Failed to save configuration');
      }
    } catch (err) {
      console.error('Failed to save ingestion config:', err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const activeStreamsCount = config?.streams.filter((s) => s.enabled).length || 0;
  const totalStreamsCount = config?.streams.length || 0;

  // Determine if repository scoping or cloud/project scoping applies
  const hasRepoParam =
    config?.streams.some((s) =>
      s.parameters.some((p) => p.name === 'repositories'),
    ) ||
    /git|github|gitlab|bitbucket|snyk|code/i.test(appName);

  const hasCloudParam =
    config?.streams.some((s) =>
      s.parameters.some((p) => p.name === 'account_id'),
    ) ||
    /aws|azure|gcp|cloud|inspector/i.test(appName);

  const hasProjectParam =
    config?.streams.some((s) =>
      s.parameters.some((p) => p.name === 'project_key'),
    ) ||
    /jira|snyk|sonarqube|sonar/i.test(appName);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          pt: 2.5,
          pb: 1.5,
          borderBottom: '1px solid hsl(var(--border))',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            Configure Ingestion: {displayName}
          </Typography>
          <Tooltip title="This configuration is restricted to Shuffle support users" arrow>
            <Chip
              label="Support only"
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 500,
                color: 'hsl(var(--muted-foreground))',
                bgcolor: 'hsl(var(--muted) / 0.5)',
                border: '1px solid hsl(var(--border))',
                '& .MuiChip-label': { px: 1 },
              }}
            />
          </Tooltip>
          <Chip
            label={validated ? 'Connected' : 'Pending Verification'}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 500,
              bgcolor: validated
                ? 'hsla(var(--severity-low) / 0.15)'
                : 'hsla(var(--severity-medium) / 0.15)',
              color: validated
                ? 'hsl(var(--severity-low))'
                : 'hsl(var(--severity-medium))',
              border: '1px solid',
              borderColor: validated
                ? 'hsla(var(--severity-low) / 0.35)'
                : 'hsla(var(--severity-medium) / 0.35)',
            }}
          />
        </Box>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            color: 'hsl(var(--muted-foreground))',
            width: 28,
            height: 28,
            borderRadius: 1,
            border: '1px solid hsl(var(--border))',
            '&:hover': {
              color: 'hsl(var(--foreground))',
              bgcolor: 'hsl(var(--muted))',
            },
          }}
        >
          <CloseIcon size={16} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 2.5 }}>
        {!isSupport ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))' }}>
              This configuration is restricted to Shuffle support users.
            </Typography>
          </Box>
        ) : loading ? (
          <Box sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={28} sx={{ color: 'hsl(var(--primary))' }} />
            <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))' }}>
              Discovering available streams for {displayName}...
            </Typography>
          </Box>
        ) : !config ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.9rem', color: 'hsl(var(--muted-foreground))' }}>
              Unable to discover streams for {displayName}.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Discovery Status Banner */}
            <Box
              sx={{
                p: 1.75,
                borderRadius: 1.5,
                bgcolor: 'hsl(var(--muted) / 0.35)',
                border: '1px solid hsl(var(--border))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                  Discovery Status: {config.discovered_via === 'llm' ? 'Local LLM Introspection' : 'Heuristic Schema Inspection'}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                  {totalStreamsCount} stream{totalStreamsCount === 1 ? '' : 's'} identified. Configurations are stored per tenant in datastore.
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                onClick={handleRunDiscovery}
                disabled={discovering}
                sx={{
                  height: 30,
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  px: 1.5,
                  borderRadius: 1,
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  '&:hover': {
                    borderColor: 'hsl(var(--foreground) / 0.4)',
                    bgcolor: 'hsl(var(--muted))',
                  },
                }}
              >
                {discovering ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={14} sx={{ color: 'inherit' }} />
                    <Typography sx={{ fontSize: '0.75rem' }}>Discovering...</Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <RefreshIcon size={14} />
                    <Typography sx={{ fontSize: '0.75rem' }}>Re-discover</Typography>
                  </Box>
                )}
              </Button>
            </Box>

            {/* Global Scope Parameters */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                  Scope Parameters
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                  Define which assets, scopes, and thresholds apply during vulnerability extraction.
                </Typography>
              </Box>

              <Grid container spacing={2}>
                {hasRepoParam && (
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      label="Repositories"
                      value={repositoriesInput}
                      onChange={(e) => setRepositoriesInput(e.target.value)}
                      placeholder="e.g. shuffle/shuffle, shuffle/shuffle-shared"
                      helperText="Comma-separated list of target repositories. Leave blank to ingest across all accessible repositories."
                      size="small"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      sx={{
                        '& .MuiInputBase-input': { fontSize: '0.8rem' },
                        '& .MuiFormHelperText-root': { fontSize: '0.7rem' },
                      }}
                    />
                  </Grid>
                )}

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Organization / Namespace"
                    value={organizationInput}
                    onChange={(e) => setOrganizationInput(e.target.value)}
                    placeholder="e.g. shuffle"
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    select
                    label="Minimum Severity Threshold"
                    value={minSeverity}
                    onChange={(e) => setMinSeverity(e.target.value)}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                  >
                    <MenuItem value="all" sx={{ fontSize: '0.8rem' }}>All Findings (Low, Medium, High, Critical)</MenuItem>
                    <MenuItem value="medium" sx={{ fontSize: '0.8rem' }}>Medium and Above</MenuItem>
                    <MenuItem value="high" sx={{ fontSize: '0.8rem' }}>High and Critical Only</MenuItem>
                    <MenuItem value="critical" sx={{ fontSize: '0.8rem' }}>Critical Only</MenuItem>
                  </TextField>
                </Grid>

                {hasCloudParam && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Cloud Account / Subscription ID"
                      value={accountIdInput}
                      onChange={(e) => setAccountIdInput(e.target.value)}
                      placeholder="e.g. 123456789012"
                      size="small"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                    />
                  </Grid>
                )}

                {hasProjectParam && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Project Key / Identifier"
                      value={projectKeyInput}
                      onChange={(e) => setProjectKeyInput(e.target.value)}
                      placeholder="e.g. SEC-PROJ-1"
                      size="small"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                    />
                  </Grid>
                )}
              </Grid>
            </Box>

            <Divider sx={{ borderColor: 'hsl(var(--border))' }} />

            {/* Granular Streams List */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                    Ingestion Streams ({activeStreamsCount} of {totalStreamsCount} active)
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                    Enable or disable specific finding feeds extracted from this integration.
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {config.streams.map((stream) => {
                  const colors =
                    CATEGORY_CHIP_COLORS[stream.category] ||
                    CATEGORY_CHIP_COLORS.general_finding;

                  return (
                    <Box
                      key={stream.id}
                      sx={{
                        p: 1.5,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: stream.enabled
                          ? 'hsl(var(--border))'
                          : 'hsl(var(--border) / 0.5)',
                        bgcolor: stream.enabled
                          ? 'hsl(var(--card))'
                          : 'hsl(var(--muted) / 0.2)',
                        opacity: stream.enabled ? 1 : 0.65,
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                            {stream.label}
                          </Typography>
                          <Chip
                            label={CATEGORY_LABELS[stream.category] || stream.category}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              fontWeight: 500,
                              bgcolor: colors.bg,
                              color: colors.text,
                              border: `1px solid ${colors.border}`,
                            }}
                          />
                          <Typography
                            sx={{
                              fontSize: '0.7rem',
                              fontFamily: 'monospace',
                              color: 'hsl(var(--muted-foreground))',
                              bgcolor: 'hsl(var(--muted) / 0.6)',
                              px: 0.75,
                              py: 0.1,
                              borderRadius: 0.5,
                            }}
                          >
                            {stream.action_name}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
                          {stream.description}
                        </Typography>
                      </Box>
                      <Switch
                        checked={stream.enabled}
                        onChange={() => handleToggleStream(stream.id)}
                        size="small"
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': {
                            color: 'hsl(var(--primary))',
                          },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                            backgroundColor: 'hsl(var(--primary))',
                          },
                        }}
                      />
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: '1px solid hsl(var(--border))',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1.5,
        }}
      >
        <Button
          size="small"
          variant="outlined"
          onClick={onClose}
          sx={{
            height: 32,
            fontSize: '0.8rem',
            textTransform: 'none',
            borderRadius: 1,
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--foreground))',
            '&:hover': {
              borderColor: 'hsl(var(--foreground) / 0.4)',
              bgcolor: 'hsl(var(--muted))',
            },
          }}
        >
          {isSupport ? 'Cancel' : 'Close'}
        </Button>
        {isSupport && (
          <Button
            size="small"
            variant="contained"
            onClick={handleSave}
            disabled={saving || loading || !config}
            sx={{
              height: 32,
              fontSize: '0.8rem',
              textTransform: 'none',
              borderRadius: 1,
              bgcolor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              '&:hover': {
                bgcolor: 'hsl(var(--primary) / 0.9)',
              },
            }}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
