import React, { useEffect, useState, useMemo, useCallback, useLayoutEffect } from "react";
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  InputBase,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ShuffleMarkdown from "@/Shuffle-Core/components/Markdown";
import AgentUI from "@/Shuffle-MCPs/components/AgentUI";
import AgentActivityList from "@/Shuffle-MCPs/components/AgentActivityList";
import AgentExecutionDrawer from "@/Shuffle-MCPs/components/AgentExecutionDrawer";
import type { AgentRun } from "@/Shuffle-MCPs/agentActivity";
import { DEMO_AGENT_RUNS } from "@/Shuffle-MCPs/demoAgentActivity";
import {
  AgentPresets,
  AGENT_PRESETS,
  type AgentPreset,
} from "@/Shuffle-Core/components/AgentPresets";
import AppMcpChat from "@/Shuffle-Core/views/AppMcpChat";
import { useAppLookup } from "@/Shuffle-Core/useAppLookup";
import AgentIcon from "@/Shuffle-Core/components/AgentIcon";
import { openAgentDrawer } from "@/lib/agentDrawer";
import { fetchAuthenticatedApps } from "@/Shuffle-Core/authenticatedApps";
import { resolveActiveLLMProvider } from "@/Shuffle-Core/llmProviderDetect";
import { DocCurlViewer } from "./DocCurlViewer";
import { DocCodeBlock } from "./DocCodeBlock";
import { DocIncidentDashboard } from "./DocIncidentDashboard";
import { IngestionSourcesRow } from "@/components/ingestion/IngestionSourcesRow";
import { useNavigate } from "@/lib/router-compat";
import { useDatastore } from "@/hooks/useDatastore";
import { DATASTORE_CATEGORIES, type CategoryAutomation } from "@/Shuffle-Core/datastore";
import { getApiUrl, getAuthHeader, getRegionUrl, setRegionUrl, getShuffleCoreUrl } from "@/Shuffle-Core/api";
import { ComponentErrorBoundary } from "@/components/common/ComponentErrorBoundary";
import { UsecaseDrawer, CategoryAutomationsDialog } from "@/Shuffle-Core";
import { API_CONFIG } from "@/Shuffle-Core/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { AutomationReadinessBanner } from "@/components/incidents/AutomationReadinessBanner";
import { VulnerabilityReadinessBanner } from "@/components/vulnerabilities/VulnerabilityReadinessBanner";
import { VulnerabilitiesDashboard } from "@/components/dashboard/VulnerabilitiesDashboard";
import { HostMonitoringDetailSlot } from "@/components/usecases/HostMonitoringDetailSlot";
import MonitorsView from "@/Shuffle-Core/views/monitors/MonitorsView";
import { DefaultEnvironmentSelector } from "@/components/settings/DefaultEnvironmentSelector";
import { RegionFlagImage } from "@/components/shared/RegionFlagImage";
import { getRegionFlag } from "@/lib/regionFlag";
import { SAMPLE_ORG_ID, installDashboardSampleFetch, buildSampleEnvironments } from "@/lib/dashboardSampleData";
import { toast } from "@/lib/toast";
import { Rocket as RocketLaunchIcon } from "lucide-react";
import DatastoreCategories from "@/Shuffle-Core/views/DatastoreCategories";

export interface ContentSegment {
  type: "markdown" | "component" | "expandable";
  content?: string;
  componentName?: string;
  props?: Record<string, string>;
  title?: string;
  defaultOpen?: boolean;
}

const COMBINED_DIRECTIVE_REGEX =
  /(?:<!--\s*component:([a-zA-Z0-9_-]+)(?:\s+([^>]*?))?\s*-->)|(?:<details(\s+open)?\s*>[\r\n\s]*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>)/gi;

/**
 * Parse key="value" or key='value' or key=value attributes from an HTML comment.
 */
export const parseAttributes = (raw?: string): Record<string, string> => {
  if (!raw) return {};
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(raw)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? "true";
    attrs[key] = val;
  }
  return attrs;
};

/**
 * Split raw markdown into sequential markdown chunks, component directives, and expandable details blocks.
 */
