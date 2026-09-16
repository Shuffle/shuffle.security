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
  onAssignAi?: (task: IncidentTask) => void;
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

  const handleAssignAi = (task: IncidentTask) => {
    if (!onAssignAi) return;
    if (!assigningTaskIds) {
      setLocalAssigningIds((prev) => ({ ...prev, [task.id]: true }));
      setTimeout(() => {
        setLocalAssigningIds((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });
      }, 8000);
    }
    onAssignAi(task);
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
                      {!readOnly && onAssignAi && (() => {
                        const isAssigning = !!(assigningTaskIds ? assigningTaskIds[task.id] : localAssigningIds[task.id]);
                        const isAssigned = isAIAssignee(task.assignee);
                        return (
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={isAssigning}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAssignAi(task);
                            }}
                            aria-label="Assign AI"
                            className="task-hover-actions"
                            sx={{
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              lineHeight: 1,
                              textTransform: "none",
                              py: 0.2,
                              px: 0.8,
                              minHeight: 24,
                              height: 24,
                              borderRadius: 1,
                              borderColor: isAssigned
                                ? "hsl(var(--primary) / 0.4)"
                                : "hsl(var(--border))",
                              color: isAssigned
                                ? "hsl(var(--primary))"
                                : "hsl(var(--foreground))",
                              bgcolor: isAssigned
                                ? "hsl(var(--primary) / 0.08)"
                                : "transparent",
                              opacity: isAssigning || isAssigned ? 1 : { xs: 1, md: 0 },
                              transition: "opacity 0.15s ease",
                              "&:hover": {
                                borderColor: "hsl(var(--primary))",
                                bgcolor: "hsl(var(--primary) / 0.12)",
                              },
                              "&.Mui-disabled": {
                                opacity: 0.7,
                                borderColor: "hsl(var(--border))",
                                color: "hsl(var(--muted-foreground))",
                              },
                            }}
                          >
                            {isAssigning ? (
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                <CircularProgress size={10} color="inherit" thickness={5} />
                                <span>Assigning...</span>
                              </Box>
                            ) : isAssigned ? (
                              "Assigned AI"
                            ) : (
                              "Assign AI"
                            )}
                          </Button>
                        );
                      })()}

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
                "& .MuiSelect-select": { py: 0, pr: 2 },
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
                  sx={{ fontSize: "0.78rem", color: cat.color, gap: 1 }}
                >
                  <Box
                    sx={{
                      width: 3,
                      height: 12,
                      borderRadius: "1px",
                      bgcolor: cat.color,
                      flexShrink: 0,
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
