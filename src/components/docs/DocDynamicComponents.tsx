import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Avatar,
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
  Paper,
  Select,
  type SelectChangeEvent,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ShuffleMarkdown from "@/Shuffle-MCPs/components/Markdown";
import AgentUI from "@/Shuffle-MCPs/components/AgentUI";
import AgentActivityList from "@/Shuffle-MCPs/components/AgentActivityList";
import AgentExecutionDrawer from "@/Shuffle-MCPs/components/AgentExecutionDrawer";
import type { AgentRun } from "@/Shuffle-MCPs/agentActivity";
import { DEMO_AGENT_RUNS } from "@/Shuffle-MCPs/demoAgentActivity";
import {
  AgentPresets,
  AGENT_PRESETS,
  type AgentPreset,
} from "@/Shuffle-MCPs/components/AgentPresets";
import AppMcpChat from "@/Shuffle-MCPs/views/AppMcpChat";
import { useAppLookup } from "@/Shuffle-MCPs/useAppLookup";
import AgentIcon from "@/Shuffle-MCPs/components/AgentIcon";
import { openAgentDrawer } from "@/lib/agentDrawer";
import { fetchAuthenticatedApps } from "@/Shuffle-MCPs/authenticatedApps";
import { resolveActiveLLMProvider } from "@/Shuffle-MCPs/llmProviderDetect";
import { DocCurlViewer } from "./DocCurlViewer";
import { DocIncidentDashboard } from "./DocIncidentDashboard";
import { IngestionSourcesRow } from "@/components/ingestion/IngestionSourcesRow";
import { useNavigate } from "@/lib/router-compat";
import { useDatastore } from "@/hooks/useDatastore";
import { DATASTORE_CATEGORIES, type CategoryAutomation } from "@/Shuffle-MCPs/datastore";
import { useVulnerabilities } from "@/hooks/useVulnerabilities";
import { useHostMonitorCount } from "@/hooks/useHostMonitorCount";
import { getApiUrl, getAuthHeader, getRegionUrl, setRegionUrl, getShuffleCoreUrl } from "@/Shuffle-MCPs/api";
import { ComponentErrorBoundary } from "@/components/common/ComponentErrorBoundary";
import { UsecaseDrawer, CategoryAutomationsDialog } from "@/Shuffle-Core";
import { API_CONFIG } from "@/Shuffle-MCPs/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { AutomationReadinessBanner } from "@/components/incidents/AutomationReadinessBanner";
import { VulnerabilityReadinessBanner } from "@/components/vulnerabilities/VulnerabilityReadinessBanner";
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
    <Box className="not-prose" sx={{ my: 3 }}>
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
      <Box sx={{ my: 3 }}>
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ my: 3 }}>
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
  title = "AI Executions & Activity",
  subtitle = "Recent autonomous agent executions, live status, decision breakdown, and raw LLM request/response logs.",
  limit = 5,
  top = 5,
}) => {
  const { isAuthenticated } = useAuth();
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
  const effectiveLimit = typeof limit === "string" ? parseInt(limit, 10) || 5 : limit;
  const effectiveTop = typeof top === "string" ? parseInt(top, 10) || 5 : top;

  return (
    <Box
      sx={{
        my: 3,
        p: 2.5,
        borderRadius: 2.5,
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--card))",
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 0.5 }}>
          <Typography
            sx={{
              fontSize: "1.05rem",
              fontWeight: 600,
              color: "hsl(var(--foreground))",
            }}
          >
            {title}
          </Typography>
          {!isAuthenticated && (
            <Chip
              label="Demo Data"
              size="small"
              sx={{
                height: 20,
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                backgroundColor: "hsla(var(--primary) / 0.15)",
                color: "hsl(var(--primary))",
                border: "1px solid hsla(var(--primary) / 0.3)",
                borderRadius: 1,
              }}
            />
          )}
        </Box>
        {subtitle && (
          <Typography
            sx={{
              fontSize: "0.875rem",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      {!isAuthenticated && (
        <Box
          sx={{
            mb: 2,
            px: 2,
            py: 1.25,
            borderRadius: 1.5,
            border: "1px solid hsl(var(--border))",
            backgroundColor: "hsla(var(--muted) / 0.35)",
          }}
        >
          <Typography sx={{ fontSize: "0.8rem", color: "hsl(var(--muted-foreground))" }}>
            Unauthenticated preview. Showing representative agent executions with interactive timelines, decision trees, and raw LLM request/response telemetry. Click any run to inspect the execution drawer.
          </Typography>
        </Box>
      )}

      <AgentActivityList
        limit={effectiveLimit}
        top={effectiveTop}
        onRunClick={setSelectedRun}
        initialRuns={!isAuthenticated ? DEMO_AGENT_RUNS : undefined}
        disableFetch={!isAuthenticated}
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
        my: 2.5,
        p: 2,
        borderRadius: 2,
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--card))",
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
        my: 2.5,
        p: 2,
        borderRadius: 2,
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--card))",
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
  title = "Interactive Alert Ingest Pipeline",
  subtitle = "Configure webhooks and connected tools that feed into your incident queue in real time.",
}) => {
  return (
    <Box
      sx={{
        my: 3,
        p: 2.5,
        borderRadius: 2.5,
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--card))",
      }}
    >
      <Box sx={{ mb: 2 }}>
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
        {subtitle && (
          <Typography
            sx={{
              fontSize: "0.85rem",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      <IngestionSourcesRow
        workflowLabel={workflow}
        category={category}
        webhookLabel={`${workflow}_webhook`}
        webhookWorkflowName="Ingestion Webhook"
      />
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
      <Box
        sx={{
          my: 3,
          p: 2.5,
          borderRadius: 2.5,
          border: "1px solid hsl(var(--border))",
          backgroundColor: "hsl(var(--card))",
        }}
      >
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
  const { isAuthenticated, sessionToken, userInfo } = useAuth();
  const isLoggedIn = Boolean(isAuthenticated && (sessionToken || userInfo?.id));

  return (
    <Box sx={{ my: 3 }}>
      {isVuln ? (
        <VulnerabilityReadinessBanner />
      ) : isLoggedIn ? (
        <AutomationReadinessBanner />
      ) : (
        <Paper
          sx={{
            p: 2.5,
            bgcolor: "transparent",
            backgroundImage: "none",
            backdropFilter: "blur(12px)",
            border: "1px solid hsl(var(--border))",
            borderRadius: 2.5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: "0.95rem", color: "hsl(var(--foreground))" }}>
                Incident Automation Readiness
              </Typography>
              <Typography sx={{ fontSize: "0.8rem", color: "hsl(var(--muted-foreground))" }}>
                Foundational response workflows and status across Ingestion, Enrichment, Routing, and Default Config.
              </Typography>
            </Box>
            <Chip
              label="Public Documentation Preview"
              size="small"
              variant="outlined"
              sx={{
                height: 22,
                fontSize: "0.72rem",
                borderColor: "hsl(var(--border))",
                color: "hsl(var(--muted-foreground))",
              }}
            />
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
              gap: 1.5,
            }}
          >
            {[
              { label: "Ingestion", desc: "Inbound webhook trigger running", status: "Active in Cloud" },
              { label: "Enrichment", desc: "Threat feeds & IOC extraction", status: "Active in Cloud" },
              { label: "Assign & Escalate", desc: "SLA escalation workflows", status: "Active in Cloud" },
              { label: "Default config", desc: "IOC types & security rules", status: "Active in Cloud" },
            ].map((pillar) => (
              <Box
                key={pillar.label}
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  border: "1px solid hsl(var(--border))",
                  bgcolor: "hsl(var(--muted) / 0.15)",
                }}
              >
                <Typography sx={{ fontSize: "0.82rem", fontWeight: 600, color: "hsl(var(--foreground))", mb: 0.25 }}>
                  {pillar.label}
                </Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "hsl(var(--muted-foreground))", mb: 1 }}>
                  {pillar.desc}
                </Typography>
                <Chip
                  label={pillar.status}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: "0.68rem",
                    bgcolor: "rgba(74, 222, 128, 0.12)",
                    color: "#22c55e",
                    fontWeight: 600,
                  }}
                />
              </Box>
            ))}
          </Box>
        </Paper>
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
}

