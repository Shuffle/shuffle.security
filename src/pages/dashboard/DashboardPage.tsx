/**
 * Dashboard Page — CTA-focused setup guide + AI Agent notifications.
 */

import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Skeleton,
  Chip,
  IconButton,
  Tooltip, Tooltip as MuiTooltip,
  Button,
  Avatar,
  LinearProgress,
  Autocomplete,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListSubheader,
  Collapse,
} from '@mui/material';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, Loader2, HelpCircle, Clock, MessageSquare, ChevronRight, Plug, KeyRound, ArrowDownToLine, Send, Radar, Monitor, Shield, Sparkles, Check, ArrowRight, ExternalLink, EyeOff, Undo2, ExternalLink as OpenInNewIcon, RefreshCw as RefreshIcon } from 'lucide-react';
import { Link, useNavigate } from '@/lib/router-compat';
import AgentQuestionDialog from '@/components/agent/AgentQuestionDialog';
import AgentQuickViewDrawer, { type QuickViewItem } from '@/components/agent/AgentQuickViewDrawer';
import InlineMarkdown from '@/components/shared/InlineMarkdown';
import { useAgentNotifications } from '@/hooks/useNotifications';
import { isApprovalNotification, approveAgentAction, continueAgentExecution, stripAgentTitlePrefix, type AgentNotification } from '@/services/notifications';
import { getShuffleCoreFormUrl, isAgentApprovalFormUrl } from '@/Shuffle-MCPs/api';
import { navigateToShuffleCore } from '@/lib/authHandoff';
import { getTimeAgo } from '@/components/agent/AgentRunHeader';
import { useEntityPreference } from '@/hooks/useEntityLabel';
import { useAppAuth } from '@/Shuffle-MCPs/useAppAuth';
import { useWorkflows } from '@/hooks/useWorkflows';
import { findIngestTicketsWorkflow } from '@/Shuffle-MCPs/ingestionDetection';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { toast } from '@/lib/toast';
import { DemoModeCard, useIncidentCount } from '@/components/demo/DemoModeCard';
import { useDatastore } from '@/hooks/useDatastore';
import { DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';
import { useVulnerabilities } from '@/hooks/useVulnerabilities';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { AutomationDashboard } from '@/components/dashboard/AutomationDashboard';
import { AgentsDashboard } from '@/components/dashboard/AgentsDashboard';
import { VulnerabilitiesDashboard } from '@/components/dashboard/VulnerabilitiesDashboard';
import { AUTOMATION_RANGE_OPTIONS, DASHBOARD_TABS, TAB_LABELS, type DashboardTab } from '@/Shuffle-Core';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useAuth } from '@/context/AuthContext';
import { useSubOrgs } from '@/hooks/useSubOrgs';
import { ChevronDown, ChevronUp, X as CloseIcon } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';

// ── Setup Step ─────────────────────────────────────────────────────────────────

interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: 'complete' | 'action-needed' | 'not-started';
  ctaLabel: string;
  ctaPath: string;
  priority: number; // lower = more important
  detail?: string;
  disabled?: boolean;
  disabledReason?: string;
}

const statusColors = {
  'complete': { dot: 'hsl(var(--severity-low))', bg: 'hsl(var(--severity-low) / 0.08)', border: 'hsl(var(--severity-low) / 0.2)' },
  'action-needed': { dot: 'hsl(var(--primary))', bg: 'hsl(var(--primary) / 0.08)', border: 'hsl(var(--primary) / 0.25)' },
  'not-started': { dot: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--muted) / 0.3)', border: 'hsl(var(--border))' },
};

const IGNORED_STEPS_KEY = 'shuffle_setup_ignored_steps';

const SetupStepCard = ({ step, index, ignored, onIgnore, onRestore }: {
  step: SetupStep;
  index: number;
  ignored?: boolean;
  onIgnore?: (id: string) => void;
  onRestore?: (id: string) => void;
}) => {
  const navigate = useNavigate();
  const isComplete = step.status === 'complete';
  const isDisabled = !!step.disabled && !isComplete && !ignored;
  // When the step is locked/disabled or ignored, fall back to a neutral
  // muted palette so the card does not steal focus with the bright
  // "action-needed" orange that doesn't apply to it.
  const colors = ignored || isDisabled
    ? { dot: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--muted) / 0.15)', border: 'hsl(var(--border))' }
    : statusColors[step.status];
  const isInteractive = !isComplete && !ignored && !isDisabled;

  const cardContent = (
    <Box
      onClick={() => isInteractive && navigate(step.ctaPath)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2.5,
        py: 2,
        borderRadius: 2,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        cursor: isInteractive ? 'pointer' : isDisabled ? 'not-allowed' : 'default',
        transition: 'all 0.2s ease',
        '&:hover': isInteractive ? {
          borderColor: 'hsl(var(--primary) / 0.5)',
          backgroundColor: 'hsl(var(--primary) / 0.06)',
        } : {},
        opacity: isComplete || ignored ? 0.5 : isDisabled ? 0.55 : 1,
      }}
    >
      {/* Icon */}
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ignored || isDisabled ? 'hsl(var(--muted) / 0.3)' : isComplete ? 'hsl(var(--severity-low) / 0.15)' : 'hsl(var(--primary) / 0.12)',
          color: ignored || isDisabled ? 'hsl(var(--muted-foreground))' : isComplete ? 'hsl(var(--severity-low))' : 'hsl(var(--primary))',
          flexShrink: 0,
        }}
      >
        {ignored ? <EyeOff size={20} /> : isComplete ? <Check size={20} /> : step.icon}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: ignored || isDisabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
            textDecoration: isComplete || ignored ? 'line-through' : 'none',
          }}>
            {step.title}
          </Typography>
          {isComplete && !ignored && (
            <Chip
              label="Done"
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 600,
                backgroundColor: 'hsl(var(--severity-low) / 0.15)',
                color: 'hsl(var(--severity-low))',
              }}
            />
          )}
          {ignored && (
            <Chip
              label="Ignored"
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 600,
                backgroundColor: 'hsl(var(--muted) / 0.3)',
                color: 'hsl(var(--muted-foreground))',
              }}
            />
          )}
          {isDisabled && (
            <Chip
              label="Locked"
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 600,
                backgroundColor: 'hsl(var(--muted) / 0.3)',
                color: 'hsl(var(--muted-foreground))',
              }}
            />
          )}
        </Box>
        <Typography sx={{
          fontSize: '0.78rem',
          color: 'hsl(var(--muted-foreground))',
          mt: 0.25,
        }}>
          {step.description}
        </Typography>
        {step.detail && !isComplete && !ignored && !isDisabled && (
          <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--primary))', mt: 0.5, fontWeight: 500 }}>
            {step.detail}
          </Typography>
        )}
        {isDisabled && step.disabledReason && (
          <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', mt: 0.5, fontWeight: 500 }}>
            {step.disabledReason}
          </Typography>
        )}
      </Box>

      {/* Actions */}
      {ignored ? (
        <Tooltip title="Restore this step">
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onRestore?.(step.id); }}
            sx={{
              color: 'hsl(var(--muted-foreground))',
              '&:hover': { color: 'hsl(var(--primary))', backgroundColor: 'hsl(var(--primary) / 0.08)' },
            }}
          >
            <Undo2 size={16} />
          </IconButton>
        </Tooltip>
      ) : !isComplete && !isDisabled ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <Tooltip title="Ignore this step">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onIgnore?.(step.id); }}
              sx={{
                color: 'hsl(var(--muted-foreground))',
                opacity: 0.5,
                '&:hover': { opacity: 1, color: 'hsl(var(--muted-foreground))' },
              }}
            >
              <EyeOff size={14} />
            </IconButton>
          </Tooltip>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'hsl(var(--primary))', whiteSpace: 'nowrap' }}>
            {step.ctaLabel}
          </Typography>
          <ChevronRight size={16} style={{ color: 'hsl(var(--primary))' }} />
        </Box>
      ) : null}
    </Box>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
    >
      {isDisabled && step.disabledReason ? (
        <Tooltip title={step.disabledReason} placement="top">
          <Box>{cardContent}</Box>
        </Tooltip>
      ) : cardContent}
    </motion.div>
  );
};

