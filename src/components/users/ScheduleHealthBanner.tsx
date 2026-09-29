/**
 * ScheduleHealthBanner — surfaces on-call schedule problems on /incidents
 * and /users so issues like coverage gaps or dead-end escalations are
 * visible exactly where responders work.
 *
 * Reads the `assignment_schedules` config datastore item and runs the shared
 * `analyzeSchedules` analyzer. Renders nothing when the config is healthy.
 *
 * For the common fixable issues (empty Tier 2 / Tier 3 / Manager) the banner
 * also exposes an inline user-picker so the admin can assign someone to that
 * tier without leaving the page — the global `assignment_schedules` config is
 * updated in place and the banner refreshes.
 */

import { X as CloseIcon, ChevronDown as ExpandMoreIcon, ExternalLink as OpenInNewIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, AlertTitle, Box, Button, Collapse, IconButton, Stack, Typography,
  Select, MenuItem, FormControl, CircularProgress,
} from '@mui/material';
import { useNavigate } from '@/lib/router-compat';
import { toast } from '@/lib/toast';
import { getDatastoreItem, setDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';
import {
  analyzeSchedules,
  highestSeverity,
  type ScheduleIssue,
} from '@/lib/scheduleHealth';
import type {
  AssignmentConfig,
  UserSchedule,
  EscalationLevel,
  ScheduleEntry,
} from '@/components/users/OnCallScheduleManager';
import { computeDefaultPolicy } from '@/components/users/OnCallScheduleManager';
import { useUsers } from '@/hooks/useUsers';
import { useIsAdmin } from '@/hooks/useIsAdmin';

interface ScheduleHealthBannerProps {
  manageHref?: string;
  hideManageCta?: boolean;
  compact?: boolean;
  dismissKey?: string;
  minIncidents?: number;
  incidentCount?: number;
}

const SEVERITY_LABEL = {
  critical: 'On-call schedule issues need attention',
  warning: 'On-call schedule could be improved',
  info: 'On-call schedule notes',
} as const;

// Map fixable issues to the tier they need a user assigned to.
const ISSUE_TO_TIER: Record<string, EscalationLevel> = {
  'orphan-tier2': 'tier2',
  'orphan-tier3': 'tier3',
  'no-manager': 'manager',
  'no-escalation-path': 'tier2',
};

const TIER_LABEL: Record<EscalationLevel, string> = {
  tier1: 'Tier 1',
  tier2: 'Tier 2',
  tier3: 'Tier 3',
  manager: 'Manager',
};

const generateId = () => Math.random().toString(36).substring(2, 12);

const alwaysOnEntry = (): ScheduleEntry => ({
  id: generateId(),
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  startTime: '00:00',
  endTime: '23:59',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
});

export const ScheduleHealthBanner = ({
  manageHref = '/users',
  hideManageCta = false,
  compact = false,
  dismissKey,
  minIncidents,
  incidentCount,
}: ScheduleHealthBannerProps) => {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const { users } = useUsers();
  const [config, setConfig] = useState<AssignmentConfig | null>(null);
  const [issues, setIssues] = useState<ScheduleIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [savingIssue, setSavingIssue] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!dismissKey || typeof window === 'undefined') return false;
    try { return window.localStorage.getItem(dismissKey) === '1'; } catch { return false; }
  });

  const issuesSignature = useMemo(
    () => issues.map(i => `${i.severity}:${i.id}`).sort().join('|'),
    [issues],
  );

  const reload = async () => {
    try {
      const response = await getDatastoreItem(
        'assignment_schedules',
        DATASTORE_CATEGORIES.CONFIGURATION,
      );
      let data: AssignmentConfig = { userSchedules: [], updatedAt: '' };
      if (response.success && response.item?.value) {
        data = typeof response.item.value === 'string'
          ? JSON.parse(response.item.value)
          : response.item.value;
      }
      setConfig(data);
      setIssues(analyzeSchedules(data.userSchedules || []));
    } catch {
      setConfig(null);
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await reload(); })();
    return () => { cancelled = true; };
  }, []);

  // Users not yet assigned to the given tier — used to populate the picker.
  const availableUsersForTier = (tier: EscalationLevel) => {
    const assignedIds = new Set(
      (config?.userSchedules || [])
        .filter(s => s.enabled && s.escalationLevel === tier)
        .map(s => s.userId.split('::')[0]),
    );
    return users.filter(u => u.active !== false && !assignedIds.has(u.id));
  };

  const handleAssign = async (issueId: string, tier: EscalationLevel, userId: string) => {
    if (!config) return;
    const user = users.find(u => u.id === userId);
    if (!user) return;
    setSavingIssue(issueId);
    try {
      const newSchedule: UserSchedule = {
        userId: tier === 'tier1' ? user.id : `${user.id}::${tier}`,
        userName: user.username,
        userEmail: user.username,
        escalationLevel: tier,
        schedules: [alwaysOnEntry()],
        enabled: true,
      };
      const newConfig: AssignmentConfig = {
        ...config,
        userSchedules: [...config.userSchedules, newSchedule],
        updatedAt: new Date().toISOString(),
        defaultPolicy: computeDefaultPolicy([...config.userSchedules, newSchedule]),
      };
      const response = await setDatastoreItem(
        'assignment_schedules',
        newConfig,
        DATASTORE_CATEGORIES.CONFIGURATION,
      );
      if (response.success) {
        toast.success(`${user.username} assigned to ${TIER_LABEL[tier]}`);
        await reload();
      } else {
        throw new Error(response.error || 'Failed to update schedule');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign user');
    } finally {
      setSavingIssue(null);
    }
  };

  if (!isAdmin) return null;
  if (loading || issues.length === 0) return null;
  if (typeof minIncidents === 'number' && (incidentCount ?? 0) < minIncidents) return null;
  if (dismissed && dismissKey) {
    try {
      const lastSig = window.localStorage.getItem(`${dismissKey}:sig`);
      if (lastSig === issuesSignature) return null;
    } catch {
      return null;
    }
  }

  const top = highestSeverity(issues);
  if (!top) return null;

  const handleDismiss = () => {
    if (!dismissKey) return;
    try {
      window.localStorage.setItem(dismissKey, '1');
      window.localStorage.setItem(`${dismissKey}:sig`, issuesSignature);
    } catch { /* ignore */ }
    setDismissed(true);
  };

  const severity: 'error' | 'warning' | 'info' =
    top === 'critical' ? 'error' : top === 'warning' ? 'warning' : 'info';

  return (
    <Box sx={{ mb: compact ? 2 : 3 }}>
      <Alert
        severity={severity}
        sx={{
          borderRadius: 2,
          border: '1px solid',
          borderColor: severity === 'error'
            ? 'hsl(var(--destructive) / 0.4)'
            : severity === 'warning'
              ? 'hsl(38 92% 50% / 0.4)'
              : 'hsl(var(--primary) / 0.4)',
          bgcolor: 'hsl(var(--card))',
          color: 'hsl(var(--foreground))',
          '& .MuiAlert-icon': {
            color: severity === 'error'
              ? 'hsl(var(--destructive))'
              : severity === 'warning'
                ? 'hsl(38 92% 50%)'
                : 'hsl(var(--primary))',
          },
        }}
        action={
          <Stack direction="row" spacing={0.5} alignItems="center">
            {!hideManageCta && (
              <Button
                size="small"
                endIcon={<OpenInNewIcon size={14} />}
                onClick={() => navigate(manageHref)}
                sx={{
                  color: 'hsl(var(--foreground))',
                  textTransform: 'none',
                  '&:hover': { bgcolor: 'hsl(var(--muted) / 0.4)' },
                }}
              >
                Manage schedules
              </Button>
            )}
            <IconButton
              size="small"
              onClick={() => setExpanded(v => !v)}
              sx={{
                color: 'hsl(var(--muted-foreground))',
                transition: 'transform 0.2s',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <ExpandMoreIcon size={20} />
            </IconButton>
            {dismissKey && (
              <IconButton
                size="small"
                aria-label="Dismiss"
                onClick={handleDismiss}
                sx={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <CloseIcon size={20} />
              </IconButton>
            )}
          </Stack>
        }
      >
        <AlertTitle sx={{ fontWeight: 600, mb: 0.25 }}>
          {SEVERITY_LABEL[top]} ({issues.length})
        </AlertTitle>
        <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
          {issues[0].title}
        </Typography>
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Stack spacing={1.25} sx={{ mt: 1.5 }}>
            {issues.map(issue => {
              const tier = ISSUE_TO_TIER[issue.id];
              const candidates = tier ? availableUsersForTier(tier) : [];
              const isSaving = savingIssue === issue.id;

              return (
                <Box
                  key={issue.id}
                  sx={{
                    p: 1.5,
                    borderRadius: 1.5,
                    border: '1px solid hsl(var(--border))',
                    bgcolor: 'hsl(var(--muted) / 0.3)',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', mb: 0.25 }}
                  >
                    {issue.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                    {issue.detail}
                  </Typography>

                  {tier && (
                    <Box sx={{ mt: 1.25, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                        Assign {TIER_LABEL[tier]}:
                      </Typography>
                      <FormControl size="small" sx={{ minWidth: 220 }}>
                        <Select
                          displayEmpty
                          value=""
                          disabled={isSaving || candidates.length === 0}
                          onChange={(e) => handleAssign(issue.id, tier, String(e.target.value))}
                          sx={{
                            height: 32,
                            fontSize: 13,
                            color: 'hsl(var(--foreground))',
                            bgcolor: 'hsl(var(--background))',
                            '& .MuiOutlinedInput-notchedOutline': {
                              borderColor: 'hsl(var(--border))',
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                              borderColor: 'hsl(var(--primary))',
                            },
                          }}
                        >
                          <MenuItem value="" disabled>
                            {candidates.length === 0
                              ? 'No available users'
                              : `Select a user…`}
                          </MenuItem>
                          {candidates.map(u => (
                            <MenuItem key={u.id} value={u.id}>
                              {u.username}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      {isSaving && (
                        <CircularProgress size={14} sx={{ color: 'hsl(var(--primary))' }} />
                      )}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Collapse>
      </Alert>
    </Box>
  );
};

export default ScheduleHealthBanner;
