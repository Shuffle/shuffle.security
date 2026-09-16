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
} from "@mui/material";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { DeferredTextField } from "./DeferredTextField";
import { TaskAssigneeChip } from "./TaskAssigneeChip";
import { taskCategories, type IncidentTask } from "@/config/ocsfIncidentSchema";

export interface TaskCategoryGroup {
  categoryKey: string;
  label: string;
  color: string;
  tasks: IncidentTask[];
  openCount: number;
  totalCount: number;
}

export const UNCATEGORIZED_KEY = "general";
export const UNCATEGORIZED_LABEL = "General";
export const UNCATEGORIZED_COLOR = "#94a3b8";

export const groupTasksByCategory = (
  tasks: IncidentTask[],
): TaskCategoryGroup[] => {
  const activeTasks = tasks.filter((t) => !t.disabled);
  const groups: TaskCategoryGroup[] = [];

  // 1. Standard lifecycle categories in defined order
  for (const cat of taskCategories) {
    const matching = activeTasks.filter(
      (t) =>
        (t.category || "").trim().toLowerCase() === cat.value.toLowerCase(),
    );
    if (matching.length > 0) {
      groups.push({
        categoryKey: cat.value,
        label: cat.label,
        color: cat.color,
        tasks: matching,
        openCount: matching.filter((t) => !t.completed).length,
        totalCount: matching.length,
      });
    }
  }

  // 2. Custom categories not in standard list
  const standardKeys = new Set(
    taskCategories.map((c) => c.value.toLowerCase()),
  );
  const customCategories = new Map<string, IncidentTask[]>();
  const uncategorizedTasks: IncidentTask[] = [];

  for (const t of activeTasks) {
    const rawCat = (t.category || "").trim();
    const lower = rawCat.toLowerCase();
    if (!rawCat || lower === UNCATEGORIZED_KEY || lower === "uncategorized") {
      uncategorizedTasks.push(t);
    } else if (!standardKeys.has(lower)) {
      if (!customCategories.has(rawCat)) {
        customCategories.set(rawCat, []);
      }
      customCategories.get(rawCat)!.push(t);
    }
  }

  // Add custom categories sorted alphabetically
  const sortedCustom = Array.from(customCategories.keys()).sort((a, b) =>
    a.localeCompare(b),
  );
  for (const customName of sortedCustom) {
    const matching = customCategories.get(customName) || [];
    groups.push({
      categoryKey: customName.toLowerCase(),
      label: customName,
      color: "#a1a1aa",
      tasks: matching,
      openCount: matching.filter((t) => !t.completed).length,
      totalCount: matching.length,
    });
  }

  // 3. Uncategorized / General tasks
  if (uncategorizedTasks.length > 0) {
    groups.push({
      categoryKey: UNCATEGORIZED_KEY,
      label: UNCATEGORIZED_LABEL,
      color: UNCATEGORIZED_COLOR,
      tasks: uncategorizedTasks,
      openCount: uncategorizedTasks.filter((t) => !t.completed).length,
      totalCount: uncategorizedTasks.length,
    });
  }

  return groups;
};

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
}: SimpleTasksViewProps) => {
  const [localExpandedIds, setLocalExpandedIds] = useState<string[]>([]);
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
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                py: 0.75,
                borderBottom: "1px solid hsl(var(--border) / 0.6)",
                mb: 0.5,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    bgcolor: group.color,
                    flexShrink: 0,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    color: group.color,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {group.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.72rem",
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

            {/* Tasks in Category */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {group.tasks.map((task) => {
                const expanded = isExpanded(task.id);
                const currentCat = (task.category || "").trim().toLowerCase();
                const matchedOption = allCategoryOptions.find(
                  (opt) => opt.value === currentCat,
                ) || {
                  value: currentCat || UNCATEGORIZED_KEY,
                  label: task.category || UNCATEGORIZED_LABEL,
                  color: group.color,
                };

                return (
                  <Box
                    key={task.id}
                    data-simple-task-id={task.id}
                    sx={{
                      py: 0.6,
                      px: 0.5,
                      borderRadius: 1,
                      scrollMarginTop: 100,
                      transition: "background-color 0.15s ease",
                      "&:hover": { bgcolor: "hsl(var(--muted) / 0.25)" },
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

                      {/* Category Switcher Pill */}
                      {!readOnly && onUpdateTaskCategory && (
                        <FormControl
                          size="small"
                          variant="standard"
                          sx={{ flexShrink: 0 }}
                        >
                          <Select
                            value={matchedOption.value}
                            onChange={(e) => {
                              const nextCat = e.target.value;
                              onUpdateTaskCategory(
                                task.id,
                                nextCat === UNCATEGORIZED_KEY ? "" : nextCat,
                              );
                            }}
                            disableUnderline
                            sx={{
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              color: matchedOption.color,
                              bgcolor: "hsl(var(--muted) / 0.4)",
                              borderRadius: 1,
                              px: 0.75,
                              py: 0.1,
                              "& .MuiSelect-select": { py: 0, pr: 2 },
                              "& .MuiSvgIcon-root": {
                                fontSize: 13,
                                color: matchedOption.color,
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
                            {allCategoryOptions.map((opt) => (
                              <MenuItem
                                key={opt.value}
                                value={opt.value}
                                sx={{
                                  fontSize: "0.74rem",
                                  gap: 1,
                                  color: opt.color,
                                  fontWeight: 500,
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    bgcolor: opt.color,
                                  }}
                                />
                                {opt.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}

                      {/* Assignee Chip */}
                      {onUpdateTaskAssignee && (
                        <Box sx={{ flexShrink: 0 }}>
                          <TaskAssigneeChip
                            value={task.assignee || ""}
                            onChange={(next) =>
                              onUpdateTaskAssignee(task.id, next)
                            }
                            maxWidth={120}
                            dense
                          />
                        </Box>
                      )}

                      {/* Hover Actions: Delete */}
                      {!readOnly && onDeleteTask && (
                        <IconButton
                          size="small"
                          className="task-hover-actions"
                          onClick={() => onDeleteTask(task.id)}
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
                      <Box sx={{ pl: 4.25, pr: 4.5, pt: 0.4 }}>
                        <DeferredTextField
                          value={task.description || ""}
                          onCommit={(next) =>
                            onUpdateTaskDescription(task.id, next)
                          }
                          variant="standard"
                          fullWidth
                          multiline
                          disabled={readOnly}
                          placeholder="Add a description"
                          slotProps={{ input: { disableUnderline: true } }}
                          sx={{
                            "& textarea": {
                              fontSize: "0.82rem",
                              lineHeight: 1.6,
                              color: "hsl(var(--muted-foreground))",
                            },
                          }}
                        />
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
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      bgcolor: cat.color,
                    }}
                  />
                  {cat.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}
    </Box>
  );
};

export default SimpleTasksView;
