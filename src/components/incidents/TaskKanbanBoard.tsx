import { Plus as AddIcon, Trash as DeleteOutlineIcon, GripVertical as DragIndicatorIcon } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Box, Typography, Chip, IconButton, TextField, Button } from '@mui/material';
import { IncidentTask, taskCategories } from '@/config/ocsfIncidentSchema';
import { useTaskStatuses } from '@/hooks/useEntityLabel';
import { TaskAssigneeChip } from './TaskAssigneeChip';
import { TaskEditDialog } from './TaskEditDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ============================================================================
// Lane semantics — copied verbatim from IncidentSimplePage so behaviour stays
// identical across the simplified and full incident views. `done` is a
// reserved key mapping to `task.completed === true`. Other lanes live on the
// task as a `_lane` marker; the first non-`done` lane is the default.
// ============================================================================
type LaneKey = string;

const getLane = (
  task: IncidentTask & { _lane?: LaneKey },
  laneKeys: LaneKey[],
): LaneKey => {
  if (task.completed) return 'done';
  if (task._lane && laneKeys.includes(task._lane)) return task._lane;
  // No explicit lane → always default to the first non-`done` lane (typically
  // "To Do"). We deliberately do NOT auto-bump assigned/aiWorking tasks into
  // a later lane: that hid genuine state-changes from the timeline and made
  // it impossible to tell whether a task had actually been moved.
  const openLanes = laneKeys.filter((k) => k !== 'done');
  return openLanes[0] || laneKeys[0];
};

const TASK_HISTORY_DEDUP_WINDOW_MS = 5 * 60 * 1000;

const applyLane = (
  task: IncidentTask & { _lane?: LaneKey },
  lane: LaneKey,
  laneKeys: LaneKey[],
  by?: string,
): IncidentTask & { _lane?: LaneKey } => {
  const previousLane = getLane(task, laneKeys);
  if (previousLane === lane) return task;
  const now = Date.now();
  const prevHistory = task.statusHistory || [];
  const lastEntry = prevHistory.length > 0 ? prevHistory[prevHistory.length - 1] : null;
  let nextHistory: typeof prevHistory;

  if (lastEntry && now - (lastEntry.at || 0) <= TASK_HISTORY_DEDUP_WINDOW_MS) {
    if (lane === lastEntry.from) {
      // Reverted back to the state before the last transition within the dedup window
      nextHistory = prevHistory.slice(0, -1);
    } else {
      // Transitioned to another lane within the window - merge the transition
      nextHistory = [
        ...prevHistory.slice(0, -1),
        { ...lastEntry, to: lane, at: now, by: by || lastEntry.by },
      ];
    }
  } else {
    nextHistory = [
      ...prevHistory,
      {
        from: previousLane,
        to: lane,
        at: now,
        by: by || undefined,
      },
    ];
  }
  if (lane === 'done') {
    return {
      ...task,
      _lane: 'done',
      completed: true,
      completedAt: task.completedAt || now,
      statusHistory: nextHistory,
    };
  }
  return {
    ...task,
    _lane: lane,
    completed: false,
    completedAt: 0,
    aiWorking: false,
    statusHistory: nextHistory,
  };
};

interface TaskKanbanBoardProps {
  tasks: IncidentTask[];
  onTasksChange: (next: IncidentTask[]) => void;
  incidentId: string;
  currentUser: string;
  /** Task id to briefly flash, e.g. when the user clicked it in the timeline. */
  highlightTaskId?: string | null;
}

/**
 * Shared kanban board used on both the simplified incident view
 * (/incidents-simple/:id) and the full incident detail Tasks tab.
 *
 * Owns its own DnD, add-task, edit-dialog and delete-confirmation state —
 * parents only need to provide the task array, an updater, and identity.
 */
