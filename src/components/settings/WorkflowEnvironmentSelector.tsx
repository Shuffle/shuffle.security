import { useState, useMemo, useEffect } from "react";
import {
  Autocomplete,
  Box,
  TextField,
  Typography,
  CircularProgress,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl, getAuthHeader } from "@/Shuffle-Core/api";
import { toast } from "@/lib/toast";
import { WorkflowSummary } from "@/hooks/useWorkflows";
import { updateWorkflowEnvironment } from "@/services/workflowEnvironments";
import { invalidateWorkflowsCache } from "@/Shuffle-Core/views/appsFetchCache";
import {
  EnvironmentItem,
  isRunning,
  TypeIcon,
  RunningChip,
} from "./DefaultEnvironmentSelector";

export interface WorkflowEnvironmentSelectorProps {
  workflow: WorkflowSummary;
  environments: EnvironmentItem[];
  defaultEnvironment?: EnvironmentItem | null;
  onUpdated?: (updatedWorkflow: WorkflowSummary, newEnvName: string) => void;
  disabled?: boolean;
  minWidth?: number | string;
  highlighted?: boolean;
  helperText?: string;
}

export const WorkflowEnvironmentSelector = ({
  workflow,
  environments,
  defaultEnvironment,
  onUpdated,
  disabled = false,
  minWidth = 220,
  highlighted = false,
  helperText,
}: WorkflowEnvironmentSelectorProps) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [localEnvName, setLocalEnvName] = useState<string | null>(null);

  // Sync localEnvName whenever workflow prop updates from outside (e.g. background batch updates)
  useEffect(() => {
    setLocalEnvName(null);
  }, [workflow.environment, workflow.execution_environment, workflow.actions, workflow.triggers]);

  // Discover explicit environment on the workflow object, actions, or triggers
  const explicitEnvName = useMemo(() => {
    if (localEnvName) return localEnvName;
    if (workflow.environment && typeof workflow.environment === "string") {
      return workflow.environment;
    }
    const actionEnv = workflow.actions?.find(
      (a: { environment?: string }) => a?.environment,
    )?.environment;
    if (actionEnv && typeof actionEnv === "string") return actionEnv;
    const triggerEnv = workflow.triggers?.find(
      (t: { environment?: string }) => t?.environment,
    )?.environment;
    if (triggerEnv && typeof triggerEnv === "string") return triggerEnv;
    return null;
  }, [workflow, localEnvName]);

  // Selected EnvironmentItem from environments list
  const selectedEnv = useMemo<EnvironmentItem | undefined>(() => {
    if (explicitEnvName) {
      const match = environments.find(
        (e) =>
          e.Name.toLowerCase() === explicitEnvName.toLowerCase() ||
          e.id === explicitEnvName,
      );
      if (match) return match;
    }
    // If no explicit environment, fall back to default runtime location
    return defaultEnvironment || environments.find((e) => e.default);
  }, [explicitEnvName, environments, defaultEnvironment]);

  const isInherited = !explicitEnvName;

  const handleSelect = async (next: EnvironmentItem | null) => {
    if (!next || next.id === selectedEnv?.id) return;
    setSaving(true);
    try {
      const result = await updateWorkflowEnvironment(
        workflow.id,
        next.Name,
        workflow,
      );
      if (!result.success) {
        throw new Error(result.reason || "Failed to update workflow environment");
      }

      setLocalEnvName(next.Name);
      toast.success(
        `Runtime location for "${workflow.name || "Workflow"}" updated to ${next.Name}`,
      );

      // Optimistically update React Query workflows cache so parent and other views update immediately
      queryClient.setQueriesData<WorkflowSummary[]>(
        { queryKey: ["workflows"] },
        (oldWorkflows) => {
          if (!Array.isArray(oldWorkflows)) return oldWorkflows;
          return oldWorkflows.map((w) =>
            w.id === workflow.id
              ? {
                  ...w,
                  environment: next.Name,
                  execution_environment: next.Name,
                  actions: Array.isArray(w.actions)
                    ? w.actions.map((a: any) => ({
                        ...a,
                        environment: next.Name,
                        execution_environment: next.Name,
                      }))
                    : [{ environment: next.Name, execution_environment: next.Name }],
                  triggers: Array.isArray(w.triggers)
                    ? w.triggers.map((t: any) => ({
                        ...t,
                        environment: next.Name,
                        execution_environment: next.Name,
                      }))
                    : w.triggers,
                }
              : w,
          );
        },
      );

      // Invalidate react-query cache and in-memory workflows cache so all views stay in sync
      invalidateWorkflowsCache();
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      onUpdated?.({ ...workflow, environment: next.Name, execution_environment: next.Name }, next.Name);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update runtime location for workflow",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ minWidth, maxWidth: 320 }}>
      <Autocomplete
        key={selectedEnv?.id ?? "none"}
        value={selectedEnv}
        loading={saving}
        disabled={disabled || saving}
        onChange={(_, newValue) => handleSelect(newValue)}
        options={environments}
        getOptionLabel={(option) => option?.Name || ""}
        getOptionDisabled={(option) =>
          option.archived === true || option.sensor_group === true
        }
        isOptionEqualToValue={(option, value) => option?.id === value?.id}
        size="small"
        disableClearable
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Select runtime location"
            slotProps={{
              input: {
                ...params.InputProps,
                startAdornment: selectedEnv ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      ml: 0.5,
                      mr: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    <TypeIcon env={selectedEnv} />
                    <RunningChip running={isRunning(selectedEnv)} />
                  </Box>
                ) : null,
                endAdornment: (
                  <>
                    {saving ? (
                      <CircularProgress
                        size={14}
                        sx={{ color: "hsl(var(--primary))" }}
                      />
                    ) : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                backgroundColor: "hsl(var(--card))",
                borderRadius: 1.5,
                fontSize: "0.8125rem",
                py: 0.25,
                border: highlighted || (selectedEnv && !isRunning(selectedEnv))
                  ? "1.5px solid hsl(var(--destructive))"
                  : "none",
                boxShadow: highlighted || (selectedEnv && !isRunning(selectedEnv))
                  ? "0 0 0 2px hsla(var(--destructive) / 0.15)"
                  : "none",
                transition: "border 0.2s ease, box-shadow 0.2s ease",
                "& fieldset": {
                  borderColor: highlighted || (selectedEnv && !isRunning(selectedEnv))
                    ? "transparent"
                    : "hsl(var(--border))",
                },
                "&:hover fieldset": {
                  borderColor: highlighted || (selectedEnv && !isRunning(selectedEnv))
                    ? "transparent"
                    : "hsl(var(--primary))",
                },
                "&.Mui-focused fieldset": {
                  borderColor: highlighted || (selectedEnv && !isRunning(selectedEnv))
                    ? "hsl(var(--destructive))"
                    : "hsl(var(--primary))",
                },
              },
              "& .MuiInputBase-input": {
                color: "hsl(var(--foreground))",
                fontWeight: 500,
                fontSize: "0.8125rem",
              },
            }}
          />
        )}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 1.5,
              mt: 0.5,
              minWidth: 280,
              maxHeight: 280,
              overflow: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              "& .MuiAutocomplete-listbox": { padding: 0, maxHeight: "none" },
            },
          },
        }}
        renderOption={(props, option) => {
          const { key, ...restProps } = props;
          const isCurrent = option.id === selectedEnv?.id;
          const isOrgDefault = !!option.default;
          return (
            <Box
              component="li"
              key={option.id}
              {...restProps}
              sx={{
                fontSize: "0.8125rem",
                color: isCurrent
                  ? "hsl(var(--primary))"
                  : "hsl(var(--foreground))",
                backgroundColor: isCurrent
                  ? "rgba(255, 102, 0, 0.1)"
                  : "hsl(var(--card))",
                py: 0.75,
                borderLeft: isCurrent
                  ? "2px solid hsl(var(--primary))"
                  : "2px solid transparent",
                "&:hover": {
                  backgroundColor: isCurrent
                    ? "rgba(255, 102, 0, 0.15) !important"
                    : "hsl(var(--muted)) !important",
                },
                "&.Mui-focused": {
                  backgroundColor: isCurrent
                    ? "rgba(255, 102, 0, 0.15) !important"
                    : "hsl(var(--muted)) !important",
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  width: "100%",
                }}
              >
                <RunningChip running={isRunning(option)} />
                <TypeIcon env={option} />
                <Typography
                  noWrap
                  sx={{ fontSize: "0.8125rem", color: "inherit", flex: 1 }}
                >
                  {option.Name}
                </Typography>
                {isOrgDefault && (
                  <Typography
                    sx={{
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      color: "hsl(var(--muted-foreground))",
                      bgcolor: "hsl(var(--muted))",
                      px: 0.75,
                      py: 0.2,
                      borderRadius: 1,
                    }}
                  >
                    Default
                  </Typography>
                )}
                {(option.archived || option.sensor_group) && (
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      color: "hsl(var(--muted-foreground))",
                    }}
                  >
                    {option.archived ? "Archived" : "Sensor group"}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        }}
      />
      {helperText ? (
        <Typography
          variant="caption"
          sx={{
            fontSize: "0.6875rem",
            color: highlighted
              ? "hsl(var(--primary))"
              : "hsl(var(--muted-foreground))",
            mt: 0.35,
            display: "block",
            pl: 0.5,
            lineHeight: 1.35,
          }}
        >
          {helperText}
        </Typography>
      ) : isInherited ? (
        <Typography
          variant="caption"
          sx={{
            fontSize: "0.6875rem",
            color: "hsl(var(--muted-foreground))",
            mt: 0.35,
            display: "block",
            pl: 0.5,
          }}
        >
          Inheriting tenant default ({selectedEnv?.Name || "Cloud"})
        </Typography>
      ) : null}
    </Box>
  );
};

export default WorkflowEnvironmentSelector;