// ── Notification row ──────────────────────────────────────────────────────────

interface NotificationRowProps {
  notification: AgentNotification;
  entityBasePath: string;
  onApprove: (n: AgentNotification) => void;
  onQuickView: (n: AgentNotification) => void;
  onAnswer: (n: AgentNotification) => void;
}

const NotificationRow = ({ notification, entityBasePath, onApprove, onQuickView, onAnswer }: NotificationRowProps) => {
  const isApproval = isApprovalNotification(notification);
  const timeAgo = notification.created_at
    ? getTimeAgo(new Date(notification.created_at * 1000).toISOString())
    : '—';

  return (
    <Box
      onClick={() => onQuickView(notification)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onQuickView(notification);
        }
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2.5,
        py: 2,
        borderRadius: 2,
        border: '1px solid hsl(var(--border))',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
        '&:hover': {
          borderColor: 'hsl(var(--primary) / 0.4)',
          backgroundColor: 'hsl(var(--primary) / 0.04)',
        },
        '&:focus-visible': {
          outline: '2px solid hsl(var(--primary))',
          outlineOffset: 2,
        },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'hsl(var(--foreground))',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}>
            <InlineMarkdown text={stripAgentTitlePrefix(notification.title)} />
          </Box>
          {notification.severity && (
            <Chip
              label={notification.severity}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.68rem',
                fontWeight: 600,
                backgroundColor: 'hsl(var(--severity-high) / 0.12)',
                color: 'hsl(var(--severity-high))',
              }}
            />
          )}
          {!isApproval && (
            <Chip
              icon={<HelpCircle size={12} />}
              label="Questions"
              size="small"
              sx={{
                height: 20,
                fontSize: '0.68rem',
                fontWeight: 600,
                backgroundColor: 'hsl(var(--severity-medium) / 0.12)',
                color: 'hsl(var(--severity-medium))',
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
          )}
        </Box>

        <Typography sx={{
          fontSize: '0.78rem',
          color: 'hsl(var(--muted-foreground))',
          mt: 0.5,
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {notification.description}
        </Typography>

        {isApproval && notification.action && notification.action !== notification.description && (
          <Box sx={{
            mt: 1,
            px: 1.5,
            py: 1,
            borderRadius: 1.5,
            background: 'var(--agent-gradient-subtle)',
          }}>
            <Typography sx={{
              fontSize: '0.72rem',
              fontWeight: 600,
              background: 'var(--agent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              mb: 0.25,
            }}>
              Proposed Action
            </Typography>
            <Typography sx={{
              fontSize: '0.78rem',
              color: 'hsl(var(--foreground))',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {notification.action}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', opacity: 0.7 }}>
            {timeAgo}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        {isApproval ? (
          <Button
            data-tour="agent-approve-button"
            onClick={(e) => { e.stopPropagation(); onApprove(notification); }}
            size="small"
            variant="contained"
            startIcon={<CheckCircle size={14} />}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              px: 2,
              py: 0.5,
              boxShadow: 'none',
              whiteSpace: 'nowrap',
              '&:hover': {
                backgroundColor: 'hsl(var(--primary) / 0.9)',
                boxShadow: 'none',
              },
            }}
          >
            Approve
          </Button>
        ) : (
          <Button
            onClick={(e) => { e.stopPropagation(); onAnswer(notification); }}
            size="small"
            variant="contained"
            startIcon={<MessageSquare size={14} />}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              px: 2,
              py: 0.5,
              boxShadow: 'none',
              whiteSpace: 'nowrap',
              '&:hover': {
                backgroundColor: 'hsl(var(--primary) / 0.9)',
                boxShadow: 'none',
              },
            }}
          >
            Answer Questions
          </Button>
        )}

        {notification.incident_id && (
          <Tooltip title="Open incident">
            <IconButton
              component={Link}
              to={`${entityBasePath}/${notification.incident_id}`}
              size="small"
              onClick={(e) => e.stopPropagation()}
              sx={{
                color: 'hsl(var(--muted-foreground))',
                flexShrink: 0,
                '&:hover': { color: 'hsl(var(--primary))', backgroundColor: 'hsl(var(--primary) / 0.08)' },
              }}
            >
              <OpenInNewIcon size={18} />
            </IconButton>
          </Tooltip>
        )}
        {notification.reference_url && !notification.incident_id && (() => {
          const isApprovalForm = isAgentApprovalFormUrl(notification.reference_url);
          const href = isApprovalForm
            ? getShuffleCoreFormUrl(notification.reference_url)
            : notification.reference_url;
          const tooltipLabel = isApprovalForm ? 'Open agent approval' : 'Open incident';
          // Approval forms live on Shuffle Core (or the configured backend
          // for self-hosted), so we always open them as an external link in
          // a new tab — never as an in-app react-router navigation.
          return (
            <Tooltip title={tooltipLabel}>
              <IconButton
                component="a"
                href={href}
                target={isApprovalForm ? '_blank' : undefined}
                rel={isApprovalForm ? 'noopener noreferrer' : undefined}
                size="small"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (isApprovalForm && href) {
                    e.preventDefault();
                    await navigateToShuffleCore(href, { newTab: true });
                  }
                }}
                sx={{
                  color: 'hsl(var(--muted-foreground))',
                  flexShrink: 0,
                  '&:hover': { color: 'hsl(var(--primary))', backgroundColor: 'hsl(var(--primary) / 0.08)' },
                }}
              >
                <OpenInNewIcon size={18} />
              </IconButton>
            </Tooltip>
          );
        })()}
      </Box>
    </Box>
  );
};

// ── Page ───────────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 10;

