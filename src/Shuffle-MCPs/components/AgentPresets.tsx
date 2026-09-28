/**
 * AgentPresets — compact "+ Templates" trigger shown above the AgentUI textbox.
 *
 * Self-contained: no host-app `@/` imports. Consumers can override the template
 * list via the `presets` prop; otherwise the built-in {@link AGENT_PRESETS}
 * list is used.
 *
 * Enabled templates notify the consumer via the `onSelectPreset` callback. The
 * consumer is responsible for forwarding the preset to the backend API; the
 * frontend no longer seeds the prompt or pre-selects tools locally. Disabled
 * presets render with a "coming soon" chip and are not clickable.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Button, ButtonBase, ClickAwayListener, Paper, Popper, type PopperProps, TextField, Tooltip, Typography, SxProps, Theme } from '@mui/material';
import { Workflow, ShieldAlert, LifeBuoy, Bug, Radar, Monitor, Plus, X as CloseIcon, BellRing } from 'lucide-react';
import { AppFallbackIcon } from './AppFallbackIcon';
import { getPopupZIndex } from '../drawerLayer';
import { useShuffleMcpTheme } from '../ShuffleMcpThemeProvider';


export interface AgentPreset {
  id: string;
  label: string;
  description: string;
  /** Default prompt seed — will pre-fill the AgentUI when the preset is clicked. */
  defaultPrompt: string;
  icon: React.ReactNode;
  /** When true, the preset is clickable and pre-fills the prompt. Others are placeholders. */
  enabled?: boolean;
  /** Optional badge/tag label to display next to the preset name, e.g. "Beta", "Coming soon" */
  tag?: string;
  /** Optional tools/apps to pre-select when this preset is clicked. */
  defaultApps?: Array<{ name: string; id?: string; icon?: string }>;
  /**
   * Tools this skill cannot run without. They are always selected and cannot
   * be removed from the Tools chip row while the skill is active.
   */
  requiredApps?: string[];
}

/** Normalized comparison for app/tool names ("Shuffle Apps" -> "shuffle_apps"). */
const normalizeToolName = (name: string) =>
  (name || '').toLowerCase().trim().replace(/[\s-]+/g, '_');

/** True when `appName` is a required (non-removable) tool of `preset`. */
export const isRequiredPresetApp = (
  preset: AgentPreset | null | undefined,
  appName: string,
): boolean => {
  if (!preset?.requiredApps || preset.requiredApps.length === 0) return false;
  const slug = normalizeToolName(appName);
  return preset.requiredApps.some((r) => normalizeToolName(r) === slug);
};

/** "shuffle_software_and_packages" -> "Shuffle Software and Packages" */
const prettyAppName = (name: string) => {
  const words = (name || '').replace(/[_-]+/g, ' ').trim().split(/\s+/);
  return words
    .map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && (lower === 'and' || lower === 'or' || lower === 'of' || lower === 'the' || lower === 'in' || lower === 'on')) {
        return lower;
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
};

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: 'build-workflows',
    label: 'Build Workflow',
    description: 'Designs and builds Shuffle workflows for you — pick apps, wire actions, and iterate on automations from a description.',
    defaultPrompt: 'Build a Shuffle workflow that ',
    icon: <Workflow size={16} />,
    enabled: true,
    defaultApps: [{ name: 'shuffle_workflows_builder' }, { name: 'shuffle_apps' }],
    requiredApps: ['shuffle_workflows_builder', 'shuffle_apps'],
  },
  {
    id: 'incident-response',
    label: 'Incident Handler',
    description: 'Holistic incident investigation & response — triages alerts, closes false positives, escalates threats, executes or stages containment, tunes noisy detections, and documents findings.',
    defaultPrompt: 'Investigate this incident, assess severity, and take appropriate action (resolve, escalate, contain, or document): ',
    icon: <ShieldAlert size={16} />,
    enabled: true,
    tag: 'Beta',
    defaultApps: [{ name: 'shuffle_incidents' }],
  },
  {
    id: 'host-monitor-control',
    label: 'Computer Use',
    description: 'Controls a host computer primarily through the command line, with screenshots and mouse/keyboard input as secondary options — useful for hands-on remediation or guided walkthroughs.',
    defaultPrompt: 'Take control of this host and help me with: ',
    icon: <Monitor size={16} />,
    enabled: true,
    defaultApps: [{ name: 'shuffle_host_monitors' }],
    requiredApps: ['shuffle_host_monitors'],
  },
  {
    id: 'support',
    label: 'Support Agent',
    description: 'Uses the platform on your behalf — navigates settings, runs diagnostics, and answers "how do I…" questions.',
    defaultPrompt: 'Help me with the following on the Shuffle platform: ',
    icon: <LifeBuoy size={16} />,
    enabled: false,
    tag: 'Coming soon',
    defaultApps: [{ name: 'shuffle_tools' }],
  },
  {
    id: 'vulnerability',
    label: 'Vulnerability Agent',
    description: 'Helps you solve vulnerabilities — demystifies CVEs in plain language, reviews affected packages and OSV advisory data, and guides you through remediation steps.',
    defaultPrompt: 'Help me review and solve this vulnerability: ',
    icon: <Bug size={16} />,
    enabled: true,
    tag: 'Beta',
    defaultApps: [
      { name: 'shuffle_vulnerabilities' },
      { name: 'shuffle_software_and_packages' },
    ],
  },
  {
    id: 'detection',
    label: 'Detection Agent',
    description: 'Creates and tunes detection rules (Sigma, pipelines) — adjusts logic, filters false positives, and validates coverage.',
    defaultPrompt: 'Modify my detections to ',
    icon: <Radar size={16} />,
    enabled: false,
    tag: 'Coming soon',
    defaultApps: [{ name: 'shuffle_detection' }],
  },
  {
    id: 'handle-notifications',
    label: 'Handle Notifications',
    description: 'Automatically handles incoming incidents for you — triages, enriches, and resolves or escalates based on your rules.',
    defaultPrompt: 'Automatically handle incoming incidents by ',
    icon: <BellRing size={16} />,
    enabled: false,
    tag: 'Coming soon',
    defaultApps: [{ name: 'shuffle_incidents' }],
  },
];

