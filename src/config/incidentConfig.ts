// Shared incident status and severity configuration
// Used across IncidentCardView, IncidentsPage, IncidentDetailPage, and IncidentStatsCards

import { Clock, Zap, Flame, CheckCircle, PauseCircle, AlertTriangle, GitMerge, LucideIcon } from 'lucide-react';

export const statusConfig: Record<string, { 
  icon: LucideIcon; 
  color: string; 
  bg: string; 
  label: string;
  id: number; // OCSF status_id
}> = {
  new: { 
    icon: Clock, 
    color: '#3b82f6', 
    bg: 'rgba(59, 130, 246, 0.15)',
    label: 'New',
    id: 1,
  },
  in_progress: { 
    icon: Zap, 
    color: '#f97316', 
    bg: 'rgba(249, 115, 22, 0.15)',
    label: 'In Progress',
    id: 2,
  },
  resolved: { 
    icon: CheckCircle, 
    color: '#22c55e', 
    bg: 'rgba(34, 197, 94, 0.15)',
    label: 'Resolved',
    id: 3,
  },
  on_hold: { 
    icon: PauseCircle, 
    color: '#a855f7', 
    bg: 'rgba(168, 85, 247, 0.15)',
    label: 'On Hold',
    id: 4,
  },
  escalated: { 
    icon: Flame, 
    color: '#ef4444', 
    bg: 'rgba(239, 68, 68, 0.15)',
    label: 'Escalated',
    id: 5,
  },
  merged: {
    icon: GitMerge,
    color: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.15)',
    label: 'Merged',
    id: 6,
  },
};

// ============================================================================
// Status Synonyms - maps alternative status strings to canonical statuses
// ============================================================================
export const STATUS_SYNONYMS: Record<string, string> = {
  // resolved synonyms
  closed: 'resolved',
  done: 'resolved',
  complete: 'resolved',
  completed: 'resolved',
  fixed: 'resolved',
  remediated: 'resolved',
  mitigated: 'resolved',
  // new synonyms
  open: 'new',
  created: 'new',
  pending: 'new',
  reported: 'new',
  // in_progress synonyms
  in_progress: 'in_progress',
  inprogress: 'in_progress',
  active: 'in_progress',
  investigating: 'in_progress',
  working: 'in_progress',
  assigned: 'in_progress',
  acknowledged: 'in_progress',
  // on_hold synonyms
  on_hold: 'on_hold',
  onhold: 'on_hold',
  paused: 'on_hold',
  waiting: 'on_hold',
  suspended: 'on_hold',
  snoozed: 'on_hold',
  // escalated synonyms
  escalated: 'escalated',
  critical_escalation: 'escalated',
  // merged synonyms
  merged: 'merged',
  duplicate: 'merged',
  duplicated: 'merged',
};

/**
 * Normalize a status string to a canonical status key.
 * Returns the canonical status if found, otherwise defaults to 'new'.
 */
export const normalizeStatus = (raw: string | undefined): string => {
  if (!raw) return 'new';
  const key = raw.toLowerCase().trim().replace(/[\s-]+/g, '_');
  // Direct match in statusConfig
  if (statusConfig[key]) return key;
  // Synonym match
  if (STATUS_SYNONYMS[key]) return STATUS_SYNONYMS[key];
  // Try without underscores
  const noUnder = key.replace(/_/g, '');
  if (STATUS_SYNONYMS[noUnder]) return STATUS_SYNONYMS[noUnder];
  // Unknown - default to 'new'
  return 'new';
};

/**
 * Check if a status is recognized (exists in statusConfig after normalization)
 */
export const isKnownStatus = (status: string): boolean => {
  return !!statusConfig[status];
};
export const severityColors: Record<string, string> = {
  critical: '#ef4444',
  high: '#ea3815',
  medium: '#d97706',
  low: '#22c55e',
  informational: '#3b82f6',
};

/**
 * Returns a theme-aware CSS color for a given severity level.
 * Uses --severity-* CSS variables defined in styles.css for optimal contrast
 * in both light and dark mode.
 */
export const getSeverityColor = (severity: string): string => {
  const normalized = (severity || 'medium').toLowerCase();
  const key = normalized === 'informational' ? 'info' : normalized;
  return `hsl(var(--severity-${key}, var(--severity-medium)))`;
};

export const severityOrder: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  informational: 1,
};

// Helper to get status display info (handles unknown statuses with warning styling)
export const getStatusDisplay = (status: string) => {
  const config = statusConfig[status];
  if (config) return { ...config, unknown: false };
  return { 
    icon: AlertTriangle, 
    color: '#f59e0b', 
    bg: 'rgba(245, 158, 11, 0.15)',
    label: status.replace(/_/g, ' '),
    id: 0,
    unknown: true,
  };
};

/**
 * Resolve a canonical status key to its OCSF label and status_id.
 * Falls back to preserving the original status string with id=0 for unknown statuses,
 * so we never silently convert to "Resolved" or any other incorrect default.
 */
export const getOCSFStatus = (canonicalStatus: string): { label: string; id: number } => {
  const config = statusConfig[canonicalStatus];
  if (config) return { label: config.label, id: config.id };
  // Unknown status — preserve the raw string, don't force a mapping
  return { label: canonicalStatus.replace(/_/g, ' '), id: 0 };
};