export const parseMarkdownSegments = (
  rawMarkdown: string,
): ContentSegment[] => {
  if (!rawMarkdown) return [];

  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  COMBINED_DIRECTIVE_REGEX.lastIndex = 0;

  while ((match = COMBINED_DIRECTIVE_REGEX.exec(rawMarkdown)) !== null) {
    const textBefore = rawMarkdown.slice(lastIndex, match.index);
    if (textBefore) {
      const cleanMarkdown = textBefore.replace(/<!--[\s\S]*?-->/g, "");
      if (cleanMarkdown.trim()) {
        segments.push({ type: "markdown", content: cleanMarkdown });
      }
    }

    if (match[1]) {
      // Component directive: <!-- component:<name> <props> -->
      const componentName = match[1].toLowerCase();
      const rawAttrs = match[2] || "";
      const props = parseAttributes(rawAttrs);

      segments.push({
        type: "component",
        componentName,
        props,
      });
    } else if (match[4] !== undefined) {
      // HTML <details><summary>Title</summary>Content</details> block
      const rawTitle = match[4].replace(/<[^>]+>/g, "").trim();
      const content = (match[5] || "").trim();
      const defaultOpen = Boolean(match[3]);

      segments.push({
        type: "expandable",
        title: rawTitle || "Details",
        content,
        defaultOpen,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  const remainingText = rawMarkdown.slice(lastIndex);
  if (remainingText) {
    const cleanMarkdown = remainingText.replace(/<!--[\s\S]*?-->/g, "");
    if (cleanMarkdown.trim()) {
      segments.push({ type: "markdown", content: cleanMarkdown });
    }
  }

  return segments;
};

interface DocAgentUIProps {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  compact?: string | boolean;
  apps?: string;
}

export const DocAgentUI: React.FC<DocAgentUIProps> = ({
  title,
  subtitle,
  placeholder,
  compact = true,
  apps,
}) => {
  const isCompact = compact === true || compact === "true";

  const defaultApps = React.useMemo(() => {
    if (!apps || apps === "none" || apps === '""' || apps === "''") {
      return [];
    }
    return apps
      .split(",")
      .map((name) => name.trim())
      .filter((name) => Boolean(name) && name !== "none")
      .map((name) => ({ name }));
  }, [apps]);

  const effectiveTitle = title !== undefined ? title : "Try the AI Agent";

  return (
    <Box className="not-prose" sx={{ my: 4 }}>
      <AgentUI
        compact={isCompact}
        hideHeroIcon={true}
        title={effectiveTitle}
        subtitle={subtitle}
        placeholder={
          placeholder ||
          'What do you want the agent to do? e.g. "Check if 1.1.1.1 is malicious"'
        }
        defaultApps={defaultApps}
        readUrlParams={false}
      />
    </Box>
  );
};

interface DocTryMcpProps {
  app?: string;
  appname?: string;
  appid?: string;
  title?: string;
  subtitle?: string;
}

export const DocTryMcp: React.FC<DocTryMcpProps> = ({
  app,
  appname,
  appid,
  title,
  subtitle,
}) => {
  const resolvedAppName = app || appname || "Shuffle Tools";
  const lookup = useAppLookup(resolvedAppName);

  const finalAppId =
    appid ||
    lookup.algoliaId ||
    (resolvedAppName.toLowerCase().includes("shuffle")
      ? "3e2bdf9d5069fe3f4746c29d68785a6a"
      : resolvedAppName);

  const finalAppIcon =
    lookup.image ||
    (resolvedAppName.toLowerCase().includes("shuffle")
      ? "/images/logos/orange_logo.png"
      : undefined);

  if (lookup.loading) {
    return (
      <Box sx={{ my: 4 }}>
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ my: 4 }}>
      {title && (
        <Typography
          sx={{
            fontSize: "1.05rem",
            fontWeight: 600,
            color: "hsl(var(--foreground))",
            mb: 0.5,
          }}
        >
          {title}
        </Typography>
      )}
      {subtitle && (
        <Typography
          sx={{
            fontSize: "0.875rem",
            color: "hsl(var(--muted-foreground))",
            mb: 1.5,
          }}
        >
          {subtitle}
        </Typography>
      )}
      <AppMcpChat
        appName={resolvedAppName}
        appIcon={finalAppIcon}
        appId={finalAppId}
        categories={lookup.categories}
      />
    </Box>
  );
};

interface DocAgentActivityProps {
  title?: string;
  subtitle?: string;
  limit?: string | number;
  top?: string | number;
}

export const DocAgentActivity: React.FC<DocAgentActivityProps> = ({
  limit = 3,
  top = 3,
}) => {
  const { isAuthenticated } = useAuth();
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
  const effectiveLimit = typeof limit === "string" ? parseInt(limit, 10) || 3 : limit;
  const effectiveTop = typeof top === "string" ? parseInt(top, 10) || 3 : top;

  return (
    <Box sx={{ my: 3.5 }}>
      <AgentActivityList
        limit={effectiveLimit}
        top={effectiveTop}
        onRunClick={setSelectedRun}
        initialRuns={!isAuthenticated ? DEMO_AGENT_RUNS.slice(0, effectiveLimit) : undefined}
        disableFetch={!isAuthenticated}
        rowSx={{ py: 1.25, px: 2 }}
      />

      <AgentExecutionDrawer
        open={selectedRun !== null}
        onClose={() => setSelectedRun(null)}
        run={selectedRun}
      />
    </Box>
  );
};

interface DocAgentSidebarButtonProps {
  label?: string;
  input?: string;
}

export const DocAgentSidebarButton: React.FC<DocAgentSidebarButtonProps> = ({
  label = "Open AI Agent Sidebar",
  input,
}) => {
  const { isAuthenticated } = useAuth();

  const handleOpen = () => {
    openAgentDrawer("run", { defaultInput: input, source: "docs" });
  };

  return (
    <Box
      sx={{
        my: 3.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 2,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "hsl(var(--primary) / 0.1)",
            color: "hsl(var(--primary))",
          }}
        >
          <AgentIcon size={20} />
        </Box>
        <Box>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "hsl(var(--foreground))",
            }}
          >
            Interactive AI Agent
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "hsl(var(--muted-foreground))" }}
          >
            Open the live AI side-panel to run tasks alongside the
            documentation.
            {!isAuthenticated && " (Login may be required to execute tasks)"}
          </Typography>
        </Box>
      </Stack>
      <Button
        variant="contained"
        size="small"
        onClick={handleOpen}
        sx={{
          textTransform: "none",
          fontWeight: 500,
          borderRadius: 1.5,
        }}
      >
        {label}
      </Button>
    </Box>
  );
};

export interface DocExpandableProps {
  title?: string;
  summary?: string;
  content?: string;
  children?: React.ReactNode;
  defaultOpen?: boolean | string;
  linkComponent?: any;
}

