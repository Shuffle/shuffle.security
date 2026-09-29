/**
 * Compact, chip-styled Status / Severity / Assignee selectors used in incident
 * headers. Identical visual treatment between the full incident detail page
 * and the simplified kanban view so users get muscle memory across both.
 */
import { useEffect, useRef } from 'react';
import {
  Box,
  FormControl,
  Select,
  MenuItem,
  Typography,
} from '@mui/material';
import { statusConfig, severityColors } from '@/config/incidentConfig';
import { isAIAssignee } from '@/lib/utils';
import AgentIcon from '@/Shuffle-Core/components/AgentIcon';
import { useUsers } from '@/hooks/useUsers';

export interface IncidentMetaChipsProps {
  status: string;
  severity: string;
  assignee: string;
  onStatusChange: (next: string) => void;
  onSeverityChange: (next: string) => void;
  onAssigneeChange: (next: string) => void;
  /** When the user picks "resolved" from the status dropdown, surface the dialog
   *  request to the parent instead of mutating status directly. */
  onResolveRequest?: () => void;
  /** Hide the dropdown affordances (used for read-only / public views). */
  readOnly?: boolean;
  /** Cap each chip's max width so long usernames / status labels don't blow
   *  out a tight header. Defaults to 180px on the assignee chip. */
  assigneeMaxWidth?: number;
  /** Force everything onto a single line — no wrap, no bullet separators,
   *  ellipsis on overflow. Used by the simplified view's narrow sidebar. */
  singleLine?: boolean;
}

