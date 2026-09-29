import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "@/lib/router-compat";
import {
  Box,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Skeleton,
  MenuItem,
  Select,
  FormControl,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import {
  Search,
  ExternalLink,
  RefreshCw,
  Server,
  Layers,
  Filter,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkflows, WorkflowSummary } from "@/hooks/useWorkflows";
import { useUsecases } from "@/Shuffle-Core/hooks/useUsecases";
import { invalidateAppsCache, invalidateWorkflowsCache } from "@/Shuffle-Core/views/appsFetchCache";
import { DEFAULT_USECASES, Usecase } from "@/Shuffle-Core/config/usecases";
import { getApiUrl, getAuthHeader } from "@/Shuffle-Core/api";
import { API_CONFIG, UsecaseDrawer } from "@/Shuffle-Core";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/lib/toast";
import { getShuffleCoreWorkflowUrl } from "@/lib/shuffleUrls";
import { navigateToShuffleCore } from "@/lib/authHandoff";
import {
  DefaultEnvironmentSelector,
  EnvironmentItem,
  isRunning,
} from "./DefaultEnvironmentSelector";
import { WorkflowEnvironmentSelector } from "./WorkflowEnvironmentSelector";

interface EnrichedWorkflow {
  workflow: WorkflowSummary;
  matchedUsecases: Usecase[];
  isRelevant: boolean;
  environmentName: string;
  isExplicitEnv: boolean;
}

export const RuntimeLocationsTab = () => {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const { userInfo } = useAuth();

  const {
    data: workflows = [],
    isLoading: workflowsLoading,
    refetch: refetchWorkflows,
  } = useWorkflows();
  const { usecases = DEFAULT_USECASES } = useUsecases();
  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [envsLoading, setEnvsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterMode, setFilterMode] = useState<"affected" | "relevant" | "all">("relevant");
  const [searchQuery, setSearchQuery] = useState("");
  const [envFilter, setEnvFilter] = useState<string>("all");

  // Selected usecase for drawer
  const [selectedUsecaseId, setSelectedUsecaseId] = useState<string | null>(
    null,
  );

  // Workflow deletion state
  const [workflowToDelete, setWorkflowToDelete] =
    useState<WorkflowSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch environments list
  const fetchEnvironments = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/v1/getenvironments"), {
        credentials: "include",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("Failed to load environments");
      const data = await res.json();
      setEnvironments(Array.isArray(data) ? data : []);
    } catch {
      setEnvironments([]);
    } finally {
      setEnvsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  const defaultEnvironment = useMemo(() => {
    return environments.find((e) => e.default) || null;
  }, [environments]);

  const location = useLocation();
  const navigate = useNavigate();
  const isLoading = workflowsLoading || envsLoading;
  const defaultCardRef = useRef<HTMLDivElement>(null);
  const workflowsSectionRef = useRef<HTMLDivElement>(null);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const highlightParam = searchParams.get("highlight");
  const envParam = searchParams.get("env");
  const filterParam = searchParams.get("filter");

  const offlineEnvironments = useMemo(() => {
    return environments.filter((e) => !isRunning(e));
  }, [environments]);

  const offlineEnvNames = useMemo(() => {
    return new Set(offlineEnvironments.map((e) => e.Name.toLowerCase()));
  }, [offlineEnvironments]);

  // Determine target offline/problem environment
  const targetEnvName = useMemo(() => {
    if (envParam) return envParam;
    if (highlightParam && highlightParam !== "default") return highlightParam;
    if (highlightParam === "default" && defaultEnvironment?.Name) return defaultEnvironment.Name;
    if (defaultEnvironment && !isRunning(defaultEnvironment)) return defaultEnvironment.Name;
    return offlineEnvironments[0]?.Name || null;
  }, [envParam, highlightParam, defaultEnvironment, offlineEnvironments]);

  const isDefaultHighlighted = useMemo(() => {
    if (!highlightParam) return false;
    return (
      highlightParam === "default" ||
      (defaultEnvironment?.Name && highlightParam.toLowerCase() === defaultEnvironment.Name.toLowerCase())
    );
  }, [highlightParam, defaultEnvironment]);

  useEffect(() => {
    if (isDefaultHighlighted && defaultCardRef.current) {
      defaultCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (
      highlightParam &&
      highlightParam !== "default" &&
      highlightParam.toLowerCase() !== targetEnvName?.toLowerCase()
    ) {
      setSearchQuery(highlightParam);
    }
  }, [isDefaultHighlighted, highlightParam, targetEnvName]);

  const handleRefresh = async () => {
    setRefreshing(true);
    invalidateWorkflowsCache();
    invalidateAppsCache();
    await Promise.allSettled([refetchWorkflows(), fetchEnvironments()]);
    setRefreshing(false);
  };

  const handleDeleteWorkflow = async () => {
    if (!workflowToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(
        getApiUrl(`/api/v1/workflows/${workflowToDelete.id}`),
        {
          method: "DELETE",
          credentials: "include",
          headers: { ...getAuthHeader() },
        },
      );
      const rawText = await res.text().catch(() => "");
      let resJson: { reason?: string; error?: string; message?: string } | null = null;
      try {
        if (rawText) resJson = JSON.parse(rawText);
      } catch {
        // Not JSON
      }

      if (!res.ok) {
        const reason =
          (resJson && typeof resJson.reason === "string" && resJson.reason) ||
          (resJson && typeof resJson.error === "string" && resJson.error) ||
          (resJson && typeof resJson.message === "string" && resJson.message) ||
          rawText.trim() ||
          `Failed to delete workflow (HTTP ${res.status})`;
        throw new Error(reason);
      }
      toast.success(
        `Workflow "${workflowToDelete.name || "Workflow"}" deleted`,
      );
      setWorkflowToDelete(null);
      invalidateWorkflowsCache();
      invalidateAppsCache();
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      refetchWorkflows();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete workflow",
      );
    } finally {
      setDeleting(false);
    }
  };

  // Correlate workflows with usecases and background_processing flag
  const enrichedWorkflows: EnrichedWorkflow[] = useMemo(() => {
    if (!Array.isArray(workflows)) return [];

    return workflows.map((wf) => {
      const wfName = (wf.name || "").toLowerCase();
      const rawTags = (wf.tags || []).map((t) => String(t).trim()).filter(Boolean);
      const wfTags = rawTags.map((t) => t.toLowerCase());

      // Deduplicate tags (case-insensitive) while preserving display casing
      const dedupedTags: string[] = [];
      const seenTagSet = new Set<string>();
      for (const t of rawTags) {
        const lower = t.toLowerCase();
        if (!seenTagSet.has(lower)) {
          seenTagSet.add(lower);
          dedupedTags.push(t);
        }
      }

      // Match against platform usecases
      const rawMatched = usecases.filter((uc) => {
        if (!uc.automationLabel && !uc.label) return false;
        const lbl = (uc.automationLabel || uc.label).toLowerCase();
        const ucId = (uc.id || "").toLowerCase();
        const ucLabel = (uc.label || "").toLowerCase();
        const isIngestion = uc.automationArea === "automatic_ingestion";

        // Check name or tags
        const nameMatches = wfName === lbl || wfName.includes(lbl);
        const tagMatches =
          wfTags.includes(lbl) || wfTags.some((t) => t.includes(lbl));
        const webhookMatches =
          isIngestion &&
          (wfName === "ingestion webhook" ||
            wfName.includes("ingestion webhook") ||
            wfTags.includes("ingestion webhook"));

        // Threat feeds / IOC canonical matches
        const threatIntelMatches =
          uc.automationArea === "threat_intel" &&
          (wfName.includes("threat feed") ||
            wfName.includes("ioc extraction") ||
            wfTags.includes("threat feed") ||
            wfTags.includes("ioc"));

        // Forward Tickets canonical matches
        const forwardMatches =
          lbl === "forward tickets" &&
          (wfName === "forward tickets" || wfName.includes("forward tickets"));

        // Notification Workflow canonical matches
        const notificationMatches =
          (lbl.includes("notification") ||
            uc.automationArea === "notifications" ||
            ucId === "case_management_communication_1" ||
            ucLabel === "notifications") &&
          (wfName.includes("notification") ||
            wfTags.includes("notification") ||
            wfTags.includes("notifications"));

        // Vulnerability Comparison canonical matches
        const vulnerabilityCorrelationMatches =
          (ucId === "asset_management_case_management_vuln_1" ||
            lbl.includes("vulnerability correlation") ||
            ucLabel.includes("vulnerability correlation")) &&
          (wfName.includes("vulnerability comparison") ||
            (wfName.includes("vulnerability") &&
              (wfName.includes("compar") ||
                wfName.includes("correlat") ||
                wfTags.includes("correlate") ||
                wfTags.includes("correlat"))));

        // Ingest Assets canonical matches
        const assetMatches =
          (ucId === "asset_management_case_management_1" ||
            lbl.includes("asset context") ||
            ucLabel === "asset context" ||
            lbl === "ingest assets") &&
          (wfName.includes("asset") ||
            wfTags.includes("asset") ||
            wfTags.includes("assets"));

        return (
          nameMatches ||
          tagMatches ||
          webhookMatches ||
          threatIntelMatches ||
          forwardMatches ||
          notificationMatches ||
          vulnerabilityCorrelationMatches ||
          assetMatches
        );
      });

      // Deduplicate matched usecases by id and by label (case-insensitive)
      const matchedUsecases: Usecase[] = [];
      const seenUcIds = new Set<string>();
      const seenUcLabels = new Set<string>();
      for (const uc of rawMatched) {
        if (!uc) continue;
        const normId = (uc.id || "").trim().toLowerCase();
        const normLabel = (uc.label || "").trim().toLowerCase();
        if (normId && seenUcIds.has(normId)) continue;
        if (normLabel && seenUcLabels.has(normLabel)) continue;
        if (normId) seenUcIds.add(normId);
        if (normLabel) seenUcLabels.add(normLabel);
        matchedUsecases.push(uc);
      }

      // A workflow is relevant if it has background_processing === true OR matches a platform usecase
      const isRelevant =
        wf.background_processing === true || matchedUsecases.length > 0;

      // Current resolved environment name
      const actionEnv = wf.actions?.find(
        (a: { environment?: string }) => a?.environment,
      )?.environment;
      const triggerEnv = wf.triggers?.find(
        (t: { environment?: string }) => t?.environment,
      )?.environment;
      const explicitEnv = wf.environment || actionEnv || triggerEnv;
      const isExplicitEnv = Boolean(explicitEnv);
      const environmentName =
        explicitEnv || defaultEnvironment?.Name || "Cloud";

      return {
        workflow: {
          ...wf,
          tags: dedupedTags,
        },
        matchedUsecases,
        isRelevant,
        environmentName,
        isExplicitEnv,
      };
    });
  }, [workflows, usecases, defaultEnvironment]);

  // Check if a workflow is affected by the offline target environment
  // Check if a workflow is affected by any offline runtime location
  const isWorkflowAffected = useCallback(
    (item: EnrichedWorkflow): boolean => {
      if (item.environmentName.toLowerCase() === "cloud") return false;
      if (offlineEnvNames.has(item.environmentName.toLowerCase())) return true;
      if (targetEnvName && item.environmentName.toLowerCase() === targetEnvName.toLowerCase()) return true;
      return false;
    },
    [offlineEnvNames, targetEnvName]
  );

  const affectedCount = useMemo(() => {
    return enrichedWorkflows.filter(isWorkflowAffected).length;
  }, [enrichedWorkflows, isWorkflowAffected]);

  useEffect(() => {
    if (filterParam === "all") {
      setFilterMode("all");
    } else if (filterParam === "affected") {
      if (!isLoading && affectedCount === 0) {
        setFilterMode("relevant");
      } else {
        setFilterMode("affected");
      }
    } else {
      setFilterMode("relevant");
    }
  }, [filterParam, isLoading, affectedCount]);

  // When all affected workflows are resolved, automatically transition from "affected" to "relevant"
  useEffect(() => {
    if (!isLoading && filterMode === "affected" && affectedCount === 0) {
      setFilterMode("relevant");
      if (searchParams.get("filter") === "affected") {
        const nextParams = new URLSearchParams(location.search);
        nextParams.delete("filter");
        const nextSearch = nextParams.toString();
        navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
          replace: true,
        });
      }
    }
  }, [
    isLoading,
    filterMode,
    affectedCount,
    searchParams,
    location.search,
    location.pathname,
    navigate,
  ]);

  // Filtered workflows based on search, filterMode, and environment
  const filteredWorkflows = useMemo(() => {
    let result = enrichedWorkflows.filter((item) => {
      // 1. Filter mode: affected vs relevant vs all
      if (filterMode === "affected") {
        if (!isWorkflowAffected(item)) {
          return false;
        }
      } else if (filterMode === "relevant" && !item.isRelevant) {
        return false;
      }

      // 2. Environment filter
      if (envFilter !== "all") {
        if (item.environmentName.toLowerCase() !== envFilter.toLowerCase()) {
          return false;
        }
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const nameMatch = (item.workflow.name || "")
          .toLowerCase()
          .includes(query);
        const descMatch = (item.workflow.description || "")
          .toLowerCase()
          .includes(query);
        const tagMatch = (item.workflow.tags || []).some((t) =>
          String(t).toLowerCase().includes(query),
        );
        const usecaseMatch = item.matchedUsecases.some(
          (u) =>
            u.label.toLowerCase().includes(query) ||
            (u.automationLabel &&
              u.automationLabel.toLowerCase().includes(query)),
        );
        return nameMatch || descMatch || tagMatch || usecaseMatch;
      }

      return true;
    });

    // When viewing "relevant" or "all", prioritize affected workflows by sorting them to the top
    if (filterMode !== "affected" && targetEnvName) {
      result = [...result].sort((a, b) => {
        const aAff = isWorkflowAffected(a) ? 1 : 0;
        const bAff = isWorkflowAffected(b) ? 1 : 0;
        return bAff - aAff;
      });
    }

    return result;
  }, [
    enrichedWorkflows,
    filterMode,
    envFilter,
    searchQuery,
    isWorkflowAffected,
    targetEnvName,
  ]);

  const relevantCount = useMemo(() => {
    return enrichedWorkflows.filter((w) => w.isRelevant).length;
  }, [enrichedWorkflows]);

  const relevantWorkflows = useMemo(() => {
    return enrichedWorkflows
      .filter((w) => w.isRelevant)
      .map((w) => w.workflow);
  }, [enrichedWorkflows]);


  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Top warning if an offline runtime location affects workflows */}
      {(offlineEnvironments.length > 0 || (affectedCount > 0 && targetEnvName)) && (
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderRadius: 1.5,
            bgcolor: "hsla(var(--destructive) / 0.08)",
            border: "1px solid hsla(var(--destructive) / 0.35)",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "hsl(var(--destructive))",
              flexShrink: 0,
            }}
          />
          <Typography sx={{ fontSize: "0.84rem", color: "hsl(var(--foreground))", fontWeight: 500 }}>
            {offlineEnvironments.length <= 1 ? (
              <>
                Runtime location <strong>&ldquo;{offlineEnvironments[0]?.Name || targetEnvName}&rdquo;</strong> is offline. Workflows using this location cannot execute until reallocated or restarted.
              </>
            ) : (
              <>
                Runtime locations <strong>{offlineEnvironments.map((e) => `"${e.Name}"`).join(", ")}</strong> are offline. Workflows using these locations cannot execute until reallocated or restarted.
              </>
            )}
          </Typography>
        </Box>
      )}

      {/* Top Section: Default Runtime Location (mirrored from Preferences tab) */}
      <Paper
        ref={defaultCardRef}
        sx={{
          p: 2.5,
          bgcolor: "transparent",
          backgroundImage: "none",
          backdropFilter: "blur(12px)",
          border: "1px solid hsl(var(--border))",
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 2,
            width: "100%",
          }}
        >
          <Box>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, color: "hsl(var(--foreground))" }}
            >
              Default Runtime Location
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "hsl(var(--muted-foreground))" }}
            >
              Where workflows execute by default. Archived environments and sensor
              groups cannot be selected.
            </Typography>
          </Box>
          <DefaultEnvironmentSelector
            workflows={relevantWorkflows}
            environments={environments}
            defaultEnvironment={defaultEnvironment}
            onSelected={() => {
              fetchEnvironments();
              refetchWorkflows();
            }}
          />
        </Box>
      </Paper>

      {/* Bottom Section: Relevant Workflows to Shuffle Security Usecases */}
      <Paper
        ref={workflowsSectionRef}
        sx={{
          p: { xs: 2, sm: 2.5 },
          bgcolor: "transparent",
          backgroundImage: "none",
          backdropFilter: "blur(12px)",
          border: "1px solid hsl(var(--border))",
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
        }}
      >

        {/* Header and Controls */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", md: "center" },
            gap: 2,
          }}
        >
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Layers size={18} style={{ color: "hsl(var(--primary))" }} />
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, color: "hsl(var(--foreground))" }}
              >
                Shuffle Security Workflows
              </Typography>
              <Chip
                label={`${filteredWorkflows.length} workflow${filteredWorkflows.length === 1 ? "" : "s"}`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  bgcolor: "hsl(var(--muted))",
                  color: "hsl(var(--foreground))",
                }}
              />
            </Box>
            <Typography
              variant="body2"
              sx={{ color: "hsl(var(--muted-foreground))", mt: 0.25 }}
            >
              Workflows powering Shuffle Security automated usecases and
              detections. Configure execution locations individually per
              workflow.
            </Typography>
          </Box>

          {/* Action buttons & mode toggle */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              flexWrap: "wrap",
            }}
          >
            {/* Filter mode chips */}
            <Box
              sx={{
                display: "inline-flex",
                bgcolor: "hsl(var(--muted))",
                p: 0.5,
                borderRadius: 1.5,
                border: "1px solid hsl(var(--border))",
                gap: 0.5,
              }}
            >
              <Chip
                label={`Relevant (${relevantCount})`}
                size="small"
                onClick={() => setFilterMode("relevant")}
                sx={{
                  height: 24,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  bgcolor:
                    filterMode === "relevant"
                      ? "hsl(var(--card))"
                      : "transparent",
                  color:
                    filterMode === "relevant"
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--muted-foreground))",
                  boxShadow:
                    filterMode === "relevant"
                      ? "0 1px 3px rgba(0,0,0,0.1)"
                      : "none",
                  "&:hover": {
                    bgcolor:
                      filterMode === "relevant"
                        ? "hsl(var(--card))"
                        : "rgba(255,255,255,0.05)",
                  },
                }}
              />
              {affectedCount > 0 && (
                <Chip
                  label={`Affected (${affectedCount})`}
                  size="small"
                  onClick={() => setFilterMode("affected")}
                  sx={{
                    height: 24,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: "none",
                    bgcolor:
                      filterMode === "affected"
                        ? "hsla(var(--destructive) / 0.15)"
                        : "transparent",
                    color:
                      filterMode === "affected"
                        ? "hsl(var(--destructive))"
                        : "hsl(var(--muted-foreground))",
                    boxShadow:
                      filterMode === "affected"
                        ? "0 1px 3px rgba(0,0,0,0.1)"
                        : "none",
                    "&:hover": {
                      bgcolor: "hsla(var(--destructive) / 0.2)",
                    },
                  }}
                />
              )}
              <Chip
                label={`All Workflows (${enrichedWorkflows.length})`}
                size="small"
                onClick={() => setFilterMode("all")}
                sx={{
                  height: 24,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  bgcolor:
                    filterMode === "all" ? "hsl(var(--card))" : "transparent",
                  color:
                    filterMode === "all"
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--muted-foreground))",
                  boxShadow:
                    filterMode === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  "&:hover": {
                    bgcolor:
                      filterMode === "all"
                        ? "hsl(var(--card))"
                        : "rgba(255,255,255,0.05)",
                  },
                }}
              />
            </Box>

            {/* Refresh button */}
            <Tooltip title="Refresh workflows and environments">
              <span>
                <IconButton
                  size="small"
                  onClick={handleRefresh}
                  disabled={refreshing || isLoading}
                  sx={{
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 1.5,
                    bgcolor: "hsl(var(--card))",
                    color: "hsl(var(--foreground))",
                    p: 0.75,
                  }}
                >
                  <RefreshCw
                    size={14}
                    className={refreshing ? "animate-spin" : ""}
                  />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>

        {/* Filter / Search Bar */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: 1.5,
            alignItems: "center",
          }}
        >
          <TextField
            size="small"
            placeholder="Search by workflow name, usecase, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search
                      size={15}
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                backgroundColor: "hsl(var(--card))",
                borderRadius: 1.5,
                fontSize: "0.8125rem",
                "& fieldset": { borderColor: "hsl(var(--border))" },
                "&:hover fieldset": { borderColor: "hsl(var(--primary))" },
                "&.Mui-focused fieldset": {
                  borderColor: "hsl(var(--primary))",
                },
              },
              "& .MuiInputBase-input": {
                color: "hsl(var(--foreground))",
                fontSize: "0.8125rem",
              },
            }}
          />

          {/* Environment Filter */}
          <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 200 } }}>
            <Select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              displayEmpty
              startAdornment={
                <Filter
                  size={14}
                  style={{
                    marginRight: 6,
                    color: "hsl(var(--muted-foreground))",
                    flexShrink: 0,
                  }}
                />
              }
              sx={{
                backgroundColor: "hsl(var(--card))",
                borderRadius: 1.5,
                fontSize: "0.8125rem",
                color: "hsl(var(--foreground))",
                "& fieldset": { borderColor: "hsl(var(--border))" },
                "&:hover fieldset": { borderColor: "hsl(var(--primary))" },
                "&.Mui-focused fieldset": {
                  borderColor: "hsl(var(--primary))",
                },
              }}
            >
              <MenuItem value="all" sx={{ fontSize: "0.8125rem" }}>
                All Locations
              </MenuItem>
              {environments.map((env) => (
                <MenuItem
                  key={env.id}
                  value={env.Name}
                  sx={{ fontSize: "0.8125rem" }}
                >
                  {env.Name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Workflows Table */}
        {isLoading ? (
          <Box
            sx={{ display: "flex", flexDirection: "column", gap: 1.5, py: 2 }}
          >
            <Skeleton
              variant="rectangular"
              height={45}
              sx={{ borderRadius: 1.5 }}
            />
            <Skeleton
              variant="rectangular"
              height={55}
              sx={{ borderRadius: 1.5 }}
            />
            <Skeleton
              variant="rectangular"
              height={55}
              sx={{ borderRadius: 1.5 }}
            />
            <Skeleton
              variant="rectangular"
              height={55}
              sx={{ borderRadius: 1.5 }}
            />
          </Box>
        ) : filteredWorkflows.length === 0 ? (
          <Box
            sx={{
              p: 4,
              textAlign: "center",
              border: "1px dashed hsl(var(--border))",
              borderRadius: 2,
              bgcolor: "rgba(255,255,255,0.01)",
            }}
          >
            <Server
              size={32}
              style={{
                color: "hsl(var(--muted-foreground))",
                margin: "0 auto 12px",
                opacity: 0.6,
              }}
            />
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, color: "hsl(var(--foreground))", mb: 0.5 }}
            >
              No workflows found
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "hsl(var(--muted-foreground))",
                maxWidth: 460,
                mx: "auto",
              }}
            >
              {searchQuery || envFilter !== "all"
                ? "Try adjusting your search query or filters to find workflows."
                : filterMode === "affected"
                  ? `No workflows are currently affected by offline runtime location "${targetEnvName || "selected"}". All workflows are running on active locations.`
                  : filterMode === "relevant"
                    ? 'No background processing workflows or usecase-matched workflows were found. Toggle to "All Workflows" to view all available workflows in this tenant.'
                    : "No workflows have been created in this tenant yet."}
            </Typography>
          </Box>
        ) : (
          <TableContainer
            sx={{
              border: "1px solid hsl(var(--border))",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <Table size="small">
              <TableHead sx={{ bgcolor: "hsl(var(--muted))" }}>
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      color: "hsl(var(--muted-foreground))",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      py: 1.25,
                    }}
                  >
                    Workflow
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      color: "hsl(var(--muted-foreground))",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      py: 1.25,
                    }}
                  >
                    Associated Usecase(s)
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      color: "hsl(var(--muted-foreground))",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      py: 1.25,
                    }}
                  >
                    Runtime Location
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      color: "hsl(var(--muted-foreground))",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      py: 1.25,
                      width: 48,
                    }}
                  >
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredWorkflows.map((item) => {
                  const { workflow, matchedUsecases } = item;
                  const isAffected = isWorkflowAffected(item);
                  const hasBg = workflow.background_processing === true;
                  const actionsCount = Array.isArray(workflow.actions)
                    ? workflow.actions.length
                    : 0;
                  const triggersCount = Array.isArray(workflow.triggers)
                    ? workflow.triggers.length
                    : 0;

                  return (
                    <TableRow
                      key={workflow.id}
                      hover
                      sx={{
                        borderLeft: isAffected
                          ? "3px solid hsl(var(--destructive))"
                          : "3px solid transparent",
                        backgroundColor: isAffected
                          ? "hsla(var(--destructive) / 0.03)"
                          : "transparent",
                        transition:
                          "border-left-color 0.2s ease, background-color 0.2s ease",
                        "&:hover": {
                          backgroundColor: isAffected
                            ? "hsla(var(--destructive) / 0.06) !important"
                            : "rgba(255, 255, 255, 0.02) !important",
                        },
                      }}
                    >
                      {/* Workflow Name, Link, and Tags */}
                      <TableCell sx={{ py: 1.5, verticalAlign: "top" }}>
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              flexWrap: "wrap",
                            }}
                          >
                            <Typography
                              component="a"
                              href={getShuffleCoreWorkflowUrl(workflow.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={async (e: React.MouseEvent) => {
                                e.preventDefault();
                                await navigateToShuffleCore(getShuffleCoreWorkflowUrl(workflow.id), { newTab: true });
                              }}
                              sx={{
                                fontWeight: 600,
                                fontSize: "0.84rem",
                                color: "hsl(var(--foreground))",
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 0.5,
                                "&:hover": {
                                  color: "hsl(var(--primary))",
                                  textDecoration: "underline",
                                },
                              }}
                            >
                              {workflow.name || "Untitled Workflow"}
                              <ExternalLink
                                size={12}
                                style={{
                                  color: "hsl(var(--muted-foreground))",
                                }}
                              />
                            </Typography>

                            {isAffected && (
                              <Chip
                                label="Offline"
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: "0.625rem",
                                  fontWeight: 700,
                                  bgcolor: "hsla(var(--destructive) / 0.15)",
                                  color: "hsl(var(--destructive))",
                                  border:
                                    "1px solid hsla(var(--destructive) / 0.35)",
                                  "& .MuiChip-label": { px: 0.75 },
                                }}
                              />
                            )}

                            {hasBg && (
                              <Chip
                                label="Background"
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: "0.625rem",
                                  fontWeight: 600,
                                  bgcolor: "rgba(139, 92, 246, 0.15)",
                                  color: "#a78bfa",
                                  border: "1px solid rgba(139, 92, 246, 0.3)",
                                  "& .MuiChip-label": { px: 0.75 },
                                }}
                              />
                            )}

                            {Array.isArray(workflow.tags) &&
                              workflow.tags.map((tag: string) => (
                                <Chip
                                  key={tag}
                                  label={tag}
                                  size="small"
                                  sx={{
                                    height: 18,
                                    fontSize: "0.625rem",
                                    fontWeight: 500,
                                    bgcolor: "hsl(var(--muted))",
                                    color: "hsl(var(--muted-foreground))",
                                    border: "1px solid hsl(var(--border))",
                                    "& .MuiChip-label": { px: 0.6 },
                                  }}
                                />
                              ))}
                          </Box>

                          {workflow.description ? (
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: "0.75rem",
                                color: "hsl(var(--muted-foreground))",
                                display: "-webkit-box",
                                WebkitLineClamp: 1,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {workflow.description}
                            </Typography>
                          ) : null}

                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1.5,
                              mt: 0.25,
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "0.6875rem",
                                color: "hsl(var(--muted-foreground))",
                              }}
                            >
                              {actionsCount} node{actionsCount === 1 ? "" : "s"}{" "}
                              · {triggersCount} trigger
                              {triggersCount === 1 ? "" : "s"}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>

                      {/* Associated Usecases */}
                      <TableCell sx={{ py: 1.5, verticalAlign: "top" }}>
                        {matchedUsecases.length > 0 ? (
                          <Box
                            sx={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 0.75,
                              maxWidth: 320,
                            }}
                          >
                            {matchedUsecases.map((uc) => (
                              <Tooltip
                                key={uc.id}
                                title={`Open ${uc.label} usecase details`}
                              >
                                <Chip
                                  label={uc.label}
                                  size="small"
                                  onClick={() => setSelectedUsecaseId(uc.id)}
                                  clickable
                                  sx={{
                                    height: 22,
                                    fontSize: "0.7rem",
                                    fontWeight: 500,
                                    bgcolor: "hsl(var(--muted))",
                                    color: "hsl(var(--foreground))",
                                    border: "1px solid hsl(var(--border))",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                    "&:hover": {
                                      bgcolor: "hsl(var(--accent))",
                                      borderColor: "hsl(var(--primary))",
                                      color: "hsl(var(--primary))",
                                    },
                                    "& .MuiChip-label": { px: 0.75 },
                                  }}
                                />
                              </Tooltip>
                            ))}
                          </Box>
                        ) : hasBg ? (
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: "0.75rem",
                              color: "hsl(var(--muted-foreground))",
                              fontStyle: "italic",
                            }}
                          >
                            Platform background workflow
                          </Typography>
                        ) : (
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: "0.75rem",
                              color: "hsl(var(--muted-foreground))",
                            }}
                          >
                            —
                          </Typography>
                        )}
                      </TableCell>

                      {/* Runtime Location Dropdown */}
                      <TableCell
                        sx={{ py: 1.5, verticalAlign: "top", minWidth: 260 }}
                      >
                        <WorkflowEnvironmentSelector
                          workflow={workflow}
                          environments={environments}
                          defaultEnvironment={defaultEnvironment}
                          highlighted={isAffected}
                        />
                      </TableCell>

                      {/* Actions (Delete button) */}
                      <TableCell
                        align="right"
                        sx={{ py: 1.5, verticalAlign: "top", width: 48 }}
                      >
                        <Tooltip title="Delete workflow">
                          <IconButton
                            size="small"
                            onClick={() => setWorkflowToDelete(workflow)}
                            sx={{
                              color: "hsl(var(--muted-foreground))",
                              "&:hover": {
                                color: "hsl(var(--destructive))",
                                bgcolor: "rgba(239, 68, 68, 0.1)",
                              },
                            }}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={workflowToDelete !== null}
        onClose={() => !deleting && setWorkflowToDelete(null)}
        PaperProps={{
          sx: {
            bgcolor: "hsl(var(--card))",
            backgroundImage: "none",
            border: "1px solid hsl(var(--border))",
            borderRadius: 2,
            maxWidth: 440,
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ color: "hsl(var(--foreground))", fontWeight: 600 }}>
          Delete Workflow
        </DialogTitle>
        <DialogContent>
          <Typography
            sx={{
              color: "hsl(var(--muted-foreground))",
              fontSize: "0.875rem",
            }}
          >
            Are you sure you want to delete &ldquo;
            {workflowToDelete?.name || "Untitled Workflow"}&rdquo;? This action
            cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setWorkflowToDelete(null)}
            disabled={deleting}
            sx={{
              borderColor: "hsl(var(--border))",
              color: "hsl(var(--muted-foreground))",
              textTransform: "none",
              "&:hover": {
                borderColor: "hsl(var(--border) / 0.8)",
                backgroundColor: "hsl(var(--muted) / 0.5)",
              },
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            size="small"
            onClick={handleDeleteWorkflow}
            disabled={deleting}
            startIcon={
              deleting ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <Trash2 size={14} />
              )
            }
            sx={{
              textTransform: "none",
              fontWeight: 600,
            }}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Standalone Usecase Drawer */}
      <UsecaseDrawer
        open={selectedUsecaseId !== null}
        onClose={() => setSelectedUsecaseId(null)}
        flowId={selectedUsecaseId}
        globalUrl={API_CONFIG.baseUrl}
        userdata={userInfo as any}
        isLoaded={true}
        isLoggedIn={!!userInfo}
        theme={resolvedTheme}
      />
    </Box>
  );
};

export default RuntimeLocationsTab;