const DashboardPage = () => {

  usePageMeta({
    title: 'Dashboard',
    description: 'Your Shuffle Security overview: setup progress, notifications, and key incident metrics.',
    url: '/dashboard',
  });
  const navigate = useNavigate();
  const { userInfo } = useAuth();
  const isSupport = userInfo?.support === true;
  const { notifications, isLoading, refresh: refreshNotifications } = useAgentNotifications();
  const { singular: entitySingular, basePath: entityBasePath } = useEntityPreference();
  const { authenticatedApps, loading: authLoading } = useAppAuth();
  const { data: workflows, isLoading: workflowsLoading } = useWorkflows();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ignoredSteps, setIgnoredSteps] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(IGNORED_STEPS_KEY) || '[]');
    } catch { return []; }
  });
  const [showCompleted, setShowCompleted] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [questionNotification, setQuestionNotification] = useState<AgentNotification | null>(null);
  const [quickViewItem, setQuickViewItem] = useState<QuickViewItem | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'approval' | 'question'>('all');
  const [hasRunningSensor, setHasRunningSensor] = useState<boolean | null>(null);
  const [runningSensorCount, setRunningSensorCount] = useState<number>(0);
  const [hasHostMonitor, setHasHostMonitor] = useState<boolean | null>(null);
  const [hostMonitorCount, setHostMonitorCount] = useState<number>(0);
  const [overviewCollapsed, setOverviewCollapsed] = useState(false);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [agentNotificationsCollapsed, setAgentNotificationsCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('dashboard-agent-notifications-collapsed');
      // Default to collapsed when no preference is stored.
      return stored === null ? true : stored === '1';
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('dashboard-agent-notifications-collapsed', agentNotificationsCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [agentNotificationsCollapsed]);
  const setupAutoCollapsedRef = useRef(false);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>(() => {
    try {
      const stored = localStorage.getItem('shuffle_dashboard_tab') as DashboardTab | null;
      if (stored && DASHBOARD_TABS.includes(stored)) return stored;
    } catch { return 'security'; }
    return 'security';
  });
  useEffect(() => { try { localStorage.setItem('shuffle_dashboard_tab', dashboardTab); } catch { } }, [dashboardTab]);
  // Preserve the visual position of the dashboard tab bar across tab swaps.
  // Each branch mounts a completely different subtree (AutomationDashboard vs
  // DashboardOverview) with very different heights, so the browser's scroll
  // offset gets clamped against the new (often shorter) document — which the
  // user perceives as "jumping to the top". We record where the tab bar sat
  // in the viewport before the swap, and after the new subtree commits, we
  // scrollBy the delta so the tab bar stays exactly where it was.
  const dashboardTabsRef = useRef<HTMLDivElement | null>(null);
  const pendingTabsTopRef = useRef<number | null>(null);
  const scrollParentRef = useRef<HTMLElement | Window | null>(null);
  // Find the nearest scrollable ancestor. The dashboard sits inside the
  // DashboardLayout <main> which has its own overflowY: auto, so the window
  // itself does not scroll — we need to scroll that container instead.
  const findScrollParent = (el: HTMLElement | null): HTMLElement | Window => {
    let node: HTMLElement | null = el?.parentElement ?? null;
    while (node) {
      const style = getComputedStyle(node);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return window;
  };
  const handleDashboardTabChange = useCallback((next: DashboardTab) => {
    if (next === dashboardTab) return;
    if (dashboardTabsRef.current) {
      pendingTabsTopRef.current = dashboardTabsRef.current.getBoundingClientRect().top;
      scrollParentRef.current = findScrollParent(dashboardTabsRef.current);
    }
    setDashboardTab(next);
  }, [dashboardTab]);
  useLayoutEffect(() => {
    if (pendingTabsTopRef.current === null || !dashboardTabsRef.current) return;
    const before = pendingTabsTopRef.current;
    pendingTabsTopRef.current = null;
    const after = dashboardTabsRef.current.getBoundingClientRect().top;
    const delta = after - before;
    if (delta === 0) return;
    const parent = scrollParentRef.current;
    if (parent && parent !== window) {
      (parent as HTMLElement).scrollTop += delta;
    } else {
      window.scrollBy({ top: delta, left: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [dashboardTab]);
  // Shared time-range filter for both dashboard tabs (Security Operations + Automation).
  const [dashboardDays, setDashboardDays] = useState<string>(() => {
    try { return localStorage.getItem('shuffle_dashboard_days') || '30'; } catch { return '30'; }
  });
  useEffect(() => { try { localStorage.setItem('shuffle_dashboard_days', dashboardDays); } catch { } }, [dashboardDays]);
  // Shared granularity for both dashboard tabs.
  const [dashboardGran, setDashboardGran] = useState<'daily' | 'monthly'>(() => {
    try { return ((localStorage.getItem('shuffle_dashboard_gran') as 'daily' | 'monthly') || 'daily'); } catch { return 'daily'; }
  });
  useEffect(() => { try { localStorage.setItem('shuffle_dashboard_gran', dashboardGran); } catch { } }, [dashboardGran]);
  // Shared Workflows | Apps toggle for the Automation dashboard (shown but disabled on Security).
  const [dashboardMode, setDashboardMode] = useState<'workflows' | 'apps'>(() => {
    try { return ((localStorage.getItem('shuffle_dashboard_mode') as 'workflows' | 'apps') || 'workflows'); } catch { return 'workflows'; }
  });
  useEffect(() => { try { localStorage.setItem('shuffle_dashboard_mode', dashboardMode); } catch { } }, [dashboardMode]);
  // Ephemeral custom date range — set when the user click-drags on a chart to
  // zoom in. Cleared via the × on the "Last" select. Not persisted on purpose.
  const [dashboardCustomRange, setDashboardCustomRange] = useState<{ fromMs: number; toMs: number } | null>(null);
  // Bumped by the shared refresh button — Automation watches this, Security re-fetches via handleDashboardRefresh.
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

  // Incidents + vulnerabilities for the overview charts
  const currentOrgId = userInfo?.active_org?.id;

  // Local "view as tenant" — does NOT change the active org. Just re-fetches
  // dashboard data using a different Org-Id header.
  const [viewOrgId, setViewOrgId] = useState<string | null>(null);
  const effectiveOrgId = viewOrgId || currentOrgId;
  const isViewingChild = !!viewOrgId && viewOrgId !== currentOrgId;

  // Default datastore/vulnerability hooks — only used when viewing the active org.
  const { items: incidentItems, isLoading: incidentsLoadingDefault, fetchItems: fetchIncidents, hasFetched: incidentsFetched, hasMore: incidentsHasMoreDefault, totalAmount: incidentTotalAmount } = useDatastore({
    category: DATASTORE_CATEGORIES.INCIDENTS,
  });
  const { data: datastoreIncidentCount = 0 } = useIncidentCount(effectiveOrgId);
  const { severityCounts: vulnSeverityCountsDefault, isLoading: vulnLoadingDefault } = useVulnerabilities({ tab: 'assets' });

  // Trigger initial fetch (the hook does not auto-fetch)
  useEffect(() => {
    if (!incidentsFetched && !isViewingChild) fetchIncidents();
  }, [incidentsFetched, fetchIncidents, isViewingChild]);

  // Multi-tenant: pull child-org incidents for parents so the overview
  // reflects everything across the organization, not just the current org.
  const { subOrgs, isParentOrg } = useSubOrgs(currentOrgId);
  const [subOrgIncidentItems, setSubOrgIncidentItems] = useState<{ key: string; value: string; created?: number; edited?: number }[]>([]);

  useEffect(() => {
    if (!isParentOrg || isViewingChild) { setSubOrgIncidentItems([]); return; }
    const orgsToFetch = subOrgs.filter(o => o.id !== currentOrgId);
    if (orgsToFetch.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(orgsToFetch.map(async (org) => {
        try {
          const url = getApiUrl(`/api/v1/orgs/${org.id}/list_cache?category=${encodeURIComponent(DATASTORE_CATEGORIES.INCIDENTS)}&top=50`);
          const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader(), 'Org-Id': org.id },
          });
          if (!response.ok) return [];
          const data = await response.json();
          return Array.isArray(data) ? data : (data.keys || data.data || []);
        } catch {
          return [];
        }
      }));
      if (!cancelled) setSubOrgIncidentItems(results.flat());
    })();
    return () => { cancelled = true; };
  }, [isParentOrg, subOrgs, currentOrgId, isViewingChild]);

  // When viewing a specific child tenant, fetch incidents + vulnerabilities
  // scoped to that org via Org-Id header (no active-org change).
  const [viewIncidentItems, setViewIncidentItems] = useState<{ key: string; value: string; created?: number; edited?: number }[]>([]);
  const [viewVulnSeverityCounts, setViewVulnSeverityCounts] = useState<{ critical: number; high: number; medium: number; low: number; info: number }>({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    if (!isViewingChild || !viewOrgId) { setViewIncidentItems([]); setViewVulnSeverityCounts({ critical: 0, high: 0, medium: 0, low: 0, info: 0 }); return; }
    let cancelled = false;
    setViewLoading(true);
    (async () => {
      const fetchCategory = async (category: string) => {
        try {
          const isVulns = category === DATASTORE_CATEGORIES.VULNERABILITIES || category === 'shuffle-security_vulns' || category === 'shuffle-security_vulnerabilities' || category === 'vulns';
          const url = isVulns
            ? getApiUrl('/api/v2/vulns?skip_fields=false&top=50')
            : getApiUrl(`/api/v1/orgs/${viewOrgId}/list_cache?category=${encodeURIComponent(category)}&top=50`);
          const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader(), 'Org-Id': viewOrgId },
          });
          if (!response.ok) return [];
          const data = await response.json();
          return Array.isArray(data) ? data : (data.keys || data.data || []);
        } catch { return []; }
      };
      const [incs, vulns] = await Promise.all([
        fetchCategory(DATASTORE_CATEGORIES.INCIDENTS),
        fetchCategory(DATASTORE_CATEGORIES.VULNERABILITIES),
      ]);
      if (cancelled) return;
      setViewIncidentItems(incs);
      // Compute severity counts from raw vuln items (lightweight inline)
      const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<string, number>;
      for (const item of vulns) {
        try {
          const v = item?.value != null ? (typeof item.value === 'string' ? JSON.parse(item.value) : item.value) : item;
          const sevRaw = (v?.severity || v?.database_specific?.severity || '').toString().toLowerCase();
          let sev: keyof typeof counts = 'info';
          if (sevRaw.startsWith('crit')) sev = 'critical';
          else if (sevRaw.startsWith('high') || sevRaw === 'severe') sev = 'high';
          else if (sevRaw.startsWith('mod') || sevRaw.startsWith('med')) sev = 'medium';
          else if (sevRaw.startsWith('low')) sev = 'low';
          counts[sev]++;
        } catch { /* skip */ }
      }
      setViewVulnSeverityCounts(counts as typeof viewVulnSeverityCounts);
      setViewLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isViewingChild, viewOrgId]);

  // Effective values used by the rest of the page
  const effectiveIncidentItems = isViewingChild ? viewIncidentItems : incidentItems;
  const effectiveSubOrgIncidentItems = isViewingChild ? [] : subOrgIncidentItems;
  const incidentsLoading = isViewingChild ? viewLoading : incidentsLoadingDefault;
  const vulnSeverityCounts = isViewingChild ? viewVulnSeverityCounts : vulnSeverityCountsDefault;
  const vulnLoading = isViewingChild ? viewLoading : vulnLoadingDefault;

  const overviewIncidents = useMemo(() => {
    const out: { status: string; severity: string; createdTs: number }[] = [];
    const sevMap: Record<number, string> = { 1: 'informational', 2: 'low', 3: 'medium', 4: 'high', 5: 'critical', 6: 'critical' };
    const statusMap: Record<number, string> = { 1: 'new', 2: 'in_progress', 3: 'resolved', 4: 'on_hold' };
    const STATUS_SYNONYMS: Record<string, string> = {
      open: 'new', created: 'new', pending: 'new', reported: 'new',
      inprogress: 'in_progress', active: 'in_progress', investigating: 'in_progress',
      working: 'in_progress', assigned: 'in_progress', acknowledged: 'in_progress',
      closed: 'resolved', done: 'resolved', complete: 'resolved', completed: 'resolved',
      fixed: 'resolved', remediated: 'resolved', mitigated: 'resolved',
    };
    const normalizeTs = (t: unknown): number => {
      if (!t) return 0;
      const n = typeof t === 'string' ? Number(t) : (typeof t === 'number' ? t : 0);
      if (!n || isNaN(n) || n <= 0) {
        if (typeof t === 'string') {
          const d = new Date(t).getTime();
          return isNaN(d) ? 0 : d;
        }
        return 0;
      }
      if (n < 1e12) return n * 1000;
      if (n < 1e15) return n;
      if (n < 1e18) return n / 1000;
      return n / 1e6;
    };
    const all = [...effectiveIncidentItems, ...effectiveSubOrgIncidentItems];
    const seen = new Set<string>();
    for (const item of all) {
      try {
        if (!item.value || (typeof item.value === 'string' && item.value.length > 5_000_000)) continue;
        const data = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
        const customAttrs = data?.metadata?.extensions?.custom_attributes;
        const severityId = data?.severity_id;
        const severity = (data?.severity || sevMap[severityId] || 'medium').toString().toLowerCase();
        const rawStatus = (data?.status || customAttrs?.status || statusMap[data?.status_id] || 'new').toString().toLowerCase().trim().replace(/[\s-]+/g, '_');
        const status = STATUS_SYNONYMS[rawStatus] || STATUS_SYNONYMS[rawStatus.replace(/_/g, '')] || rawStatus;
        const createdTs = normalizeTs(data?.created_time) || normalizeTs((item as { created?: number }).created);
        // Dedupe across orgs by raw key tail (incidents shared between parent/child)
        const dedupeKey = (item.key || '').includes('::') ? item.key.split('::').pop()! : item.key;
        if (dedupeKey && seen.has(dedupeKey)) continue;
        if (dedupeKey) seen.add(dedupeKey);
        out.push({ status, severity, createdTs });
      } catch { /* skip */ }
    }
    return out;
  }, [effectiveIncidentItems, effectiveSubOrgIncidentItems]);


  // Check for running detection sensors AND deployed host monitors
  useEffect(() => {
    const checkSensors = async () => {
      try {
        const res = await fetch(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader(), ...(isViewingChild && viewOrgId ? { 'Org-Id': viewOrgId } : {}) },
        });
        if (res.ok) {
          const envs = await res.json();
          const now = Math.floor(Date.now() / 1000);
          const runningEnvs = Array.isArray(envs) ? envs.filter(
            (e: any) => e.Type === 'onprem' && e.checkin > 0 && (now - e.checkin) < 300 && e.data_lake?.enabled === true
          ) : [];
          setHasRunningSensor(runningEnvs.length > 0);
          setRunningSensorCount(runningEnvs.length);
          let hostCount = 0;
          if (Array.isArray(envs)) {
            for (const e of envs) {
              if (!e.archived && Array.isArray(e.sensor_hosts)) hostCount += e.sensor_hosts.length;
            }
          }
          setHasHostMonitor(hostCount > 0);
          setHostMonitorCount(hostCount);
        } else {
          setHasRunningSensor(false);
          setHasHostMonitor(false);
        }
      } catch {
        setHasRunningSensor(false);
        setHasHostMonitor(false);
      }
    };
    checkSensors();
  }, [isViewingChild, viewOrgId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshNotifications();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleApprove = async (notification: AgentNotification) => {
    try {
      // Resume the agent run with answer=true. Then dismiss the notification.
      await continueAgentExecution({ notification, approve: true });
      await approveAgentAction(notification.id).catch(() => { /* non-fatal */ });
      toast.success('Action approved — the agent will continue.');
      refreshNotifications();
    } catch (err) {
      console.error('[Agent] Approve failed:', err);
      toast.error('Failed to approve action.');
    }
  };

  const handleDeny = async (notification: AgentNotification, note?: string) => {
    try {
      await continueAgentExecution({ notification, approve: false, note });
      await approveAgentAction(notification.id).catch(() => { /* non-fatal */ });
      toast.success('Action denied — the agent will continue accordingly.');
      refreshNotifications();
    } catch (err) {
      console.error('[Agent] Deny failed:', err);
      toast.error('Failed to deny action.');
    }
  };

  const handleConfigureApprove = async (notificationId: string, modifiedAction?: string) => {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) {
      toast.error('Notification no longer available.');
      return;
    }
    try {
      await continueAgentExecution({
        notification,
        approve: true,
        note: modifiedAction,
      });
      await approveAgentAction(notificationId).catch(() => { /* non-fatal */ });
      toast.success(modifiedAction ? 'Modified action submitted.' : 'Action approved.');
      refreshNotifications();
    } catch (err) {
      console.error('[Agent] Configure approve failed:', err);
      toast.error('Failed to approve action.');
    }
  };

  const handleSubmitAnswers = async (notificationId: string, answers: Record<number, string>) => {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) {
      toast.error('Notification no longer available.');
      return;
    }
    try {
      // Build the same `note={"question_0":"…"}` payload the original
      // approval form posts back to the agent.
      const noteMap: Record<string, string> = {};
      Object.entries(answers).forEach(([idx, value]) => {
        noteMap[`question_${idx}`] = value;
      });
      await continueAgentExecution({
        notification,
        approve: true,
        note: noteMap,
      });
      await approveAgentAction(notificationId).catch(() => { /* non-fatal */ });
      toast.success('Answers submitted — the agent will continue.');
      refreshNotifications();
    } catch (err) {
      console.error('[Agent] Submit answers failed:', err);
      toast.error('Failed to submit answers.');
    }
  };

  // ── Derive setup step statuses ──────────────────────────────────────────────

  const workflowList = useMemo(() => Array.isArray(workflows) ? workflows : [], [workflows]);
  const hasIngest = useMemo(() => !!findIngestTicketsWorkflow(workflowList), [workflowList]);

  const setupSteps = useMemo((): SetupStep[] => {
    const activatedApps = authenticatedApps.filter(a => a.active);
    const validatedApps = authenticatedApps.filter(a => a.validation?.valid);
    const hasActivatedApps = activatedApps.length > 0;
    const hasAuthenticatedApps = validatedApps.length > 0;

    // Detection: check for a running sensor (fetched via useEffect)
    const hasDetection = hasRunningSensor === true;

    // Vulnerability: check for vuln-scanner related workflows
    const hasVulnSetup = workflowList.some(w =>
      w.name?.toLowerCase().includes('vulnerabilit') ||
      (w.tags || []).some((t: string) => t.toLowerCase().includes('vuln'))
    );

    const steps: SetupStep[] = [
      {
        id: 'setup-endpoints',
        title: 'Set up host monitors',
        description: 'Deploy lightweight host monitors to check compliance, encryption, and posture.',
        icon: <Monitor size={20} />,
        status: hasHostMonitor === true ? 'complete' : 'not-started',
        ctaLabel: 'Set Up',
        ctaPath: '/monitors?add_host=true',
        priority: 4,
      },
      {
        id: 'enable-ingest',
        title: 'Enable incident ingestion',
        description: hasIngest
          ? 'Incident ingestion is configured and pulling data.'
          : 'Set up automatic ingestion to pull incidents from your connected tools.',
        icon: <ArrowDownToLine size={20} />,
        status: hasIngest ? 'complete' : hasAuthenticatedApps ? 'action-needed' : 'not-started',
        ctaLabel: 'Configure',
        ctaPath: '/incidents?highlight=ingest',
        priority: 3,
      },
      {
        id: 'setup-vulns',
        title: 'Set up vulnerability ingestion',
        description: hasVulnSetup
          ? 'Vulnerability scanners are connected and feeding data.'
          : 'Connect vulnerability scanners to track CVEs, misconfigs, and identity risks.',
        icon: <Shield size={20} />,
        status: hasVulnSetup ? 'complete' : 'not-started',
        ctaLabel: 'Set Up',
        ctaPath: '/vulnerabilities',
        priority: 5,
      },
    ];
    // Preserve the explicit priority order requested by the user
    steps.sort((a, b) => a.priority - b.priority);

    return steps;
  }, [authenticatedApps, workflowList, hasIngest, hasRunningSensor, hasHostMonitor]);

  const handleIgnoreStep = (id: string) => {
    const next = [...ignoredSteps, id];
    setIgnoredSteps(next);
    localStorage.setItem(IGNORED_STEPS_KEY, JSON.stringify(next));
  };

  const handleRestoreStep = (id: string) => {
    const next = ignoredSteps.filter(s => s !== id);
    setIgnoredSteps(next);
    localStorage.setItem(IGNORED_STEPS_KEY, JSON.stringify(next));
  };

  const visibleSteps = setupSteps.filter(s => !ignoredSteps.includes(s.id));
  const ignoredStepsList = setupSteps.filter(s => ignoredSteps.includes(s.id));
  const incompleteVisibleSteps = visibleSteps.filter(s => s.status !== 'complete');
  const completedVisibleSteps = visibleSteps.filter(s => s.status === 'complete');
  const completedCount = completedVisibleSteps.length;
  const totalSteps = visibleSteps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 100;
  const allComplete = completedCount === totalSteps;
  const setupLoading = authLoading || workflowsLoading;

  const effectiveIncidentCount = (incidentTotalAmount !== null && incidentTotalAmount > 0)
    ? incidentTotalAmount
    : Math.max(overviewIncidents.length, effectiveIncidentItems.length, datastoreIncidentCount);

  const hasIngestedIncidents = effectiveIncidentCount > 0;
  const hasVulnData = (vulnSeverityCounts.critical + vulnSeverityCounts.high + vulnSeverityCounts.medium + vulnSeverityCounts.low + vulnSeverityCounts.info) > 0;
  const hasIngestedData = hasIngestedIncidents || hasIngest || hasVulnData;
  const isInitialIngestionLoading = (workflowsLoading || (!incidentsFetched && incidentsLoadingDefault)) && !hasIngestedData;

  // Auto-collapse Setup Guide once when fully complete
  useEffect(() => {
    if (!setupLoading && allComplete && totalSteps > 0 && !setupAutoCollapsedRef.current) {
      setSetupCollapsed(true);
      setupAutoCollapsedRef.current = true;
    }
  }, [setupLoading, allComplete, totalSteps]);

  // Notification counts & filter
  const approvalCount = notifications.filter(n => isApprovalNotification(n)).length;
  const questionCount = notifications.filter(n => !isApprovalNotification(n)).length;
  const totalCount = notifications.length;

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'approval') return notifications.filter(n => isApprovalNotification(n));
    if (filter === 'question') return notifications.filter(n => !isApprovalNotification(n));
    return notifications;
  }, [notifications, filter]);

  const filteredCount = filteredNotifications.length;
  const totalPages = Math.ceil(filteredCount / ITEMS_PER_PAGE);
  const paginated = filteredNotifications.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

  return (
    <>
      <Box sx={{ maxWidth: 1100, width: '100%', mx: 'auto', p: { xs: 2, sm: 3, md: 4 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h4" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Dashboard
            </Typography>
            {(isLoading || setupLoading) && !isRefreshing && (
              <Loader2 size={18} style={{ color: 'hsl(var(--muted-foreground))', animation: 'spin 1s linear infinite' }} />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isParentOrg && subOrgs.length > 0 && (() => {
              const currentOrgImage = userInfo?.active_org?.image;
              const currentOrgName = userInfo?.active_org?.name || 'Current Tenant';
              const sortedChildren = [...subOrgs]
                .filter(o => o.id !== currentOrgId)
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
              const options: { id: string; name: string; image?: string; isParent?: boolean }[] = [
                { id: currentOrgId || '', name: currentOrgName, image: currentOrgImage, isParent: true },
                ...sortedChildren.map(o => ({ id: o.id, name: o.name, image: o.image, isParent: false })),
              ];
              const value = options.find(o => o.id === effectiveOrgId) || options[0];
              return (
                <Autocomplete
                  size="small"
                  disableClearable
                  options={options}
                  value={value}
                  getOptionLabel={(option) => option.name}
                  isOptionEqualToValue={(option, v) => option.id === v.id}
                  onChange={(_, newValue) => {
                    if (!newValue) return;
                    // Local view-as: do NOT change the active org. Just re-fetch
                    // the dashboard's data using this org's Org-Id header.
                    setViewOrgId(newValue.id === currentOrgId ? null : newValue.id);
                  }}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id} style={{ paddingLeft: option.isParent ? 16 : 36 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {option.image ? (
                          <img src={option.image} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />
                        ) : (
                          <Box sx={{ width: 20, height: 20, borderRadius: '4px', bgcolor: 'hsl(var(--muted) / 0.5)', flexShrink: 0 }} />
                        )}
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: option.isParent ? 600 : 400 }}>{option.name}</Typography>
                      </Box>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Tenant"
                      sx={{ minWidth: 180, width: 180 }}
                    />
                  )}
                  sx={{
                    minWidth: 180,
                    width: 180,
                    '& .MuiOutlinedInput-root': { minHeight: 36, py: '2px' },
                  }}
                  slotProps={{ popper: { sx: { zIndex: 1500 } } }}
                />
              );
            })()}
            <Tooltip title="Refresh">
              <IconButton
                onClick={handleRefresh}
                size="small"
                sx={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <RefreshIcon
                  size={20}
                  className={isRefreshing ? 'animate-spin' : ''}
                  style={{ transition: 'transform 0.6s ease' }}
                />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mb: 2 }}>
          Get started by completing the setup steps below, then monitor agent activity.
        </Typography>

        {/* ── Demo Mode CTA (shown at top only when no data has been ingested yet) ── */}
        {!hasIngestedData && !isInitialIngestionLoading && (
          <DemoModeCard incidentCount={effectiveIncidentCount} />
        )}

        {/* Overview is shown to all users. When the Setup Guide is incomplete
          it renders BELOW the guide; once complete it moves to the top. */}
        {/* ── Agent Notifications + Setup Guide + Overview (order swaps when setup complete) ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {!setupLoading && (
            <Box sx={{ mb: 2, mt: 3, order: allComplete ? 0 : 2 }}>
              {(() => {
                const dashboardTabs = (
                  <FormControl size="small" sx={{ minWidth: 210 }}>
                    <Select
                      value={dashboardTab}
                      onChange={(e) => handleDashboardTabChange(e.target.value as DashboardTab)}
                      inputProps={{ 'aria-label': 'Dashboard view' }}
                      sx={{
                        height: 36,
                        borderRadius: '999px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
                      }}
                      MenuProps={{ PaperProps: { sx: { mt: 0.5, borderRadius: '10px' } } }}
                    >
                      <ListSubheader sx={{ fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 2.4, color: 'hsl(var(--muted-foreground))', bgcolor: 'transparent' }}>
                        Security
                      </ListSubheader>
                      <MenuItem value="security">{TAB_LABELS.security}</MenuItem>
                      <MenuItem value="vulnerabilities">{TAB_LABELS.vulnerabilities}</MenuItem>
                      <ListSubheader sx={{ fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 2.4, color: 'hsl(var(--muted-foreground))', bgcolor: 'transparent' }}>
                        Automation
                      </ListSubheader>
                      <MenuItem value="automation">{TAB_LABELS.automation}</MenuItem>
                      <MenuItem value="agents">{TAB_LABELS.agents}</MenuItem>
                    </Select>
                  </FormControl>
                );
                const handleDashboardRefresh = () => {
                  // Bump key so AutomationDashboard re-fetches; also refresh Security data.
                  setDashboardRefreshKey(k => k + 1);
                  try { fetchIncidents(); } catch { /* noop */ }
                  try { refreshNotifications(); } catch { /* noop */ }
                };
                const fmtShort = (ms: number) => {
                  const d = new Date(ms);
                  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
                  return `${M} ${d.getDate()}`;
                };
                const customRangeLabel = dashboardCustomRange
                  ? `${fmtShort(dashboardCustomRange.fromMs)} → ${fmtShort(dashboardCustomRange.toMs)}`
                  : null;
                const sharedControls = (
                  <>
                    <FormControl size="small" sx={{ minWidth: customRangeLabel ? 220 : 130 }}>
                      <InputLabel>Last</InputLabel>
                      <Select
                        label="Last"
                        value={dashboardCustomRange ? '__custom__' : dashboardDays}
                        onChange={(e) => {
                          const v = String(e.target.value);
                          if (v === '__custom__') return;
                          setDashboardCustomRange(null);
                          setDashboardDays(v);
                        }}
                        renderValue={() => customRangeLabel ?? (AUTOMATION_RANGE_OPTIONS.find(o => o.value === dashboardDays)?.label ?? `${dashboardDays} days`)}
                        endAdornment={dashboardCustomRange ? (
                          <IconButton
                            size="small"
                            onMouseDown={(e) => { e.stopPropagation(); }}
                            onClick={(e) => { e.stopPropagation(); setDashboardCustomRange(null); }}
                            sx={{ mr: 3, p: 0.25, color: 'hsl(var(--muted-foreground))' }}
                            aria-label="Clear custom range"
                          >
                            <CloseIcon size={14} />
                          </IconButton>
                        ) : undefined}
                      >
                        {customRangeLabel && (
                          <MenuItem value="__custom__" disabled>{customRangeLabel} (custom)</MenuItem>
                        )}
                        {AUTOMATION_RANGE_OPTIONS.map(o => (
                          <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Box sx={{ alignSelf: 'flex-end', opacity: dashboardTab === 'automation' ? 1 : 0.5, pointerEvents: dashboardTab === 'automation' ? 'auto' : 'none' }}>
                      <SegmentedControl
                        ariaLabel="Mode"
                        value={dashboardMode}
                        onChange={(v) => setDashboardMode(v as 'workflows' | 'apps')}
                        options={[
                          { value: 'workflows', label: 'Workflows', disabled: dashboardTab !== 'automation' },
                          { value: 'apps', label: 'Apps', disabled: dashboardTab !== 'automation' },
                        ]}
                      />
                    </Box>
                    <Box sx={{ alignSelf: 'flex-end' }}>
                      <SegmentedControl
                        ariaLabel="Granularity"
                        value={dashboardGran}
                        onChange={(v) => setDashboardGran(v as 'daily' | 'monthly')}
                        options={[{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }]}
                      />
                    </Box>
                    <MuiTooltip title="Refresh">
                      <IconButton
                        size="small"
                        onClick={handleDashboardRefresh}
                        sx={{ color: 'hsl(var(--muted-foreground))', alignSelf: 'flex-end', width: 36, height: 36, borderRadius: '8px' }}
                      >
                        <RefreshIcon size={16} />
                      </IconButton>
                    </MuiTooltip>
                  </>
                );
                const sharedHeader = (
                  <Box ref={dashboardTabsRef} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 36 }}>
                      {dashboardTabs}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      {sharedControls}
                    </Box>
                  </Box>
                );
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
                    {sharedHeader}
                    {dashboardTab === 'agents' ? (
                      <AgentsDashboard
                        orgId={effectiveOrgId}
                        days={parseInt(dashboardDays, 10) || 30}
                        gran={dashboardGran}
                        customRange={dashboardCustomRange}
                        onRangeSelect={(fromMs, toMs) => setDashboardCustomRange({ fromMs, toMs })}
                        refreshKey={dashboardRefreshKey}
                      />
                    ) : dashboardTab === 'vulnerabilities' ? (
                      <VulnerabilitiesDashboard
                        orgId={effectiveOrgId}
                        days={parseInt(dashboardDays, 10) || 30}
                        gran={dashboardGran}
                        customRange={dashboardCustomRange}
                        onRangeSelect={(fromMs, toMs) => setDashboardCustomRange({ fromMs, toMs })}
                        refreshKey={dashboardRefreshKey}
                      />
                    ) : dashboardTab === 'automation' ? (
                      <AutomationDashboard
                        orgId={effectiveOrgId}
                        days={dashboardDays}
                        onDaysChange={setDashboardDays}
                        gran={dashboardGran}
                        onGranChange={setDashboardGran}
                        mode={dashboardMode}
                        onModeChange={setDashboardMode}
                        refreshKey={dashboardRefreshKey}
                        hideRefresh
                        customRange={dashboardCustomRange}
                        onRangeSelect={(fromMs, toMs) => setDashboardCustomRange({ fromMs, toMs })}
                      />
                    ) : (
                      <DashboardOverview
                        incidents={overviewIncidents}
                        incidentsLoading={incidentsLoading}
                        incidentsHasMore={!isViewingChild && incidentsHasMoreDefault}
                        vulnSeverityCounts={vulnSeverityCounts}
                        vulnLoading={vulnLoading}
                        monitorHostCount={hostMonitorCount}
                        runningSensorCount={runningSensorCount}
                        monitorsLoading={hasHostMonitor === null}
                        days={parseInt(dashboardDays, 10) || 30}
                        gran={dashboardGran}
                        customRange={dashboardCustomRange}
                        onRangeSelect={(fromMs, toMs) => setDashboardCustomRange({ fromMs, toMs })}
                      />
                    )}
                  </Box>
                );
              })()}
            </Box>
          )}
          <Box id="agent-notifications" sx={{ order: 3, scrollMarginTop: 80 }}>
            <Box
              onClick={() => setAgentNotificationsCollapsed(c => !c)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                mb: agentNotificationsCollapsed ? 0 : 2,
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <AlertTriangle size={18} style={{ color: 'hsl(var(--severity-high))' }} />
              <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: 'hsl(var(--foreground))' }}>
                Agent Notifications
              </Typography>
              {totalCount > 0 && (
                <Chip
                  label={totalCount}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: 'hsl(var(--severity-high) / 0.15)',
                    color: 'hsl(var(--severity-high))',
                  }}
                />
              )}
              <Box sx={{ flex: 1 }} />
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); setAgentNotificationsCollapsed(c => !c); }}
                sx={{ color: 'hsl(var(--muted-foreground))' }}
                aria-label={agentNotificationsCollapsed ? 'Expand agent notifications' : 'Collapse agent notifications'}
              >
                {agentNotificationsCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </IconButton>
            </Box>

            <Collapse in={!agentNotificationsCollapsed} timeout="auto" unmountOnExit>


              {/* Filter chips */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {([
                  { key: 'all' as const, label: 'All', count: totalCount },
                  { key: 'approval' as const, label: 'Needs Approval', count: approvalCount },
                  { key: 'question' as const, label: 'Pending Question', count: questionCount },
                ]).map(f => (
                  <Chip
                    key={f.key}
                    label={`${f.label}${f.count > 0 ? ` (${f.count})` : ''}`}
                    size="small"
                    variant={filter === f.key ? 'filled' : 'outlined'}
                    onClick={() => { setFilter(f.key); setCurrentPage(0); }}
                    sx={{
                      fontSize: '0.75rem',
                      height: 28,
                      borderColor: filter === f.key ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      bgcolor: filter === f.key ? 'hsl(var(--primary) / 0.15)' : 'transparent',
                      color: filter === f.key ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                      '&:hover': { bgcolor: 'hsl(var(--muted))' },
                    }}
                  />
                ))}
              </Box>

              {isLoading && filteredCount === 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {[0, 1, 2].map(i => (
                    <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 2, bgcolor: 'hsl(var(--muted) / 0.3)' }} />
                  ))}
                </Box>
              ) : filteredCount === 0 ? (
                <Box
                  sx={{
                    px: 3,
                    py: 4,
                    borderRadius: 2,
                    border: '1px solid hsl(var(--border))',
                    backgroundColor: 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                  }}
                >
                  <CheckCircle size={28} style={{ color: 'hsl(var(--severity-low))', marginBottom: 8 }} />
                  <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
                    All clear — no notifications requiring your attention.
                  </Typography>
                </Box>
              ) : (
                <>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {paginated.map((notification) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <NotificationRow
                          notification={notification}
                          entityBasePath={entityBasePath}
                          onApprove={handleApprove}
                          onQuickView={(n) => setQuickViewItem({ type: 'notification', notification: n })}
                          onAnswer={(n) => setQuickViewItem({ type: 'notification', notification: n })}
                        />
                      </motion.div>
                    ))}
                  </Box>
                  {totalPages > 1 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 2 }}>
                      <Button
                        size="small"
                        disabled={currentPage === 0}
                        onClick={() => setCurrentPage(p => p - 1)}
                        sx={{
                          fontSize: '0.75rem',
                          textTransform: 'none',
                          color: 'hsl(var(--foreground))',
                          minWidth: 32,
                          '&.Mui-disabled': { color: 'hsl(var(--muted-foreground) / 0.4)' },
                        }}
                      >
                        Previous
                      </Button>
                      <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                        {currentPage + 1} / {totalPages}
                      </Typography>
                      <Button
                        size="small"
                        disabled={currentPage >= totalPages - 1}
                        onClick={() => setCurrentPage(p => p + 1)}
                        sx={{
                          fontSize: '0.75rem',
                          textTransform: 'none',
                          color: 'hsl(var(--foreground))',
                          minWidth: 32,
                          '&.Mui-disabled': { color: 'hsl(var(--muted-foreground) / 0.4)' },
                        }}
                      >
                        Next
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </Collapse>
          </Box>

          {/* ── Setup Checklist ──────────────────────────────────────────────────── */}
          <Box sx={{ mt: hasIngestedData && !allComplete ? 2 : 5, mb: allComplete ? 4 : 0, order: allComplete ? 2 : 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: setupCollapsed ? 0 : 2,
                cursor: progressPercent >= 80 ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (progressPercent >= 80) setSetupCollapsed(c => !c);
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Sparkles size={18} style={{ color: 'hsl(var(--primary))' }} />
                <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: 'hsl(var(--foreground))' }}>
                  Setup Guide
                </Typography>
                <Chip
                  label={`${completedCount}/${totalSteps}`}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    backgroundColor: allComplete ? 'hsl(var(--severity-low) / 0.15)' : 'hsl(var(--primary) / 0.15)',
                    color: allComplete ? 'hsl(var(--severity-low))' : 'hsl(var(--primary))',
                  }}
                />
              </Box>
              {progressPercent >= 80 && (
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setSetupCollapsed(c => !c); }} sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  {setupCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </IconButton>
              )}
            </Box>
            {!setupCollapsed && (<>

              {/* Progress bar */}
              <Box sx={{ mb: 2.5 }}>
                <LinearProgress
                  variant={setupLoading ? 'indeterminate' : 'determinate'}
                  value={progressPercent}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: 'hsl(var(--muted))',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 3,
                      backgroundColor: allComplete ? 'hsl(var(--severity-low))' : 'hsl(var(--primary))',
                      transition: 'transform 0.6s ease',
                    },
                  }}
                />
              </Box>

              {/* Steps */}
              {setupLoading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {[0, 1, 2].map(i => (
                    <Skeleton key={i} variant="rounded" height={68} sx={{ borderRadius: 2, bgcolor: 'hsl(var(--muted) / 0.3)' }} />
                  ))}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {(showCompleted ? visibleSteps : incompleteVisibleSteps).map((step, i) => (
                    <SetupStepCard key={step.id} step={step} index={i} onIgnore={handleIgnoreStep} onRestore={handleRestoreStep} />
                  ))}
                  {(completedVisibleSteps.length > 0 || ignoredStepsList.length > 0) && (
                    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                      {completedVisibleSteps.length > 0 && (
                        <Chip
                          size="small"
                          label={showCompleted ? `Hide finished (${completedVisibleSteps.length})` : `Show finished (${completedVisibleSteps.length})`}
                          onClick={() => setShowCompleted(v => !v)}
                          variant="outlined"
                          sx={{
                            fontSize: '0.72rem',
                            height: 24,
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--muted-foreground))',
                            '&:hover': { bgcolor: 'hsl(var(--muted))' },
                          }}
                        />
                      )}
                      {ignoredStepsList.length > 0 && (
                        <Chip
                          size="small"
                          label={showIgnored ? `Hide ignored (${ignoredStepsList.length})` : `Show ignored (${ignoredStepsList.length})`}
                          onClick={() => setShowIgnored(v => !v)}
                          variant="outlined"
                          sx={{
                            fontSize: '0.72rem',
                            height: 24,
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--muted-foreground))',
                            '&:hover': { bgcolor: 'hsl(var(--muted))' },
                          }}
                        />
                      )}
                    </Box>
                  )}
                  {showIgnored && ignoredStepsList.length > 0 && (
                    <>
                      <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mt: 1, opacity: 0.7 }}>
                        Ignored ({ignoredStepsList.length})
                      </Typography>
                      {ignoredStepsList.map((step, i) => (
                        <SetupStepCard key={step.id} step={step} index={visibleSteps.length + i} ignored onRestore={handleRestoreStep} />
                      ))}
                    </>
                  )}
                </Box>
              )}
            </>)}

            {/* When data is already ingested, Demo Mode CTA is positioned below the Setup Guide area */}
            {hasIngestedData && (
              <Box sx={{ mt: setupCollapsed ? 2.5 : 3.5, mb: allComplete ? 0 : 2 }}>
                <DemoModeCard incidentCount={effectiveIncidentCount} sx={{ mb: 0 }} />
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <AgentQuestionDialog
        open={!!questionNotification}
        onClose={() => setQuestionNotification(null)}
        notification={questionNotification}
        onSubmitted={refreshNotifications}
      />

      <AgentQuickViewDrawer
        open={!!quickViewItem}
        onClose={() => setQuickViewItem(null)}
        item={quickViewItem}
        entityBasePath={entityBasePath}
        onApprove={handleApprove}
        onDeny={handleDeny}
        onConfigureApprove={handleConfigureApprove}
        onSubmitAnswers={handleSubmitAnswers}
      />
    </>
  );
};

export default DashboardPage;