export const IncidentMetaChips = ({
  status,
  severity,
  assignee,
  onStatusChange,
  onSeverityChange,
  onAssigneeChange,
  onResolveRequest,
  readOnly = false,
  assigneeMaxWidth = 180,
  singleLine = false,
}: IncidentMetaChipsProps) => {
  const { users, loading: usersLoading } = useUsers();

  /**
   * Autocorrect: incidents ingested from email can end up with an assignee that
   * is really a sender header ("Google Cloud Alerting <x@y.com>") rather than a
   * real Shuffle user. Once the user list is known, silently reset any assignee
   * that matches no existing user back to Unassigned.
   */
  const correctedRef = useRef<string | null>(null);
  useEffect(() => {
    if (readOnly || usersLoading || users.length === 0) return;
    if (!assignee || isAIAssignee(assignee)) return;
    if (correctedRef.current === assignee) return;
    const known = users.some(
      (u) => (u.username || '').trim().toLowerCase() === assignee.trim().toLowerCase(),
    );
    if (!known) {
      correctedRef.current = assignee;
      onAssigneeChange('');
    }
  }, [assignee, users, usersLoading, readOnly, onAssigneeChange]);

  const statusInfo = statusConfig[status];


  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: singleLine ? 0.5 : 1,
        flexWrap: singleLine ? 'nowrap' : 'wrap',
        minWidth: 0,
        ...(singleLine && { overflow: 'hidden' }),
        ...(readOnly && { pointerEvents: 'none' }),
      }}
    >
      {/* Status */}
      <FormControl size="small" variant="standard" sx={{ flexShrink: 0, minWidth: 0 }}>
        <Select
          value={status}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'resolved' && onResolveRequest) {
              onResolveRequest();
              return;
            }
            onStatusChange(val);
          }}
          disableUnderline
          sx={{
            fontSize: '0.7rem',
            fontWeight: 600,
            color: statusInfo?.color || '#f59e0b',
            '& .MuiSelect-select': {
              py: 0.25,
              px: 1,
              borderRadius: 3,
              bgcolor: statusInfo?.bg || 'rgba(245, 158, 11, 0.15)',
              border: !statusInfo ? '1px dashed rgba(245, 158, 11, 0.4)' : 'none',
            },
            '& .MuiSelect-icon': {
              color: statusInfo?.color || '#f59e0b',
              fontSize: 16,
            },
          }}
          renderValue={(val) => {
            if (!statusConfig[val]) return `⚠ ${val.replace(/_/g, ' ')}`;
            return statusConfig[val].label;
          }}
          MenuProps={{
            PaperProps: {
              sx: { bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' },
            },
          }}
        >
          {Object.entries(statusConfig)
            // "Merged" is set only by the auto-merge action — never let a user
            // pick it manually from the status dropdown.
            .filter(([key]) => key !== 'merged')
            .map(([key, cfg]) => {
            const isDisabled = key === 'on_hold' || key === 'escalated';
            return (
              <MenuItem
                key={key}
                value={key}
                disabled={isDisabled}
                sx={{ fontSize: '0.8rem', gap: 1, opacity: isDisabled ? 0.4 : 1 }}
              >
                <cfg.icon size={14} color={cfg.color} />
                {cfg.label}
                {isDisabled && (
                  <Typography
                    component="span"
                    sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', ml: 'auto' }}
                  >
                    Soon
                  </Typography>
                )}
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>

      {!singleLine && (
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>•</Typography>
      )}

      {/* Severity */}
      <FormControl size="small" variant="standard" sx={{ flexShrink: 0, minWidth: 0 }}>
        <Select
          value={severity}
          onChange={(e) => onSeverityChange(e.target.value)}
          disableUnderline
          sx={{
            fontSize: '0.7rem',
            fontWeight: 600,
            bgcolor: `${severityColors[severity]}20`,
            color: severityColors[severity],
            borderRadius: 1,
            px: 1,
            py: 0.25,
            textTransform: 'capitalize',
            '& .MuiSelect-select': { py: 0, pr: 2.5 },
            '& .MuiSvgIcon-root': { color: severityColors[severity], fontSize: 16 },
          }}
          MenuProps={{
            PaperProps: {
              sx: { bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' },
            },
          }}
        >
          <MenuItem value="critical">Critical</MenuItem>
          <MenuItem value="high">High</MenuItem>
          <MenuItem value="medium">Medium</MenuItem>
          <MenuItem value="low">Low</MenuItem>
          <MenuItem value="informational">Informational</MenuItem>
        </Select>
      </FormControl>

      {!singleLine && (
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>•</Typography>
      )}

      {/* Assignee — in singleLine, this shrinks first since usernames vary the most. */}
      <FormControl
        size="small"
        variant="standard"
        sx={{
          maxWidth: assigneeMaxWidth,
          minWidth: 0,
          ...(singleLine && { flex: '1 1 0' }),
        }}
      >
        <Select
          value={assignee || ''}
          onChange={(e) => onAssigneeChange(e.target.value)}
          displayEmpty
          disableUnderline
          disabled={usersLoading}
          sx={{
            fontSize: '0.7rem',
            fontWeight: 600,
            maxWidth: assigneeMaxWidth,
            bgcolor: isAIAssignee(assignee)
              ? 'rgba(34, 197, 94, 0.15)'
              : assignee
                ? 'rgba(251, 146, 60, 0.15)'
                : 'rgba(148, 163, 184, 0.1)',
            color: isAIAssignee(assignee)
              ? '#22c55e'
              : assignee
                ? '#fb923c'
                : 'text.secondary',
            borderRadius: 1,
            px: 1,
            py: 0.25,
            '& .MuiSelect-select': {
              py: 0,
              pr: 2.5,
              maxWidth: assigneeMaxWidth - 24,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
            '& .MuiSvgIcon-root': {
              color: isAIAssignee(assignee)
                ? '#22c55e'
                : assignee
                  ? '#fb923c'
                  : 'text.secondary',
              fontSize: 16,
            },
          }}
          MenuProps={{
            PaperProps: {
              sx: { bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' },
            },
          }}
          renderValue={(value) => {
            if (isAIAssignee(value as string)) {
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AgentIcon size={16} /> AI Agent
                </Box>
              );
            }
            return value || 'Unassigned';
          }}
        >
          <MenuItem value="">Unassigned</MenuItem>
          <MenuItem value="AI Agent">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AgentIcon size={16} />
              AI Agent
            </Box>
          </MenuItem>
          {users.map((user) => (
            <MenuItem key={user.id} value={user.username}>
              {user.username}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
};

export default IncidentMetaChips;
