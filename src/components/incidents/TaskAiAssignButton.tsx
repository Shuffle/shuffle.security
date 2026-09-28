import React from "react";
import { Box, ButtonBase, CircularProgress, Tooltip, type SxProps, type Theme } from "@mui/material";
import { type IncidentTask } from "@/config/ocsfIncidentSchema";
import { isAIAssignee, isTaskAiAssigned, isTaskAiHandled } from "@/lib/utils";
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
 *   • Green dot for handled (isTaskAiHandled)
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
  const isRunning = Boolean(isAssigning || task.aiStatus === "running" || task.aiWorking);
  const isFailed = task.aiStatus === "failed";
  const isHandled = isTaskAiHandled(task);
  const isAssigned = Boolean(
    isTaskAiAssigned(task) && !isRunning && !isHandled && !isFailed
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;

    if (isAssigned || isRunning || isHandled || isFailed) {
      // Open Agent Drawer with contextual instructions and task scope
      openAgentDrawer("run", {
        defaultInput: task.aiPrompt,
        taskId: task.id,
        incidentId,
        executionId: task.aiRunId,
      });
    } else if (onAssignAi) {
      onAssignAi(task);
    }
  };

  const label = isRunning
    ? "Assigned"
    : isHandled
      ? "Handled"
      : isFailed
        ? "Failed"
        : isAssigned
          ? "Assigned"
          : "Assign AI";

  const tooltipTitle = isRunning
    ? `Assigned to AI Agent (Running)${task.aiRunId ? ` · ${task.aiRunId.slice(0, 8)}` : ""}. Click to view in Agent Drawer.`
    : isHandled
      ? `Task handled by AI Agent${task.aiRunId ? ` · ${task.aiRunId.slice(0, 8)}` : ""}. Click to view details in Agent Drawer.`
      : isFailed
        ? `Task execution failed${task.aiRunId ? ` · ${task.aiRunId.slice(0, 8)}` : ""}. Click to view or retry in Agent Drawer.`
        : isAssigned
          ? `Assigned to AI Agent${task.aiRunId ? ` · ${task.aiRunId.slice(0, 8)}` : ""}. Click to view in Agent Drawer.`
          : "Assign this specific task to AI Agent to handle directly";

  return (
    <Tooltip title={tooltipTitle} arrow placement="top">
      <ButtonBase
        onClick={handleClick}
        disabled={readOnly}
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
          bgcolor: "hsl(var(--background))",
          color: "hsl(var(--muted-foreground))",
          border: "1px solid hsl(var(--border))",
          boxShadow: "none",
          cursor: readOnly ? "default" : "pointer",
          userSelect: "none",
          fontSize: "0.7rem",
          fontWeight: 500,
          lineHeight: 1,
          transition: "all 140ms cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: isRunning || isAssigned || isHandled || isFailed ? 1 : { xs: 1, md: 0 },
          "&:hover":
            !readOnly
              ? {
                  bgcolor: "hsl(var(--muted) / 0.5)",
                  color: "hsl(var(--foreground))",
                  borderColor: "hsl(var(--border))",
                }
              : undefined,
          "&:active":
            !readOnly
              ? {
                  bgcolor: "hsl(var(--muted))",
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
              flexShrink: 0,
            }}
          />
        ) : null}

        <span>{label}</span>
      </ButtonBase>
    </Tooltip>
  );
};
