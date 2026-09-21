/**
 * AssignedToolsSection — top-of-Permissions UI that shows which apps
 * the agent will use for a given (agent, actionType) pair.
 *
 * Styled to match the rest of PermissionsPanel: a category-style card
 * with app pills that include the app icon (resolved from Algolia)
 * and an inline remove button.
 */

import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, IconButton, Tooltip, Button, Select, MenuItem } from '@mui/material';
import { Plus, X, Wrench, AppWindow } from 'lucide-react';
import { AppSearchDrawer } from '@/Shuffle-MCPs';
import { AGENT_TOOL_PICKER_OPEN_EVENT } from '@/lib/agentDrawer';

import { useAppDetailOptional } from '@/Shuffle-MCPs/AppDetailContext';
import {
  AGENT_TOOLS_CHANGED_EVENT,
  DEFAULT_ACTION_TYPE,
  DEFAULT_AGENT,
  addAgentTool,
  formatToolName,
  getAgentTools,
  loadAgentToolsFromDatastore,
  saveAgentTools,
  setAgentTools,
  type ToolRef,
} from '@/lib/agentTools';

export interface SkillDefinition {
  id: string;
  label: string;
  description: string;
  builtInApps: string[];
}

export const AGENT_SKILLS: SkillDefinition[] = [
  {
    id: 'incident-handler',
    label: 'Incident Handler',
    description: 'Investigates alerts, triages threats, correlates observables, and coordinates response.',
    builtInApps: ['shuffle_incidents'],
  },
  {
    id: 'vulnerability',
    label: 'Vulnerability Agent',
    description: 'Demystifies CVEs, reviews affected packages, and guides remediation.',
    builtInApps: ['shuffle_vulnerabilities', 'shuffle_software_and_packages'],
  },
  {
    id: 'build-workflows',
    label: 'Build Workflow',
    description: 'Designs and builds automations, wires app actions, and iterates on workflows.',
    builtInApps: ['shuffle_workflows_builder', 'shuffle_apps'],
  },
  {
    id: 'host-monitor-control',
    label: 'Computer Use',
    description: 'Controls hosts, executes commands, and inspects remote endpoints.',
    builtInApps: ['shuffle_host_monitors'],
  },
  {
    id: 'support',
    label: 'Support Agent',
    description: 'Answers platform questions, inspects settings, and assists users.',
    builtInApps: ['shuffle_tools'],
  },
  {
    id: 'detection',
    label: 'Detection Agent',
    description: 'Creates and tunes detection rules (Sigma, pipelines) and validates coverage.',
    builtInApps: ['shuffle_detection'],
  },
];

interface Props {
  agent?: string;
  actionType?: string;
  compact?: boolean;
  onSkillChange?: (skillId: string) => void;
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[\s-]+/g, '_');

/** Lightweight Algolia lookup for app icons. Resolves once per name. */
const useAppIcons = (names: string[]) => {
  const [icons, setIcons] = useState<Record<string, string>>({});
  const key = names.join('|');

  useEffect(() => {
    let cancelled = false;
    const missing = names.filter((n) => !(n in icons));
    if (missing.length === 0) return;
    (async () => {
      try {
        const { algoliasearch } = await import('algoliasearch');
        const client = algoliasearch('JNSS5CFDZZ', '33e4e3564f4f060e96e0531957bed552');
        const resolved: Record<string, string> = {};
        await Promise.all(
          missing.map(async (name) => {
            try {
              const res = await client.searchSingleIndex({
                indexName: 'appsearch',
                searchParams: { query: name.replace(/_/g, ' '), hitsPerPage: 3 },
              });
              const hits = (res.hits as any[]) || [];
              const match = hits.find((h) => norm(h.name || '') === norm(name)) || hits[0];
              resolved[name] = match?.image_url || '';
            } catch {
              resolved[name] = '';
            }
          }),
        );
        if (!cancelled) setIcons((prev) => ({ ...prev, ...resolved }));
      } catch {
        /* offline / blocked — pills fall back to letter avatars */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return icons;
};

const BuiltInToolPill = ({
  name,
  icon,
  onOpen,
  skillLabel,
}: {
  name: string;
  icon?: string;
  onOpen?: () => void;
  skillLabel: string;
}) => {
  const display = formatToolName(name);
  return (
    <Tooltip title={`Built-in default app for ${skillLabel} (always available)`} arrow>
      <Box
        onClick={onOpen}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          height: 30,
          pl: 0.75,
          pr: 1,
          borderRadius: 1.5,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--muted) / 0.5)',
          cursor: onOpen ? 'pointer' : 'default',
          transition: 'all 120ms ease',
          '&:hover': onOpen
            ? {
                bgcolor: 'hsl(var(--muted) / 0.8)',
                borderColor: 'hsl(var(--primary) / 0.4)',
              }
            : undefined,
        }}
      >
        <Box
          sx={{
            width: 20,
            height: 20,
            borderRadius: 0.75,
            bgcolor: 'hsl(var(--primary) / 0.12)',
            color: 'hsl(var(--primary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.65rem',
            fontWeight: 700,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {icon ? (
            <img src={icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            display.charAt(0).toUpperCase()
          )}
        </Box>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: 'hsl(var(--foreground))' }}>
          {display}
        </Typography>
        <Box
          sx={{
            fontSize: '0.62rem',
            fontWeight: 600,
            px: 0.6,
            py: 0.15,
            borderRadius: 0.75,
            bgcolor: 'hsl(var(--primary) / 0.12)',
            color: 'hsl(var(--primary))',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}
        >
          Default
        </Box>
      </Box>
    </Tooltip>
  );
};

const ToolPill = ({
  name,
  icon,
  onRemove,
  onOpen,
}: {
  name: string;
  icon?: string;
  onRemove: () => void;
  onOpen?: () => void;
}) => {
  const display = formatToolName(name);
  return (
    <Box
      onClick={onOpen}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 30,
        pl: 0.5,
        pr: 0.5,
        borderRadius: 1.5,
        border: '1px solid hsl(var(--border))',
        bgcolor: 'hsl(var(--muted) / 0.4)',
        cursor: onOpen ? 'pointer' : 'default',
        transition: 'all 120ms ease',
        '&:hover': {
          borderColor: 'hsl(var(--primary) / 0.5)',
          bgcolor: 'hsl(var(--primary) / 0.06)',
        },
      }}
    >
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: 0.75,
          bgcolor: 'hsl(var(--background))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {icon ? (
          <img src={icon} alt={display} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))' }}>
            {display.charAt(0).toUpperCase()}
          </Typography>
        )}
      </Box>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: 'hsl(var(--foreground))', pr: 0.25 }}>
        {display}
      </Typography>
      <Tooltip title="Remove tool">
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          sx={{
            width: 20,
            height: 20,
            color: 'hsl(var(--muted-foreground))',
            '&:hover': { color: 'hsl(var(--destructive))', bgcolor: 'transparent' },
          }}
        >
          <X size={12} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

