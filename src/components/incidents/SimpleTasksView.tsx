import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Checkbox,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Button,
  CircularProgress,
} from "@mui/material";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { DeferredTextField } from "./DeferredTextField";
import { MarkdownDescriptionEditor } from "./MarkdownDescriptionEditor";
import { TaskAssigneeChip } from "./TaskAssigneeChip";
import { taskCategories, type IncidentTask } from "@/config/ocsfIncidentSchema";
import { isAIAssignee } from "@/lib/utils";
import { openAgentDrawer } from "@/lib/agentDrawer";
import { TaskAiAssignButton } from "./TaskAiAssignButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  groupTasksByCategory,
  type TaskCategoryGroup,
  UNCATEGORIZED_KEY,
  UNCATEGORIZED_LABEL,
  UNCATEGORIZED_COLOR,
} from "./taskCategoryUtils";

export interface SimpleTasksViewProps {
  tasks: IncidentTask[];
  onToggleTask: (taskId: string) => void;
  onUpdateTaskTitle: (taskId: string, title: string) => void;
  onUpdateTaskDescription: (taskId: string, description: string) => void;
  onUpdateTaskCategory?: (taskId: string, category: string) => void;
  onUpdateTaskAssignee?: (taskId: string, assignee: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onAddTask: (title?: string, category?: string) => void;
  expandedTaskIds?: string[];
  onToggleTaskExpanded?: (taskId: string) => void;
  readOnly?: boolean;
  onAssignAi?: (task: IncidentTask, reRun?: boolean) => void;
  assigningTaskIds?: Record<string, boolean>;
  highlightTaskId?: string | null;
  incidentId?: string;
}

export const SimpleTasksView = ({
  tasks,
  onToggleTask,
  onUpdateTaskTitle,
  onUpdateTaskDescription,
  onUpdateTaskCategory,
  onUpdateTaskAssignee,
  onDeleteTask,
  onAddTask,
  expandedTaskIds = [],
  onToggleTaskExpanded,
  readOnly = false,
  onAssignAi,
  assigningTaskIds,
  highlightTaskId = null,
  incidentId,
}: SimpleTasksViewProps) => {
  const [localExpandedIds, setLocalExpandedIds] = useState<string[]>([]);
  const [localAssigningIds, setLocalAssigningIds] = useState<Record<string, boolean>>({});
  const [pendingDeleteTask, setPendingDeleteTask] = useState<IncidentTask | null>(null);
  const isExpanded = (id: string) =>
    onToggleTaskExpanded
      ? expandedTaskIds.includes(id)
      : localExpandedIds.includes(id);

  const toggleExpand = (id: string) => {
    if (onToggleTaskExpanded) {
      onToggleTaskExpanded(id);
    } else {
      setLocalExpandedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
      );
    }
  };

  // State for global task input
  const [globalTitle, setGlobalTitle] = useState("");
  const [globalCategory, setGlobalCategory] = useState<string>("triage");

  // State for inline category inputs: categoryKey -> title
  const [inlineTitles, setInlineTitles] = useState<Record<string, string>>({});
  const [activeInlineCat, setActiveInlineCat] = useState<string | null>(null);

  const categoryGroups = useMemo(() => groupTasksByCategory(tasks), [tasks]);
  const hasCategories = useMemo(
    () => categoryGroups.some((g) => g.categoryKey !== UNCATEGORIZED_KEY),
    [categoryGroups],
  );
  const showCategoryHeaders = hasCategories || categoryGroups.length > 1;

  const handleCreateGlobal = () => {
    if (!globalTitle.trim()) return;
    onAddTask(globalTitle.trim(), globalCategory);
    setGlobalTitle("");
  };

  const handleCreateInline = (catKey: string) => {
    const title = (inlineTitles[catKey] || "").trim();
    if (!title) return;
    onAddTask(title, catKey === UNCATEGORIZED_KEY ? "" : catKey);
    setInlineTitles((prev) => ({ ...prev, [catKey]: "" }));
  };