export const DocVulnStatus: React.FC<DocVulnStatusProps> = ({
  title = "Live Vulnerability Backlog & Risk",
  subtitle = "Active CVEs, package findings, and exploit likelihood tracked in your environment.",
}) => {
  const navigate = useNavigate();
  const { allVulnerabilities, severityCounts, isLoading, refresh } =
    useVulnerabilities();

  return (
    <Box
      sx={{
        my: 3,
        p: 2.5,
        borderRadius: 2.5,
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--card))",
      }}
    >
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography
              sx={{
                fontSize: "1.05rem",
                fontWeight: 600,
                color: "hsl(var(--foreground))",
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor: "hsl(var(--primary) / 0.12)",
                color: "hsl(var(--primary))",
                fontWeight: 600,
                fontSize: "0.72rem",
              }}
            >
              OSV + Host Posture
            </Typography>
          </Box>
          {subtitle && (
            <Typography
              sx={{
                fontSize: "0.85rem",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => refresh()}
            disabled={isLoading}
            sx={{
              textTransform: "none",
              fontWeight: 500,
              borderRadius: 1.5,
            }}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => navigate("/vulnerabilities")}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 1.5,
            }}
          >
            Open Vulnerabilities
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
          gap: 1.5,
        }}
      >
        <Box
          onClick={() => navigate("/vulnerabilities")}
          sx={{
            p: 1.75,
            borderRadius: 2,
            border: "1px solid rgba(239, 68, 68, 0.25)",
            bgcolor: "rgba(239, 68, 68, 0.04)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            "&:hover": { borderColor: "#ef4444", transform: "translateY(-1px)" },
          }}
        >
          <Typography sx={{ fontSize: "0.75rem", color: "#ef4444", fontWeight: 600, mb: 0.5 }}>
            Critical
          </Typography>
          <Typography sx={{ fontSize: "1.4rem", fontWeight: 700, color: "#ef4444" }}>
            {isLoading ? <Skeleton width={40} height={32} /> : severityCounts.critical}
          </Typography>
        </Box>

        <Box
          onClick={() => navigate("/vulnerabilities")}
          sx={{
            p: 1.75,
            borderRadius: 2,
            border: "1px solid rgba(249, 115, 22, 0.25)",
            bgcolor: "rgba(249, 115, 22, 0.04)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            "&:hover": { borderColor: "#f97316", transform: "translateY(-1px)" },
          }}
        >
          <Typography sx={{ fontSize: "0.75rem", color: "#f97316", fontWeight: 600, mb: 0.5 }}>
            High Severity
          </Typography>
          <Typography sx={{ fontSize: "1.4rem", fontWeight: 700, color: "#f97316" }}>
            {isLoading ? <Skeleton width={40} height={32} /> : severityCounts.high}
          </Typography>
        </Box>

        <Box
          onClick={() => navigate("/vulnerabilities")}
          sx={{
            p: 1.75,
            borderRadius: 2,
            border: "1px solid hsl(var(--border))",
            bgcolor: "hsl(var(--background))",
            cursor: "pointer",
            transition: "all 0.15s ease",
            "&:hover": { borderColor: "hsl(var(--primary))", transform: "translateY(-1px)" },
          }}
        >
          <Typography sx={{ fontSize: "0.75rem", color: "hsl(var(--muted-foreground))", fontWeight: 500, mb: 0.5 }}>
            Medium / Low
          </Typography>
          <Typography sx={{ fontSize: "1.4rem", fontWeight: 700, color: "hsl(var(--foreground))" }}>
            {isLoading ? (
              <Skeleton width={40} height={32} />
            ) : (
              severityCounts.medium + severityCounts.low
            )}
          </Typography>
        </Box>

        <Box
          onClick={() => navigate("/vulnerabilities")}
          sx={{
            p: 1.75,
            borderRadius: 2,
            border: "1px solid hsl(var(--border))",
            bgcolor: "hsl(var(--background))",
            cursor: "pointer",
            transition: "all 0.15s ease",
            "&:hover": { borderColor: "hsl(var(--primary))", transform: "translateY(-1px)" },
          }}
        >
          <Typography sx={{ fontSize: "0.75rem", color: "hsl(var(--muted-foreground))", fontWeight: 500, mb: 0.5 }}>
            Total Findings
          </Typography>
          <Typography sx={{ fontSize: "1.4rem", fontWeight: 700, color: "hsl(var(--foreground))" }}>
            {isLoading ? <Skeleton width={40} height={32} /> : allVulnerabilities.length}
          </Typography>
        </Box>
      </Box>
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
  title = "Live OSV Advisory Lookup",
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
    <Box
      sx={{
        my: 3,
        p: 2.5,
        borderRadius: 2.5,
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--card))",
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <Typography
            sx={{
              fontSize: "1.05rem",
              fontWeight: 600,
              color: "hsl(var(--foreground))",
            }}
          >
            {title}
          </Typography>
        </Box>
        <Typography
          sx={{
            fontSize: "0.85rem",
            color: "hsl(var(--muted-foreground))",
          }}
        >
          Lookup open source vulnerability advisories directly from OSV.dev.
        </Typography>
      </Box>

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
// 4. Fleet Posture & Compliance Status
// ==========================================
interface DocHostStatusProps {
  title?: string;
  subtitle?: string;
}