/** True when the signed-in user is a Shuffle support user (/getinfo => support). */
export const isSupportUser = (): boolean => {
  try {
    const keys = ['shuffle_user_info', 'userinfo', 'user_info'];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) || {};
      const support = parsed?.support ?? parsed?.user?.support ?? parsed?.userdata?.support;
      if (support === true || support === 'true') return true;
    }
    return false;
  } catch {
    return false;
  }
};

/** Templates that are support-only for now — disabled ("coming soon") for everyone else. */
const SUPPORT_ONLY_PRESET_IDS = ['host-monitor-control'];

/** Disables support-only templates unless the current user is a support user. */
export const filterAgentPresets = (list: AgentPreset[], support?: boolean): AgentPreset[] => {
  if (support === true || (support === undefined && isSupportUser())) return list;
  return list.map((p) => (SUPPORT_ONLY_PRESET_IDS.includes(p.id) ? { ...p, enabled: false } : p));
};


export interface AgentPresetsProps {
  /** Inline variant sits inside the prompt input row alongside action buttons. */
  variant?: 'default' | 'inline' | 'floating';
  /** Called when the user picks a preset — receives the preset's default prompt seed. */
  onSelectPreset?: (preset: AgentPreset) => void;
  /** Optional currently selected preset — turns the trigger into a chip showing the preset label. */
  selectedPreset?: AgentPreset | null;
  /** Called when the user clicks the remove (X) button on a selected preset chip. */
  onRemoveSelected?: () => void;
  /** Override the built-in preset list. */
  presets?: AgentPreset[];
  /** Ref forwarded to the trigger button so the host can measure its width. */
  chipRef?: React.Ref<HTMLButtonElement>;
  /** Authoritative support flag from the host's getinfo payload. */
  isSupport?: boolean;
  /** Optional style overrides for the trigger button */
  sx?: SxProps<Theme>;
  /** Popper placement override (defaults to 'bottom-start') */
  placement?: PopperProps['placement'];
}