  const handleAssignAi = (task: IncidentTask, reRun: boolean = false) => {
    if (!onAssignAi || !task) return;
    const taskId = String(task.id || "").trim();
    if (!taskId) return;
    if (!assigningTaskIds) {
      setLocalAssigningIds((prev) => ({ ...prev, [taskId]: true }));
      setTimeout(() => {
        setLocalAssigningIds((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      }, 8000);
    }
    onAssignAi(task, reRun);
  };

  const allCategoryOptions = [
    ...taskCategories.map((c) => ({
      value: c.value,
      label: c.label,
      color: c.color,
    })),
    {
      value: UNCATEGORIZED_KEY,
      label: UNCATEGORIZED_LABEL,
      color: UNCATEGORIZED_COLOR,
    },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {categoryGroups.length === 0 && (
        <Box sx={{ py: 2 }}>
          <Typography
            sx={{
              color: "hsl(var(--muted-foreground))",
              fontSize: "0.85rem",
              mb: 2,
            }}
          >
            No tasks yet. Create a task below to start the investigation.
          </Typography>
        </Box>
      )}

      {/* Render Category Groups in Incident Lifecycle Order */}
      {categoryGroups.map((group) => {
        const isInlineOpen = activeInlineCat === group.categoryKey;
        const inlineValue = inlineTitles[group.categoryKey] || "";

        return (
          <Box
            key={group.categoryKey}
            id={`simple-task-cat-${group.categoryKey}`}
            data-simple-task-category={group.categoryKey}
            sx={{
              scrollMarginTop: 96,
              display: "flex",
              flexDirection: "column",
              gap: 0.75,
            }}
          >
            {/* Category Sub-area Header */}
            {showCategoryHeaders && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  py: 0.75,
                  borderBottom: "1px solid hsl(var(--border) / 0.6)",
                  mb: 1,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                  <Box
                    sx={{
                      width: 3.5,
                      height: 18,
                      borderRadius: "2px",
                      bgcolor: group.color,
                      flexShrink: 0,
                      boxShadow:
                        Boolean(highlightTaskId) &&
                        group.tasks.some(
                          (t) =>
                            String(t.id) === String(highlightTaskId) ||
                            (t.title && t.title === highlightTaskId),
                        )
                          ? `0 0 8px ${group.color}`
                          : "none",
                      transition: "box-shadow 0.2s ease",
                    }}
                  />
                  <Typography
                    component="h3"
                    sx={{
                      fontSize: "1.05rem",
                      fontWeight: 700,
                      color: "hsl(var(--foreground))",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {group.label}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.75rem",
                      color: "hsl(var(--muted-foreground))",
                      fontWeight: 500,
                    }}
                  >
                    ({group.totalCount - group.openCount}/{group.totalCount}{" "}
                    completed)
                  </Typography>
                </Box>

                {!readOnly && (
                  <Button
                    size="small"
                    onClick={() =>
                      setActiveInlineCat((prev) =>
                        prev === group.categoryKey ? null : group.categoryKey,
                      )
                    }
                    sx={{
                      minHeight: 24,
                      px: 1,
                      py: 0,
                      fontSize: "0.72rem",
                      textTransform: "none",
                      color: "hsl(var(--muted-foreground))",
                      "&:hover": { color: "hsl(var(--foreground))" },
                    }}
                  >
                    + Add task
                  </Button>
                )}
              </Box>
            )}

            {/* Tasks in Category */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {group.tasks.map((task) => {
                const expanded = isExpanded(task.id);
                const isHighlighted =
                  Boolean(highlightTaskId) &&
                  (String(task.id) === String(highlightTaskId) ||
                    (task.title && task.title === highlightTaskId));

                return (
                  <Box
                    key={task.id}
                    data-simple-task-id={task.id}
                    sx={{
                      py: 0.6,
                      px: 0.75,
                      borderRadius: 1.5,
                      scrollMarginTop: 100,
                      transition:
                        "background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
                      bgcolor: isHighlighted
                        ? "hsl(var(--primary) / 0.14)"
                        : undefined,
                      border: isHighlighted
                        ? "1px solid #ff6600"
                        : "1px solid transparent",
                      boxShadow: isHighlighted
                        ? "0 0 12px rgba(255, 102, 0, 0.25)"
                        : "none",
                      "&:hover": {
                        bgcolor: isHighlighted
                          ? "hsl(var(--primary) / 0.18)"
                          : "hsl(var(--muted) / 0.25)",
                      },
                      "&:hover .task-hover-actions": { opacity: 1 },
                    }}
                  >
                    <Box
                      sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}
                    >
                      <Checkbox
                        checked={task.completed}
                        onChange={() => onToggleTask(task.id)}
                        disabled={readOnly}
                        size="small"
                        sx={{ p: 0.25, mt: 0.1 }}
                      />

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <DeferredTextField
                          value={task.title}
                          onCommit={(next) => onUpdateTaskTitle(task.id, next)}
                          variant="standard"
                          fullWidth
                          multiline
                          disabled={readOnly}
                          slotProps={{ input: { disableUnderline: true } }}
                          sx={{
                            "& textarea, & input": {
                              fontSize: "0.88rem",
                              lineHeight: 1.55,
                              textDecoration: task.completed
                                ? "line-through"
                                : "none",
                              color: task.completed
                                ? "hsl(var(--muted-foreground))"
                                : "hsl(var(--foreground))",
                            },
                          }}
                        />
                      </Box>

                      {/* Assign AI Button */}
                      {!readOnly && onAssignAi && (
                        <TaskAiAssignButton
                          task={task}
                          incidentId={incidentId}
                          isAssigning={Boolean(
                            task.id &&
                              (assigningTaskIds
                                ? assigningTaskIds[task.id]
                                : localAssigningIds[task.id]),
                          )}
                          readOnly={readOnly}
                          onAssignAi={handleAssignAi}
                          className="task-hover-actions"
                        />
                      )}

                      {/* Hover Actions: Delete */}
                      {!readOnly && onDeleteTask && (
                        <IconButton
                          size="small"
                          className="task-hover-actions"
                          onClick={() => setPendingDeleteTask(task)}
                          aria-label="Delete task"
                          sx={{
                            p: 0.25,
                            mt: 0.1,
                            color: "hsl(var(--muted-foreground))",
                            opacity: { xs: 1, md: 0 },
                            transition: "opacity 0.15s ease",
                            "&:hover": { color: "hsl(var(--destructive))" },
                          }}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      )}

                      {/* Expand Description Toggle */}
                      <IconButton
                        size="small"
                        onClick={() => toggleExpand(task.id)}
                        aria-label={
                          expanded
                            ? "Hide task description"
                            : "Show task description"
                        }
                        sx={{
                          p: 0.25,
                          mt: 0.1,
                          color: "hsl(var(--muted-foreground))",
                        }}
                      >
                        {expanded ? (
                          <ChevronUp size={15} />
                        ) : (
                          <ChevronDown size={15} />
                        )}
                      </IconButton>
                    </Box>

                    {/* Description Block */}
                    {expanded && (
                      <Box
                        sx={{
                          pl: 4.25,
                          pr: 4.5,
                          pt: 0.6,
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                        }}
                      >
                        {/* AI Agent Execution Panel */}
                        {isAIAssignee(task.assignee) && (
                          <Box
                            sx={{
                              p: 1.25,
                              borderRadius: 1,
                              border: "1px solid hsl(var(--border))",
                              bgcolor: "hsl(var(--muted) / 0.25)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 0.75,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontSize: "0.72rem",
                                    fontWeight: 600,
                                    color: "hsl(var(--foreground))",
                                  }}
                                >
                                  AI Agent Execution
                                </Typography>
                                <Typography
                                  sx={{
                                    fontSize: "0.65rem",
                                    px: 0.75,
                                    py: 0.15,
                                    borderRadius: 0.5,
                                    border: "1px solid hsl(var(--border))",
                                    bgcolor: "hsl(var(--background))",
                                    color: "hsl(var(--muted-foreground))",
                                    fontWeight: 500,
                                  }}
                                >
                                  {task.aiStatus === "completed" || task.completed
                                    ? "Handled"
                                    : task.aiStatus === "failed"
                                      ? "Failed"
                                      : task.aiStatus === "running"
                                        ? "Running"
                                        : "Assigned"}
                                </Typography>
                              </Box>
                              {task.aiRunAt ? (
                                <Typography
                                  sx={{
                                    fontSize: "0.68rem",
                                    color: "hsl(var(--muted-foreground))",
                                  }}
                                >
                                  Run{" "}
                                  {new Date(task.aiRunAt).toLocaleDateString(
                                    undefined,
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </Typography>
                              ) : null}
                            </Box>

                            {task.aiPrompt && (
                              <Box
                                sx={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 0.25,
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontSize: "0.68rem",
                                    color: "hsl(var(--muted-foreground))",
                                    fontWeight: 500,
                                  }}
                                >
                                  Instructions sent to agent:
                                </Typography>
                                <Typography
                                  sx={{
                                    fontSize: "0.7rem",
                                    fontFamily: "monospace",
                                    p: 1,
                                    borderRadius: 0.5,
                                    bgcolor: "hsl(var(--background))",
                                    border: "1px solid hsl(var(--border))",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    maxHeight: 120,
                                    overflowY: "auto",
                                  }}
                                >
                                  {task.aiPrompt}
                                </Typography>
                              </Box>
                            )}

                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                pt: 0.25,
                                flexWrap: "wrap",
                              }}
                            >
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() =>
                                  openAgentDrawer("run", {
                                    defaultInput: task.aiPrompt,
                                    taskId: task.id,
                                    incidentId,
                                  })
                                }
                                sx={{
                                  fontSize: "0.68rem",
                                  height: 24,
                                  minHeight: 24,
                                  px: 1,
                                  borderRadius: 1,
                                  textTransform: "none",
                                }}
                              >
                                View in Agent Drawer
                              </Button>
                              {!readOnly && onAssignAi && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => handleAssignAi(task, true)}
                                  disabled={Boolean(
                                    task.id &&
                                      (assigningTaskIds
                                        ? assigningTaskIds[task.id]
                                        : localAssigningIds[task.id]),
                                  )}
                                  sx={{
                                    fontSize: "0.68rem",
                                    height: 24,
                                    minHeight: 24,
                                    px: 1,
                                    borderRadius: 1,
                                    textTransform: "none",
                                  }}
                                >
                                  Re-run with AI
                                </Button>
                              )}
                              {!readOnly && onUpdateTaskAssignee && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() =>
                                    onUpdateTaskAssignee(task.id, "")
                                  }
                                  sx={{
                                    fontSize: "0.68rem",
                                    height: 24,
                                    minHeight: 24,
                                    px: 1,
                                    borderRadius: 1,
                                    textTransform: "none",
                                    color: "hsl(var(--muted-foreground))",
                                  }}
                                >
                                  Unassign AI
                                </Button>
                              )}
                            </Box>
                          </Box>
                        )}

                        <MarkdownDescriptionEditor
                          key={task.id}
                          value={task.description || ""}
                          onCommit={(next) =>
                            onUpdateTaskDescription(task.id, next)
                          }
                          placeholder="Add a task description... Markdown supported, paste images directly."
                          readOnly={readOnly}
                          minRows={2}
                          incidentId={incidentId}
                          taskId={task.id}
                          compact
                        />
                        {onUpdateTaskAssignee && (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              pt: 0.25,
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "0.72rem",
                                color: "hsl(var(--muted-foreground))",
                                fontWeight: 500,
                              }}
                            >
                              Assignee:
                            </Typography>
                            <TaskAssigneeChip
                              value={task.assignee || ""}
                              onChange={(next) =>
                                onUpdateTaskAssignee(task.id, next)
                              }
                              maxWidth={140}
                              dense
                            />
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>

            {/* Inline Add Task Field for this category */}
            {!readOnly && isInlineOpen && (
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "center",
                  mt: 0.5,
                  pl: 0.5,
                  py: 0.5,
                  bgcolor: "hsl(var(--muted) / 0.15)",
                  borderRadius: 1,
                }}
              >
                <Plus size={14} style={{ color: group.color, flexShrink: 0 }} />
                <TextField
                  value={inlineValue}
                  onChange={(e) =>
                    setInlineTitles((prev) => ({
                      ...prev,
                      [group.categoryKey]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      handleCreateInline(group.categoryKey);
                    if (e.key === "Escape") setActiveInlineCat(null);
                  }}
                  placeholder={`Add a task in ${group.label}... (Press Enter)`}
                  variant="standard"
                  fullWidth
                  autoFocus
                  slotProps={{ input: { disableUnderline: true } }}
                  sx={{ "& input": { fontSize: "0.83rem" } }}
                />
                <Button
                  size="small"
                  onClick={() => handleCreateInline(group.categoryKey)}
                  disabled={!inlineValue.trim()}
                  sx={{
                    textTransform: "none",
                    fontSize: "0.74rem",
                    minHeight: 24,
                    px: 1,
                  }}
                >
                  Add
                </Button>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Global Add Task Field with Category Selector */}
      {!readOnly && (
        <Box
          sx={{
            display: "flex",
            gap: 1.5,
            alignItems: "center",
            mt: 1.5,
            pt: 2,
            borderTop: "1px dashed hsl(var(--border) / 0.7)",
          }}
        >
          <Plus
            size={16}
            style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }}
          />
          <TextField
            value={globalTitle}
            onChange={(e) => setGlobalTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateGlobal();
            }}
            placeholder="Add a new task (Press Enter)"
            variant="standard"
            fullWidth
            slotProps={{ input: { disableUnderline: true } }}
            sx={{ "& input": { fontSize: "0.85rem" } }}
          />
          <FormControl
            size="small"
            variant="standard"
            sx={{ minWidth: 125, flexShrink: 0 }}
          >
            <Select
              value={globalCategory}
              onChange={(e) => setGlobalCategory(e.target.value)}
              disableUnderline
              renderValue={(val) => {
                const cat = allCategoryOptions.find((c) => c.value === val);
                if (!cat) return val;
                return (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Box
                      component="span"
                      sx={{
                        width: 3,
                        height: 12,
                        borderRadius: "1px",
                        bgcolor: cat.color,
                        flexShrink: 0,
                        display: "inline-block",
                      }}
                    />
                    <span>{cat.label}</span>
                  </Box>
                );
              }}
              sx={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color:
                  allCategoryOptions.find((c) => c.value === globalCategory)
                    ?.color || "hsl(var(--foreground))",
                bgcolor: "hsl(var(--muted) / 0.35)",
                borderRadius: 1,
                px: 1,
                py: 0.25,
                "& .MuiSelect-select": {
                  display: "flex",
                  alignItems: "center",
                  py: 0,
                  pr: "20px !important",
                },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    bgcolor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  },
                },
              }}
            >
              {allCategoryOptions.map((cat) => (
                <MenuItem
                  key={cat.value}
                  value={cat.value}
                  sx={{
                    fontSize: "0.78rem",
                    color: cat.color,
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 3,
                      height: 12,
                      borderRadius: "1px",
                      bgcolor: cat.color,
                      flexShrink: 0,
                      display: "inline-block",
                    }}
                  />
                  {cat.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

      {/* Delete task confirmation dialog */}
      <AlertDialog
        open={!!pendingDeleteTask}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteTask(null);
        }}
      >
        <AlertDialogContent className="z-[1500]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {pendingDeleteTask?.title ? `"${pendingDeleteTask.title}"` : "this task"}? This action cannot be undone and will be recorded in the incident timeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteTask && onDeleteTask) {
                  onDeleteTask(pendingDeleteTask.id);
                }
                setPendingDeleteTask(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
};

export default SimpleTasksView;