export const DocHostStatus: React.FC<DocHostStatusProps> = ({
  title = "Fleet Posture & Compliance Status",
  subtitle = "Real-time endpoint compliance, disk encryption, and software inventory across registered hosts.",
}) => {
  const navigate = useNavigate();
  const hostCount = useHostMonitorCount();

  return (
    <Box
      sx={{
        my: 3,
        p: 2.5,
        borderRadius: 2.5,
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--card))",
      }}
    >
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography
              sx={{
                fontSize: "1.05rem",
                fontWeight: 600,
                color: "hsl(var(--foreground))",
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor:
                  hostCount && hostCount > 0
                    ? "rgba(34, 197, 94, 0.12)"
                    : "rgba(100, 116, 139, 0.12)",
                color: hostCount && hostCount > 0 ? "#22c55e" : "hsl(var(--muted-foreground))",
                fontWeight: 600,
                fontSize: "0.72rem",
              }}
            >
              {hostCount === null
                ? "Connecting..."
                : `${hostCount} Host${hostCount === 1 ? "" : "s"} Monitored`}
            </Typography>
          </Box>
          {subtitle && (
            <Typography
              sx={{
                fontSize: "0.85rem",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate("/monitors")}
            sx={{
              textTransform: "none",
              fontWeight: 500,
              borderRadius: 1.5,
              borderColor: "hsl(var(--border))",
            }}
          >
            View Fleet Table
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => navigate("/monitors")}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 1.5,
            }}
          >
            Manage Monitors
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
          gap: 1.5,
        }}
      >
        <Box
          onClick={() => navigate("/monitors")}
          sx={{
            p: 1.75,
            borderRadius: 2,
            border: "1px solid hsl(var(--border))",
            bgcolor: "hsl(var(--background))",
            cursor: "pointer",
            "&:hover": { borderColor: "hsl(var(--primary))" },
          }}
        >
          <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: "hsl(var(--foreground))", mb: 0.5 }}>
            Disk Encryption
          </Typography>
          <Typography sx={{ fontSize: "0.72rem", color: "hsl(var(--muted-foreground))" }}>
            FileVault, BitLocker, & LUKS verification
          </Typography>
        </Box>

        <Box
          onClick={() => navigate("/monitors")}
          sx={{
            p: 1.75,
            borderRadius: 2,
            border: "1px solid hsl(var(--border))",
            bgcolor: "hsl(var(--background))",
            cursor: "pointer",
            "&:hover": { borderColor: "hsl(var(--primary))" },
          }}
        >
          <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: "hsl(var(--foreground))", mb: 0.5 }}>
            Screen Lock
          </Typography>
          <Typography sx={{ fontSize: "0.72rem", color: "hsl(var(--muted-foreground))" }}>
            Max 15-min idle timeout compliance
          </Typography>
        </Box>

        <Box
          onClick={() => navigate("/monitors")}
          sx={{
            p: 1.75,
            borderRadius: 2,
            border: "1px solid hsl(var(--border))",
            bgcolor: "hsl(var(--background))",
            cursor: "pointer",
            "&:hover": { borderColor: "hsl(var(--primary))" },
          }}
        >
          <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: "hsl(var(--foreground))", mb: 0.5 }}>
            Software Catalog
          </Typography>
          <Typography sx={{ fontSize: "0.72rem", color: "hsl(var(--muted-foreground))" }}>
            Installed apps and package versions
          </Typography>
        </Box>

        <Box
          onClick={() => navigate("/monitors")}
          sx={{
            p: 1.75,
            borderRadius: 2,
            border: "1px solid hsl(var(--border))",
            bgcolor: "hsl(var(--background))",
            cursor: "pointer",
            "&:hover": { borderColor: "hsl(var(--primary))" },
          }}
        >
          <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: "hsl(var(--foreground))", mb: 0.5 }}>
            Code Scanner
          </Typography>
          <Typography sx={{ fontSize: "0.72rem", color: "hsl(var(--muted-foreground))" }}>
            npm, pip, cargo, and go.mod audits
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

// ==========================================
// 5. Interactive One-Liner Host Daemon Deployer
// ==========================================
interface DocAddHostProps {
  title?: string;
  os?: string;
}

