/**
 * Native platform components rendered inline within incident timeline entries.
 * Ensures severity, status/resolution, tags, assignments, and TLP in the timeline
 * feel identical to their native counterparts across the platform.
 */
import React, { useState } from 'react';
import {
  Box,
  FormControl,
  Select,
  MenuItem,
  Chip,
  TextField,
  Typography,
} from '@mui/material';
import { statusConfig, severityColors, normalizeStatus } from '@/config/incidentConfig';
import { isAIAssignee } from '@/lib/utils';
import AgentIcon from '@/Shuffle-MCPs/components/AgentIcon';
import { useUsers } from '@/hooks/useUsers';
import { tlpLevels } from '@/components/incidents/CreateIncidentDialog';

// ============================================================================
// 1. Severity Dropdown
// ============================================================================
export interface TimelineSeverityDropdownProps {
  value: string;
  onChange?: (next: string) => void;
  disabled?: boolean;
}

export const TimelineSeverityDropdown: React.FC<TimelineSeverityDropdownProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const normalized = (value || 'medium').toLowerCase();
  const color = severityColors[normalized] || severityColors.medium;
  const isReadOnly = disabled || !onChange;

  return (
    <FormControl
      size="small"
      variant="standard"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      sx={{ display: 'inline-flex', verticalAlign: 'middle' }}
    >
      <Select
        value={normalized}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={isReadOnly}
        disableUnderline
        sx={{
          fontSize: '0.7rem',
          fontWeight: 600,
          bgcolor: `${color}20`,
          color: color,
          borderRadius: 1,
          px: 1,
          py: 0.2,
          height: 22,
          textTransform: 'capitalize',
          border: `1px solid ${color}40`,
          cursor: isReadOnly ? 'default' : 'pointer',
          '& .MuiSelect-select': {
            py: 0,
            pr: isReadOnly ? 1 : 2.5,
            display: 'flex',
            alignItems: 'center',
          },
          '& .MuiSvgIcon-root': {
            color: color,
            fontSize: 14,
            display: isReadOnly ? 'none' : 'block',
          },
          '&:hover': {
            bgcolor: isReadOnly ? `${color}20` : `${color}30`,
          },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              bgcolor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            },
          },
        }}
      >
        <MenuItem value="critical" sx={{ fontSize: '0.75rem', fontWeight: 600, color: severityColors.critical }}>Critical</MenuItem>
        <MenuItem value="high" sx={{ fontSize: '0.75rem', fontWeight: 600, color: severityColors.high }}>High</MenuItem>
        <MenuItem value="medium" sx={{ fontSize: '0.75rem', fontWeight: 600, color: severityColors.medium }}>Medium</MenuItem>
        <MenuItem value="low" sx={{ fontSize: '0.75rem', fontWeight: 600, color: severityColors.low }}>Low</MenuItem>
        <MenuItem value="informational" sx={{ fontSize: '0.75rem', fontWeight: 600, color: severityColors.informational }}>Informational</MenuItem>
      </Select>
    </FormControl>
  );
};

// ============================================================================
// 2. Status / Resolution Dropdown
// ============================================================================
export interface TimelineStatusDropdownProps {
  value: string;
  onChange?: (next: string) => void;
  onResolveRequest?: () => void;
  resolutionReason?: string;
  resolutionNotes?: string;
  disabled?: boolean;
}

