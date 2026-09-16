import { X as CloseIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, CheckCircle2 as CheckCircleIcon, Circle as RadioButtonUncheckedIcon, Trash as DeleteOutlineIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Box,
  Typography,
  Button,
  Tooltip,
  Chip,
  TextField,
  FormControl,
  Select,
  MenuItem,
  Divider,
} from '@mui/material';
import { IncidentTask, taskCategories } from '@/config/ocsfIncidentSchema';
import { isAIAssignee } from '@/lib/utils';
import { openAgentDrawer } from '@/lib/agentDrawer';
import { TaskAssigneeChip } from './TaskAssigneeChip';
import { TaskDateTimePicker } from './TaskDateTimePicker';
import { FileAttachments } from './FileAttachments';
import { MentionInput } from './MentionInput';
import { useAuth } from '@/context/AuthContext';
import { format } from 'date-fns';

interface TaskEditDialogProps {
  open: boolean;
  onClose: () => void;
  task: IncidentTask | null;
  onTaskChange: (updated: IncidentTask) => void;
  /** Called when the user wants to delete the open task. Optional — when not
   *  provided the delete affordance is hidden. */
  onTaskDelete?: (taskId: string) => void;
  incidentId?: string;
  /** Ordered list of tasks in the *current visible context* (e.g. the lane the
   *  user opened the task from). Drives prev/next navigation. */
  siblings?: IncidentTask[];
  /** Open another task in the dialog. Wired by the parent to swap `task`. */
  onNavigate?: (taskId: string) => void;
}

// ---- Small inline helpers --------------------------------------------------

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Typography
    variant="caption"
    sx={{
      color: 'hsl(var(--muted-foreground))',
      fontWeight: 600,
      fontSize: 11,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      mb: 0.75,
      display: 'block',
    }}
  >
    {children}
  </Typography>
);

/**
 * Spacious, purpose-built task editor.
 *
 * The previous implementation re-used the kanban-card `TaskEditor` inside a
 * Dialog — which forced an awkward expand-chevron and a cramped form into a
 * modal that should feel like a workspace. This component is the inverse: a
 * single-task layout with a clear hero (checkbox + big title), a single
 * meta row (category / assignee / due), and a generous description / files
 * area. Prev/Next + keyboard shortcuts make finalising 10 tasks feel like
 * 10 keypresses, not 10 modal cycles.
 */