export const DocExpandable: React.FC<DocExpandableProps> = ({
  title,
  summary,
  content,
  children,
  defaultOpen = false,
  linkComponent,
}) => {
  const isDefaultOpen = defaultOpen === true || defaultOpen === "true";
  const [open, setOpen] = useState(isDefaultOpen);
  const displayTitle = title || summary || "Details";

  return (
    <Box
      sx={{
        my: 2.5,
        borderRadius: 2,
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--card))",
        overflow: "hidden",
        transition: "border-color 150ms ease",
        "&:hover": {
          borderColor: "hsl(var(--muted-foreground) / 0.4)",
        },
      }}
    >
      <ButtonBase
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          width: "100%",
          py: 1.5,
          px: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          textAlign: "left",
          backgroundColor: open ? "hsl(var(--muted) / 0.35)" : "transparent",
          borderBottom: open ? "1px solid hsl(var(--border))" : "none",
          transition: "background-color 150ms ease",
          cursor: "pointer",
        }}
      >
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: "0.875rem",
            color: "hsl(var(--foreground))",
          }}
        >
          {displayTitle}
        </Typography>
        <Typography
          component="span"
          sx={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "hsl(var(--muted-foreground))",
            ml: 1.5,
            flexShrink: 0,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {open ? "Hide" : "Expand"}
        </Typography>
      </ButtonBase>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box
          sx={{
            p: 2,
            backgroundColor: "hsl(var(--background) / 0.4)",
            "& pre": { my: 1 },
          }}
        >
          {content ? (
            <ShuffleMarkdown disableBreaks components={linkComponent}>
              {content}
            </ShuffleMarkdown>
          ) : (
            children
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

interface DocAgentSkillsProps {
  title?: string;
  subtitle?: string;
  initialSkill?: string;
  compact?: string | boolean;
}

export const DocAgentSkills: React.FC<DocAgentSkillsProps> = ({
  title = "Predefined Agent Skills",
  subtitle = "Inspect built-in agent capability bundles or launch one directly in the Ask AI assistant.",
  initialSkill,
  compact = false,
}) => {
  const isCompact = compact === true || compact === "true";
  const [selectedPreset, setSelectedPreset] = useState<AgentPreset | null>(
    () => {
      if (initialSkill) {
        return AGENT_PRESETS.find((p) => p.id === initialSkill) || null;
      }
      return null;
    },
  );

  const handleSelect = (preset: AgentPreset) => {
    setSelectedPreset(preset);
  };

  const handleRun = () => {
    if (!selectedPreset) return;
    openAgentDrawer("run", {
      defaultInput: selectedPreset.defaultPrompt,
      source: "docs-skills",
    });
  };

  return (
    <Box
      sx={{
        my: 3.5,
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
        }}
      >
        <Box>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: "0.92rem",
              color: "hsl(var(--foreground))",
            }}
          >
            {title}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "hsl(var(--muted-foreground))" }}
          >
            {subtitle}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AgentPresets
            variant="default"
            selectedPreset={selectedPreset}
            onSelectPreset={handleSelect}
            onRemoveSelected={() => setSelectedPreset(null)}
          />
        </Box>
      </Box>

      {/* Selected Skill Detail Panel */}
      {selectedPreset && (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: "hsl(var(--muted) / 0.5)",
            border: "1px solid hsl(var(--border))",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  color: "hsl(var(--foreground))",
                }}
              >
                {selectedPreset.label}
              </Typography>
              {selectedPreset.tag && (
                <Chip
                  label={selectedPreset.tag}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                />
              )}
            </Box>
            {selectedPreset.enabled !== false ? (
              <Button
                variant="contained"
                size="small"
                onClick={handleRun}
                sx={{
                  textTransform: "none",
                  fontWeight: 500,
                  fontSize: "0.75rem",
                  py: 0.25,
                  px: 1.25,
                  borderRadius: 1,
                  minHeight: 0,
                }}
              >
                Launch in Ask AI
              </Button>
            ) : (
              <Chip
                label="Coming soon"
                size="small"
                variant="outlined"
                sx={{ height: 22, fontSize: "0.7rem" }}
              />
            )}
          </Box>
          <Typography
            sx={{
              fontSize: "0.78rem",
              color: "hsl(var(--muted-foreground))",
              lineHeight: 1.45,
            }}
          >
            {selectedPreset.description}
          </Typography>

          {/* Tools & Prompt Preview */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.75,
              mt: 0.5,
            }}
          >
            {selectedPreset.defaultApps &&
              selectedPreset.defaultApps.length > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    flexWrap: "wrap",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: "hsl(var(--foreground))",
                    }}
                  >
                    Tools:
                  </Typography>
                  {selectedPreset.defaultApps.map((app) => (
                    <Chip
                      key={app.name}
                      label={app.name}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 20,
                        fontSize: "0.7rem",
                        fontFamily: "monospace",
                        bgcolor: "hsl(var(--card))",
                      }}
                    />
                  ))}
                </Box>
              )}
            {selectedPreset.defaultPrompt && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 0.75,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: "hsl(var(--foreground))",
                    flexShrink: 0,
                    pt: 0.2,
                  }}
                >
                  Prompt:
                </Typography>
                <Typography
                  component="code"
                  sx={{
                    fontSize: "0.72rem",
                    fontFamily: "monospace",
                    p: 0.75,
                    borderRadius: 1,
                    bgcolor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    color: "hsl(var(--foreground))",
                    flex: 1,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {selectedPreset.defaultPrompt}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

interface DocShuffleAIProps {
  label?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  compact?: string | boolean;
  pill?: string | boolean;
}

export const DocShuffleAI: React.FC<DocShuffleAIProps> = ({
  label,
  title,
  subtitle,
  description,
  compact = false,
  pill = true,
}) => {
  const isCompact = compact === true || String(compact) === "true";
  const isPill =
    pill === undefined ? true : pill === true || String(pill) === "true";

  const [activeLLM, setActiveLLM] = useState<{
    label: string;
    url: string;
    logo: string;
  }>({
    label: "Shuffle AI",
    url: "",
    logo: "",
  });

  useEffect(() => {
    let cancelled = false;
    fetchAuthenticatedApps()
      .then((apps) => {
        if (!cancelled && apps) {
          setActiveLLM(resolveActiveLLMProvider(apps));
        }
      })
      .catch(() => {
        // Fall back silently to default Shuffle AI
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpen = () => {
    openAgentDrawer("localLLM");
  };

  const effectiveLabel = label || activeLLM.label || "Shuffle AI";
  const helperText = subtitle || description;

  return (
    <Box sx={{ my: 2.5 }}>
      {title && (
        <Typography
          sx={{
            fontSize: "1rem",
            fontWeight: 600,
            color: "hsl(var(--foreground))",
            mb: 1,
          }}
        >
          {title}
        </Typography>
      )}
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
          verticalAlign: "middle",
        }}
      >
        <Tooltip title="Configure or swap LLM provider (Shuffle AI, OpenAI, Gemini, Ollama...)">
          <Button
            variant="outlined"
            size="small"
            onClick={handleOpen}
            startIcon={
              activeLLM.logo ? (
                <Box
                  component="img"
                  src={activeLLM.logo}
                  alt=""
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: "3px",
                    objectFit: "contain",
                    display: "block",
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      "none";
                  }}
                />
              ) : (
                <AgentIcon size={16} />
              )
            }
            sx={{
              textTransform: "none",
              fontWeight: 500,
              fontSize: "0.85rem",
              borderRadius: isPill ? 999 : 2,
              px: 1.75,
              py: 0.6,
              lineHeight: 1.4,
              display: "inline-flex",
              alignItems: "center",
              color: "hsl(var(--foreground))",
              borderColor: "hsl(var(--border))",
              backgroundColor: "hsl(var(--card))",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
              transition: "all 0.15s ease",
              "& .MuiButton-startIcon": {
                display: "inline-flex",
                alignItems: "center",
                my: 0,
              },
              "&:hover": {
                borderColor: "hsl(var(--primary))",
                backgroundColor: "hsl(var(--muted) / 0.5)",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.08)",
              },
            }}
          >
            {effectiveLabel}
          </Button>
        </Tooltip>
        {!isCompact && (
          <Typography
            component="span"
            variant="body2"
            sx={{
              color: "hsl(var(--muted-foreground))",
              fontSize: "0.825rem",
              lineHeight: 1.4,
              m: 0,
              p: 0,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {helperText ||
              "Click to configure or swap the model provider in the sidebar."}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

interface DocIngestProps {
  workflow?: string;
  category?: string;
  title?: string;
  subtitle?: string;
}

export const DocIngest: React.FC<DocIngestProps> = ({
  workflow = "Ingest Tickets",
  category = "cases",
  title,
  subtitle,
}) => {
  return (
    <Box
      sx={{
        my: 3.5,
        pt: 1.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 2,
      }}
    >
      <Box>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: "0.95rem",
            color: "hsl(var(--foreground))",
            mb: 0.25,
          }}
        >
          {title || workflow}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.82rem",
            color: "hsl(var(--muted-foreground))",
          }}
        >
          {subtitle ||
            "Toggle push webhooks, connect authenticated source apps, or trigger a manual sync."}
        </Typography>
      </Box>
      <Box sx={{ pt: 1 }}>
        <IngestionSourcesRow
          workflowLabel={workflow}
          category={category}
          webhookLabel={`${workflow}_webhook`}
          webhookWorkflowName="Ingestion Webhook"
        />
      </Box>
    </Box>
  );
};

interface DocUsecasesProps {
  title?: string;
  subtitle?: string;
  category?: string;
}

const USECASES_BY_CATEGORY: Record<
  string,
  {
    title: string;
    subtitle: string;
    items: Array<{ title: string; desc: string; flowId?: string }>;
  }
> = {
  vulnerabilities: {
    title: "Vulnerability & Patch Automation Use Cases",
    subtitle:
      "Turn scanner findings into automated patch playbooks, code reviews, and risk escalations.",
    items: [
      {
        title: "Automated Patch Orchestration",
        desc: "Ingest CVEs from scanner webhooks or package scans, correlate with monitored hosts, and trigger remediation workflows.",
        flowId: "asset_management_case_management_vuln_response_1",
      },
      {
        title: "CI/CD Dependency Gate",
        desc: "Scan npm, pip, and cargo dependencies in PRs; alert engineering in Slack and create Jira tickets for critical flaws.",
        flowId: "asset_management_case_management_vuln_1",
      },
      {
        title: "Emergency Zero-Day Fleet Audit",
        desc: "When a zero-day drops, instantly query all Host Monitors and cloud assets to identify vulnerable package versions.",
        flowId: "vulnerability_ingestion_1",
      },
      {
        title: "Auto-Ticketing & SLA Escalation",
        desc: "Automatically sync critical findings to Jira or ServiceNow, and escalate overdue remediations into Incidents.",
        flowId: "case_management_cases_forward_1",
      },
    ],
  },
  monitors: {
    title: "Host Monitoring & Endpoint Compliance Use Cases",
    subtitle:
      "Continuous posture verification, live endpoint forensics, and automated containment.",
    items: [
      {
        title: "Non-Compliant Laptop Quarantine",
        desc: "Detect disabled FileVault or BitLocker on endpoints, notify the user, and auto-revoke access if uncorrected.",
        flowId: "case_management_asset_management_monitors_1",
      },
      {
        title: "Live Incident Forensics",
        desc: "Directly from an active incident, trigger host actions to dump process trees, open ports, and recent file changes.",
        flowId: "case_management_asset_management_monitors_1",
      },
      {
        title: "Fleet-Wide Threat Hunting",
        desc: "Run one-click inspection scripts via the remote web terminal across thousands of endpoints to identify compromised hashes.",
        flowId: "case_management_asset_management_monitors_1",
      },
      {
        title: "Developer Dependency Audit",
        desc: "Use the local Code Package Scanner to catch risky open-source packages before code is pushed to production.",
        flowId: "asset_management_case_management_vuln_1",
      },
    ],
  },
  cases: {
    title: "Pre-Built Incident & SOC Use Cases",
    subtitle:
      "Shuffle bridges ingestion, analysis, and containment into reusable multi-phase pipelines.",
    items: [
      {
        title: "Phishing Triage & Auto-Purge",
        desc: "Parse headers (SPF/DKIM/DMARC), sandbox attachments, extract IOCs, and purge malicious emails across the entire tenant.",
        flowId: "email_case_management_1",
      },
      {
        title: "EDR Detection & Host Isolation",
        desc: "Ingest alerts from CrowdStrike or SentinelOne, correlate with threat feeds, and trigger one-click host isolation.",
        flowId: "edr_case_management_1",
      },
      {
        title: "Cloud Identity & Impossible Travel",
        desc: "Detect suspicious Okta or Azure AD logins, prompt user via Slack/Teams, and auto-revoke sessions upon anomaly confirmation.",
        flowId: "case_management_iam_1",
      },
      {
        title: "IOC Enrichment & Firewall Block",
        desc: "Extract IPs and domains from SIEM alerts, check reputation in VirusTotal / AbuseIPDB, and push block rules to firewalls.",
        flowId: "threat_intel_case_management_1",
      },
    ],
  },
  architecture: {
    title: "Deployment & Architecture Patterns",
    subtitle:
      "Engineered for high availability, air-gapped security, and distributed hybrid orchestration.",
    items: [
      {
        title: "Single Server / Docker Compose",
        desc: "All-in-one standalone deployment running frontend, backend, OpenSearch, and Orborus on a single host.",
        flowId: "siem_case_management_1",
      },
      {
        title: "Distributed Swarm Clustering",
        desc: "Separate backend API from execution runtime across dedicated worker nodes with overlay networking.",
        flowId: "edr_case_management_1",
      },
      {
        title: "Cloud Hybrid Orchestration",
        desc: "Manage workflows from Shuffle Cloud while Orborus executes actions on-premise inside your private network.",
        flowId: "case_management_cloud_1",
      },
      {
        title: "Kubernetes Cloud-Native",
        desc: "Scale workers dynamically as ephemeral Kubernetes pods with native namespace isolation and RBAC.",
        flowId: "cloud_siem_1",
      },
    ],
  },
};

export const DocUsecases: React.FC<DocUsecasesProps> = ({
  title,
  subtitle,
  category = "cases",
}) => {
  const navigate = useNavigate();
  const { userInfo } = useAuth();
  const { resolvedTheme } = useTheme();
  const [activeDrawerFlowId, setActiveDrawerFlowId] = useState<string | null>(null);

  const normalizedCategory = category.toLowerCase().includes("vuln")
    ? "vulnerabilities"
    : category.toLowerCase().includes("mon") || category.toLowerCase().includes("host")
    ? "monitors"
    : category.toLowerCase().includes("arch")
    ? "architecture"
    : "cases";

  const config =
    USECASES_BY_CATEGORY[normalizedCategory] || USECASES_BY_CATEGORY.cases;
  const displayTitle = title || config.title;
  const displaySubtitle = subtitle || config.subtitle;
  const usecases = config.items;

  return (
    <>
      <Box sx={{ my: 4 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1.5,
            mb: 2,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: "1.05rem",
                fontWeight: 600,
                color: "hsl(var(--foreground))",
                mb: 0.5,
              }}
            >
              {displayTitle}
            </Typography>
            {displaySubtitle && (
              <Typography
                sx={{
                  fontSize: "0.85rem",
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                {displaySubtitle}
              </Typography>
            )}
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate("/usecases")}
            sx={{
              textTransform: "none",
              fontWeight: 500,
              borderRadius: 1.5,
            }}
          >
            View all use cases
          </Button>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 1.5,
          }}
        >
          {usecases.map((uc, i) => (
            <Box
              key={i}
              onClick={() => {
                if (uc.flowId) {
                  setActiveDrawerFlowId(uc.flowId);
                } else {
                  navigate("/usecases");
                }
              }}
              sx={{
                p: 1.75,
                borderRadius: 2,
                border: "1px solid hsl(var(--border))",
                backgroundColor: "hsl(var(--background))",
                cursor: "pointer",
                transition: "all 0.15s ease",
                "&:hover": {
                  borderColor: "hsl(var(--primary))",
                  transform: "translateY(-1px)",
                },
              }}
            >
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  color: "hsl(var(--foreground))",
                  mb: 0.5,
                }}
              >
                {uc.title}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "hsl(var(--muted-foreground))", fontSize: "0.8rem", lineHeight: 1.4 }}
              >
                {uc.desc}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <UsecaseDrawer
        open={!!activeDrawerFlowId}
        onClose={() => setActiveDrawerFlowId(null)}
        flowId={activeDrawerFlowId}
        globalUrl={API_CONFIG.baseUrl}
        userdata={userInfo as any}
        isLoaded={true}
        isLoggedIn={!!userInfo}
        theme={resolvedTheme}
      />
    </>
  );
};

interface DocAutomationReadinessProps {
  type?: string;
  category?: string;
}

export const DocAutomationReadiness: React.FC<DocAutomationReadinessProps> = ({
  type,
  category,
}) => {
  const target = (type || category || "incidents").toLowerCase();
  const isVuln = target.includes("vuln");

  return (
    <Box sx={{ my: 3.5 }}>
      {isVuln ? (
        <VulnerabilityReadinessBanner />
      ) : (
        <AutomationReadinessBanner forceShow atTop />
      )}
    </Box>
  );
};

// ==========================================
// 1. Live Incident Status & Queue Telemetry
// ==========================================
export { DocIncidentDashboard, DocIncidentDashboard as DocIncidentStatus };

// ==========================================
// 2. Live Vulnerability Backlog & Risk Stats
// ==========================================
interface DocVulnStatusProps {
  title?: string;
  subtitle?: string;
  days?: string | number;
}

export const DocVulnStatus: React.FC<DocVulnStatusProps> = ({
  days = 30,
}) => {
  const { isAuthenticated, userInfo } = useAuth();
  const [ready, setReady] = useState(isAuthenticated);
  const [customRange, setCustomRange] = useState<{ fromMs: number; toMs: number } | null>(null);
  const dayCount = typeof days === "string" ? parseInt(days, 10) || 30 : days;

  useLayoutEffect(() => {
    if (isAuthenticated) {
      setReady(true);
      return;
    }
    const restore = installDashboardSampleFetch();
    setReady(true);
    return () => {
      restore();
    };
  }, [isAuthenticated]);

  if (!ready) return null;

  return (
    <Box sx={{ my: 3.5 }}>
      <VulnerabilitiesDashboard
        orgId={isAuthenticated ? userInfo?.active_org?.id : SAMPLE_ORG_ID}
        days={dayCount}
        gran="daily"
        compact
        customRange={customRange}
        onRangeSelect={(fromMs, toMs) => setCustomRange({ fromMs, toMs })}
      />
    </Box>
  );
};

// ==========================================
// 3. Interactive Live CVE & Advisory Lookup
// ==========================================
interface DocCveLookupProps {
  title?: string;
  placeholder?: string;
}

export const DocCveLookup: React.FC<DocCveLookupProps> = ({
  placeholder = "e.g. CVE-2024-3094, GHSA-xxxx, or package name",
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const handleSearch = (cveId?: string) => {
    const target = (cveId || query).trim();
    if (!target) return;
    navigate(`/vulnerabilities/${encodeURIComponent(target)}`);
  };

  const sampleCves = [
    { id: "CVE-2024-3094", label: "XZ Backdoor" },
    { id: "CVE-2023-38606", label: "Operation Triangulation" },
    { id: "CVE-2021-44228", label: "Log4Shell" },
  ];

  return (
    <Box sx={{ my: 3.5 }}>
      <Box
        component="form"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          handleSearch();
        }}
        sx={{
          display: "flex",
          gap: 1,
          mb: 1.5,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flex: 1,
            px: 1.5,
            py: 0.5,
            borderRadius: 1.5,
            border: "1px solid hsl(var(--border))",
            bgcolor: "hsl(var(--background))",
          }}
        >
          <InputBase
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            sx={{
              flex: 1,
              fontSize: "0.88rem",
              fontFamily: "monospace",
              color: "hsl(var(--foreground))",
            }}
          />
        </Box>
        <Button
          type="submit"
          variant="contained"
          disabled={!query.trim()}
          sx={{
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 1.5,
            px: 2,
          }}
        >
          Check Advisory
        </Button>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography
          variant="caption"
          sx={{ color: "hsl(var(--muted-foreground))", fontWeight: 500 }}
        >
          Quick samples:
        </Typography>
        {sampleCves.map((c) => (
          <Chip
            key={c.id}
            label={c.label}
            size="small"
            clickable
            onClick={() => handleSearch(c.id)}
            sx={{
              fontSize: "0.75rem",
              borderRadius: 1.5,
              borderColor: "hsl(var(--border))",
              bgcolor: "hsl(var(--background))",
              "&:hover": { borderColor: "hsl(var(--primary))" },
            }}
          />
        ))}
      </Box>
    </Box>
  );
};