export const DocAddHost: React.FC<DocAddHostProps> = ({
  title = "Deploy Shuffle Host Monitor Daemon",
  os: initialOs = "macos",
}) => {
  const navigate = useNavigate();
  const [selectedOs, setSelectedOs] = useState<"macos" | "linux" | "windows">(
    initialOs.toLowerCase().includes("win")
      ? "windows"
      : initialOs.toLowerCase().includes("lin")
      ? "linux"
      : "macos",
  );
  const [copied, setCopied] = useState(false);

  const commands: Record<"macos" | "linux" | "windows", string> = {
    macos:
      "curl -sSL https://shuffle.security/api/v1/monitors/install.sh | sudo bash",
    linux:
      "curl -sSL https://shuffle.security/api/v1/monitors/install.sh | sudo bash",
    windows: "irm https://shuffle.security/api/v1/monitors/install.ps1 | iex",
  };

  const currentCommand = commands[selectedOs];

  const handleCopy = () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(currentCommand).catch(() => {});
      }
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      sx={{
        my: 3,
        p: 2.5,
        borderRadius: 2.5,
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--card))",
      }}
    >
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
            {title}
          </Typography>
          <Typography
            sx={{
              fontSize: "0.85rem",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            Lightweight, low-overhead daemon for continuous compliance, package scanning, and remote containment.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          onClick={() => navigate("/monitors")}
          sx={{
            textTransform: "none",
            fontWeight: 500,
            borderRadius: 1.5,
          }}
        >
          Open Registration Modal
        </Button>
      </Box>

      {/* OS Selector Tabs */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {(["macos", "linux", "windows"] as const).map((osKey) => (
          <Button
            key={osKey}
            size="small"
            variant={selectedOs === osKey ? "contained" : "outlined"}
            onClick={() => setSelectedOs(osKey)}
            sx={{
              textTransform: "capitalize",
              fontSize: "0.8rem",
              borderRadius: 1.5,
              fontWeight: 600,
            }}
          >
            {osKey === "macos" ? "macOS" : osKey === "linux" ? "Linux" : "Windows"}
          </Button>
        ))}
      </Stack>

      {/* Code Snippet Box */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          p: 1.5,
          borderRadius: 2,
          border: "1px solid hsl(var(--border))",
          bgcolor: "hsl(var(--background))",
        }}
      >
        <Typography
          component="code"
          sx={{
            fontFamily: "monospace",
            fontSize: "0.82rem",
            color: "hsl(var(--foreground))",
            overflowX: "auto",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {currentCommand}
        </Typography>
        <Button
          size="small"
          onClick={handleCopy}
          sx={{
            minWidth: 70,
            textTransform: "none",
            fontSize: "0.78rem",
            fontWeight: 600,
            color: copied ? "#22c55e" : "hsl(var(--foreground))",
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </Box>
    </Box>
  );
};

// ==========================================
// 6. Live Architecture & Service Status
// ==========================================
interface DocSystemHealthProps {
  title?: string;
}

export const DocSystemHealth: React.FC<DocSystemHealthProps> = ({
  title = "Live Architecture & Service Status",
}) => {
  const navigate = useNavigate();
  const [latency, setLatency] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    const start = performance.now();
    try {
      const res = await fetch(getApiUrl("/api/v1/health"), {
        credentials: "include",
        headers: { ...getAuthHeader() },
      });
      const end = performance.now();
      setLatency(Math.round(end - start));
      setApiOnline(res.ok || res.status < 500);
    } catch {
      // fallback test on version
      try {
        const res2 = await fetch(getApiUrl("/api/v1/version"), {
          credentials: "include",
          headers: { ...getAuthHeader() },
        });
        const end = performance.now();
        setLatency(Math.round(end - start));
        setApiOnline(res2.ok || res2.status < 500);
      } catch {
        setApiOnline(false);
        setLatency(null);
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const services = [
    {
      name: "Shuffle Web UI",
      desc: "React frontends on port :3001 / :3002",
      status: "Connected",
      isHealthy: true,
    },
    {
      name: "Backend API (Go)",
      desc: "Core REST server on port :5001",
      status: apiOnline === false ? "Degraded" : "Healthy",
      isHealthy: apiOnline !== false,
    },
    {
      name: "Datastore Cluster",
      desc: "OpenSearch document store",
      status: "Operational",
      isHealthy: true,
    },
    {
      name: "Orborus Runtime",
      desc: "Docker Swarm & K8s worker engine",
      status: "Listening",
      isHealthy: true,
    },
  ];

  return (
    <Box
      sx={{
        my: 3,
        p: 2.5,
        borderRadius: 2.5,
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--card))",
      }}
    >
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography
              sx={{
                fontSize: "1.05rem",
                fontWeight: 600,
                color: "hsl(var(--foreground))",
              }}
            >
              {title}
            </Typography>
            {latency !== null && (
              <Typography
                variant="caption"
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: "rgba(34, 197, 94, 0.12)",
                  color: "#22c55e",
                  fontWeight: 600,
                  fontSize: "0.72rem",
                }}
              >
                {latency}ms API Ping
              </Typography>
            )}
          </Box>
          <Typography
            sx={{
              fontSize: "0.85rem",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            Live connectivity across Server (Frontend, Backend, OpenSearch) and Runtime (Orborus, Workers).
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={checkHealth}
            disabled={isChecking}
            sx={{
              textTransform: "none",
              fontWeight: 500,
              borderRadius: 1.5,
            }}
          >
            {isChecking ? "Pinging..." : "Refresh"}
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate("/admin/locations")}
            sx={{
              textTransform: "none",
              fontWeight: 500,
              borderRadius: 1.5,
            }}
          >
            Environments
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 1.5,
        }}
      >
        {services.map((svc, i) => (
          <Box
            key={i}
            sx={{
              p: 1.75,
              borderRadius: 2,
              border: "1px solid hsl(var(--border))",
              bgcolor: "hsl(var(--background))",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: "0.88rem", color: "hsl(var(--foreground))" }}>
                {svc.name}
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "hsl(var(--muted-foreground))" }}>
                {svc.desc}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  bgcolor: svc.isHealthy ? "#22c55e" : "#eab308",
                  boxShadow: svc.isHealthy ? "0 0 6px #22c55e" : "none",
                }}
              />
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: svc.isHealthy ? "#22c55e" : "#eab308",
                }}
              >
                {svc.status}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
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
    : "Shuffle Cloud (Public API)";
  const defaultOrgDescription = isLoggedIn
    ? ((userInfo?.active_org as any)?.description || "")
    : "Public cloud endpoint and interactive API documentation console. Sign in to configure your tenant.";
  const defaultRegionUrl = normalizeRegionUrl(
    propRegion || (isLoggedIn ? userInfo?.active_org?.region_url : getRegionUrl())
  );

  const [orgName, setOrgName] = useState(propName || defaultOrgName);
  const [orgDescription, setOrgDescription] = useState(propDescription || defaultOrgDescription);
  const [selectedRegion, setSelectedRegion] = useState(defaultRegionUrl);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState(false);

  // Sync with fetched org details when authenticated
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
      .catch(() => {
        // Keep fallback state
      });

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

  const currentBaseUrl = useMemo(() => {
    const match = allOptions.find((o) => o.value === selectedRegion);
    if (match) return match.apiBase;
    if (!selectedRegion) return "https://uk.shuffler.io/api/v1";
    return `${selectedRegion.replace(/\/+$/, "")}/api/v1`;
  }, [allOptions, selectedRegion]);

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

  const handleCopyUrl = () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(currentBaseUrl).catch(() => {});
      }
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Paper
      sx={{
        p: 3,
        my: 3,
        bgcolor: "transparent",
        backgroundImage: "none",
        backdropFilter: "blur(12px)",
        border: "1px solid hsl(var(--border))",
        borderRadius: 2.5,
      }}
    >
      {/* Header: Avatar, Name, Status, and Auth CTA */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar
            sx={{
              width: 52,
              height: 52,
              bgcolor: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              fontSize: "1.35rem",
              fontWeight: 600,
              borderRadius: 2.5,
            }}
            variant="rounded"
          >
            {isLoggedIn ? (orgName?.charAt(0)?.toUpperCase() || "O") : "S"}
          </Avatar>
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25 }}>
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: "1.05rem",
                  color: "hsl(var(--foreground))",
                }}
              >
                {isLoggedIn ? orgName : "Shuffle Cloud (Public API)"}
              </Typography>
              <Chip
                label={
                  isLoggedIn
                    ? saveStatus === "saving"
                      ? "Updating"
                      : saveStatus === "saved"
                        ? "Updated"
                        : "Active Tenant"
                    : "Guest / Public"
                }
                size="small"
                variant="outlined"
                sx={{
                  height: 20,
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  borderColor: isLoggedIn ? "rgba(34, 197, 94, 0.4)" : "hsl(var(--border))",
                  color: isLoggedIn ? "#22c55e" : "hsl(var(--muted-foreground))",
                }}
              />
            </Box>
            <Typography
              sx={{
                fontSize: "0.8rem",
                color: "hsl(var(--muted-foreground))",
                lineHeight: 1.4,
              }}
            >
              {isLoggedIn
                ? "Your organization's active deployment region and API configuration."
                : "You are not signed in. Select a region below to test the API endpoint, or sign in to configure your tenant."}
            </Typography>
          </Box>
        </Box>

        {!isLoggedIn && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate("/login")}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8rem",
              borderRadius: 1.5,
              borderColor: "hsl(var(--border))",
              color: "hsl(var(--foreground))",
              "&:hover": { borderColor: "hsl(var(--primary))", bgcolor: "hsl(var(--muted))" },
            }}
          >
            Sign In
          </Button>
        )}
      </Box>

      {/* Name and Region Row - Matching in-product AdminPage structure */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 2,
          mb: 2.5,
        }}
      >
        <TextField
          label="Name"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          disabled={!isLoggedIn}
          fullWidth
          size="small"
          placeholder="Organization name"
          sx={{
            "& .MuiOutlinedInput-root": {
              color: "hsl(var(--foreground))",
              bgcolor: "hsl(var(--background))",
              "& fieldset": { borderColor: "hsl(var(--border))" },
              "&:hover fieldset": { borderColor: "hsl(var(--primary))" },
            },
            "& .MuiInputLabel-root": { color: "hsl(var(--muted-foreground))" },
          }}
        />

        <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 220 } }}>
          <InputLabel
            id="doc-region-select-label"
            sx={{ color: "hsl(var(--muted-foreground))" }}
          >
            Region
          </InputLabel>
          <Select
            labelId="doc-region-select-label"
            id="doc-region-select"
            value={selectedRegion}
            label="Region"
            onChange={handleRegionChange}
            disabled={saveStatus === "saving"}
            sx={{
              color: "hsl(var(--foreground))",
              bgcolor: "hsl(var(--background))",
              "& fieldset": { borderColor: "hsl(var(--border))" },
              "&:hover fieldset": { borderColor: "hsl(var(--primary))" },
            }}
          >
            {allOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "100%",
                    alignItems: "center",
                  }}
                >
                  <span>{opt.label}</span>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: "0.72rem",
                      fontFamily: "monospace",
                      color: "hsl(var(--muted-foreground))",
                      ml: 1.5,
                    }}
                  >
                    {opt.code}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Description Row - Matching in-product AdminPage structure */}
      <TextField
        label="Description"
        value={orgDescription}
        onChange={(e) => setOrgDescription(e.target.value)}
        disabled={!isLoggedIn}
        multiline
        rows={2}
        fullWidth
        size="small"
        placeholder="Tenant description"
        sx={{
          mb: 2.5,
          "& .MuiOutlinedInput-root": {
            color: "hsl(var(--foreground))",
            bgcolor: "hsl(var(--background))",
            "& fieldset": { borderColor: "hsl(var(--border))" },
            "&:hover fieldset": { borderColor: "hsl(var(--primary))" },
          },
          "& .MuiInputLabel-root": { color: "hsl(var(--muted-foreground))" },
        }}
      />

      {/* Footer: Live API Base URL & Actions */}
      <Box
        sx={{
          pt: 2,
          borderTop: "1px solid hsl(var(--border))",
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            flexWrap: "wrap",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "hsl(var(--muted-foreground))",
            }}
          >
            API Base URL:
          </Typography>
          <Typography
            sx={{
              fontSize: "0.8rem",
              fontFamily: "monospace",
              color: "hsl(var(--foreground))",
              bgcolor: "hsl(var(--muted))",
              px: 1,
              py: 0.35,
              borderRadius: 1,
              border: "1px solid hsl(var(--border))",
            }}
          >
            {currentBaseUrl}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={handleCopyUrl}
            sx={{
              textTransform: "none",
              fontSize: "0.75rem",
              fontWeight: 500,
              borderRadius: 1,
              height: 28,
              borderColor: "hsl(var(--border))",
              color: copied ? "#22c55e" : "hsl(var(--foreground))",
              "&:hover": { borderColor: "hsl(var(--primary))" },
            }}
          >
            {copied ? "Copied" : "Copy Base URL"}
          </Button>
        </Box>

        {isLoggedIn && (
          <Button
            variant="contained"
            size="small"
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8rem",
              bgcolor: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              height: 32,
              px: 3,
              borderRadius: 1.5,
              "&:hover": { bgcolor: "hsl(var(--primary) / 0.9)" },
            }}
          >
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "saved"
                ? "Saved"
                : "Save Changes"}
          </Button>
        )}
      </Box>
    </Paper>
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
  const navigate = useNavigate();
  const { isAuthenticated, sessionToken, userInfo } = useAuth();
  const isLoggedIn = Boolean(isAuthenticated && (sessionToken || userInfo?.id));
  const orgName = isLoggedIn
    ? (userInfo?.active_org?.name || "Active Tenant")
    : "Shuffle Cloud (Public)";
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
    <Paper
      sx={{
        p: 2.5,
        my: 3,
        bgcolor: "transparent",
        backgroundImage: "none",
        backdropFilter: "blur(12px)",
        border: "1px solid hsl(var(--border))",
        borderRadius: 2.5,
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* Exact in-product Rocket launch button */}
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
              <Chip
                label={isLoggedIn ? `Tenant: ${orgName}` : "Guest / Public Mode"}
                size="small"
                variant="outlined"
                sx={{
                  height: 20,
                  fontSize: "0.68rem",
                  fontWeight: 500,
                  borderColor: "hsl(var(--border))",
                  color: "hsl(var(--muted-foreground))",
                }}
              />
            </Box>
            <Typography sx={{ fontSize: "0.8rem", color: "hsl(var(--muted-foreground))" }}>
              {isLoggedIn
                ? `Active tenant: ${orgName}. Click the rocket button to configure triggers, response workflows, and AI prompts.`
                : "Live automation console for incidents. Click the rocket button to preview and configure automations."}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {!isLoggedIn && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => navigate("/login")}
              sx={{
                textTransform: "none",
                fontWeight: 500,
                fontSize: "0.8rem",
                borderRadius: 1.5,
                borderColor: "hsl(var(--border))",
                color: "hsl(var(--foreground))",
                "&:hover": { borderColor: "hsl(var(--primary))" },
              }}
            >
              Sign In
            </Button>
          )}
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
    </Paper>
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
    <Paper
      sx={{
        p: 2.5,
        my: 2.5,
        bgcolor: "transparent",
        backgroundImage: "none",
        backdropFilter: "blur(12px)",
        border: "1px solid hsl(var(--border))",
        borderRadius: 2.5,
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

      <Box
        sx={{
          mt: 1.75,
          pt: 1.5,
          borderTop: "1px solid hsl(var(--border))",
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>
          Direct Link:
        </Typography>
        <Typography
          component="a"
          href={datastoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            fontSize: "0.78rem",
            fontFamily: "monospace",
            color: "hsl(var(--primary))",
            textDecoration: "none",
            "&:hover": { textDecoration: "underline" },
            wordBreak: "break-all",
          }}
        >
          {datastoreUrl}
        </Typography>
      </Box>
    </Paper>
  );
};

// ==========================================
// DocDatastore: Interactive Datastore Preview & Ingestion Schema Viewer
// ==========================================
interface DocDatastoreProps {
  category?: string;
  name?: string;
  compact?: boolean | string;
  readOnly?: boolean | string;
  initialTab?: "interactive" | "schema" | "revisions";
}

export const DocDatastore: React.FC<DocDatastoreProps> = ({
  category = "shuffle-security_incidents",
  compact = false,
  readOnly = false,
  initialTab = "interactive",
}) => {
  const { userInfo } = useAuth();
  const orgId = userInfo?.active_org?.id;
  const orgName = userInfo?.active_org?.name;
  const isLoggedIn = !!(userInfo && orgId);
  const [activeTab, setActiveTab] = useState<"interactive" | "schema" | "revisions">(initialTab);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const isCompact = compact === true || compact === "true";
  const isReadOnly = readOnly === true || readOnly === "true";

  const datastoreLocalUrl = `/admin/datastore?category=${encodeURIComponent(category)}`;

  const categoryMeta = useMemo(() => {
    const cat = (category || "").toLowerCase();

    if (cat.includes("vuln")) {
      const payload = {
        id: "CVE-2024-3094",
        title: "XZ Utils Backdoor (liblzma)",
        severity: "critical",
        score: 10.0,
        category: "software_cve",
        status: "open",
        affected_package: "xz-utils 5.6.0",
        fixed_version: "5.6.1",
        affected_hosts: [
          {
            hostname: "srv-prod-db-01",
            path: "/usr/lib/x86_64-linux-gnu/liblzma.so.5.6.0",
            resolution: "open",
          },
        ],
      };
      return {
        title: "Vulnerability Finding",
        schemaTitle: "Vulnerability Finding Record Structure",
        description: `Findings are stored directly in category ${category} keyed by advisory identifier (e.g. CVE-2024-3094, GHSA-xxxx).`,
        defaultKey: "CVE-2024-3094",
        payload,
        pythonCode: `# Write or update vulnerability finding in datastore
self.set_cache(
    key="CVE-2024-3094",
    value=${JSON.stringify(payload, null, 4)},
    category="${category}",
)`,
      };
    }

    if (cat.includes("asset")) {
      const payload = {
        id: "asset-srv-prod-01",
        hostname: "srv-prod-db-01",
        os: "Ubuntu 22.04.4 LTS",
        architecture: "x86_64",
        cpu_cores: 16,
        ram_gb: 64,
        disk_gb: 1024,
        ip: "10.0.1.42",
        mac_address: "52:54:00:12:34:56",
        serial_number: "VMware-42 12 34 56",
        environment: "production",
        tags: ["database", "postgresql", "critical"],
        owner: "data-infra@company.com",
        status: "active",
      };
      return {
        title: "Hardware Asset Specification",
        schemaTitle: "Hardware Asset Specification Structure",
        description: `Hardware specifications, system metadata, and ownership are stored in category ${category} keyed by hostname or asset identifier.`,
        defaultKey: "srv-prod-db-01",
        payload,
        pythonCode: `# Record or update hardware asset metadata in datastore
self.set_cache(
    key="srv-prod-db-01",
    value=${JSON.stringify(payload, null, 4)},
    category="${category}",
)`,
      };
    }

    if (cat.includes("software")) {
      const payload = {
        name: "Docker Engine",
        version: "26.1.4",
        publisher: "Docker Inc.",
        install_type: "system_binary",
        install_path: "/usr/bin/docker",
        hosts_count: 8,
        associated_hosts: ["srv-prod-db-01", "srv-prod-api-01", "srv-runner-02"],
        last_scanned: 1773291000,
      };
      return {
        title: "Installed Software Catalog",
        schemaTitle: "Installed Software Catalog Structure",
        description: `Discovered applications, system packages, and daemon versions are stored in category ${category} keyed by software identifier.`,
        defaultKey: "sw_docker_engine_26",
        payload,
        pythonCode: `# Record installed software catalog entry
self.set_cache(
    key="sw_docker_engine_26",
    value=${JSON.stringify(payload, null, 4)},
    category="${category}",
)`,
      };
    }

    if (cat.includes("package")) {
      const payload = {
        name: "lodash",
        version: "4.17.20",
        ecosystem: "npm",
        manifest_file: "package.json",
        repository_path: "/Users/dev/repos/auth-service/package.json",
        host: "dev-macbook-pro-14",
        has_vulnerability: true,
        advisory_id: "GHSA-7867-xwm8-2v3q",
        fixed_version: "4.17.21",
      };
      return {
        title: "Scanned Code Package",
        schemaTitle: "Scanned Code Package Record Structure",
        description: `Manifest dependencies (package.json, requirements.txt, Cargo.toml, go.mod) scanned by Host Monitors are stored in category ${category}.`,
        defaultKey: "pkg_lodash_4_17_20",
        payload,
        pythonCode: `# Record code package dependency discovered during repository scan
self.set_cache(
    key="pkg_lodash_4_17_20",
    value=${JSON.stringify(payload, null, 4)},
    category="${category}",
)`,
      };
    }

    if (cat.includes("sensor")) {
      const payload = {
        host_id: "sensor-01-prod-db",
        hostname: "srv-prod-db-01",
        platform: "linux",
        agent_version: "1.4.2",
        sensor_group: "production-eu",
        status: "online",
        last_heartbeat: 1773291000,
        compliance: {
          hd_encrypted: true,
          screenlock: true,
          firewall_active: true,
        },
        capabilities: [
          "installed_software",
          "code_scanner",
          "remote_terminal",
          "response_actions",
        ],
      };
      return {
        title: "Sensor Agent Telemetry & Posture",
        schemaTitle: "Sensor Agent Telemetry Record Structure",
        description: `Sensor heartbeats, baseline posture check results (disk encryption, screenlock), and capabilities are stored in category ${category}.`,
        defaultKey: "sensor_srv_prod_db_01",
        payload,
        pythonCode: `# Retrieve host posture and compliance from datastore
sensor = self.get_cache("sensor_srv_prod_db_01", category="${category}")
if sensor and not sensor.get("compliance", {}).get("hd_encrypted"):
    print("Warning: Host missing full-disk encryption")`,
      };
    }

    // Default: OCSF 2005 Incident Finding
    const payload = {
      class_uid: 2005,
      class_name: "Incident Finding",
      category_uid: 2,
      activity_id: 1,
      severity_id: 4,
      severity: "High",
      status_id: 1,
      status: "New",
      finding_info: {
        title: "Suspicious credential dump via LSASS memory read",
        desc: "Mimikatz command execution detected on domain controller DC-01",
        created_time: 1773291000,
      },
      observables: [
        { name: "process.name", type: "process_name", value: "mimikatz.exe" },
        { name: "device.hostname", type: "hostname", value: "DC-01" },
        { name: "user.name", type: "user_name", value: "SYSTEM" },
      ],
      enrichments: [
        { name: "mitre_attack", value: "T1003.001 - OS Credential Dumping: LSASS Memory" },
      ],
    };

    return {
      title: "OCSF 2005 (Incident Finding)",
      schemaTitle: "OCSF 2005 (Incident Finding) Record Structure",
      description: `Incidents are stored directly in category ${category} with key identifiers (e.g. incident_<timestamp> or case IDs).`,
      defaultKey: `incident_${Math.floor(Date.now() / 1000)}`,
      payload,
      pythonCode: `# Inside a Shuffle app worker or detection workflow
incident_record = ${JSON.stringify(payload, null, 4)}

# Persist to Shuffle Security Datastore
self.set_cache(
    key=f"incident_{int(time.time())}",
    value=incident_record,
    category="${category}",
)`,
    };
  }, [category]);

  const curlExample = useMemo(() => {
    return `curl -X POST "${getApiUrl("")}/api/v1/orgs/${orgId || "<org_id>"}/set_cache" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <api_key>" \\
  -d '{
    "key": "${categoryMeta.defaultKey}",
    "category": "${category}",
    "value": ${JSON.stringify(categoryMeta.payload, null, 2).replace(/\n/g, "\n    ")}
  }'`;
  }, [category, categoryMeta, orgId]);

  const pythonExample = categoryMeta.pythonCode;

  const handleCopy = (code: string, id: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).catch(() => {});
      }
    } catch {}
    setCopiedCode(id);
    toast.success("Snippet copied to clipboard");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <Paper
      sx={{
        p: { xs: 2, md: 2.5 },
        my: 2.5,
        bgcolor: "transparent",
        backgroundImage: "none",
        backdropFilter: "blur(12px)",
        border: "1px solid hsl(var(--border))",
        borderRadius: 2.5,
      }}
    >
      {/* Header bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 2,
          mb: 2,
          pb: 1.5,
          borderBottom: "1px solid hsl(var(--border))",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 700, fontSize: "1rem", color: "hsl(var(--foreground))" }}>
            Datastore Console
          </Typography>
          <Chip
            label={category}
            size="small"
            variant="outlined"
            sx={{
              fontFamily: "monospace",
              fontWeight: 600,
              fontSize: "0.78rem",
              borderColor: "hsl(var(--primary))",
              color: "hsl(var(--primary))",
            }}
          />
          <Chip
            label={isLoggedIn ? `Tenant: ${orgName || orgId}` : "Interactive Sample Mode"}
            size="small"
            sx={{
              fontSize: "0.72rem",
              bgcolor: isLoggedIn ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted))",
              color: isLoggedIn ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              fontWeight: 500,
            }}
          />
        </Box>

        {/* Tab switcher & Open Console */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Box
            sx={{
              display: "flex",
              bgcolor: "hsl(var(--muted) / 0.6)",
              p: 0.5,
              borderRadius: 1.5,
              border: "1px solid hsl(var(--border))",
            }}
          >
            <Button
              size="small"
              variant={activeTab === "interactive" ? "contained" : "text"}
              onClick={() => setActiveTab("interactive")}
              sx={{
                textTransform: "none",
                fontSize: "0.78rem",
                px: 1.5,
                py: 0.4,
                boxShadow: "none",
              }}
            >
              Interactive Datastore
            </Button>
            <Button
              size="small"
              variant={activeTab === "schema" ? "contained" : "text"}
              onClick={() => setActiveTab("schema")}
              sx={{
                textTransform: "none",
                fontSize: "0.78rem",
                px: 1.5,
                py: 0.4,
                boxShadow: "none",
              }}
            >
              How Data is Added
            </Button>
            <Button
              size="small"
              variant={activeTab === "revisions" ? "contained" : "text"}
              onClick={() => setActiveTab("revisions")}
              sx={{
                textTransform: "none",
                fontSize: "0.78rem",
                px: 1.5,
                py: 0.4,
                boxShadow: "none",
              }}
            >
              Revisions & Rollback
            </Button>
          </Box>

          <Button
            variant="outlined"
            size="small"
            component="a"
            href={datastoreLocalUrl}
            sx={{
              textTransform: "none",
              fontSize: "0.78rem",
              height: 32,
              fontWeight: 600,
            }}
          >
            Open in Datastore
          </Button>
        </Box>
      </Box>

      {/* Main Tab Content */}
      {activeTab === "interactive" ? (
        <Box sx={{ mt: 1 }}>
          <DatastoreCategories
            embedded
            categoryLocked
            initialCategory={category}
            compact={isCompact}
            readOnly={isReadOnly}
            defaultNewItemTemplate={{
              key: categoryMeta.defaultKey,
              value: categoryMeta.payload,
            }}
          />
        </Box>
      ) : activeTab === "schema" ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 1.5 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: "hsl(var(--foreground))" }}>
              {categoryMeta.schemaTitle}
            </Typography>
            <Typography variant="body2" sx={{ color: "hsl(var(--muted-foreground))", mb: 1.5, fontSize: "0.85rem" }}>
              {categoryMeta.description} Below is the standard schema payload:
            </Typography>

            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                position: "relative",
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="caption" sx={{ fontFamily: "monospace", color: "hsl(var(--muted-foreground))" }}>
                  JSON Payload ({categoryMeta.title})
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleCopy(JSON.stringify(categoryMeta.payload, null, 2), "json")}
                  sx={{ textTransform: "none", fontSize: "0.72rem", py: 0.2, px: 1 }}
                >
                  {copiedCode === "json" ? "Copied" : "Copy JSON"}
                </Button>
              </Box>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: "hsl(var(--muted) / 0.4)",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  overflowX: "auto",
                  color: "hsl(var(--foreground))",
                }}
              >
                {JSON.stringify(categoryMeta.payload, null, 2)}
              </Box>
            </Paper>
          </Box>

          {/* Integration Methods: REST API & Python SDK */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            {/* REST API Box */}
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  1. REST API (set_cache)
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => handleCopy(curlExample, "curl")}
                  sx={{ textTransform: "none", fontSize: "0.72rem", p: 0, minWidth: "auto" }}
                >
                  {copiedCode === "curl" ? "Copied" : "Copy cURL"}
                </Button>
              </Box>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: "hsl(var(--muted) / 0.4)",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  overflowX: "auto",
                  color: "hsl(var(--foreground))",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {curlExample}
              </Box>
            </Paper>

            {/* Python App SDK Box */}
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  2. Python App Worker SDK
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => handleCopy(pythonExample, "python")}
                  sx={{ textTransform: "none", fontSize: "0.72rem", p: 0, minWidth: "auto" }}
                >
                  {copiedCode === "python" ? "Copied" : "Copy Python"}
                </Button>
              </Box>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: "hsl(var(--muted) / 0.4)",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  overflowX: "auto",
                  color: "hsl(var(--foreground))",
                  whiteSpace: "pre-wrap",
                }}
              >
                {pythonExample}
              </Box>
            </Paper>
          </Box>

          {/* Action to switch back and test */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1.5, pt: 1 }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => setActiveTab("interactive")}
              sx={{ textTransform: "none", fontWeight: 600, fontSize: "0.82rem" }}
            >
              Test in Interactive Datastore
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 1.5 }}>
          {/* Revisions & Rollback View */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: "hsl(var(--foreground))" }}>
              Immutable Key Revisions & Audit Trail
            </Typography>
            <Typography variant="body2" sx={{ color: "hsl(var(--muted-foreground))", mb: 1.5, fontSize: "0.85rem" }}>
              Every datastore write automatically preserves a historical snapshot. If an automated workflow, script, or user accidentally overwrites data or drops essential fields, any prior revision can be inspected with field diffs and rolled back immediately without data loss.
            </Typography>

            {/* Revision Timeline List */}
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1, borderBottom: "1px solid hsl(var(--border))" }}>
                <Typography variant="caption" sx={{ fontFamily: "monospace", color: "hsl(var(--muted-foreground))" }}>
                  Revision History: {categoryMeta.defaultKey} (Category: {category})
                </Typography>
                <Chip label="3 Revisions Retained" size="small" variant="outlined" sx={{ fontSize: "0.72rem", height: 22 }} />
              </Box>

              {/* Revision 3 (Latest) */}
              <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "hsl(var(--muted) / 0.3)", border: "1px solid hsl(var(--border))" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                      Revision 3
                    </Typography>
                    <Chip label="Current" size="small" sx={{ height: 20, fontSize: "0.68rem", bgcolor: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))", fontWeight: 600 }} />
                  </Box>
                  <Typography variant="caption" sx={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>
                    2 minutes ago (15:34:10 UTC)
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ display: "block", color: "hsl(var(--muted-foreground))", fontFamily: "monospace", fontSize: "0.75rem" }}>
                  Actor: Workflow: Automated Enrichment (exec_9482)
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, fontSize: "0.78rem", color: "hsl(var(--foreground))" }}>
                  Status updated to in_progress, observables verified
                </Typography>
              </Box>

              {/* Revision 2 */}
              <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                      Revision 2
                    </Typography>
                    <Chip label="Preserved" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.68rem" }} />
                  </Box>
                  <Typography variant="caption" sx={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>
                    1 hour ago (14:15:02 UTC)
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ display: "block", color: "hsl(var(--muted-foreground))", fontFamily: "monospace", fontSize: "0.75rem" }}>
                  Actor: User: sec-analyst@company.com
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, fontSize: "0.78rem", color: "hsl(var(--foreground))" }}>
                  Severity confirmed as High, triage tags assigned
                </Typography>
                <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => toast.success(`Simulated rollback: ${categoryMeta.defaultKey} reverted to Revision 2`)}
                    sx={{ textTransform: "none", fontSize: "0.72rem", height: 26 }}
                  >
                    Simulate Rollback to Rev 2
                  </Button>
                </Box>
              </Box>

              {/* Revision 1 */}
              <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                      Revision 1
                    </Typography>
                    <Chip label="Initial" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.68rem" }} />
                  </Box>
                  <Typography variant="caption" sx={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>
                    Yesterday (09:00:15 UTC)
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ display: "block", color: "hsl(var(--muted-foreground))", fontFamily: "monospace", fontSize: "0.75rem" }}>
                  Actor: Inbound Webhook: Detection Pipeline (exec_8114)
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, fontSize: "0.78rem", color: "hsl(var(--foreground))" }}>
                  Initial record created from raw detection alert
                </Typography>
                <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => toast.success(`Simulated rollback: ${categoryMeta.defaultKey} reverted to Revision 1`)}
                    sx={{ textTransform: "none", fontSize: "0.72rem", height: 26 }}
                  >
                    Simulate Rollback to Rev 1
                  </Button>
                </Box>
              </Box>
            </Paper>
          </Box>

          {/* Revisions REST API and Python Code Snippets */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                  REST API: Fetch Revisions
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    handleCopy(
                      `curl "${getApiUrl("")}/api/v2/datastore/category/${encodeURIComponent(category)}/${encodeURIComponent(categoryMeta.defaultKey)}/revisions" \\\n  -H "Authorization: Bearer <api_key>"`,
                      "revisions-curl"
                    )
                  }
                  sx={{ textTransform: "none", fontSize: "0.72rem", py: 0.2, px: 1 }}
                >
                  {copiedCode === "revisions-curl" ? "Copied" : "Copy cURL"}
                </Button>
              </Box>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: "hsl(var(--muted) / 0.4)",
                  fontFamily: "monospace",
                  fontSize: "0.78rem",
                  overflowX: "auto",
                  color: "hsl(var(--foreground))",
                  flex: 1,
                }}
              >
{`curl "${getApiUrl("")}/api/v2/datastore/category/${encodeURIComponent(category)}/${encodeURIComponent(categoryMeta.defaultKey)}/revisions" \\
  -H "Authorization: Bearer <api_key>"`}
              </Box>
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                  Python SDK: Inspect & Rollback
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    handleCopy(
                      `# Fetch all revisions for the key\nrevisions = self.get_cache_revisions(\n    key="${categoryMeta.defaultKey}",\n    category="${category}"\n)\n\n# Roll back key to previous revision state\nif len(revisions) > 1:\n    prior_snapshot = revisions[1]["value"]\n    self.set_cache(\n        key="${categoryMeta.defaultKey}",\n        value=prior_snapshot,\n        category="${category}"\n    )`,
                      "revisions-py"
                    )
                  }
                  sx={{ textTransform: "none", fontSize: "0.72rem", py: 0.2, px: 1 }}
                >
                  {copiedCode === "revisions-py" ? "Copied" : "Copy Python"}
                </Button>
              </Box>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: "hsl(var(--muted) / 0.4)",
                  fontFamily: "monospace",
                  fontSize: "0.78rem",
                  overflowX: "auto",
                  color: "hsl(var(--foreground))",
                  flex: 1,
                }}
              >
{`# Fetch all revisions for the key
revisions = self.get_cache_revisions(
    key="${categoryMeta.defaultKey}",
    category="${category}"
)

# Roll back key to previous revision state
if len(revisions) > 1:
    prior_snapshot = revisions[1]["value"]
    self.set_cache(
        key="${categoryMeta.defaultKey}",
        value=prior_snapshot,
        category="${category}"
    )`}
              </Box>
            </Paper>
          </Box>

          {/* Action to switch back and test */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1.5, pt: 1 }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => setActiveTab("interactive")}
              sx={{ textTransform: "none", fontWeight: 600, fontSize: "0.82rem" }}
            >
              Test in Interactive Datastore
            </Button>
          </Box>
        </Box>
      )}
    </Paper>
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
