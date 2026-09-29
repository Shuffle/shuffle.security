import {
  Box,
  Typography,
  Paper,
  Chip,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  ENTITY_OPTIONS,
  setEntityPreference,
  useEntityPreference,
  useShowAutomation,
  setShowAutomation,
  useAutoMergeThread,
  setAutoMergeThread,

  useSidebarTabs,
  setSidebarTabVisibility,
  SidebarTabKey,
} from '@/hooks/useEntityLabel';
import { SIDEBAR_NAV } from '@/config/sidebarNav';
import { TaskStatusesEditor } from '@/components/settings/TaskStatusesEditor';
import { SlaEditor } from '@/components/settings/SlaEditor';
import { DefaultEnvironmentSelector } from '@/components/settings/DefaultEnvironmentSelector';

import { useAuth } from '@/context/AuthContext';
import { PROPAGATABLE_AUTOMATIONS, useAutomationPropagation, setAutomationPropagation } from '@/lib/automationPropagation';
import { usePageMeta } from '@/hooks/usePageMeta';


const AutomationPropagationSelector = () => {
  const prefs = useAutomationPropagation();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {PROPAGATABLE_AUTOMATIONS.map((a) => {
        const on = prefs[a.name] === true;
        return (
          <Box key={a.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{a.name}</Typography>
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>{a.description}</Typography>
            </Box>
            <Chip
              label={on ? 'Enabled' : 'Disabled'}
              onClick={() => setAutomationPropagation(a.name, !on)}
              variant="filled"
              sx={{
                fontWeight: 600,
                bgcolor: on ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                color: on ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                '&:hover': { bgcolor: on ? 'hsl(var(--primary) / 0.9)' : 'hsl(var(--muted) / 0.8)' },
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
};

const TerminologySelector = () => {
  const { value } = useEntityPreference();
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      {ENTITY_OPTIONS.map((opt) => (
        <Chip
          key={opt.value}
          label={opt.plural}
          onClick={() => setEntityPreference(opt.value)}
          variant={value === opt.value ? 'filled' : 'outlined'}
          sx={{
            fontWeight: value === opt.value ? 600 : 400,
            bgcolor: value === opt.value ? 'hsl(var(--primary))' : 'transparent',
            color: value === opt.value ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
            borderColor: 'hsl(var(--border))',
            '&:hover': {
              bgcolor: value === opt.value ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.1)',
            },
          }}
        />
      ))}
    </Box>
  );
};

/**
 * Renders one toggle row per item in `SIDEBAR_NAV` — the same config the
 * actual left sidebar consumes. Adding/removing items there automatically
 * shows up here (no path/label lookup tables to maintain).
 *
 * Toggling a parent off cascades and disables its children so the
 * persisted state stays consistent with what the user sees in the sidebar.
 */
const SidebarTabsSelector = () => {
  const tabs = useSidebarTabs();
  const { userInfo } = useAuth();
  const isSupport = userInfo?.support === true;

  const handleToggle = (key: SidebarTabKey, currentValue: boolean) => {
    const next = { ...tabs, [key]: !currentValue };
    // If a parent group is being turned off, also turn off its children so
    // they don't reappear later if the parent is re-enabled.
    if (next[key] === false) {
      const parent = SIDEBAR_NAV.find((item) => item.tabKey === key);
      if (parent?.children) {
        for (const c of parent.children) next[c.tabKey] = false;
      }
    }
    setSidebarTabVisibility(next);
  };

  const switchSx = {
    '& .MuiSwitch-switchBase.Mui-checked': {
      color: 'hsl(var(--primary))',
    },
    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
      backgroundColor: 'hsl(var(--primary))',
    },
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}>
      {SIDEBAR_NAV.map((item) => {
        // Hide support-only top-level items for non-support users so we don't
        // expose toggles that would never affect the sidebar they see.
        if (item.supportOnly && !isSupport) return null;

        // For always-visible items (Incidents) the parent stays enabled but
        // its children remain individually togglable.
        const parentChecked = item.alwaysVisible ? true : tabs[item.tabKey] !== false;
        const parentDisabled = !parentChecked;
        // Visible children — drop support-only ones for non-support users.
        const visibleChildren = (item.children ?? []).filter(
          (c) => !c.supportOnly || isSupport,
        );

        return (
          <Box key={item.tabKey}>
            {/* Parent row */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: parentDisabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                }}
              >
                {item.label}
              </Typography>
              {item.alwaysVisible ? (
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
                  Always visible
                </Typography>
              ) : (
                <Switch
                  checked={parentChecked}
                  onChange={() => handleToggle(item.tabKey, parentChecked)}
                  size="small"
                  sx={switchSx}
                />
              )}
            </Box>

            {/* Children */}
            {visibleChildren.length > 0 && (
              <Box sx={{ ml: 2.5, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0 }}>
                {visibleChildren.map((child) => {
                  const childChecked = !parentDisabled && tabs[child.tabKey] !== false;
                  return (
                    <FormControlLabel
                      key={child.tabKey}
                      disabled={parentDisabled}
                      control={
                        <Switch
                          checked={childChecked}
                          onChange={() => handleToggle(child.tabKey, childChecked)}
                          size="small"
                          disabled={parentDisabled}
                          sx={switchSx}
                        />
                      }
                      label={
                        <Typography
                          variant="body2"
                          sx={{
                            color: parentDisabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                            opacity: parentDisabled ? 0.5 : 1,
                          }}
                        >
                          {child.label}
                        </Typography>
                      }
                      sx={{ ml: 0 }}
                    />
                  );
                })}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

const OrgPreferencesPage = ({ embedded = false }: { embedded?: boolean }) => {

  usePageMeta({
    title: 'UI preferences',
    description: 'Configure terminology, sidebar visibility, SLA targets, and UI preferences.',
    url: '/admin/preferences',
  });
  const showAutomation = useShowAutomation();
  const autoMergeThread = useAutoMergeThread();


  return (
    <Box sx={embedded ? { width: '100%' } : { p: 4, maxWidth: 900, width: '100%', mx: 'auto' }}>
      {!embedded && (
        <>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 1, color: 'hsl(var(--foreground))' }}>
            UI Preferences
          </Typography>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 3 }}>
            Configure terminology, sidebar visibility, and UI display settings
          </Typography>
        </>
      )}


      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Default runtime location (environment workflows execute in) */}
        <Paper
          sx={{
            p: 2.5,
            bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Default Runtime Location
            </Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Where workflows execute by default. Archived environments and sensor groups cannot be selected.
            </Typography>
          </Box>
          <DefaultEnvironmentSelector />
        </Paper>

        {/* Terminology */}

        <Paper
          sx={{
            p: 2.5,
            bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Terminology
            </Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Choose what to call your security work items across the platform
            </Typography>
          </Box>
          <TerminologySelector />
        </Paper>

        {/* Automation Pipeline */}
        <Paper
          sx={{
            p: 2.5,
            bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Automation Pipeline
            </Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Display ingest/forward sources and automation controls on the main page
            </Typography>
          </Box>
          <Chip
            label={showAutomation ? 'Enabled' : 'Disabled'}
            onClick={() => setShowAutomation(!showAutomation)}
            variant="filled"
            sx={{
              fontWeight: 600,
              bgcolor: showAutomation ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
              color: showAutomation ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
              '&:hover': {
                bgcolor: showAutomation ? 'hsl(var(--primary) / 0.9)' : 'hsl(var(--muted) / 0.8)',
              },
            }}
          />
        </Paper>

        {/* Auto Merge Thread */}
        <Paper
          sx={{
            p: 2.5,
            bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Auto Merge Thread
            </Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Automatically merge incidents that share the same email thread into the latest one, without requiring a click.
            </Typography>
          </Box>
          <Chip
            label={autoMergeThread ? 'Enabled' : 'Disabled'}
            onClick={() => setAutoMergeThread(!autoMergeThread)}
            variant="filled"
            sx={{
              fontWeight: 600,
              bgcolor: autoMergeThread ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
              color: autoMergeThread ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
              '&:hover': {
                bgcolor: autoMergeThread ? 'hsl(var(--primary) / 0.9)' : 'hsl(var(--muted) / 0.8)',
              },
            }}
          />
        </Paper>

        {/* Automation auto-propagation to child tenants */}
        <Paper
          sx={{
            p: 2.5,
            bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Automation Auto-propagation
            </Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              When an automation type is saved in "Automation for X" on this tenant, copy it to all child tenants in the background.
            </Typography>
          </Box>
          <AutomationPropagationSelector />
        </Paper>

        {/* Task Statuses (kanban lanes) */}

        <Paper
          sx={{
            p: 2.5,
            bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Task Statuses
            </Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Configure the kanban lanes for incident tasks. Drag to reorder, click the swatch to recolor.
              The "Done" lane is required and represents completed tasks.
            </Typography>
          </Box>
          <TaskStatusesEditor />
        </Paper>

        {/* SLA targets per severity */}
        <Paper
          sx={{
            p: 2.5,
            bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              SLA Targets
            </Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              How quickly the team must respond to and resolve incidents at each severity. The
              "Fallback" row is used when an incident has no severity. Defaults follow common
              MSSP and NIST SP 800-61 guidance — adjust to match your service commitments.
            </Typography>
          </Box>
          <SlaEditor />
        </Paper>

        {/*
          Sidebar Navigation — kept as the LAST card on this page so users
          always know where to find it. This card and the actual sidebar
          read from the same SIDEBAR_NAV config, so toggling here is
          guaranteed to match what the sidebar renders.
        */}
        <Paper
          sx={{
            p: 2.5,
            bgcolor: 'transparent', backgroundImage: 'none', backdropFilter: 'blur(12px)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Sidebar Navigation
            </Typography>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Show or hide sections in the left sidebar. The Incidents tab is always visible.
              These toggles map one-to-one to the items in the sidebar.
            </Typography>
          </Box>
          <SidebarTabsSelector />
        </Paper>
      </Box>
      <Box sx={{ height: 200 }} />
    </Box>
  );
};

export default OrgPreferencesPage;
