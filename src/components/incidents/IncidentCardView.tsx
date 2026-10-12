import { Box, Typography, Chip, Checkbox, Skeleton, Tooltip, CircularProgress, Avatar, Button, useMediaQuery } from '@mui/material';
import { getLinkedPointers } from '@/lib/incidentRelations';
import { Tag, RefreshCw as RefreshIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/lib/router-compat';
import {
  Fingerprint,
  FileCode,
  Radar,
  Send,
  Cpu,
  ChevronRight,
  Lock,
  Globe,
  Terminal,
  Bug,
  ListTodo,
  Link2,
} from 'lucide-react';
import { statusConfig, severityColors, isKnownStatus, getSeverityColor } from '@/config/incidentConfig';
import { getActiveCustomStatus, getActiveCustomSeverity, getSeverityLabel } from '@/config/lifecycleOverrides';
import { useState, useEffect, useRef } from 'react';
import { useSourceAppImage } from '@/hooks/useSourceAppImage';
import { useAuth } from '@/context/AuthContext';

/**
 * Resolves a source-app logo for an incident card.
 *
 * Strategy:
 *   1. First check `ingestionApps` (the user's wired-up integrations) — fast,
 *      no network, and respects user's authenticated apps.
 *   2. If no match, fall back to `useSourceAppImage` which queries the
 *      authenticated apps endpoint and the public Algolia catalog. This
 *      ensures sources like `outlook_office365` still render a logo even
 *      when the user has not explicitly added that app to their ingestion
 *      pipeline yet.
 */
const ResolvedSourceImage = ({
  source,
  directImage,
  children,
}: {
  source: string | undefined | null;
  directImage: string | undefined;
  children: (image: string | undefined) => React.ReactNode;
}) => {
  // Only run Algolia/auth-app lookup when we don't already have a direct hit.
  const fallback = useSourceAppImage(directImage ? null : source ?? null);
  return <>{children(directImage || fallback || undefined)}</>;
};

interface DisplayIncident {
  lifecycle?: { status?: string; severity?: string };
  id: string;
  title?: string;
  source?: string;
  severity: string;
  status: string;
  assignee: string | null;
  created: string;
  createdTs: number;
  originCreatedTs?: number;
  edited?: string;
  editedTs?: number;
  tlp?: string;
  taskCount?: number;
  correlationCount?: number;
  labels?: string[];
  orgId?: string;
  orgName?: string;
  orgImage?: string;
  sharedOrgs?: Array<{ orgId: string; orgName: string; orgImage?: string }>;
}

interface IngestionApp {
  name: string;
  image?: string;
}

interface IncidentCardViewProps {
  incidents: DisplayIncident[];
  onIncidentClick?: (incident: DisplayIncident) => void;
  onFilterChange?: (type: 'severity' | 'status' | 'assignee' | 'source' | 'tag' | 'org', value: string) => void;
  getIncidentUrl?: (incident: DisplayIncident) => string;
  selectedIds?: Set<string>;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  isLoading?: boolean;
  ingestionApps?: IngestionApp[];
  resyncingIds?: Set<string>;
  resyncingSource?: string;
  orgFilterNames?: string[];
  totalOrgCount?: number;
  onResetOrgFilter?: () => void;
  /** Total number of loaded incidents before filtering, used for "0/N" copy. */
  totalIncidentCount?: number;
  onResetFilters?: () => void;
  onShowAllIncidents?: () => void;

  /** Whether the current org has sub-tenants. When false, per-incident
   *  tenant chips are hidden because there is only one tenant in play. */
  isParentOrg?: boolean;
  /** Optional map of incident id -> total number of incidents sharing the
   *  same email thread_id across the loaded list. Used to surface the thread
   *  badge for siblings that have not yet been persistently merged. */
  threadCounts?: Record<string, number>;
}


// Skeleton card component for loading state
const IncidentCardSkeleton = ({ index }: { index: number }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      p: 2,
      borderRadius: 2,
      backgroundColor: 'hsl(var(--card))',
      border: '1px solid hsl(var(--border))',
      animation: 'pulse 1.5s ease-in-out infinite',
      animationDelay: `${index * 0.1}s`,
      '@keyframes pulse': {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.6 },
      },
    }}
  >
    {/* Icon skeleton */}
    <Skeleton 
      variant="rounded" 
      width={48} 
      height={48} 
      sx={{ bgcolor: 'hsl(var(--muted) / 0.3)', flexShrink: 0 }} 
    />
    
    {/* Content skeleton */}
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Skeleton 
        variant="text" 
        width="60%" 
        height={24} 
        sx={{ bgcolor: 'hsl(var(--muted) / 0.3)', mb: 0.5 }} 
      />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Skeleton 
          variant="rounded" 
          width={70} 
          height={24} 
          sx={{ bgcolor: 'hsl(var(--muted) / 0.2)', borderRadius: 3 }} 
        />
        <Skeleton 
          variant="rounded" 
          width={85} 
          height={24} 
          sx={{ bgcolor: 'hsl(var(--muted) / 0.2)', borderRadius: 3 }} 
        />
      </Box>
    </Box>
    
    {/* Right side skeleton */}
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
      <Skeleton 
        variant="text" 
        width={100} 
        height={16} 
        sx={{ bgcolor: 'hsl(var(--muted) / 0.2)' }} 
      />
      <Skeleton 
        variant="text" 
        width={80} 
        height={14} 
        sx={{ bgcolor: 'hsl(var(--muted) / 0.15)' }} 
      />
    </Box>
  </Box>
);