export const TaskKanbanBoard = ({
  tasks,
  onTasksChange,
  incidentId,
  currentUser,
  highlightTaskId = null,
}: TaskKanbanBoardProps) => {
  const taskStatuses = useTaskStatuses();
  const laneKeys = useMemo(() => taskStatuses.map((s) => s.key), [taskStatuses]);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [hoverLane, setHoverLane] = useState<LaneKey | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // ---------------------------------------------------------------- handlers
  const handleAddTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const defaultLane = laneKeys.find((k) => k !== 'done') || laneKeys[0];
    const t: IncidentTask = {
      id: `task-${Date.now()}`,
      title,
      completed: false,
      createdAt: Date.now(),
      createdBy: currentUser,
      _lane: defaultLane,
    };
    onTasksChange([...tasks, t]);
    setNewTaskTitle('');
  };

  const handleTaskUpdate = (updated: IncidentTask) => {
    onTasksChange(tasks.map((t) => (t.id === updated.id ? updated : t)));
  };

  const confirmDeleteTask = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    onTasksChange(
      tasks
        .map((t) => (t.id === id ? { ...t, disabled: true } : t))
        .filter((t) => !t.disabled),
    );
    setPendingDeleteId(null);
  };

  const handleDropToLane = (lane: LaneKey, insertIndex: number | null = null) => {
    if (!draggedTaskId) return;
    const dragged = tasks.find((t) => t.id === draggedTaskId);
    if (!dragged) {
      setDraggedTaskId(null);
      setHoverLane(null);
      setDropIndex(null);
      return;
    }
    const updatedDragged = applyLane(dragged, lane, laneKeys, currentUser);
    const laneItems = tasks.filter(
      (t) => t.id !== draggedTaskId && getLane(t, laneKeys) === lane,
    );
    const clampedIdx =
      insertIndex === null
        ? laneItems.length
        : Math.max(0, Math.min(insertIndex, laneItems.length));
    const targetAnchorId =
      clampedIdx < laneItems.length ? laneItems[clampedIdx].id : null;

    const without = tasks.filter((t) => t.id !== draggedTaskId);
    let next: IncidentTask[];
    if (targetAnchorId) {
      next = [];
      for (const t of without) {
        if (t.id === targetAnchorId) next.push(updatedDragged);
        next.push(t);
      }
    } else if (laneItems.length === 0) {
      next = [...without, updatedDragged];
    } else {
      const lastLaneId = laneItems[laneItems.length - 1].id;
      next = [];
      for (const t of without) {
        next.push(t);
        if (t.id === lastLaneId) next.push(updatedDragged);
      }
    }
    onTasksChange(next);
    setDraggedTaskId(null);
    setHoverLane(null);
    setDropIndex(null);
  };

  const tasksByLane = useMemo(() => {
    const groups: Record<string, IncidentTask[]> = Object.fromEntries(
      laneKeys.map((k) => [k, [] as IncidentTask[]]),
    );
    for (const t of tasks) {
      const laneKey = getLane(t, laneKeys);
      (groups[laneKey] || groups[laneKeys[0]] || []).push(t);
    }
    return groups;
  }, [tasks, laneKeys]);

  // ------------------------------------------------------------------ render
  return (
    <Box>
      {/* New task bar */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mb: 2,
          p: 1.5,
          bgcolor: 'transparent',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Add a task… (drag between columns to update status)"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddTask();
          }}
          sx={{ '& .MuiOutlinedInput-root': { height: 36 } }}
        />
        <Button
          variant={newTaskTitle.trim() ? 'contained' : 'outlined'}
          onClick={handleAddTask}
          disabled={!newTaskTitle.trim()}
          startIcon={<AddIcon />}
          sx={{ height: 36, textTransform: 'none', whiteSpace: 'nowrap' }}
        >
          Add task
        </Button>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: `repeat(${Math.max(taskStatuses.length, 1)}, minmax(0, 1fr))`,
          },
          gap: 2,
        }}
      >
        {taskStatuses.map((lane) => {
          const items = tasksByLane[lane.key] || [];
          const isHover = hoverLane === lane.key;
          const activeDropIndex = isHover ? dropIndex : null;

          const renderDropSlot = (idx: number) => {
            const active = activeDropIndex === idx && draggedTaskId !== null;
            return (
              <Box
                key={`slot-${lane.key}-${idx}`}
                onDragOver={(e) => {
                  if (!draggedTaskId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (hoverLane !== lane.key) setHoverLane(lane.key);
                  if (dropIndex !== idx) setDropIndex(idx);
                }}
                onDrop={(e) => {
                  e.stopPropagation();
                  handleDropToLane(lane.key, idx);
                }}
                sx={{
                  height: active ? 8 : 6,
                  my: active ? 0.25 : 0,
                  borderRadius: 999,
                  bgcolor: active ? lane.color : 'transparent',
                  transition: 'height 100ms, background-color 100ms',
                }}
              />
            );
          };

          return (
            <Box
              key={lane.key}
              onDragOver={(e) => {
                e.preventDefault();
                if (hoverLane !== lane.key) setHoverLane(lane.key);
              }}
              onDragLeave={(e) => {
                const related = e.relatedTarget as Node | null;
                if (related && e.currentTarget.contains(related)) return;
                setHoverLane((p) => (p === lane.key ? null : p));
                setDropIndex(null);
              }}
              onDrop={() => handleDropToLane(lane.key, dropIndex)}
              sx={{
                bgcolor: 'transparent',
                border: '1px solid hsl(var(--border))',
                borderRadius: 2,
                p: 1.5,
                // On mobile the lanes stack vertically — a 460px min-height per
                // empty lane creates a wall of dead space. Only enforce the tall
                // min-height on md+ where the lanes sit side-by-side.
                minHeight: { xs: 'auto', md: 460 },
                transition: 'background-color 120ms, border-color 120ms',
                ...(isHover && {
                  bgcolor: `${lane.color}10`,
                  borderColor: lane.color,
                }),
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 1.5,
                  px: 0.5,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: lane.color,
                  }}
                />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {lane.label}
                </Typography>
                <Chip
                  size="small"
                  label={items.length}
                  sx={{ height: 20, fontSize: 11, ml: 'auto' }}
                />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {items.length === 0 && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'hsl(var(--muted-foreground))',
                      textAlign: 'center',
                      py: 4,
                      opacity: 0.7,
                    }}
                  >
                    Drop tasks here
                  </Typography>
                )}
                {items.map((task, idx) => {
                  const cat = taskCategories.find((c) => c.value === task.category);
                  return (
                    <Box key={task.id}>
                      {renderDropSlot(idx)}
                      <Box
                        data-task-id={task.id}
                        className={highlightTaskId === task.id ? 'incident-new-flash' : undefined}
                        draggable
                        onDragStart={() => setDraggedTaskId(task.id)}
                        onDragEnd={() => {
                          setDraggedTaskId(null);
                          setHoverLane(null);
                          setDropIndex(null);
                        }}
                        onClick={() => setEditingTaskId(task.id)}
                        sx={{
                          p: 1.25,
                          bgcolor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 1.5,
                          cursor: 'pointer',
                          opacity: draggedTaskId === task.id ? 0.4 : 1,
                          transition:
                            'box-shadow 120ms, transform 120ms, border-color 120ms',
                          '& .task-drag-handle': { opacity: 0 },
                          '&:hover': {
                            boxShadow: 2,
                            borderColor: 'hsl(var(--primary) / 0.4)',
                            '& .task-drag-handle': { opacity: 1 },
                          },
                          '&:active': { cursor: 'grabbing' },
                        }}
                      >
                        <Box
                          sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}
                        >
                          <DragIndicatorIcon
                            className="task-drag-handle"
                            size={16} style={{ color: 'hsl(var(--muted-foreground))', marginTop: '2px', cursor: 'grab', transition: 'opacity 120ms' }}
                          />
                          <Typography
                            variant="body2"
                            sx={{
                              flex: 1,
                              fontWeight: 500,
                              textDecoration: task.completed ? 'line-through' : 'none',
                              color: task.completed
                                ? 'hsl(var(--muted-foreground))'
                                : 'hsl(var(--foreground))',
                            }}
                          >
                            {task.title}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeleteId(task.id);
                            }}
                            sx={{ p: 0.25 }}
                          >
                            <DeleteOutlineIcon size={14} />
                          </IconButton>
                        </Box>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            mt: 1,
                            ml: 2.5,
                            flexWrap: 'wrap',
                          }}
                        >
                          {cat && (
                            <Chip
                              size="small"
                              label={cat.label}
                              sx={{
                                height: 18,
                                fontSize: 10,
                                bgcolor: `${cat.color}22`,
                                color: cat.color,
                              }}
                            />
                          )}
                          <Box sx={{ ml: 'auto', minWidth: 0 }}>
                            <TaskAssigneeChip
                              value={task.assignee || ''}
                              onChange={(next) =>
                                handleTaskUpdate({ ...task, assignee: next })
                              }
                              maxWidth={130}
                            />
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
                {renderDropSlot(items.length)}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Single-task editor with prev/next walking the lane the user opened from */}
      {(() => {
        const editingTask = tasks.find((t) => t.id === editingTaskId) || null;
        const lane = editingTask ? getLane(editingTask, laneKeys) : null;
        const siblings = lane ? tasksByLane[lane] || [] : [];
        return (
          <TaskEditDialog
            open={!!editingTaskId}
            onClose={() => setEditingTaskId(null)}
            task={editingTask}
            onTaskChange={handleTaskUpdate}
            onTaskDelete={(tid) => setPendingDeleteId(tid)}
            incidentId={incidentId}
            siblings={siblings}
            onNavigate={(nextId) => setEditingTaskId(nextId)}
          />
        );
      })()}

      {/* Delete confirmation — z-[1500] so it sits above the MUI TaskEditDialog */}
      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent className="z-[1500]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTask}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
};

export default TaskKanbanBoard;
