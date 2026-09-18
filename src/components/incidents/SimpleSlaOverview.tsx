import React, { useState, useEffect, useMemo } from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import {
  useSlaConfig,
  formatSlaDuration,
  SlaSeverity,
  DEFAULT_SLA_CONFIG,
} from "@/hooks/useSlaConfig";
import { STATUS_SYNONYMS } from "@/config/incidentConfig";
import { useNavigate } from "@/lib/router-compat";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export interface SlaActivityItem {
  type?: string;
  timestamp?: number | string;
  content?: string;
  user?: string;
}

export interface SimpleSlaData {
  created?: number | string;
  severity?: string;
  status?: string;
  assignee?: string | null;
  activity?: SlaActivityItem[];
  resolution?: {
    reasonLabel?: string;
    notes?: string;
    resolvedBy?: string;
    resolvedAt?: number;
  };
}

const normalizeToMs = (timestamp: number | string | undefined): number => {
  if (!timestamp) return 0;
  if (typeof timestamp === "string" && /[^0-9.]/.test(timestamp)) {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const ts = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  if (isNaN(ts) || ts <= 0) return 0;
  if (ts < 1e12) return ts * 1000;
  if (ts < 1e15) return ts;
  if (ts < 1e18) return ts / 1000;
  return ts / 1e6;
};

function formatRelativeDuration(ms: number): string {
  if (ms <= 0) return "0m";
  if (ms < 60000) return "< 1m";
  const totalMinutes = Math.round(ms / 60000);
  return formatSlaDuration(totalMinutes);
}

export const SimpleSlaOverview: React.FC<SimpleSlaData> = ({
  created,
  severity,
  status,
  assignee,
  activity,
  resolution,
}) => {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const slaConfig = useSlaConfig();
  const [now, setNow] = useState<number>(Date.now());

  const createdMs = useMemo(() => {
    return normalizeToMs(created) || Date.now();
  }, [created]);

  const rawSev = (severity || "").toLowerCase();
  const normalizedSev: SlaSeverity =
    rawSev === "critical"
      ? "critical"
      : rawSev === "high"
        ? "high"
        : rawSev === "medium"
          ? "medium"
          : rawSev === "low"
            ? "low"
            : "fallback";

  const sevMeta =
    normalizedSev === "critical"
      ? "Critical"
      : normalizedSev === "high"
        ? "High"
        : normalizedSev === "medium"
          ? "Medium"
          : normalizedSev === "low"
            ? "Low"
            : "Fallback";

  const target = slaConfig[normalizedSev] || DEFAULT_SLA_CONFIG[normalizedSev];
  const respondTargetMinutes = target.respondMinutes;
  const resolveTargetMinutes = target.resolveMinutes;
  const respondTargetMs = respondTargetMinutes * 60 * 1000;
  const resolveTargetMs = resolveTargetMinutes * 60 * 1000;

  const canonicalStatus =
    STATUS_SYNONYMS[(status || "").toLowerCase()] ||
    (status || "").toLowerCase();
  const hasAssignee = Boolean(
    assignee && assignee.trim() && assignee !== "Unassigned",
  );

  // Earliest human or automated response activity
  const earliestActivityTs = useMemo(() => {
    const responseActivities = (activity || []).filter((a) => {
      if (a.type === "created") return false;
      if (a.type === "assignment" || a.type === "comment") return true;
      if (a.type === "status") {
        const content = (a.content || "").toLowerCase();
        return !content.includes("to new") && !content.includes("created");
      }
      return false;
    });

    if (responseActivities.length === 0) return 0;
    const timestamps = responseActivities
      .map((a) => normalizeToMs(a.timestamp))
      .filter((t) => t > 0);
    return timestamps.length > 0 ? Math.min(...timestamps) : 0;
  }, [activity]);

  const isResponded =
    earliestActivityTs > 0 || hasAssignee || canonicalStatus !== "new";

  const respondedAtMs =
    earliestActivityTs > 0
      ? earliestActivityTs
      : isResponded
        ? normalizeToMs(resolution?.resolvedAt) || createdMs
        : 0;

  const isResolved = canonicalStatus === "resolved" || Boolean(resolution);
  const resolvedAtMs = resolution?.resolvedAt
    ? normalizeToMs(resolution.resolvedAt)
    : isResolved
      ? earliestActivityTs || now
      : 0;

  // Auto-refresh timer only while at least one SLA metric is active
  const isAnyActive = !isResolved || !isResponded;
  useEffect(() => {
    if (!isAnyActive) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, [isAnyActive]);

  // 1. Calculate Respond SLA
  let respondState: "met" | "breached" | "active";
  let respondBadgeText: string;
  let respondDetailText: string;
  let respondProgress: number;

  if (isResponded) {
    const durationMs = Math.max(0, respondedAtMs - createdMs);
    if (durationMs <= respondTargetMs) {
      respondState = "met";
      respondBadgeText = "Met";
      respondDetailText = `Target ${formatSlaDuration(respondTargetMinutes)} · Took ${formatRelativeDuration(durationMs)}`;
      respondProgress = 100;
    } else {
      respondState = "breached";
      respondBadgeText = "Breached";
      const overdueMs = durationMs - respondTargetMs;
      respondDetailText = `Target ${formatSlaDuration(respondTargetMinutes)} · Took ${formatRelativeDuration(durationMs)} (+${formatRelativeDuration(overdueMs)})`;
      respondProgress = 100;
    }
  } else {
    const deadlineMs = createdMs + respondTargetMs;
    const remainingMs = deadlineMs - now;
    if (remainingMs > 0) {
      respondState = "active";
      respondBadgeText = `${formatRelativeDuration(remainingMs)} left`;
      respondDetailText = `Target ${formatSlaDuration(respondTargetMinutes)}`;
      const elapsedMs = Math.max(0, now - createdMs);
      respondProgress = Math.min(
        100,
        Math.max(0, Math.round((elapsedMs / respondTargetMs) * 100)),
      );
    } else {
      respondState = "breached";
      respondBadgeText = "Breached";
      const overdueMs = Math.abs(remainingMs);
      respondDetailText = `Target ${formatSlaDuration(respondTargetMinutes)} · ${formatRelativeDuration(overdueMs)} overdue`;
      respondProgress = 100;
    }
  }

  // 2. Calculate Resolve SLA
  let resolveState: "met" | "breached" | "active" | "paused";
  let resolveBadgeText: string;
  let resolveDetailText: string;
  let resolveProgress: number;

  if (isResolved) {
    const durationMs = Math.max(0, resolvedAtMs - createdMs);
    if (durationMs <= resolveTargetMs) {
      resolveState = "met";
      resolveBadgeText = "Met";
      resolveDetailText = `Target ${formatSlaDuration(resolveTargetMinutes)} · Took ${formatRelativeDuration(durationMs)}`;
      resolveProgress = 100;
    } else {
      resolveState = "breached";
      resolveBadgeText = "Breached";
      const overdueMs = durationMs - resolveTargetMs;
      resolveDetailText = `Target ${formatSlaDuration(resolveTargetMinutes)} · Took ${formatRelativeDuration(durationMs)} (+${formatRelativeDuration(overdueMs)})`;
      resolveProgress = 100;
    }
  } else if (canonicalStatus === "on_hold") {
    const deadlineMs = createdMs + resolveTargetMs;
    const remainingMs = Math.max(0, deadlineMs - now);
    resolveState = "paused";
    resolveBadgeText = "Paused";
    resolveDetailText = `Target ${formatSlaDuration(resolveTargetMinutes)} · ${formatRelativeDuration(remainingMs)} left`;
    resolveProgress = Math.min(
      100,
      Math.max(0, Math.round(((now - createdMs) / resolveTargetMs) * 100)),
    );
  } else {
    const deadlineMs = createdMs + resolveTargetMs;
    const remainingMs = deadlineMs - now;
    if (remainingMs > 0) {
      resolveState = "active";
      resolveBadgeText = `${formatRelativeDuration(remainingMs)} left`;
      resolveDetailText = `Target ${formatSlaDuration(resolveTargetMinutes)}`;
      const elapsedMs = Math.max(0, now - createdMs);
      resolveProgress = Math.min(
        100,
        Math.max(0, Math.round((elapsedMs / resolveTargetMs) * 100)),
      );
    } else {
      resolveState = "breached";
      resolveBadgeText = "Breached";
      const overdueMs = Math.abs(remainingMs);
      resolveDetailText = `Target ${formatSlaDuration(resolveTargetMinutes)} · ${formatRelativeDuration(overdueMs)} overdue`;
      resolveProgress = 100;
    }
  }

  const getBadgeSx = (
    state: "met" | "breached" | "active" | "paused",
    progress: number,
  ) => {
    if (state === "met") {
      return {
        color: "#16a34a",
        bgcolor: "rgba(34, 197, 94, 0.12)",
        border: "1px solid rgba(34, 197, 94, 0.25)",
      };
    }
    if (state === "breached") {
      return {
        color: "#dc2626",
        bgcolor: "rgba(239, 68, 68, 0.12)",
        border: "1px solid rgba(239, 68, 68, 0.25)",
      };
    }
    if (state === "paused") {
      return {
        color: "#9333ea",
        bgcolor: "rgba(168, 85, 247, 0.12)",
        border: "1px solid rgba(168, 85, 247, 0.25)",
      };
    }
    // Active
    const isUrgent = progress >= 75;
    return {
      color: isUrgent ? "#ea580c" : "hsl(var(--foreground))",
      bgcolor: isUrgent
        ? "rgba(249, 115, 22, 0.12)"
        : "hsl(var(--muted) / 0.6)",
      border: isUrgent
        ? "1px solid rgba(249, 115, 22, 0.25)"
        : "1px solid hsl(var(--border))",
    };
  };

  const getBarColor = (
    state: "met" | "breached" | "active" | "paused",
    progress: number,
  ) => {
    if (state === "met") return "#22c55e";
    if (state === "breached") return "#ef4444";
    if (state === "paused") return "#a855f7";
    return progress >= 75 ? "#f97316" : "hsl(var(--primary))";
  };

  const policyTooltip = `${sevMeta} SLA targets: Respond within ${formatSlaDuration(respondTargetMinutes)}, Resolve within ${formatSlaDuration(resolveTargetMinutes)}.`;
  const headerTooltip = isAdmin
    ? `${policyTooltip} Click to configure in Admin Preferences.`
    : policyTooltip;

  const handleNavigatePreferences = (
    e: React.MouseEvent | React.KeyboardEvent,
  ) => {
    if (!isAdmin) return;
    e.stopPropagation();
    navigate("/admin/preferences");
  };

  return (
    <Box sx={{ mt: 3, width: "100%" }} data-tour="incident-sla-overview">
      <Tooltip title={headerTooltip} placement="top">
        <Box
          onClick={isAdmin ? handleNavigatePreferences : undefined}
          onKeyDown={
            isAdmin
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleNavigatePreferences(e);
                  }
                }
              : undefined
          }
          role={isAdmin ? "button" : undefined}
          tabIndex={isAdmin ? 0 : undefined}
          aria-label={
            isAdmin ? "Configure SLA targets in Admin Preferences" : undefined
          }
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            mb: 0.75,
            cursor: isAdmin ? "pointer" : "default",
            userSelect: "none",
            borderRadius: 0.75,
            py: 0.25,
            px: 0.25,
            mx: -0.25,
            transition: "background-color 0.15s ease",
            "&:hover": isAdmin
              ? {
                  bgcolor: "hsl(var(--muted) / 0.35)",
                  "& .sla-header-title, & .sla-header-sev": {
                    color: "hsl(var(--foreground))",
                  },
                }
              : undefined,
            "&:focus-visible": isAdmin
              ? {
                  outline: "2px solid hsl(var(--primary))",
                  outlineOffset: 1,
                }
              : undefined,
          }}
        >
          <Typography
            className="sla-header-title"
            sx={{
              fontSize: "0.68rem",
              fontWeight: 700,
              color: "hsl(var(--muted-foreground))",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              transition: "color 0.15s ease",
              "&:hover": isAdmin
                ? {
                    color: "hsl(var(--foreground))",
                    textDecoration: "underline",
                  }
                : undefined,
            }}
          >
            SLA
          </Typography>
          <Typography
            className="sla-header-sev"
            sx={{
              fontSize: "0.68rem",
              color: "hsl(var(--muted-foreground))",
              transition: "color 0.15s ease",
              "&:hover": isAdmin
                ? {
                    color: "hsl(var(--foreground))",
                    textDecoration: "underline",
                  }
                : undefined,
            }}
          >
            {sevMeta}
          </Typography>
        </Box>
      </Tooltip>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          width: "100%",
        }}
      >
        {/* Respond SLA */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            width: "100%",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Typography
              sx={{
                fontSize: "0.74rem",
                fontWeight: 600,
                color: "hsl(var(--foreground))",
              }}
            >
              First Response
            </Typography>
            <Box
              sx={{
                fontSize: "0.68rem",
                fontWeight: 600,
                px: 0.75,
                py: 0.2,
                borderRadius: 1,
                lineHeight: 1.2,
                ...getBadgeSx(respondState, respondProgress),
              }}
            >
              {respondBadgeText}
            </Box>
          </Box>
          <Typography
            sx={{
              fontSize: "0.68rem",
              color: "hsl(var(--muted-foreground))",
              lineHeight: 1.3,
            }}
          >
            {respondDetailText}
          </Typography>
          {/* Micro progress indicator */}
          <Box
            sx={{
              width: "100%",
              height: 2,
              borderRadius: 1,
              bgcolor: "hsl(var(--muted) / 0.6)",
              overflow: "hidden",
              mt: 0.25,
            }}
          >
            <Box
              sx={{
                width: `${respondProgress}%`,
                height: "100%",
                bgcolor: getBarColor(respondState, respondProgress),
                transition: "width 0.3s ease",
              }}
            />
          </Box>
        </Box>

        {/* Resolve SLA */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            width: "100%",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Typography
              sx={{
                fontSize: "0.74rem",
                fontWeight: 600,
                color: "hsl(var(--foreground))",
              }}
            >
              Resolution
            </Typography>
            <Box
              sx={{
                fontSize: "0.68rem",
                fontWeight: 600,
                px: 0.75,
                py: 0.2,
                borderRadius: 1,
                lineHeight: 1.2,
                ...getBadgeSx(resolveState, resolveProgress),
              }}
            >
              {resolveBadgeText}
            </Box>
          </Box>
          <Typography
            sx={{
              fontSize: "0.68rem",
              color: "hsl(var(--muted-foreground))",
              lineHeight: 1.3,
            }}
          >
            {resolveDetailText}
          </Typography>
          {/* Micro progress indicator */}
          <Box
            sx={{
              width: "100%",
              height: 2,
              borderRadius: 1,
              bgcolor: "hsl(var(--muted) / 0.6)",
              overflow: "hidden",
              mt: 0.25,
            }}
          >
            <Box
              sx={{
                width: `${resolveProgress}%`,
                height: "100%",
                bgcolor: getBarColor(resolveState, resolveProgress),
                transition: "width 0.3s ease",
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