export const TimelineStatusDropdown: React.FC<TimelineStatusDropdownProps> = ({
  value,
  onChange,
  onResolveRequest,
  resolutionReason,
  resolutionNotes,
  disabled = false,
}) => {
  const canonical = normalizeStatus(value);
  const cfg = statusConfig[canonical] || statusConfig.new;
  const isReadOnly = disabled || !onChange;

  return (
    <Box
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <FormControl
        size="small"
        variant="standard"
        sx={{ display: 'inline-flex', verticalAlign: 'middle' }}
      >
        <Select
          value={canonical}
          onChange={(e) => {
            const next = e.target.value;
            if (next === 'resolved' && onResolveRequest) {
              onResolveRequest();
              return;
            }
            onChange?.(next);
          }}
          disabled={isReadOnly}
          disableUnderline
          sx={{
            fontSize: '0.7rem',
            fontWeight: 600,
            color: cfg.color,
            cursor: isReadOnly ? 'default' : 'pointer',
            '& .MuiSelect-select': {
              py: 0.2,
              px: 1,
              borderRadius: 3,
              bgcolor: cfg.bg,
              border: `1px solid ${cfg.color}35`,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              pr: isReadOnly ? 1 : 2.5,
            },
            '& .MuiSelect-icon': {
              color: cfg.color,
              fontSize: 14,
              display: isReadOnly ? 'none' : 'block',
            },
          }}
          renderValue={(val) => {
            const currentCfg = statusConfig[val];
            return currentCfg ? currentCfg.label : String(val).replace(/_/g, ' ');
          }}
          MenuProps={{
            PaperProps: {
              sx: {
                bgcolor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              },
            },
          }}
        >
          {Object.entries(statusConfig)
            .filter(([key]) => key !== 'merged')
            .map(([key, itemCfg]) => {
              const isDisabled = key === 'on_hold' || key === 'escalated';
              return (
                <MenuItem
                  key={key}
                  value={key}
                  disabled={isDisabled}
                  sx={{ fontSize: '0.75rem', gap: 1, opacity: isDisabled ? 0.4 : 1 }}
                >
                  <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 500, color: itemCfg.color }}>
                    {itemCfg.label}
                  </Typography>
                  {isDisabled && (
                    <Typography component="span" sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', ml: 'auto' }}>
                      Soon
                    </Typography>
                  )}
                </MenuItem>
              );
            })}
        </Select>
      </FormControl>

      {/* Resolution details (Reason badge + Notes) when resolved */}
      {canonical === 'resolved' && resolutionReason && (
        <Chip
          label={resolutionReason}
          size="small"
          variant="outlined"
          sx={{
            height: 20,
            fontSize: '0.65rem',
            fontWeight: 600,
            bgcolor: 'rgba(34, 197, 94, 0.08)',
            borderColor: 'rgba(34, 197, 94, 0.4)',
            color: '#22c55e',
            '& .MuiChip-label': { px: 0.75 },
          }}
        />
      )}
      {canonical === 'resolved' && resolutionNotes && (
        <Typography
          sx={{
            fontSize: '0.68rem',
            color: 'text.secondary',
            fontStyle: 'italic',
            maxWidth: 320,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={resolutionNotes}
        >
          {resolutionNotes}
        </Typography>
      )}
    </Box>
  );
};

// ============================================================================
// 3. Assignee Dropdown
// ============================================================================
export interface TimelineAssigneeDropdownProps {
  value: string;
  onChange?: (next: string) => void;
  disabled?: boolean;
}

