/**
 * Inline assignee selector — visual & behaviour twin of the assignee chip in
 * `IncidentMetaChips`, extracted so the kanban task cards can show/edit
 * assignment with the same look the user already learns on the incident header.
 *
 * Used inline on kanban cards: the trigger does NOT bubble click events to the
 * card (which would otherwise open the edit modal).
 */
import { Box, FormControl, MenuItem, Select } from '@mui/material';
import { isAIAssignee } from '@/lib/utils';
import AgentIcon from '@/Shuffle-Core/components/AgentIcon';
import { useUsers } from '@/hooks/useUsers';

export interface TaskAssigneeChipProps {
  value: string;
  onChange: (next: string) => void;
  /** Caps the trigger width — usernames vary a lot. */
  maxWidth?: number;
  /** Smaller density for tight kanban cards. */
  dense?: boolean;
}

export const TaskAssigneeChip = ({
  value,
  onChange,
  maxWidth = 140,
  dense = true,
}: TaskAssigneeChipProps) => {
  const { users, loading } = useUsers();

  const fontSize = dense ? '0.65rem' : '0.7rem';
  const padY = dense ? 0.15 : 0.25;

  return (
    <FormControl
      size="small"
      variant="standard"
      sx={{ maxWidth, minWidth: 0, flexShrink: 1 }}
      // Stop the card's onClick (which opens the edit modal) from firing when
      // the user just wants to change assignment.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        displayEmpty
        disableUnderline
        disabled={loading}
        sx={{
          fontSize,
          fontWeight: 600,
          maxWidth,
          bgcolor: isAIAssignee(value)
            ? 'rgba(34, 197, 94, 0.15)'
            : value
              ? 'rgba(251, 146, 60, 0.15)'
              : 'rgba(148, 163, 184, 0.1)',
          color: isAIAssignee(value)
            ? '#22c55e'
            : value
              ? '#fb923c'
              : 'text.secondary',
          borderRadius: 1,
          px: 0.75,
          py: padY,
          '& .MuiSelect-select': {
            py: 0,
            pr: 2.5,
            maxWidth: maxWidth - 24,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
          '& .MuiSvgIcon-root': {
            color: isAIAssignee(value)
              ? '#22c55e'
              : value
                ? '#fb923c'
                : 'text.secondary',
            fontSize: 14,
          },
        }}
        MenuProps={{
          PaperProps: {
            sx: { bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' },
          },
        }}
        renderValue={(v) => {
          if (isAIAssignee(v as string)) {
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AgentIcon size={12} /> AI Agent
              </Box>
            );
          }
          return v || 'Unassigned';
        }}
      >
        <MenuItem value="">Unassigned</MenuItem>
        <MenuItem value="AI Agent">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AgentIcon size={14} />
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
  );
};

export default TaskAssigneeChip;