export const TaskEditDialog = ({
  open,
  onClose,
  task,
  onTaskChange,
  onTaskDelete,
  incidentId = 'new',
  siblings,
  onNavigate,
}: TaskEditDialogProps) => {
  const { userInfo } = useAuth();
  const currentUsername = userInfo?.username || '';

  // Local title state — buffered so users can edit without each keystroke
  // re-rendering the kanban card behind. We commit on blur + on dialog close.
  const [titleDraft, setTitleDraft] = useState(task?.title || '');
  useEffect(() => {
    setTitleDraft(task?.title || '');
  }, [task?.id]); // reset when navigating between tasks

  const commitTitle = () => {
    if (!task) return;
    if (titleDraft !== task.title) {
      // Route through update() so the title edit also triggers auto-assign
      // when the current user is the first to touch an unassigned task.
      onTaskChange({
        ...task,
        title: titleDraft,
        ...(!task.assignee && currentUsername ? { assignee: currentUsername } : {}),
      });
    }
  };

  // Position within sibling list — drives the header counter and prev/next.
  const { index, prevTask, nextTask } = useMemo(() => {
    if (!task || !siblings || siblings.length === 0) {
      return { index: -1, prevTask: null as IncidentTask | null, nextTask: null as IncidentTask | null };
    }
    const i = siblings.findIndex((t) => t.id === task.id);
    return {
      index: i,
      prevTask: i > 0 ? siblings[i - 1] : null,
      nextTask: i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null,
    };
  }, [task, siblings]);

  // Keyboard navigation — Alt+Arrow doesn't clash with text selection.
  // Cmd/Ctrl+Enter toggles complete (matches GitHub / Linear muscle memory).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Toggle complete
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && task) {
        e.preventDefault();
        onTaskChange({
          ...task,
          completed: !task.completed,
          completedAt: !task.completed ? Date.now() : 0,
        });
        return;
      }
      if (!onNavigate || !e.altKey) return;
      if (e.key === 'ArrowLeft' && prevTask) {
        e.preventDefault();
        commitTitle();
        onNavigate(prevTask.id);
      } else if (e.key === 'ArrowRight' && nextTask) {
        e.preventDefault();
        commitTitle();
        onNavigate(nextTask.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prevTask, nextTask, onNavigate, task]);

  if (!task) return null;

  const categoryInfo = taskCategories.find((c) => c.value === task.category);
  const showNav = !!siblings && siblings.length > 1 && !!onNavigate;

  // Auto-assign the current user the moment they touch an unassigned task.
  // Skip when the patch already sets the assignee (avoids overriding an
  // explicit choice) or when the user just toggles completion.
  const update = (patch: Partial<IncidentTask>) => {
    const shouldAutoAssign =
      !task.assignee &&
      currentUsername &&
      patch.assignee === undefined &&
      !('completed' in patch);
    onTaskChange({
      ...task,
      ...patch,
      ...(shouldAutoAssign ? { assignee: currentUsername } : {}),
    });
  };

  const toggleComplete = () => {
    update({
      completed: !task.completed,
      completedAt: !task.completed ? Date.now() : 0,
    });
  };

  const handleNext = () => {
    if (!nextTask || !onNavigate) return;
    commitTitle();
    onNavigate(nextTask.id);
  };

  const handleClose = () => {
    commitTitle();
    onClose();
  };

  // Format the due date for the date picker pill — it expects an ISO string.
  const dueLabel = task.dueDate
    ? (() => {
        try {
          return format(new Date(task.dueDate), 'MMM d, h:mm a');
        } catch {
          return 'Due date';
        }
      })()
    : null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          minHeight: '70vh',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* ====================================================================
          HEADER — context (category / completion / counter) + nav controls.
          Compact so the hero block below gets the visual weight it deserves.
          ==================================================================== */}
      <DialogTitle
        sx={{
          p: 2,
          py: 1.25,
          borderBottom: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--background) / 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {categoryInfo && (
          <Chip
            size="small"
            label={categoryInfo.label}
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 600,
              bgcolor: `${categoryInfo.color}22`,
              color: categoryInfo.color,
            }}
          />
        )}
        {task.completed && (
          <Chip
            size="small"
            icon={<CheckCircleIcon size={14} />}
            label="Completed"
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 600,
              bgcolor: 'rgba(34, 197, 94, 0.15)',
              color: '#22c55e',
              '& .MuiChip-icon': { color: '#22c55e' },
            }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {showNav && (
          <>
            <Typography
              variant="caption"
              sx={{ color: 'hsl(var(--muted-foreground))', fontWeight: 500, mr: 0.5 }}
            >
              {index + 1} / {siblings!.length}
            </Typography>
            <Tooltip title={prevTask ? `Previous (Alt+←) · ${prevTask.title}` : 'No previous task'}>
              <span>
                <IconButton
                  size="small"
                  onClick={() => prevTask && (commitTitle(), onNavigate?.(prevTask.id))}
                  disabled={!prevTask}
                  sx={{
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 1,
                    width: 32,
                    height: 32,
                  }}
                >
                  <ChevronLeftIcon size={20} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={nextTask ? `Next (Alt+→) · ${nextTask.title}` : 'No next task'}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleNext}
                  disabled={!nextTask}
                  sx={{
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 1,
                    width: 32,
                    height: 32,
                  }}
                >
                  <ChevronRightIcon size={20} />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{
            border: '1px solid hsl(var(--border))',
            borderRadius: 1,
            width: 32,
            height: 32,
          }}
        >
          <CloseIcon size={20} />
        </IconButton>
      </DialogTitle>

      {/* ====================================================================
          BODY — scrollable workspace.
          ==================================================================== */}
      <DialogContent sx={{ p: 0, flex: 1, overflowY: 'auto' }}>
        {/* ---- HERO: completion checkbox + huge title ---- */}
        <Box
          sx={{
            p: 3,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 2,
            bgcolor: task.completed ? 'rgba(34, 197, 94, 0.04)' : 'transparent',
            transition: 'background-color 200ms',
          }}
        >
          <Tooltip title={task.completed ? 'Reopen task (⌘+Enter)' : 'Mark complete (⌘+Enter)'}>
            <IconButton
              onClick={toggleComplete}
              sx={{
                p: 0.5,
                color: task.completed ? '#22c55e' : 'hsl(var(--muted-foreground))',
                '&:hover': {
                  color: task.completed ? '#22c55e' : 'hsl(var(--foreground))',
                  transform: 'scale(1.08)',
                },
                transition: 'transform 120ms, color 120ms',
              }}
            >
              {task.completed ? (
                <CheckCircleIcon size={36} />
              ) : (
                <RadioButtonUncheckedIcon size={36} />
              )}
            </IconButton>
          </Tooltip>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Editable title — auto-grows on long titles, blur to commit. */}
            <TextField
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                // Enter (no shift) commits and moves to description.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitTitle();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Untitled task"
              variant="standard"
              multiline
              fullWidth
              autoFocus
              InputProps={{
                disableUnderline: true,
                sx: {
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  lineHeight: 1.25,
                  color: task.completed ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                  textDecoration: task.completed ? 'line-through' : 'none',
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'hsl(var(--muted) / 0.4)' },
                  '&.Mui-focused': { bgcolor: 'hsl(var(--muted) / 0.5)' },
                },
              }}
            />
          </Box>
        </Box>

        <Divider />

        {/* ---- META ROW — Category / Assignee / Due ---- */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: 2,
            px: 3,
            py: 2.5,
          }}
        >
          {/* Category */}
          <Box>
            <FieldLabel>Category</FieldLabel>
            <FormControl size="small" fullWidth variant="standard">
              <Select
                value={task.category || ''}
                onChange={(e) => update({ category: e.target.value })}
                disableUnderline
                displayEmpty
                renderValue={(v) => {
                  const c = taskCategories.find((cat) => cat.value === v);
                  if (!c) {
                    return (
                      <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
                        Uncategorised
                      </Typography>
                    );
                  }
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.color }} />
                      <Typography variant="body2" sx={{ fontWeight: 600, color: c.color }}>
                        {c.label}
                      </Typography>
                    </Box>
                  );
                }}
                sx={{
                  fontSize: '0.85rem',
                  bgcolor: 'hsl(var(--muted) / 0.4)',
                  borderRadius: 1,
                  px: 1.25,
                  py: 0.75,
                  '& .MuiSelect-select': { py: 0.5 },
                }}
                MenuProps={{
                  PaperProps: {
                    sx: { bgcolor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' },
                  },
                }}
              >
                <MenuItem value="">
                  <em>Uncategorised</em>
                </MenuItem>
                {taskCategories.map((cat) => (
                  <MenuItem key={cat.value} value={cat.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cat.color }} />
                      {cat.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Assignee — same chip the kanban card uses, but full-bleed */}
          <Box>
            <FieldLabel>Assignee</FieldLabel>
            <Box
              sx={{
                bgcolor: 'hsl(var(--muted) / 0.4)',
                borderRadius: 1,
                px: 1.25,
                py: 1,
                display: 'flex',
                alignItems: 'center',
                minHeight: 38,
              }}
            >
              <TaskAssigneeChip
                value={task.assignee || ''}
                onChange={(next) => update({ assignee: next })}
                maxWidth={260}
                dense={false}
              />
            </Box>
          </Box>

          {/* Due date */}
          <Box>
            <FieldLabel>Due {dueLabel ? `· ${dueLabel}` : ''}</FieldLabel>
            <Box
              sx={{
                bgcolor: 'hsl(var(--muted) / 0.4)',
                borderRadius: 1,
                px: 1.25,
                py: 0.5,
                display: 'flex',
                alignItems: 'center',
                minHeight: 38,
              }}
            >
              <TaskDateTimePicker
                value={task.dueDate || ''}
                onChange={(date) => update({ dueDate: date })}
              />
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* ---- DESCRIPTION ---- */}
        <Box sx={{ px: 3, py: 2.5 }}>
          <FieldLabel>Notes</FieldLabel>
          <MentionInput
            value={task.description || ''}
            onChange={(value) => update({ description: value })}
            multiline
            minRows={5}
            fullWidth
            // Auto-focus Notes when the dialog opens so users can start
            // typing immediately. Re-runs per-task via the `key` prop below.
            key={`notes-${task.id}`}
            autoFocus
            placeholder="Add findings, links, or follow-up steps. Use @ to mention a teammate."
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'hsl(var(--muted) / 0.3)',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                '& fieldset': { borderColor: 'hsl(var(--border))' },
                '&:hover fieldset': { borderColor: 'hsl(var(--border))' },
                '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
              },
            }}
          />
        </Box>

        <Divider />

        {/* ---- AI AGENT EXECUTION ---- */}
        {(isAIAssignee(task.assignee) || task.aiPrompt) && (
          <>
            <Box sx={{ px: 3, py: 2, bgcolor: 'hsl(var(--muted) / 0.15)' }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FieldLabel>AI Agent Execution</FieldLabel>
                  <Typography
                    sx={{
                      fontSize: '0.65rem',
                      px: 0.75,
                      py: 0.15,
                      borderRadius: 0.5,
                      border: '1px solid hsl(var(--border))',
                      bgcolor: 'hsl(var(--background))',
                      color: 'hsl(var(--muted-foreground))',
                      fontWeight: 500,
                      mb: 0.75,
                    }}
                  >
                    {task.aiStatus === 'running' ? 'Running' : 'Assigned'}
                  </Typography>
                </Box>
                {task.aiRunAt ? (
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      color: 'hsl(var(--muted-foreground))',
                      mb: 0.75,
                    }}
                  >
                    Run{' '}
                    {new Date(task.aiRunAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Typography>
                ) : null}
              </Box>

              {task.aiPrompt && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography
                    sx={{
                      fontSize: '0.72rem',
                      color: 'hsl(var(--muted-foreground))',
                      mb: 0.5,
                      fontWeight: 500,
                    }}
                  >
                    Instructions sent to agent:
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      p: 1.25,
                      borderRadius: 1,
                      bgcolor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 140,
                      overflowY: 'auto',
                    }}
                  >
                    {task.aiPrompt}
                  </Typography>
                </Box>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    openAgentDrawer('run', {
                      defaultInput: task.aiPrompt,
                      taskId: task.id,
                      incidentId,
                    });
                  }}
                  sx={{
                    fontSize: '0.72rem',
                    height: 28,
                    textTransform: 'none',
                    borderRadius: 1,
                  }}
                >
                  View in Agent Drawer
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    update({ assignee: '', aiWorking: false });
                  }}
                  sx={{
                    fontSize: '0.72rem',
                    height: 28,
                    textTransform: 'none',
                    borderRadius: 1,
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  Unassign AI
                </Button>
              </Box>
            </Box>
            <Divider />
          </>
        )}

        {/* ---- ATTACHMENTS ---- */}
        <Box sx={{ px: 3, py: 2.5 }}>
          <FieldLabel>Attachments</FieldLabel>
          <FileAttachments
            attachments={task.attachments || []}
            onChange={(attachments) => update({ attachments })}
            namespace="incidents"
            labels={[`task-${task.id}`, incidentId]}
            compact
          />
        </Box>

        {/* ---- FOOTER META (read-only crumbs) ---- */}
        {(task.createdAt > 0 || task.createdBy || (typeof task.completedAt === 'number' && task.completedAt > 0)) && (
          <>
            <Divider />
            <Box
              sx={{
                px: 3,
                py: 1.5,
                display: 'flex',
                gap: 3,
                flexWrap: 'wrap',
                bgcolor: 'hsl(var(--background) / 0.3)',
              }}
            >
              {task.createdAt > 0 && (
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  Created {new Date(task.createdAt).toLocaleString()}
                  {task.createdBy ? ` by ${task.createdBy}` : ''}
                </Typography>
              )}
              {typeof task.completedAt === 'number' && task.completedAt > 0 ? (
                <Typography variant="caption" sx={{ color: '#22c55e' }}>
                  Completed {new Date(task.completedAt).toLocaleString()}
                </Typography>
              ) : null}
            </Box>
          </>
        )}
      </DialogContent>

      {/* ====================================================================
          FOOTER — primary action ladder. The right-side "Mark complete &
          next" combo is the muscle-memory path for triaging through a column.
          ==================================================================== */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 2,
          borderTop: '1px solid hsl(var(--border))',
          bgcolor: 'hsl(var(--background) / 0.5)',
        }}
      >
        {onTaskDelete && (
          <Tooltip title="Delete task">
            <IconButton
              onClick={() => onTaskDelete(task.id)}
              size="small"
              sx={{
                border: '1px solid hsl(var(--border))',
                borderRadius: 1,
                width: 36,
                height: 36,
                color: 'hsl(var(--muted-foreground))',
                '&:hover': { color: '#ef4444', borderColor: '#ef4444' },
              }}
            >
              <DeleteOutlineIcon size={20} />
            </IconButton>
          </Tooltip>
        )}

        <Box sx={{ flex: 1 }} />

        <Button
          onClick={toggleComplete}
          variant={task.completed ? 'outlined' : 'contained'}
          startIcon={task.completed ? <RadioButtonUncheckedIcon /> : <CheckCircleIcon />}
          sx={{
            height: 36,
            textTransform: 'none',
            fontWeight: 600,
            ...(task.completed
              ? {
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                }
              : {
                  bgcolor: '#22c55e',
                  color: '#fff',
                  '&:hover': { bgcolor: '#16a34a' },
                }),
          }}
        >
          {task.completed ? 'Reopen' : 'Mark complete'}
        </Button>

        {showNav && nextTask ? (
          <Button
            onClick={handleNext}
            variant="contained"
            endIcon={<ChevronRightIcon />}
            sx={{ height: 36, textTransform: 'none', fontWeight: 600 }}
          >
            Next task
          </Button>
        ) : (
          <Button
            onClick={handleClose}
            variant="contained"
            sx={{ height: 36, textTransform: 'none', fontWeight: 600 }}
          >
            Done
          </Button>
        )}
      </Box>
    </Dialog>
  );
};

export default TaskEditDialog;