const AssignedToolsSection = ({
  agent = DEFAULT_AGENT,
  actionType = DEFAULT_ACTION_TYPE,
  compact = false,
  onSkillChange,
}: Props) => {
  const [selectedSkill, setSelectedSkill] = useState<string>(() => {
    if (agent && agent !== DEFAULT_AGENT) return agent;
    return 'incident-handler';
  });

  useEffect(() => {
    if (agent && agent !== DEFAULT_AGENT && agent !== selectedSkill) {
      setSelectedSkill(agent);
    }
  }, [agent, selectedSkill]);

  const activeSkillDef = useMemo(() => {
    return AGENT_SKILLS.find((s) => s.id === selectedSkill) || AGENT_SKILLS[0];
  }, [selectedSkill]);

  const [tools, setTools] = useState<ToolRef[]>(() => getAgentTools(selectedSkill, actionType));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const appDetail = useAppDetailOptional();

  useEffect(() => {
    if (saveStatus === 'idle') return;
    const timer = setTimeout(() => setSaveStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => setTools(getAgentTools(selectedSkill, actionType));
    refresh();

    loadAgentToolsFromDatastore()
      .then(() => {
        if (!cancelled) refresh();
      })
      .catch(() => {});

    window.addEventListener(AGENT_TOOLS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(AGENT_TOOLS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [selectedSkill, actionType]);

  const handleSkillSelect = (newSkill: string) => {
    setSelectedSkill(newSkill);
    setTools(getAgentTools(newSkill, actionType));
    if (onSkillChange) onSkillChange(newSkill);
  };

  const handleRemoveTool = (toolId: string) => {
    const updated = tools.filter(
      (t) =>
        (t.id || '').toLowerCase() !== toolId.toLowerCase() &&
        t.name.toLowerCase() !== toolId.toLowerCase(),
    );
    setTools(updated);
    saveAgentTools(updated, selectedSkill, actionType);
    setSaveStatus('saved');
  };

  useEffect(() => {
    const openPicker = () => setPickerOpen(true);
    window.addEventListener(AGENT_TOOL_PICKER_OPEN_EVENT, openPicker);
    return () => window.removeEventListener(AGENT_TOOL_PICKER_OPEN_EVENT, openPicker);
  }, []);

  const allNamesToResolve = useMemo(() => {
    return Array.from(new Set([...activeSkillDef.builtInApps, ...tools.map((t) => t.name)]));
  }, [activeSkillDef.builtInApps, tools]);

  const icons = useAppIcons(allNamesToResolve);

  const pickerSelectedApps = useMemo(
    () => tools.map((t) => ({ name: t.name, id: t.id || null, icon: icons[t.name] || '' })),
    [tools, icons],
  );

  const [pinnedSnapshot, setPinnedSnapshot] = useState<
    Array<{ name: string; image_url: string; objectID?: string }>
  >([]);
  useEffect(() => {
    if (!pickerOpen) return;
    setPinnedSnapshot(
      tools.map((t) => ({
        name: formatToolName(t.name),
        image_url: icons[t.name] || '',
        objectID: t.id || undefined,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen]);

  return (
    <>
      <Box
        sx={{
          mb: compact ? 2.5 : 3,
          borderRadius: 2,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--card))',
          overflow: 'hidden',
        }}
      >
        {/* Header row */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
            px: compact ? 2 : 2.5,
            py: 1.5,
            borderBottom: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--muted) / 0.25)',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.25,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'hsl(var(--primary) / 0.12)',
                  color: 'hsl(var(--primary))',
                  flexShrink: 0,
                }}
              >
                <Wrench size={16} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: compact ? '0.82rem' : '0.9rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                  Assigned Tools
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))' }}>
                  Agent Skill: <strong style={{ color: 'hsl(var(--foreground))' }}>{activeSkillDef.label}</strong>
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
              <Select
                size="small"
                value={selectedSkill}
                onChange={(e) => handleSkillSelect(String(e.target.value))}
                sx={{
                  height: 30,
                  minWidth: 150,
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  bgcolor: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                  borderRadius: 1.25,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--muted-foreground) / 0.3)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--primary))' },
                  '& .MuiSelect-select': { py: 0.5, px: 1 },
                }}
              >
                {AGENT_SKILLS.map((skill) => {
                  const isIncident = skill.id === 'incident-handler';
                  return (
                    <MenuItem
                      key={skill.id}
                      value={skill.id}
                      disabled={!isIncident}
                      sx={{
                        fontSize: '0.78rem',
                        opacity: isIncident ? 1 : 0.5,
                      }}
                    >
                      {skill.label} {!isIncident ? '(Coming soon)' : ''}
                    </MenuItem>
                  );
                })}
              </Select>

              {saveStatus !== 'idle' && (
                <Typography
                  sx={{
                    fontSize: '0.72rem',
                    color: 'hsl(var(--muted-foreground))',
                    fontWeight: 500,
                    mr: 0.5,
                  }}
                >
                  {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
                </Typography>
              )}

              <Button
                size="small"
                startIcon={<Plus size={14} />}
                onClick={() => setPickerOpen(true)}
                sx={{
                  height: 30,
                  px: 1.25,
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 1.25,
                  color: 'hsl(var(--foreground))',
                  bgcolor: 'hsl(var(--background))',
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  '&:hover': {
                    bgcolor: 'hsl(var(--primary) / 0.08)',
                    borderColor: 'hsl(var(--primary) / 0.4)',
                    color: 'hsl(var(--primary))',
                  },
                }}
              >
                Add tool
              </Button>
            </Box>
          </Box>

          <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))' }}>
            {activeSkillDef.description}
          </Typography>
        </Box>

        {/* Body */}
        <Box sx={{ px: compact ? 2 : 2.5, py: 1.75 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {/* Built-in default apps for this skill */}
            {activeSkillDef.builtInApps.map((appName) => (
              <BuiltInToolPill
                key={`builtin-${appName}`}
                name={appName}
                icon={icons[appName]}
                skillLabel={activeSkillDef.label}
                onOpen={appDetail ? () => appDetail.openApp(appName) : undefined}
              />
            ))}

            {/* Custom assigned tools */}
            {tools.map((t) => (
              <ToolPill
                key={t.id || t.name}
                name={t.name}
                icon={icons[t.name]}
                onRemove={() => handleRemoveTool(t.id || t.name)}
                onOpen={appDetail ? () => appDetail.openApp(t.name) : undefined}
              />
            ))}
          </Box>

          {tools.length === 0 && (
            <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', mt: 1 }}>
              {activeSkillDef.builtInApps.length > 0
                ? `Only built-in default apps are active. Click Add tool to connect integrations (EDR, SIEM, Threat Intel, Firewall) for ${activeSkillDef.label}.`
                : `No tools assigned yet — click Add tool to assign apps for ${activeSkillDef.label}.`}
            </Typography>
          )}
        </Box>
      </Box>

      <AppSearchDrawer
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setTools(getAgentTools(selectedSkill, actionType));
        }}
        title={`Assign tools to ${activeSkillDef.label}`}
        subtitle={`Pick the apps ${activeSkillDef.label} is allowed to use`}
        multiSelect
        selectedApps={pickerSelectedApps}
        pinnedApps={pinnedSnapshot}
        onSelectionChange={(apps: Array<{ name: string; id: string | null; icon: string; categories: string[] }>) => {
          const nextTools = apps.map((a) => ({ name: a.name, id: a.id || a.name }));
          setTools(nextTools);
          setAgentTools(nextTools, selectedSkill, actionType);
          saveAgentTools(nextTools, selectedSkill, actionType);
          setSaveStatus('saved');
        }}
      />
    </>
  );
};

export default AssignedToolsSection;
