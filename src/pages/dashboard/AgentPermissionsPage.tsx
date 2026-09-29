import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Button,
  Collapse,
  Alert,
  TextField,
} from '@mui/material';
import { toast } from '@/lib/toast';
import { setDatastoreItem, getDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import AgentIcon from '@/Shuffle-Core/components/AgentIcon';
import { motion, AnimatePresence } from 'framer-motion';
import { Radar, Zap, Bell, Server, ShieldCheck, ShieldAlert, ShieldOff, ChevronDown as ExpandMoreIcon, ChevronUp as ExpandLessIcon, RotateCcw as RestoreIcon } from 'lucide-react';
import { useAgentPermissions, RiskLevel, AgentPermissionCategory } from '@/hooks/useAgentPermissions';
import { usePageMeta } from '@/hooks/usePageMeta';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Radar: <Radar size={20} />,
  Zap: <Zap size={20} />,
  Bell: <Bell size={20} />,
  Server: <Server size={20} />,
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

const AGENT_CONFIG_KEY = 'agent_local_config';

const AgentPermissionsPage = () => {

  usePageMeta({
    title: 'AI Agent permissions',
    description: 'Configure what your AI agent is allowed to do across incidents and integrations.',
    url: '/agent/permissions',
  });
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
  } = useAgentPermissions();

  // Local agent config state
  const [agentUrl, setAgentUrl] = useState('');
  const [agentApiKey, setAgentApiKey] = useState('');
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  // Load agent config from datastore
  useEffect(() => {
    (async () => {
      try {
        const resp = await getDatastoreItem(AGENT_CONFIG_KEY, DATASTORE_CATEGORIES.CONFIGURATION);
        if (resp.success && resp.item?.value) {
          const data = typeof resp.item.value === 'string' ? JSON.parse(resp.item.value) : resp.item.value;
          setAgentUrl(data.url || '');
          setAgentApiKey(data.apikey || '');
        }
      } catch { /* ignore */ }
      setConfigLoading(false);
    })();
  }, []);

  const saveAgentConfig = useCallback(async () => {
    setConfigSaving(true);
    try {
      const resp = await setDatastoreItem(AGENT_CONFIG_KEY, { url: agentUrl, apikey: agentApiKey }, DATASTORE_CATEGORIES.CONFIGURATION);
      if (resp.success) {
        toast.success('Agent configuration saved');
      } else {
        toast.error(resp.error || 'Failed to save configuration');
      }
    } catch (err) {
      toast.error('Failed to save configuration');
    }
    setConfigSaving(false);
  }, [agentUrl, agentApiKey]);

  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    () => categories.map(c => c.id)
  );

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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 12 }}>
        <CircularProgress sx={{ color: 'hsl(var(--primary))' }} />
      </Box>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Box sx={{ p: 4, maxWidth: 900 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                Agent Permissions
              </Typography>
              {isSaving && <CircularProgress size={18} sx={{ color: 'hsl(var(--primary))' }} />}
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
                Reset to Defaults
              </Button>
            </Tooltip>
          </Box>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 2 }}>
            Control what actions your AI agent can perform across your security stack.
          </Typography>

          {/* Summary bar */}
          <Paper
            sx={{
              px: 3,
              py: 1.5,
              bgcolor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
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
          </Paper>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
        )}
        {/* Local Agent Setup */}
        <Paper
          sx={{
            mb: 3,
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AgentIcon size={22} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Local Agent Setup
            </Typography>
          </Box>
          <Box sx={{ borderTop: '1px solid hsl(var(--border))', px: 3, py: 2.5 }}>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 2.5 }}>
              Configure the connection to your local or self-hosted agent instance.
            </Typography>
            {configLoading ? (
              <CircularProgress size={20} sx={{ color: 'hsl(var(--primary))' }} />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Agent URL"
                  placeholder="https://localhost:8000 or https://agent.yourdomain.com"
                  size="small"
                  fullWidth
                  value={agentUrl}
                  onChange={(e) => setAgentUrl(e.target.value)}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: 'hsl(var(--background))',
                      color: 'hsl(var(--foreground))',
                      '& fieldset': { borderColor: 'hsl(var(--border))' },
                      '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                    },
                    '& .MuiInputLabel-root': { color: 'hsl(var(--muted-foreground))' },
                  }}
                />
                <TextField
                  label="API Key"
                  placeholder="Enter your agent API key"
                  size="small"
                  fullWidth
                  type="password"
                  value={agentApiKey}
                  onChange={(e) => setAgentApiKey(e.target.value)}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: 'hsl(var(--background))',
                      color: 'hsl(var(--foreground))',
                      '& fieldset': { borderColor: 'hsl(var(--border))' },
                      '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                    },
                    '& .MuiInputLabel-root': { color: 'hsl(var(--muted-foreground))' },
                  }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    size="small"
                    disabled={configSaving}
                    onClick={saveAgentConfig}
                    sx={{
                      textTransform: 'none',
                      bgcolor: 'hsl(var(--primary))',
                      color: 'hsl(var(--primary-foreground))',
                      '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                    }}
                  >
                    {configSaving ? 'Saving…' : 'Save Configuration'}
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Category sections */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <AnimatePresence>
            {categories.map((cat) => {
              const stats = getCategoryStats(cat);
              const isExpanded = expandedCategories.includes(cat.id);

              return (
                <motion.div
                  key={cat.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Paper
                    sx={{
                      bgcolor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      overflow: 'hidden',
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
                      <Tooltip title={stats.allEnabled ? 'Disable all' : 'Enable all'}>
                        <Switch
                          size="small"
                          checked={stats.allEnabled}
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
                                opacity: perm.enabled ? 1 : 0.55,
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
                              <Switch
                                size="small"
                                checked={perm.enabled}
                                onChange={() => togglePermission(cat.id, perm.id)}
                                sx={{
                                  '& .MuiSwitch-switchBase.Mui-checked': {
                                    color: perm.risk === 'high' ? riskCfg.color : 'hsl(var(--primary))',
                                  },
                                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    bgcolor: perm.risk === 'high' ? riskCfg.color : 'hsl(var(--primary))',
                                  },
                                }}
                              />
                            </Box>
                          );
                        })}
                      </Box>
                    </Collapse>
                  </Paper>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </Box>
      </Box>
    </motion.div>
  );
};

export default AgentPermissionsPage;