export const TimelineAssigneeDropdown: React.FC<TimelineAssigneeDropdownProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { users, loading: usersLoading } = useUsers();
  const isAgent = isAIAssignee(value);
  const isReadOnly = disabled || !onChange || usersLoading;

  const bg = isAgent
    ? 'rgba(34, 197, 94, 0.15)'
    : value
      ? 'rgba(251, 146, 60, 0.15)'
      : 'rgba(148, 163, 184, 0.1)';

  const color = isAgent
    ? '#22c55e'
    : value
      ? '#fb923c'
      : 'hsl(var(--muted-foreground))';

  const borderColor = isAgent
    ? 'rgba(34, 197, 94, 0.35)'
    : value
      ? 'rgba(251, 146, 60, 0.35)'
      : 'hsl(var(--border-subtle))';

  return (
    <FormControl
      size="small"
      variant="standard"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      sx={{ display: 'inline-flex', verticalAlign: 'middle', maxWidth: 180 }}
    >
      <Select
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        displayEmpty
        disabled={isReadOnly}
        disableUnderline
        sx={{
          fontSize: '0.7rem',
          fontWeight: 600,
          bgcolor: bg,
          color: color,
          border: `1px solid ${borderColor}`,
          borderRadius: 1,
          px: 1,
          py: 0.2,
          height: 22,
          cursor: isReadOnly ? 'default' : 'pointer',
          '& .MuiSelect-select': {
            py: 0,
            pr: isReadOnly ? 1 : 2.5,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
          '& .MuiSvgIcon-root': {
            color: color,
            fontSize: 14,
            display: isReadOnly ? 'none' : 'block',
          },
          '&:hover': {
            bgcolor: isReadOnly ? bg : (isAgent ? 'rgba(34, 197, 94, 0.22)' : 'rgba(251, 146, 60, 0.22)'),
          },
        }}
        renderValue={(val) => {
          if (isAIAssignee(val as string)) {
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AgentIcon size={12} />
                <span>AI Agent</span>
              </Box>
            );
          }
          return (val as string) || 'Unassigned';
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              bgcolor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            },
          },
        }}
      >
        <MenuItem value="" sx={{ fontSize: '0.75rem' }}>Unassigned</MenuItem>
        <MenuItem value="AI Agent" sx={{ fontSize: '0.75rem' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AgentIcon size={14} />
            <span>AI Agent</span>
          </Box>
        </MenuItem>
        {users.map((user) => (
          <MenuItem key={user.id} value={user.username} sx={{ fontSize: '0.75rem' }}>
            {user.username}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

// ============================================================================
// 4. Tags (Labels) Editor
// ============================================================================
export interface TimelineTagsEditorProps {
  tags?: string[];
  addedTags?: string[];
  removedTags?: string[];
  onAddTag?: (next: string) => void;
  onDeleteTag?: (tag: string) => void;
  disabled?: boolean;
}

export const TimelineTagsEditor: React.FC<TimelineTagsEditorProps> = ({
  tags = [],
  addedTags,
  removedTags,
  onAddTag,
  onDeleteTag,
  disabled = false,
}) => {
  const [newTagInput, setNewTagInput] = useState('');
  const [isInputActive, setIsInputActive] = useState(false);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagInput.trim();
    if (trimmed && onAddTag) {
      onAddTag(trimmed);
      setNewTagInput('');
      setIsInputActive(false);
    }
  };

  const hasDiff = (addedTags && addedTags.length > 0) || (removedTags && removedTags.length > 0);

  return (
    <Box
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* If this is a diff event, display added & removed tags specifically */}
      {hasDiff ? (
        <>
          {addedTags?.map((tag, idx) => (
            <Chip
              key={`add-${idx}`}
              label={`+ ${tag}`}
              size="small"
              variant="outlined"
              onDelete={!disabled && onDeleteTag ? () => onDeleteTag(tag) : undefined}
              sx={{
                height: 20,
                fontSize: '0.68rem',
                fontWeight: 600,
                bgcolor: 'rgba(6, 182, 212, 0.08)',
                borderColor: 'rgba(6, 182, 212, 0.5)',
                color: '#06b6d4',
                '& .MuiChip-label': { px: 0.75 },
                '& .MuiChip-deleteIcon': {
                  fontSize: 12,
                  color: '#06b6d4',
                  '&:hover': { color: '#67e8f9' },
                },
              }}
            />
          ))}
          {removedTags?.map((tag, idx) => (
            <Chip
              key={`rem-${idx}`}
              label={`- ${tag}`}
              size="small"
              variant="outlined"
              sx={{
                height: 20,
                fontSize: '0.68rem',
                fontWeight: 500,
                textDecoration: 'line-through',
                opacity: 0.55,
                bgcolor: 'transparent',
                borderColor: 'hsl(var(--border))',
                color: 'text.secondary',
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          ))}
        </>
      ) : (
        tags.map((tag, idx) => (
          <Chip
            key={idx}
            label={tag}
            size="small"
            variant="outlined"
            onDelete={!disabled && onDeleteTag ? () => onDeleteTag(tag) : undefined}
            sx={{
              height: 20,
              fontSize: '0.68rem',
              fontWeight: 500,
              bgcolor: 'transparent',
              borderColor: 'rgba(6, 182, 212, 0.4)',
              color: '#06b6d4',
              '& .MuiChip-label': { px: 0.75 },
              '& .MuiChip-deleteIcon': {
                fontSize: 12,
                color: '#06b6d4',
                '&:hover': { color: '#67e8f9' },
              },
            }}
          />
        ))
      )}

      {/* Inline "+ Add" Tag form */}
      {!disabled && onAddTag && (
        isInputActive ? (
          <Box
            component="form"
            onSubmit={handleAdd}
            sx={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <TextField
              autoFocus
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onBlur={() => {
                if (!newTagInput.trim()) setIsInputActive(false);
              }}
              placeholder="Tag name"
              variant="outlined"
              size="small"
              InputProps={{
                sx: {
                  fontSize: '0.68rem',
                  height: 20,
                  bgcolor: 'hsl(var(--input))',
                  '& input': { py: 0, px: 0.6 },
                },
              }}
              sx={{ width: 80 }}
            />
          </Box>
        ) : (
          <Typography
            component="span"
            onClick={() => setIsInputActive(true)}
            sx={{
              fontSize: '0.68rem',
              color: 'text.secondary',
              cursor: 'pointer',
              px: 0.6,
              py: 0.1,
              borderRadius: 0.75,
              border: '1px dashed hsl(var(--border))',
              '&:hover': {
                color: 'text.primary',
                borderColor: 'hsl(var(--foreground))',
              },
            }}
          >
            + Add
          </Typography>
        )
      )}
    </Box>
  );
};

// ============================================================================
// 5. TLP Dropdown
// ============================================================================
export interface TimelineTlpDropdownProps {
  value: string;
  onChange?: (next: string) => void;
  disabled?: boolean;
}

export const TimelineTlpDropdown: React.FC<TimelineTlpDropdownProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const currentOpt = tlpLevels.find((t) => t.label === value) || tlpLevels[2]; // fallback AMBER
  const color = currentOpt.color;
  const isReadOnly = disabled || !onChange;

  return (
    <FormControl
      size="small"
      variant="standard"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      sx={{ display: 'inline-flex', verticalAlign: 'middle' }}
    >
      <Select
        value={value || 'TLP:AMBER'}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={isReadOnly}
        disableUnderline
        sx={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: color,
          cursor: isReadOnly ? 'default' : 'pointer',
          borderRadius: 1,
          px: 0.75,
          py: 0.2,
          height: 22,
          bgcolor: 'hsl(var(--muted) / 0.3)',
          border: '1px solid hsl(var(--border-subtle))',
          '& .MuiSelect-select': {
            py: 0,
            pr: isReadOnly ? 0.75 : 2,
            display: 'flex',
            alignItems: 'center',
            gap: 0.6,
          },
          '& .MuiSelect-icon': {
            color: color,
            fontSize: 14,
            display: isReadOnly ? 'none' : 'block',
          },
        }}
        renderValue={(val) => {
          const opt = tlpLevels.find((t) => t.label === val);
          const dotColor = opt?.color || '#f59e0b';
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: dotColor,
                  border: dotColor === '#ffffff' ? '1px solid rgba(255,255,255,0.4)' : 'none',
                }}
              />
              <span>{val}</span>
            </Box>
          );
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              bgcolor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            },
          },
        }}
      >
        {tlpLevels.map((opt) => (
          <MenuItem key={opt.value} value={opt.label} sx={{ fontSize: '0.75rem' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: opt.color,
                  border: opt.color === '#ffffff' ? '1px solid rgba(255,255,255,0.3)' : 'none',
                }}
              />
              <span>{opt.label}</span>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
