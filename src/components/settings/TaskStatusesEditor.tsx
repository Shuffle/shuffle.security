/**
 * Editor for the org-wide list of incident task statuses (kanban lanes used on
 * /incidents-simple/<id>).
 *
 * Constraints intentionally enforced:
 *   - The `done` lane cannot be removed (it represents `task.completed`).
 *   - Keys are auto-derived from the label so the kanban routing stays stable
 *     even if users rename a lane (the `done` key is preserved as-is).
 *   - At least 2 lanes must exist (one open + done).
 */
import { Trash as DeleteOutlineIcon, Plus as AddIcon, RotateCcw as RestartAltIcon, GripVertical as DragIndicatorIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Button,
  Tooltip,
} from '@mui/material';
import {
  TaskStatusOption,
  DEFAULT_TASK_STATUSES,
  useTaskStatuses,
  setTaskStatuses,
} from '@/hooks/useEntityLabel';
import { toast } from '@/lib/toast';

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#f59e0b', // orange
  '#22c55e', // green
  '#ef4444', // red
  '#a855f7', // purple
  '#22b8cf', // cyan
  '#6b7280', // gray
];

/** Slugify a label into a stable lane key. Keeps `done` reserved. */
const slugify = (label: string, fallback: string): string => {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
};

export const TaskStatusesEditor = () => {
  const stored = useTaskStatuses();
  const [draft, setDraft] = useState<TaskStatusOption[]>(stored);
  const [dirty, setDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Sync draft with store changes when not actively editing
  useEffect(() => {
    if (!dirty) setDraft(stored);
  }, [stored, dirty]);

  const update = (next: TaskStatusOption[]) => {
    setDraft(next);
    setDirty(true);
  };

  const handleLabelChange = (idx: number, label: string) => {
    const next = [...draft];
    const isDoneLane = next[idx].key === 'done';
    next[idx] = {
      ...next[idx],
      label,
      // Preserve `done` key — kanban routing depends on it. Other lanes get
      // their key re-derived from the label so the URL/state stays readable.
      key: isDoneLane ? 'done' : slugify(label, next[idx].key || `status_${idx}`),
    };
    update(next);
  };

  const handleColorChange = (idx: number, color: string) => {
    const next = [...draft];
    next[idx] = { ...next[idx], color };
    update(next);
  };

  const handleRemove = (idx: number) => {
    if (draft[idx].key === 'done') {
      toast.error('The "Done" lane cannot be removed.');
      return;
    }
    if (draft.length <= 2) {
      toast.error('At least one open lane plus "Done" is required.');
      return;
    }
    update(draft.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    // Insert before the `done` lane so it stays at the end.
    const doneIdx = draft.findIndex((s) => s.key === 'done');
    const insertAt = doneIdx === -1 ? draft.length : doneIdx;
    const newStatus: TaskStatusOption = {
      key: `status_${Date.now()}`,
      label: 'New status',
      color: PRESET_COLORS[draft.length % PRESET_COLORS.length],
    };
    const next = [...draft.slice(0, insertAt), newStatus, ...draft.slice(insertAt)];
    update(next);
  };

  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const next = [...draft];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    setDragIndex(null);
    update(next);
  };

  const handleSave = async () => {
    await setTaskStatuses(draft);
    setDirty(false);
    toast.success('Task statuses saved');
  };

  const handleReset = () => {
    setDraft(DEFAULT_TASK_STATUSES);
    setDirty(true);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {draft.map((status, idx) => {
        const isDone = status.key === 'done';
        return (
          <Box
            key={`${status.key}-${idx}`}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(idx)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1,
              borderRadius: 1,
              border: '1px solid hsl(var(--border))',
              bgcolor: 'hsl(var(--background))',
              opacity: dragIndex === idx ? 0.4 : 1,
              cursor: 'grab',
              '&:active': { cursor: 'grabbing' },
            }}
          >
            <DragIndicatorIcon size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />

            {/* Color swatch with native picker */}
            <Tooltip title="Change color">
              <Box
                component="label"
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  bgcolor: status.color,
                  border: '2px solid hsl(var(--border))',
                  cursor: 'pointer',
                  flexShrink: 0,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <input
                  type="color"
                  value={status.color}
                  onChange={(e) => handleColorChange(idx, e.target.value)}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                  }}
                />
              </Box>
            </Tooltip>

            <TextField
              value={status.label}
              onChange={(e) => handleLabelChange(idx, e.target.value)}
              size="small"
              variant="standard"
              sx={{ flex: 1, '& .MuiInput-input': { fontSize: '0.9rem', fontWeight: 500 } }}
            />

            {isDone ? (
              <Typography
                variant="caption"
                sx={{ color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', mr: 1 }}
              >
                Required
              </Typography>
            ) : (
              <Tooltip title="Remove status">
                <IconButton size="small" onClick={() => handleRemove(idx)}>
                  <DeleteOutlineIcon size={20} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        );
      })}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, flexWrap: 'wrap', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAdd}
          sx={{ textTransform: 'none', whiteSpace: 'nowrap', height: 36 }}
        >
          Add status
        </Button>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="text"
            startIcon={<RestartAltIcon />}
            onClick={handleReset}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap', height: 36 }}
          >
            Reset to default
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={!dirty}
            onClick={handleSave}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap', height: 36 }}
          >
            Save changes
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default TaskStatusesEditor;