// ==========================================
// 4 & 5. Host Monitoring & Deployment
// ==========================================
interface DocHostStatusProps {
  title?: string;
  subtitle?: string;
  os?: string;
}

export const DocHostStatus: React.FC<DocHostStatusProps> = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [addHostOpen, setAddHostOpen] = useState(false);

  return (
    <Box sx={{ my: 3.5 }}>
      <HostMonitoringDetailSlot
        compact
        onDeployClick={() => {
          if (!isAuthenticated) {
            navigate(`/login?view=${encodeURIComponent("/monitors?add_host=true")}`);
            return;
          }
          setAddHostOpen(true);
        }}
        onManageClick={() => navigate("/monitors")}
      />
      {addHostOpen && (
        <MonitorsView
          mode="add-host-dialog"
          onClose={() => setAddHostOpen(false)}
        />
      )}
    </Box>
  );
};

export const DocAddHost = DocHostStatus;

// ==========================================
// 6. Default Runtime Location
// ==========================================
interface DocSystemHealthProps {
  title?: string;
}

export const DocSystemHealth: React.FC<DocSystemHealthProps> = () => {
  const { isAuthenticated } = useAuth();
  const sampleEnvironments = useMemo(
    () =>
      buildSampleEnvironments().map((e, idx) => ({
        ...e,
        id: `sample-env-${idx}`,
        default: idx === 0,
      })),
    [],
  );

  return (
    <Box
      sx={{
        my: 3.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 2,
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
        environments={!isAuthenticated ? sampleEnvironments : undefined}
        defaultEnvironment={!isAuthenticated ? sampleEnvironments[0] : undefined}
      />
    </Box>
  );
};

// ==========================================
// 8. Organization Region Selector
// ==========================================
interface DocRegionSelectProps {
  name?: string;
  description?: string;
  region?: string;
}

interface RegionOption {
  value: string;
  label: string;
  code: string;
  apiBase: string;
}

const REGION_OPTIONS: RegionOption[] = [
  {
    value: "https://uk.shuffle.security",
    label: "UK (London - default)",
    code: "UK",
    apiBase: "https://uk.shuffler.io/api/v1",
  },
  {
    value: "https://us.shuffle.security",
    label: "US (California)",
    code: "US",
    apiBase: "https://california.shuffler.io/api/v1",
  },
  {
    value: "https://frankfurt.shuffle.security",
    label: "Germany (Frankfurt)",
    code: "DE",
    apiBase: "https://frankfurt.shuffler.io/api/v1",
  },
  {
    value: "https://eu.shuffle.security",
    label: "EU",
    code: "EU",
    apiBase: "https://eu.shuffle.security/api/v1",
  },
  {
    value: "https://ca.shuffle.security",
    label: "Canada (Montréal)",
    code: "CA",
    apiBase: "https://ca.shuffler.io/api/v1",
  },
  {
    value: "https://au.shuffle.security",
    label: "Australia (Sydney)",
    code: "AUS",
    apiBase: "https://au.shuffler.io/api/v1",
  },
];

const normalizeRegionUrl = (url?: string | null): string => {
  if (!url) return "https://uk.shuffle.security";
  const trimmed = url.trim().toLowerCase();
  if (trimmed.includes("california") || trimmed.includes("us.") || trimmed.includes("us-")) {
    return "https://us.shuffle.security";
  }
  if (trimmed.includes("frankfurt") || trimmed.includes("de.") || trimmed.includes("de-")) {
    return "https://frankfurt.shuffle.security";
  }
  if (trimmed.includes("ca.") || trimmed.includes("canada")) {
    return "https://ca.shuffle.security";
  }
  if (trimmed.includes("au.") || trimmed.includes("australia") || trimmed.includes("aus")) {
    return "https://au.shuffle.security";
  }
  if (trimmed.includes("eu.") || trimmed.includes("eu-") || trimmed.includes("eu2")) {
    return "https://eu.shuffle.security";
  }
  if (trimmed.includes("uk.") || trimmed.includes("london") || trimmed.includes("shuffler.io")) {
    return "https://uk.shuffle.security";
  }
  return url;
};

export const DocRegionSelect: React.FC<DocRegionSelectProps> = ({
  name: propName,
  description: propDescription,
  region: propRegion,
}) => {
  const navigate = useNavigate();
  const { isAuthenticated, sessionToken, userInfo, refreshUserInfo } = useAuth();
  const isLoggedIn = Boolean(isAuthenticated && (sessionToken || userInfo?.id));
  const orgId = userInfo?.active_org?.id;

  const defaultOrgName = isLoggedIn
    ? (userInfo?.active_org?.name || "Organization")
    : "Shuffle Cloud";
  const defaultOrgDescription = isLoggedIn
    ? ((userInfo?.active_org as any)?.description || "")
    : "Public cloud endpoint and API documentation console. Sign in to configure your tenant.";
  const defaultRegionUrl = normalizeRegionUrl(
    propRegion || (isLoggedIn ? userInfo?.active_org?.region_url : getRegionUrl())
  );

  const [orgName, setOrgName] = useState(propName || defaultOrgName);
  const [orgDescription, setOrgDescription] = useState(propDescription || defaultOrgDescription);
  const [selectedRegion, setSelectedRegion] = useState(defaultRegionUrl);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!isLoggedIn || !orgId) return;
    let cancelled = false;

    fetch(getApiUrl(`/api/v1/orgs/${orgId}`), {
      credentials: "include",
      headers: { ...getAuthHeader() },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (!propName && data.name) {
          setOrgName(data.name);
        }
        if (!propDescription && data.description !== undefined) {
          setOrgDescription(data.description || "");
        }
        if (!propRegion && data.region_url) {
          setSelectedRegion(normalizeRegionUrl(data.region_url));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, orgId, propName, propDescription, propRegion]);

  const allOptions = useMemo(() => {
    const exists = REGION_OPTIONS.some((o) => o.value === selectedRegion);
    if (!exists && selectedRegion) {
      return [
        ...REGION_OPTIONS,
        {
          value: selectedRegion,
          label: selectedRegion,
          code: "CUSTOM",
          apiBase: `${selectedRegion.replace(/\/+$/, "")}/api/v1`,
        },
      ];
    }
    return REGION_OPTIONS;
  }, [selectedRegion]);

  const handleRegionChange = async (event: SelectChangeEvent<string>) => {
    const newUrl = event.target.value;
    setSelectedRegion(newUrl);

    if (isLoggedIn && orgId) {
      setSaveStatus("saving");
      try {
        const payload: Record<string, string> = {
          org_id: orgId,
          region_url: newUrl,
        };
        const response = await fetch(getApiUrl(`/api/v1/orgs/${orgId}`), {
          method: "POST",
          credentials: "include",
          headers: {
            ...getAuthHeader(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.reason || "Failed to update organization region");
        }

        setRegionUrl(newUrl, orgId);
        await refreshUserInfo();
        setSaveStatus("saved");
        toast.success("Region updated successfully");
        setTimeout(() => setSaveStatus("idle"), 2500);
      } catch (err) {
        setSaveStatus("error");
        toast.error(err instanceof Error ? err.message : "Failed to update region");
        setTimeout(() => setSaveStatus("idle"), 3500);
      }
    } else {
      setRegionUrl(newUrl, orgId || null);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    }
  };

  const handleSave = async () => {
    if (!isLoggedIn || !orgId) {
      navigate("/login");
      return;
    }
    setSaveStatus("saving");
    try {
      const payload: Record<string, string> = {
        org_id: orgId,
        name: orgName,
        region_url: selectedRegion,
        description: orgDescription,
      };
      const response = await fetch(getApiUrl(`/api/v1/orgs/${orgId}`), {
        method: "POST",
        credentials: "include",
        headers: {
          ...getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.reason || "Failed to update organization");
      }

      setRegionUrl(selectedRegion, orgId);
      await refreshUserInfo();
      setSaveStatus("saved");
      toast.success("Tenant updated successfully");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err) {
      setSaveStatus("error");
      toast.error(err instanceof Error ? err.message : "Failed to update tenant");
      setTimeout(() => setSaveStatus("idle"), 3500);
    }
  };

  return (
    <Box sx={{ my: 3, width: "100%" }}>
      <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1.5, mb: 2 }}>
        <TextField
          label="Name"
          size="small"
          value={orgName}
          disabled={!isLoggedIn}
          onChange={(e) => setOrgName(e.target.value)}
          fullWidth
          sx={{
            "& .MuiOutlinedInput-root": {
              color: "hsl(var(--foreground))",
              "& fieldset": { borderColor: "hsl(var(--border))" },
              "&:hover fieldset": { borderColor: "hsl(var(--primary))" },
            },
            "& .MuiInputLabel-root": { color: "hsl(var(--muted-foreground))" },
          }}
        />

        <FormControl size="small" disabled={saveStatus === "saving"} sx={{ minWidth: { xs: "100%", sm: 160 } }}>
          <InputLabel sx={{ color: "hsl(var(--muted-foreground))" }}>Region</InputLabel>
          <Select
            value={selectedRegion}
            label="Region"
            disabled={saveStatus === "saving"}
            onChange={handleRegionChange}
            sx={{
              color: "hsl(var(--foreground))",
              "& fieldset": { borderColor: "hsl(var(--border))" },
              "&:hover fieldset": { borderColor: "hsl(var(--primary))" },
            }}
            renderValue={() => {
              const r = getRegionFlag(selectedRegion);
              return (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <RegionFlagImage code={r.code} />
                  <span>{r.code}</span>
                </Box>
              );
            }}
          >
            {allOptions.map((opt) => {
              const r = getRegionFlag(opt.value);
              return (
                <MenuItem key={opt.value} value={opt.value}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RegionFlagImage code={r.code} />
                    <span>{opt.label}</span>
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
      </Box>

      <TextField
        label="Description"
        size="small"
        value={orgDescription}
        disabled={!isLoggedIn}
        onChange={(e) => setOrgDescription(e.target.value)}
        multiline
        rows={2}
        fullWidth
        placeholder="Tenant description"
        sx={{
          mb: 2,
          "& .MuiOutlinedInput-root": {
            color: "hsl(var(--foreground))",
            "& fieldset": { borderColor: "hsl(var(--border))" },
            "&:hover fieldset": { borderColor: "hsl(var(--primary))" },
          },
          "& .MuiInputLabel-root": { color: "hsl(var(--muted-foreground))" },
        }}
      />

      {isLoggedIn && (
        <Button
          variant="contained"
          size="small"
          onClick={handleSave}
          disabled={saveStatus === "saving"}
          sx={{
            bgcolor: "hsl(var(--primary))",
            color: "hsl(var(--primary-foreground))",
            height: 36,
            textTransform: "none",
            width: { xs: "100%", sm: "auto" },
            "&:hover": { bgcolor: "hsl(var(--primary) / 0.9)" },
          }}
        >
          {saveStatus === "saving" ? "Saving..." : "Save Changes"}
        </Button>
      )}
    </Box>
  );
};

// ==========================================
// 19. Automation for Incidents (Rocket Button)
// ==========================================
interface DocIncidentAutomationProps {
  category?: string;
}

export const DocIncidentAutomation: React.FC<DocIncidentAutomationProps> = ({
  category = DATASTORE_CATEGORIES.INCIDENTS,
}) => {
  const { userInfo } = useAuth();
  const orgId = userInfo?.active_org?.id || null;

  const { categoryConfig, fetchItems } = useDatastore({ category });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [automations, setAutomations] = useState<CategoryAutomation[]>([]);

  useEffect(() => {
    if (categoryConfig?.automations && categoryConfig.automations.length > 0) {
      setAutomations(categoryConfig.automations);
    } else {
      setAutomations([
        {
          name: "Run AI Agent",
          description: "Runs an AI Agent to triage and summarize incidents.",
          enabled: true,
          type: "ai_agent",
          options: [{ key: "action", value: "Triage and investigate incoming alert" }],
        },
        {
          name: "Enrich",
          description: "Enriches observables against active threat intelligence feeds.",
          enabled: true,
          type: "enrich",
          options: [],
        },
        {
          name: "Run workflow",
          description: "Executes automated incident response workflows.",
          enabled: false,
          type: "workflow",
          options: [{ key: "workflow_id", value: "" }],
        },
      ]);
    }
  }, [categoryConfig]);

  const enabledCount = useMemo(() => {
    return automations.filter((a) => a.enabled).length;
  }, [automations]);

  const hasEnabled = enabledCount > 0;

  return (
    <Box sx={{ my: 3.5 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Tooltip title="Automation for Incidents">
            <IconButton
              data-tour="incidents-automation-button"
              onClick={() => setDialogOpen(true)}
              sx={{
                width: 44,
                height: 44,
                color: hasEnabled ? "#4ade80" : "hsl(var(--muted-foreground))",
                border: "1px solid",
                borderColor: hasEnabled ? "rgba(74, 222, 128, 0.5)" : "hsl(var(--border))",
                borderRadius: 2,
                bgcolor: hasEnabled ? "rgba(74, 222, 128, 0.08)" : "transparent",
                "&:hover": {
                  borderColor: hasEnabled ? "#4ade80" : "hsl(var(--foreground))",
                  bgcolor: hasEnabled ? "rgba(74, 222, 128, 0.16)" : "hsl(var(--muted))",
                },
              }}
            >
              <RocketLaunchIcon size={22} />
            </IconButton>
          </Tooltip>

          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25, flexWrap: "wrap" }}>
              <Typography sx={{ fontWeight: 600, fontSize: "0.95rem", color: "hsl(var(--foreground))" }}>
                Automation for Incidents
              </Typography>
              <Chip
                label={hasEnabled ? `${enabledCount} active` : "Not configured"}
                size="small"
                sx={{
                  height: 20,
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  bgcolor: hasEnabled ? "rgba(74, 222, 128, 0.15)" : "hsl(var(--muted))",
                  color: hasEnabled ? "#22c55e" : "hsl(var(--muted-foreground))",
                }}
              />
            </Box>
            <Typography sx={{ fontSize: "0.8rem", color: "hsl(var(--muted-foreground))" }}>
              Click the button to configure triggers, response workflows, and AI prompts.
            </Typography>
          </Box>
        </Box>

        <Button
          variant="contained"
          size="small"
          onClick={() => setDialogOpen(true)}
          sx={{
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.8rem",
            borderRadius: 1.5,
            bgcolor: "hsl(var(--primary))",
            color: "hsl(var(--primary-foreground))",
            "&:hover": { bgcolor: "hsl(var(--primary) / 0.9)" },
          }}
        >
          Configure Automations
        </Button>
      </Box>

      <CategoryAutomationsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        category={category}
        automations={automations}
        onAutomationsChange={setAutomations}
        initialSettings={categoryConfig?.settings}
        orgId={orgId}
        onSaved={() => {
          fetchItems();
          toast.success("Automations updated successfully");
        }}
      />
    </Box>
  );
};

// ==========================================
// 20. Datastore Architecture Link
// ==========================================
interface DocDatastoreLinkProps {
  category?: string;
  name?: string;
}

export const DocDatastoreLink: React.FC<DocDatastoreLinkProps> = ({
  category = "shuffle-security_incidents",
}) => {
  const datastorePath = `/admin?tab=datastore&category=${encodeURIComponent(category)}`;
  const datastoreUrl = getShuffleCoreUrl(datastorePath);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(datastoreUrl).catch(() => {});
      }
    } catch {}
    setCopied(true);
    toast.success("Datastore link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ my: 3.5 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography sx={{ fontWeight: 600, fontSize: "0.95rem", color: "hsl(var(--foreground))" }}>
              Shuffle Core Datastore
            </Typography>
            <Chip
              label={category}
              size="small"
              variant="outlined"
              sx={{
                height: 20,
                fontSize: "0.72rem",
                fontFamily: "monospace",
                borderColor: "hsl(var(--border))",
                color: "hsl(var(--foreground))",
              }}
            />
          </Box>
          <Typography sx={{ fontSize: "0.8rem", color: "hsl(var(--muted-foreground))" }}>
            Query, inspect, and manage raw OCSF 2005 records, keys, and datastore cache in the Shuffle Core admin console.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            variant="contained"
            size="small"
            component="a"
            href={datastoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8rem",
              bgcolor: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              height: 32,
              px: 2,
              borderRadius: 1.5,
              "&:hover": { bgcolor: "hsl(var(--primary) / 0.9)" },
            }}
          >
            Open in Datastore
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={handleCopy}
            sx={{
              textTransform: "none",
              fontWeight: 500,
              fontSize: "0.8rem",
              height: 32,
              borderRadius: 1.5,
              borderColor: "hsl(var(--border))",
              color: copied ? "#22c55e" : "hsl(var(--foreground))",
              "&:hover": { borderColor: "hsl(var(--primary))" },
            }}
          >
            {copied ? "Copied" : "Copy Link"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

// ==========================================
// DocDatastore: Embedded DatastoreCategories
// ==========================================
interface DocDatastoreProps {
  category?: string;
  name?: string;
  compact?: boolean | string;
  readOnly?: boolean | string;
  limit?: number | string;
  pageSize?: number | string;
}

export const DocDatastore: React.FC<DocDatastoreProps> = ({
  category = "shuffle-security_incidents",
  compact = true,
  readOnly = false,
  limit,
  pageSize = 3,
}) => {
  const isCompact = compact === true || compact === "true";
  const isReadOnly = readOnly === true || readOnly === "true";
  const rawLimit = limit ?? pageSize;
  const effectivePageSize = typeof rawLimit === "string" ? parseInt(rawLimit, 10) || 3 : rawLimit;

  return (
    <Box sx={{ my: 3.5 }}>
      <DatastoreCategories
        embedded
        categoryLocked
        initialCategory={category}
        initialPageSize={effectivePageSize}
        compact={isCompact}
        readOnly={isReadOnly}
      />
    </Box>
  );
};

interface DocDynamicComponentProps {
  name: string;
  props: Record<string, string>;
}

export const DocDynamicComponent: React.FC<DocDynamicComponentProps> = ({
  name,
  props,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Box sx={{ my: 3 }}>
        <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  const renderInner = () => {
    switch (name.toLowerCase()) {
      case "agent-ui":
      case "agent":
      case "ai-agent":
        return <DocAgentUI {...props} />;

      case "agent-skills":
      case "skills":
      case "agent-presets":
      case "presets":
        return <DocAgentSkills {...props} />;

      case "agent-activity":
      case "agent-executions":
      case "ai-executions":
      case "executions":
        return <DocAgentActivity {...props} />;

      case "expandable":
      case "details":
      case "collapse":
      case "accordion":
        return <DocExpandable {...props} />;

      case "curl":
      case "curl-viewer":
      case "api-call":
      case "api-viewer":
        return <DocCurlViewer rawCurl={props?.rawCurl || props?.curl || props?.code || ''} />;

      case "code":
      case "code-editor":
      case "code-block":
      case "python":
      case "bash":
        return (
          <DocCodeBlock
            text={props?.code || props?.text || ''}
            language={props?.language || props?.lang || (name.toLowerCase() === 'python' || name.toLowerCase() === 'bash' ? name.toLowerCase() : undefined)}
            title={props?.title}
          />
        );

      case "try-mcp":
      case "mcp":
      case "app-mcp":
        return <DocTryMcp {...props} />;

      case "agent-sidebar":
      case "agent-drawer":
      case "ask-ai":
        return <DocAgentSidebarButton {...props} />;

      case "shuffle-ai":
      case "shuffleai":
      case "swap-llm":
      case "choose-llm":
      case "llm":
      case "local-llm":
      case "localllm":
        return <DocShuffleAI {...props} />;

      case "ingest":
      case "ingestion":
      case "ingest-sources":
        return <DocIngest {...props} />;

      case "usecases":
      case "usecase":
      case "soc-usecases":
        return <DocUsecases {...props} />;

      case "incident-dashboard":
      case "incident-activity":
      case "incident-status":
      case "incident-stats":
      case "incidents-status":
      case "incidents-stats":
        return <DocIncidentDashboard {...props} />;

      case "vuln-status":
      case "vuln-stats":
      case "vulnerabilities-status":
      case "vulnerabilities-stats":
        return <DocVulnStatus {...props} />;

      case "cve-lookup":
      case "vuln-lookup":
      case "cve":
        return <DocCveLookup {...props} />;

      case "host-status":
      case "host-stats":
      case "fleet-status":
      case "fleet-stats":
      case "monitors-status":
      case "monitors-stats":
        return <DocHostStatus {...props} />;

      case "add-host":
      case "install-daemon":
      case "install-agent":
      case "install-monitor":
        return <DocAddHost {...props} />;

      case "system-health":
      case "architecture-status":
      case "architecture-health":
      case "cluster-status":
        return <DocSystemHealth {...props} />;

      case "automation-readiness":
      case "readiness":
      case "readiness-banner":
      case "automation-readiness-banner":
        return <DocAutomationReadiness {...props} />;

      case "incident-readiness":
      case "incidents-readiness":
        return <DocAutomationReadiness {...props} type="incidents" />;

      case "vuln-readiness":
      case "vulnerability-readiness":
      case "vulnerabilities-readiness":
        return <DocAutomationReadiness {...props} type="vulnerabilities" />;

      case "automation-for-incidents":
      case "incident-automation":
      case "category-automations":
      case "category-automation":
      case "rocket-button":
      case "incident-automations":
        return <DocIncidentAutomation {...props} />;

      case "datastore-link":
        return <DocDatastoreLink {...props} />;

      case "datastore":
      case "doc-datastore":
      case "datastore-viewer":
      case "datastore-categories":
      case "datastore-architecture":
      case "datastore-console":
      case "datastore-reference":
        return <DocDatastore {...props} />;

      case "region-select":
      case "region-selector":
      case "region":
      case "regions":
      case "select-region":
      case "current-region":
      case "shuffle-region":
        return <DocRegionSelect {...props} />;

      default:
        return null;
    }
  };

  const rendered = renderInner();
  if (!rendered) return null;
  return (
    <Box className="not-prose">
      <ComponentErrorBoundary name={`DocComponent-${name}`} fallback={null}>
        {rendered}
      </ComponentErrorBoundary>
    </Box>
  );
};