// Map incident types/sources to icons - more original choices
const getIncidentIcon = (source?: string, title?: string) => {
  const lowerTitle = (title || '').toLowerCase();
  const lowerSource = (source || '').toLowerCase();
  
  if (lowerTitle.includes('login') || lowerTitle.includes('auth') || lowerTitle.includes('block')) {
    return Fingerprint;
  }
  if (lowerTitle.includes('firewall') || lowerSource.includes('firewall')) {
    return Lock;
  }
  if (lowerTitle.includes('scan') || lowerTitle.includes('vulnerability')) {
    return Radar;
  }
  if (lowerTitle.includes('report') || lowerTitle.includes('email') || lowerTitle.includes('sent')) {
    return Send;
  }
  if (lowerTitle.includes('endpoint') || lowerTitle.includes('quarantine')) {
    return Cpu;
  }
  if (lowerTitle.includes('malware') || lowerTitle.includes('virus')) {
    return Bug;
  }
  if (lowerTitle.includes('network') || lowerSource.includes('network')) {
    return Globe;
  }
  if (lowerTitle.includes('code') || lowerTitle.includes('script')) {
    return FileCode;
  }
  return Terminal;
};

/** Normalize timestamp to ms (handles seconds, ms, µs, ns, ISO strings) */
const normalizeToMs = (timestamp: number | string | undefined): number => {
  if (!timestamp) return 0;
  if (typeof timestamp === 'string' && /[^0-9.]/.test(timestamp)) {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const ts = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  if (isNaN(ts) || ts <= 0) return 0;
  if (ts < 1e12) return ts * 1000;
  if (ts < 1e15) return ts;
  if (ts < 1e18) return ts / 1000;
  return ts / 1e6;
};

const formatRelativeTime = (timestamp: number, compact = false): string => {
  const ms = normalizeToMs(timestamp);
  if (!ms) return 'unknown';
  const now = Date.now();
  const diff = now - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (compact) {
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  }

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `about ${hours} hour${hours > 1 ? 's' : ''} ago`;
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

const formatAbsoluteTime = (timestamp: number): string => {
  const ms = normalizeToMs(timestamp);
  if (!ms) return 'Unknown';
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const IncidentCardView = ({ 
  incidents, 
  onIncidentClick, 
  onFilterChange, 
  getIncidentUrl,
  selectedIds = new Set(),
  onSelectionChange,
  isLoading = false,
  ingestionApps = [],
  resyncingIds = new Set(),
  resyncingSource = '',
  orgFilterNames,
  totalOrgCount,
  onResetOrgFilter,
  totalIncidentCount,
  onResetFilters,
  onShowAllIncidents,

  isParentOrg = false,
  threadCounts,
}: IncidentCardViewProps) => {

  const { userInfo } = useAuth();
  const currentOrgId = userInfo?.active_org?.id;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hasRendered, setHasRendered] = useState(false);
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useMediaQuery('(max-width:899px)');

  // Track when items have actually rendered to the DOM
  // Use requestAnimationFrame to wait until after paint
  useEffect(() => {
    if (incidents.length > 0 && !hasRendered) {
      // Clear any pending timeout
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
      // Wait for next frame + a small buffer to ensure DOM has painted
      renderTimeoutRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          setHasRendered(true);
        });
      }, 50);
    }
    
    // Reset hasRendered when incidents become empty (e.g., filter change)
    if (incidents.length === 0) {
      setHasRendered(false);
    }

    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [incidents.length, hasRendered]);

  const handleCheckboxChange = (id: string, checked: boolean, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    onSelectionChange?.(newSelection);
  };

  const isSelected = (id: string) => selectedIds.has(id);
  const showCheckbox = (id: string) => selectedIds.size > 0 || hoveredId === id;

  // Show skeletons until items have actually rendered to the DOM
  // This prevents showing "No incidents" while waiting for large lists to render
  const showSkeleton = isLoading || (incidents.length > 0 && !hasRendered);
  
  if (showSkeleton && incidents.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {[...Array(8)].map((_, index) => (
          <IncidentCardSkeleton key={index} index={index} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {incidents.map((incident, index) => {
        const IconComponent = getIncidentIcon(incident.source, incident.title);
        const baseStatusInfo = statusConfig[incident.status] || statusConfig.new;
        const customStatus = getActiveCustomStatus(incident.lifecycle?.status, incident.status);
        const customSeverity = getActiveCustomSeverity(incident.lifecycle?.severity, incident.severity);
        const statusInfo = customStatus
          ? { ...baseStatusInfo, label: customStatus.label, color: customStatus.color || baseStatusInfo.color, bg: customStatus.color ? `${customStatus.color}26` : baseStatusInfo.bg }
          : baseStatusInfo;
        const StatusIcon = statusInfo.icon;
        const severityColor = customSeverity?.color || getSeverityColor(incident.severity) || severityColors[incident.severity] || '#94a3b8';
        // Use status color for the icon (blue for new, orange for in_progress, green for resolved, etc.)
        const iconColor = statusInfo.color;
        const selected = isSelected(incident.id);
        const showCheck = showCheckbox(incident.id);

        // Match source to an ingestion app for logo
        const sourceApp = incident.source 
          ? ingestionApps.find(app => 
              app.name.toLowerCase().replace(/[\s_-]/g, '') === incident.source!.toLowerCase().replace(/[\s_-]/g, '')
            )
          : undefined;

        return (
          <ResolvedSourceImage
            key={incident.id}
            source={incident.source}
            directImage={sourceApp?.image}
          >
            {(resolvedImage) => (
          <motion.div
            key={incident.id}
            initial={index < 10 ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={index < 10 ? { duration: 0.2, delay: index * 0.03 } : { duration: 0 }}
            onMouseEnter={() => setHoveredId(incident.id)}
            onMouseLeave={() => setHoveredId(null)}
            data-tour={
              (incident as any)?.extensions?.custom_attributes?.demo === true ||
              /phishing email reported by diego/i.test(incident.title || '')
                ? 'demo-incident-row'
                : undefined
            }
          >
            <Box
              {...({
                component: !showCheck && getIncidentUrl ? Link : 'div',
                to: !showCheck && getIncidentUrl ? getIncidentUrl(incident) : undefined,
                state: !showCheck && getIncidentUrl ? { incidentListFallback: incident } : undefined,
              } as any)}

              onClick={showCheck ? undefined : (onIncidentClick ? () => onIncidentClick(incident) : undefined)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                borderRadius: 2,
                backgroundColor: selected 
                  ? 'hsl(var(--primary) / 0.08)' 
                  : 'transparent',
                border: '1px solid',
                borderColor: selected 
                  ? 'hsl(var(--primary) / 0.4)' 
                  : 'hsl(var(--border))',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textDecoration: 'none',
                color: 'inherit',
                '&:hover': {
                  backgroundColor: selected 
                    ? 'hsl(var(--primary) / 0.12)' 
                    : 'hsl(var(--background-surface))',
                  borderColor: selected 
                    ? 'hsl(var(--primary) / 0.4)' 
                    : 'hsl(var(--border-subtle))',
                  transform: 'none',
                },
              }}
            >
              {/* Icon container with checkbox overlay on hover.
                  When the incident has a source app logo, render it as the
                  primary icon and overlay the status icon as a small badge
                  in the bottom-right corner — keeps both pieces of context
                  visible while reclaiming horizontal space on the right. */}
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: showCheck 
                    ? 'transparent' 
                    : (resolvedImage ? 'hsl(var(--muted) / 0.4)' : `${iconColor}15`),
                  border: showCheck 
                    ? 'none' 
                    : (resolvedImage ? '1px solid hsl(var(--border))' : `1px solid ${iconColor}30`),
                  flexShrink: 0,
                  position: 'relative',
                }}
                onClick={(e) => {
                  if (showCheck) {
                    handleCheckboxChange(incident.id, !selected, e);
                  }
                }}
              >
                <AnimatePresence mode="wait">
                  {showCheck ? (
                    <motion.div
                      key="checkbox"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Checkbox
                        checked={selected}
                        size="medium"
                        sx={{
                          color: 'hsl(var(--muted-foreground))',
                          '&.Mui-checked': {
                            color: 'hsl(var(--primary))',
                          },
                          '& .MuiSvgIcon-root': {
                            fontSize: 28,
                          },
                        }}
                        onClick={(e) => handleCheckboxChange(incident.id, !selected, e)}
                      />
                    </motion.div>
                  ) : resolvedImage ? (
                    <motion.div
                      key="source-img"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Tooltip title={`Filter by ${incident.source}`} placement="right">
                        <Box
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onFilterChange?.('source', incident.source || '');
                          }}
                          sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'stretch', justifyContent: 'stretch', cursor: 'pointer' }}
                        >
                          <img
                            src={resolvedImage}
                            alt={incident.source}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', display: 'block' }}
                          />
                        </Box>
                      </Tooltip>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="icon"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <IconComponent size={22} color={iconColor} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Status is conveyed by the status chip in the card body —
                    no need for a duplicate badge overlay on the icon. */}

                {/* Threading badge: shows count of merged incidents when this
                    is a primary that has absorbed others via thread merge. */}
                {(() => {
                  if (showCheck) return null;
                  const rawSource = (incident as any).related_incidents
                    ? (incident as any)
                    : (incident as any).rawOCSF || (incident as any);
                  const linked = getLinkedPointers(rawSource);
                  // Thread count = merged pointers + self, OR the number of
                  // siblings sharing the same email thread_id in the loaded
                  // list (whichever is larger). This surfaces the badge even
                  // when incidents share a thread but have not yet been
                  // persistently merged.
                  const pointerCount = linked.length + 1;
                  const siblingCount = threadCounts?.[incident.id] || 0;
                  const count = Math.max(pointerCount, siblingCount);
                  if (count <= 1) return null;

                  return (
                    <Tooltip title={`${count} incident${count !== 1 ? 's' : ''} in this thread`} arrow>
                      <Avatar
                        sx={{
                          position: 'absolute',
                          bottom: -4,
                          right: -4,
                          width: 18,
                          height: 18,
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          bgcolor: 'hsl(var(--primary))',
                          color: 'hsl(var(--primary-foreground))',
                          border: '2px solid hsl(var(--background))',
                          boxSizing: 'border-box',
                          pointerEvents: 'auto',
                        }}
                      >
                        {count}
                      </Avatar>
                    </Tooltip>
                  );
                })()}
              </Box>

              {/* Content */}
              <Box 
                sx={{ flex: 1, minWidth: 0 }}
                component={getIncidentUrl ? Link : 'div'}
                to={getIncidentUrl ? getIncidentUrl(incident) : undefined}
                onClick={(e: React.MouseEvent) => {
                  if (selectedIds.size > 0) {
                    e.preventDefault();
                    handleCheckboxChange(incident.id, !selected, e);
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  {resyncingIds.has(incident.id) ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      <CircularProgress size={14} sx={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
                      <Typography
                        variant="body1"
                        sx={{
                          fontWeight: 600,
                          color: 'hsl(var(--primary))',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.9rem',
                        }}
                      >
                        Loading details from {resyncingSource || 'source'}…
                      </Typography>
                    </Box>
                  ) : (
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 600,
                        color: 'hsl(var(--foreground))',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {incident.title && incident.title.trim() !== 'Untitled Incident' && incident.title.trim() !== 'Requires sync' && incident.title.trim() !== incident.id && incident.title.trim() ? incident.title.trim() : (
                        incident.source ? (
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'hsl(var(--severity-medium))', fontStyle: 'italic', fontWeight: 500 }}>
                            <RefreshIcon size={14} />
                            Requires sync
                          </Box>
                        ) : (
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', fontWeight: 500 }}>
                            Untitled incident
                          </Box>
                        )

                      )}
                    </Typography>
                  )}
                  <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {typeof incident.id === 'string' && incident.id.startsWith('demo-') && (
                      <Tooltip title="Seeded demo incident — remove via Clean up demo data on the dashboard" placement="top">
                        <Chip
                          label="Demo"
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            letterSpacing: 0.4,
                            textTransform: 'uppercase',
                            backgroundColor: 'hsl(var(--primary) / 0.12)',
                            color: 'hsl(var(--primary))',
                            border: '1px solid hsl(var(--primary) / 0.35)',
                          }}
                        />
                      </Tooltip>
                    )}
                    
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  {incident.originCreatedTs && (
                    <Tooltip title={`Created: ${formatAbsoluteTime(incident.originCreatedTs)}`} placement="bottom">
                      <Typography
                        variant="caption"
                        sx={{ color: 'hsl(var(--muted-foreground))', cursor: 'default' }}
                      >
                        {formatRelativeTime(incident.originCreatedTs, isMobile)}
                      </Typography>
                    </Tooltip>
                  )}
                  {(incident.editedTs && incident.editedTs !== incident.originCreatedTs) && (() => {
                    const isStale = incident.status !== 'resolved' && incident.status !== 'closed' && (Date.now() - incident.editedTs) > 86400000;
                    return (
                      <>
                        <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                          •
                        </Typography>
                        <Tooltip title={`Updated: ${formatAbsoluteTime(incident.editedTs)}`} placement="bottom">
                          <Typography
                            variant="caption"
                            sx={{ 
                              cursor: 'default', 
                              fontStyle: 'italic',
                              color: isStale ? 'hsl(var(--severity-medium))' : 'hsl(var(--muted-foreground))',
                              fontWeight: isStale ? 600 : 400,
                            }}
                          >
                            edited {formatRelativeTime(incident.editedTs, isMobile)}
                          </Typography>
                        </Tooltip>
                      </>
                    );
                  })()}
                  {incident.source && !resolvedImage && (
                    <>
                      <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                        •
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'hsl(var(--muted-foreground))',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          '&:hover': { color: 'hsl(var(--foreground))' },
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onFilterChange?.('source', incident.source || '');
                        }}
                      >
                        {incident.source}
                      </Typography>
                    </>
                  )}
                   {!isMobile && incident.assignee && (
                    <>
                      <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                        •
                      </Typography>
                      <Chip
                        label={incident.assignee}
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onFilterChange?.('assignee', incident.assignee || '');
                        }}
                        sx={{
                          backgroundColor: 'hsl(var(--muted) / 0.5)',
                          color: 'hsl(var(--muted-foreground))',
                          fontWeight: 500,
                          fontSize: '0.65rem',
                          height: 22,
                          cursor: 'pointer',
                          '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                        }}
                      />
                    </>
                  )}
                  {/* Tenant name — only shown for incidents that belong to a
                       different tenant than the current one. The current tenant
                       is implied and doesn't need a label. */}
                  {!isMobile && isParentOrg &&
                    incident.orgId &&
                    incident.orgId !== currentOrgId &&
                    incident.orgName &&
                    !(incident.sharedOrgs && incident.sharedOrgs.length > 1) && (
                    <>
                      <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                        •
                      </Typography>
                      <Tooltip title={`Filter by tenant: ${incident.orgName}`} placement="bottom">
                        <Typography
                          variant="caption"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onFilterChange?.('org', incident.orgId || '');
                          }}
                          sx={{ color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}
                        >
                          {incident.orgName}
                        </Typography>
                      </Tooltip>
                    </>
                  )}
                  {!isMobile && incident.sharedOrgs && incident.sharedOrgs.length > 1 && (
                    <>
                      <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                        •
                      </Typography>
                      <Tooltip title={incident.sharedOrgs.map(o => o.orgName).join(', ')} placement="bottom">
                        <Typography
                          variant="caption"
                          sx={{ color: 'hsl(var(--muted-foreground))', cursor: 'default' }}
                        >
                          {incident.sharedOrgs.length} tenants
                        </Typography>
                      </Tooltip>
                    </>
                  )}
                   {/* Task count intentionally hidden from the incidents list — too noisy. */}
                  {/* Labels / tags — moved down here from the right-side chip
                      cluster so the title row has more breathing room. They
                      sit alongside org / assignee / source as another piece
                      of contextual metadata. */}
                    {(() => {
                     // Hide the synthetic "Manual" label that's auto-attached to
                     // manually-created incidents — it's noise, not metadata.
                      const visibleLabels = (incident.labels || []).filter(
                        (l) => l.trim().toLowerCase() !== 'manual',
                      );
                      if (isMobile) return null;
                      if (visibleLabels.length === 0) return null;
                     return (
                       <>
                         <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                           •
                         </Typography>
                         {visibleLabels.slice(0, 3).map((label, idx) => (
                           <Chip
                             key={`label-bottom-${idx}`}
                             label={label}
                             size="small"
                             onClick={(e) => {
                               e.stopPropagation();
                               e.preventDefault();
                               onFilterChange?.('tag', label);
                             }}
                              sx={{
                                backgroundColor: 'hsl(var(--muted) / 0.5)',
                                color: 'hsl(var(--muted-foreground))',
                                fontWeight: 500,
                                fontSize: '0.65rem',
                                height: 22,
                                cursor: 'pointer',
                                '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                              }}
                           />
                         ))}
                         {visibleLabels.length > 3 && (
                           <Tooltip title={visibleLabels.slice(3).join(', ')} placement="bottom">
                             <Chip
                               label={`+${visibleLabels.length - 3}`}
                               size="small"
                                sx={{
                                  backgroundColor: 'hsl(var(--muted) / 0.3)',
                                  color: 'hsl(var(--muted-foreground))',
                                  fontWeight: 500,
                                  fontSize: '0.65rem',
                                  height: 22,
                                }}
                             />
                           </Tooltip>
                         )}
                       </>
                     );
                    })()}
                </Box>
              </Box>

              {/* Chips */}
              <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 400 }}>
                {(incident.correlationCount ?? 0) > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'hsl(var(--muted-foreground))' }}>
                    <Link2 size={14} />
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                      {incident.correlationCount}
                    </Typography>
                  </Box>
                )}
                {/* Labels moved to the bottom meta row to free up title space. */}
                <Chip
                  label={customSeverity?.label || (incident.severity ? getSeverityLabel(incident.severity) : 'unknown')}
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onFilterChange?.('severity', incident.severity);
                  }}
                  sx={{
                    backgroundColor: `${severityColor}20`,
                    color: severityColor,
                    fontWeight: 500,
                    textTransform: 'capitalize',
                    fontSize: '0.7rem',
                    height: 24,
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: `${severityColor}35` },
                  }}
                />
                {!isKnownStatus(incident.status) ? (
                  <Tooltip title={`Unknown status "${incident.status}" — may need manual mapping`} placement="top">
                    <Chip
                      label={`⚠ ${statusInfo.label}`}
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onFilterChange?.('status', incident.status);
                      }}
                      sx={{
                        backgroundColor: 'hsl(var(--severity-medium) / 0.15)',
                        color: 'hsl(var(--severity-medium))',
                        fontWeight: 500,
                        fontSize: '0.7rem',
                        height: 24,
                        cursor: 'pointer',
                        border: '1px dashed hsl(var(--severity-medium) / 0.4)',
                        '&:hover': { opacity: 0.8 },
                      }}
                    />
                  </Tooltip>
                ) : (
                  <Chip
                    label={statusInfo.label}
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onFilterChange?.('status', incident.status);
                    }}
                    sx={{
                      backgroundColor: statusInfo.bg,
                      color: statusInfo.color,
                      fontWeight: 500,
                      fontSize: '0.7rem',
                      height: 24,
                      cursor: 'pointer',
                      '&:hover': { opacity: 0.8 },
                    }}
                  />
                )}
              </Box>

              {/* Source app logo moved to the left icon — no right-side duplicate. */}

            </Box>
          </motion.div>
            )}
          </ResolvedSourceImage>
        );
      })}

      {incidents.length === 0 && (
        <>
          <Box
            sx={{
              p: 4,
              textAlign: 'center',
              borderRadius: 2,
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              {totalIncidentCount && totalIncidentCount > 0
                ? `0/${totalIncidentCount} incidents match your filter`
                : 'No incidents match your filter'}
            </Typography>
            {(onResetFilters || onResetOrgFilter || onShowAllIncidents) && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                {(onResetFilters || onResetOrgFilter) && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={onResetFilters || onResetOrgFilter}
                    sx={{
                      height: 36,
                      textTransform: 'none',
                      color: 'hsl(var(--foreground))',
                      borderColor: 'hsl(var(--border))',
                      '&:hover': { borderColor: 'hsl(var(--primary))' },
                    }}
                  >
                    Reset filters
                  </Button>
                )}
                {onShowAllIncidents && (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={onShowAllIncidents}
                    sx={{
                      height: 36,
                      textTransform: 'none',
                      backgroundColor: 'hsl(var(--primary))',
                      color: 'hsl(var(--primary-foreground))',
                      '&:hover': { backgroundColor: 'hsl(var(--primary))', opacity: 0.9 },
                    }}
                  >
                    Show all incidents
                  </Button>
                )}
              </Box>
            )}
            {isParentOrg && orgFilterNames && orgFilterNames.length > 0 && totalOrgCount && totalOrgCount > orgFilterNames.length && (
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                Showing {orgFilterNames.length} of {totalOrgCount} tenant{totalOrgCount > 1 ? 's' : ''}: {orgFilterNames.join(', ')}
              </Typography>
            )}

          </Box>

          {/* Secondary CTA: even when filters hide the list, surface the
              ingestion setup path so users can keep growing coverage. Mirrors
              the controls used in the full empty state. */}
          <Box
            sx={{
              mt: 2,
              p: 3,
              borderRadius: 2,
              backgroundColor: 'hsl(var(--card))',
              border: '1px dashed hsl(var(--border))',
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: 'hsl(var(--foreground))' }}>
                Want more incidents handled for you?
              </Typography>
              <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', lineHeight: 1.5 }}>
                Connect another security tool or enable a webhook to expand automatic ingestion.
              </Typography>
            </Box>
            <Box
              component={Link}
              to="/onboarding/sources"
              sx={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                height: 36,
                px: 2,
                borderRadius: 1.5,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: 'hsl(var(--primary))',
                border: '1px solid hsl(var(--primary) / 0.5)',
                '&:hover': {
                  borderColor: 'hsl(var(--primary))',
                  backgroundColor: 'hsl(var(--primary) / 0.08)',
                },
              }}
            >
              Set up ingestion
              <ChevronRight size={16} />
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
};