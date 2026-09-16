import React from "react";
import { Box, ButtonBase, CircularProgress, Tooltip, type SxProps, type Theme } from "@mui/material";
import { type IncidentTask } from "@/config/ocsfIncidentSchema";
import { isAIAssignee } from "@/lib/utils";
import { openAgentDrawer } from "@/lib/agentDrawer";

export interface TaskAiAssignButtonProps {
  task: IncidentTask;
  incidentId?: string;
  isAssigning?: boolean;
  readOnly?: boolean;
  onAssignAi?: (task: IncidentTask, reRun?: boolean) => void;
  className?: string;
  sx?: SxProps<Theme>;
}

/**
 * TaskAiAssignButton — Direct AI Agent task assignment trigger.
 * Styled after the corner "Ask AI" pill:
 * - Rounded pill shape (borderRadius: '9999px')
 * - Compact height (22px - 24px)
 * - Status indicators instead of logo:
 *   • Circular loader while running (isAssigning or aiStatus === 'running')
 *   • Green dot for handled (task.completed or aiStatus === 'completed')
 *   • Red dot for failed (aiStatus === 'failed')
 *   • Amber dot when assigned but idle
 *   • Clean "Assign AI" text when unassigned
 * - Strictly one-by-one direct task assignment
 */
export const TaskAiAssignButton: React.FC<TaskAiAssignButtonProps> = ({
  task,
  incidentId,
  isAssigning = false,
  readOnly = false,
  onAssignAi,
  className,
  sx,
}) => {
  const isAssigned = isAIAssignee(task.assignee);
  const isFailed = task.aiStatus === "failed";
  const isHandled = Boolean(task.completed || task.aiStatus === "completed");
  const isRunning = Boolean(isAssigning || task.aiStatus === "running" || task.aiWorking);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;

    if (isAssigned) {
      // Open Agent Drawer with contextual instructions and task scope
      openAgentDrawer("run", {
        defaultInput: task.aiPrompt,
        taskId: task.id,
        incidentId,
      });
    } else if (onAssignAi) {
      onAssignAi(task);
    }
  };

  const label = isRunning
    ? isAssigning
      ? "Assigning..."
      : "Running..."
    : isHandled
      ? "Handled"
      : isFailed
        ? "Failed"
        : isAssigned
          ? "Assigned AI"
          : "Assign AI";

  const tooltipTitle = isRunning
    ? "AI Agent is currently executing this task. Click to view in Agent Drawer."
    : isHandled
      ? "Task handled by AI Agent. Click to view details in Agent Drawer."
      : isFailed
        ? "Task execution failed. Click to view or retry in Agent Drawer."
        : isAssigned
          ? "Assigned to AI Agent. Click to view in Agent Drawer."
          : "Assign this specific task to AI Agent to handle directly";

  return (
    <Tooltip title={tooltipTitle} arrow placement="top">
      <ButtonBase
        onClick={handleClick}
        disabled={readOnly || isAssigning}
        aria-label={label}
        className={className}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.25,
          py: 0.2,
          minHeight: 22,
          height: 22,
          borderRadius: "9999px",
          bgcolor: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
          border: "1px solid",
          borderColor: isRunning
            ? "hsl(var(--primary))"
            : isFailed
              ? "#ef4444"
              : isHandled
                ? "#22c55e"
                : isAssigned
                  ? "hsl(var(--primary) / 0.5)"
                  : "hsl(var(--border))",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
          cursor: readOnly || isAssigning ? "default" : "pointer",
          userSelect: "none",
          fontSize: "0.7rem",
          fontWeight: 600,
          lineHeight: 1,
          transition: "all 140ms cubic-bezier(0.4, 0, 0.2, 1)",
          backdropFilter: "blur(6px)",
          opacity: isRunning || isAssigned ? 1 : { xs: 1, md: 0 },
          "&:hover":
            !readOnly && !isAssigning
              ? {
                  bgcolor: "hsl(var(--accent))",
                  color: "hsl(var(--accent-foreground))",
                  borderColor: "hsl(var(--primary))",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.12)",
                  transform: "translateY(-1px)",
                }
              : undefined,
          "&:active":
            !readOnly && !isAssigning
              ? {
                  transform: "translateY(0px)",
                }
              : undefined,
          ...sx,
        }}
      >
        {/* Status Indicators: Loader, Green Dot, Red Dot, or Amber Dot */}
        {isRunning ? (
          <CircularProgress
            size={10}
            thickness={5}
            sx={{ color: "hsl(var(--primary))", flexShrink: 0 }}
          />
        ) : isFailed ? (
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: "#ef4444",
              boxShadow: "0 0 5px rgba(239, 68, 68, 0.6)",
              flexShrink: 0,
            }}
          />
        ) : isHandled ? (
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: "#22c55e",
              boxShadow: "0 0 5px rgba(34, 197, 94, 0.6)",
              flexShrink: 0,
            }}
          />
        ) : isAssigned ? (
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: "#f59e0b",
              boxShadow: "0 0 5px rgba(245, 158, 11, 0.5)",
              flexShrink: 0,
            }}
          />
        ) : null}

        <span>{label}</span>
      </ButtonBase>
    </Tooltip>
  );
};