export const AgentPresets = ({ variant = 'default', onSelectPreset, selectedPreset, onRemoveSelected, presets, chipRef, isSupport, sx, placement }: AgentPresetsProps) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  // Support status hydrates asynchronously (/getinfo), so re-read it when the
  // dropdown opens and when storage changes instead of only on first mount.
  const [supportTick, setSupportTick] = useState(0);
  useEffect(() => {
    const bump = () => setSupportTick((t) => t + 1);
    window.addEventListener('storage', bump);
    return () => window.removeEventListener('storage', bump);
  }, []);
  const list = useMemo(
    () => filterAgentPresets(presets && presets.length > 0 ? presets : AGENT_PRESETS, isSupport),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [presets, supportTick, open, isSupport],
  );


  const MAX_LABEL_CHARS = 18;
  const cleanLabel = selectedPreset?.label?.replace(/\s+Agent$/i, '') || '';
  const displayLabel = selectedPreset
    ? (cleanLabel.length > MAX_LABEL_CHARS ? `${cleanLabel.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…` : cleanLabel)
    : 'Skills';

  const trigger = (
    <ButtonBase
      ref={chipRef}
      onClick={(e) => setAnchorEl(e.currentTarget)}
      aria-label={selectedPreset ? `Skill: ${selectedPreset.label}` : 'Select skill'}
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          height: variant === 'floating' ? 30 : variant === 'inline' ? 38 : 32,
          px: variant === 'floating' ? '9px' : '12px',
          py: 0,
          borderRadius: 999,
          border: '1px solid hsl(var(--border))',
          color: selectedPreset ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
          bgcolor: selectedPreset ? 'hsl(var(--muted) / 0.7)' : 'transparent',
          fontSize: variant === 'floating' ? '0.75rem' : '0.78rem',
          fontWeight: 500,
          flexShrink: 0,
          boxSizing: 'border-box',
          cursor: 'pointer',
          transition: 'background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
          '&:hover': {
            bgcolor: selectedPreset ? 'hsl(var(--muted) / 0.9)' : 'hsl(var(--muted) / 0.5)',
            borderColor: selectedPreset ? 'hsl(var(--muted-foreground) / 0.35)' : 'hsl(var(--border))',
            boxShadow: selectedPreset ? '0 1px 4px hsl(var(--background) / 0.35)' : 'none',
          },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: selectedPreset ? 'hsl(var(--primary))' : 'inherit',
          '& svg': {
            width: variant === 'floating' ? 14 : 16,
            height: variant === 'floating' ? 14 : 16,
          },
        }}
      >
        {selectedPreset ? (selectedPreset.icon ?? undefined) : <Plus size={variant === 'floating' ? 12 : 14} />}
      </Box>

      <Typography
        component="span"
        sx={{
          fontSize: 'inherit',
          fontWeight: 'inherit',
          color: 'inherit',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 150,
        }}
      >
        {displayLabel}
      </Typography>

      {selectedPreset && (
        <Box
          component="span"
          role="button"
          aria-label="Remove skill"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveSelected?.();
          }}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            ml: '1px',
            p: '2px',
            borderRadius: '50%',
            cursor: 'pointer',
            flexShrink: 0,
            color: 'hsl(var(--muted-foreground))',
            transition: 'background-color 120ms ease, color 120ms ease',
            '&:hover': {
              bgcolor: 'hsl(var(--foreground) / 0.12)',
              color: 'hsl(var(--foreground))',
            },
          }}
        >
          <CloseIcon size={variant === 'floating' ? 11 : 12} />
        </Box>
      )}
    </ButtonBase>
  );


  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      p.label.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.tag && p.tag.toLowerCase().includes(q)),
    );
  }, [list, query]);

  const themeScope = useShuffleMcpTheme();
  const scopeClassName = themeScope?.scopeClassName || 'shuffle-mcp-scope';
  const popperZIndex = getPopupZIndex();

  const menu = open ? (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement={placement || 'bottom-start'}
      className={scopeClassName}
      data-shuffle-layer="popup"
      style={{ zIndex: popperZIndex }}
      modifiers={[
        { name: 'offset', options: { offset: [0, 6] } },
        { name: 'preventOverflow', options: { padding: 8 } },
      ]}
    >
      <ClickAwayListener onClickAway={() => { setAnchorEl(null); setQuery(''); }}>
        <Paper
          className={scopeClassName}
          data-shuffle-layer="popup"
          sx={{
            width: 360,
            maxWidth: '90vw',
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 8px 24px hsl(var(--background) / 0.4)',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid hsl(var(--border))' }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'hsl(var(--muted-foreground))' }}>
              Agent skills
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', opacity: 0.7, mt: 0.25 }}>
              Click a skill to seed the prompt. More coming soon.
            </Typography>
          </Box>
          <Box sx={{ px: 1, pt: 1 }}>
            <TextField
              autoFocus
              size="small"
              fullWidth
              placeholder="Search skills…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: '0.8rem',
                  bgcolor: 'hsl(var(--background))',
                  '& fieldset': { borderColor: 'hsl(var(--border))' },
                  '&:hover fieldset': { borderColor: 'hsl(var(--border))' },
                  '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                },
                '& input': { color: 'hsl(var(--foreground))', py: '6px' },
              }}
            />
          </Box>
          <Box sx={{ maxHeight: 300, overflowY: 'auto', py: 0.5 }}>
            {filtered.length === 0 ? (
              <Box sx={{ px: 1.5, py: 2, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                  No skills match "{query}"
                </Typography>
              </Box>
            ) : (
              <>
                {filtered.map((p) => (
                  <Box
                    key={p.id}
                    role="button"
                    aria-disabled={!p.enabled}
                    onClick={p.enabled ? () => {
                      onSelectPreset?.(p);
                      setAnchorEl(null);
                      setQuery('');
                    } : undefined}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1.25,
                      py: 1,
                      px: 1.5,
                      cursor: p.enabled ? 'pointer' : 'not-allowed',
                      opacity: p.enabled ? 1 : 0.65,
                      '&:hover': { bgcolor: p.enabled ? 'hsl(var(--muted))' : 'transparent' },
                    }}
                  >
                    <Box
                      sx={{
                        mt: 0.25,
                        width: 26,
                        height: 26,
                        borderRadius: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'hsl(var(--muted))',
                        color: 'hsl(var(--muted-foreground))',
                        flexShrink: 0,
                      }}
                    >
                      {p.icon}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                          {p.label}
                        </Typography>
                        {(() => {
                          const tag = p.tag || (!p.enabled ? 'Coming soon' : null);
                          if (!tag) return null;
                          const isBeta = tag.toLowerCase() === 'beta';
                          return (
                            <Typography
                              sx={{
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                letterSpacing: 0.5,
                                color: isBeta ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                                bgcolor: isBeta ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--muted))',
                                border: isBeta ? '1px solid hsl(var(--primary) / 0.25)' : '1px solid transparent',
                                px: 0.75,
                                py: '2px',
                                borderRadius: 999,
                                lineHeight: 1,
                                flexShrink: 0,
                              }}
                            >
                              {tag}
                            </Typography>
                          );
                        })()}
                      </Box>
                      <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4, mt: 0.25 }}>
                        {p.description}
                      </Typography>
                    </Box>
                    {(p.defaultApps?.length ?? 0) > 0 && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexShrink: 0 }}>
                        {p.defaultApps!.map((app) => (
                          <Tooltip
                            key={app.name}
                            title={prettyAppName(app.name)}
                            placement="top"
                            arrow
                            enterDelay={150}
                            disableInteractive
                            slotProps={{
                              popper: {
                                // The template list lives inside a Popper that can move
                                // (async icon loads, filtering). A portalled tooltip keeps
                                // its stale anchor position, so keep it in-flow and let
                                // popper.js re-evaluate against the viewport.
                                disablePortal: true,
                                modifiers: [
                                  { name: 'flip', enabled: true, options: { fallbackPlacements: ['bottom', 'left'] } },
                                  { name: 'preventOverflow', enabled: true, options: { boundary: 'viewport', padding: 8 } },
                                ],
                              },
                            }}
                          >
                            <Box
                              sx={{
                                width: 22,
                                height: 22,
                                borderRadius: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                bgcolor: 'hsl(var(--muted))',
                                border: '1px solid hsl(var(--border))',
                                color: 'hsl(var(--muted-foreground))',
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                filter: 'grayscale(1)',
                                opacity: 0.65,
                                transition: 'filter 120ms ease, opacity 120ms ease',
                                '&:hover': { filter: 'none', opacity: 1, color: 'hsl(var(--foreground))' },
                              }}
                            >
                              <AppFallbackIcon
                                name={prettyAppName(app.name)}
                                imageUrl={app.icon}
                                size={22}
                                style={{ borderRadius: 4 }}
                              />

                            </Box>
                          </Tooltip>
                        ))}
                      </Box>
                    )}

                  </Box>
                ))}
                <Box
                  role="button"
                  aria-disabled
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.25,
                    py: 1,
                    px: 1.5,
                    cursor: 'not-allowed',
                    '&:hover': { bgcolor: 'transparent' },
                    borderTop: filtered.length > 0 ? '1px solid hsl(var(--border))' : undefined,
                    mt: filtered.length > 0 ? 0.5 : 0,
                  }}
                >
                  <Box
                    sx={{
                      mt: 0.25,
                      width: 26,
                      height: 26,
                      borderRadius: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'hsl(var(--muted))',
                      color: 'hsl(var(--muted-foreground))',
                      flexShrink: 0,
                    }}
                  >
                    <Plus size={14} />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                        Add your own
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          letterSpacing: 0.5,
                          color: 'hsl(var(--muted-foreground))',
                          bgcolor: 'hsl(var(--muted))',
                          px: 0.75,
                          py: '2px',
                          borderRadius: 999,
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                      >
                        Coming soon
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4, mt: 0.25 }}>
                      Create custom skills for your organization.
                    </Typography>
                  </Box>
                </Box>
              </>
            )}
          </Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  ) : null;


  return (
    <>
      {trigger}
      {menu}
    </>
  );
};

export default AgentPresets;
