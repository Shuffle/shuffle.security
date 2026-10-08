/**
 * ShuffleMcpThemeProvider
 *
 * - Pins MUI defaults (`size="small"`) so call sites never thread sizing.
 * - Bridges the host app's light/dark scheme into MUI (`palette.mode`) and
 *   into our HSL token system (the scoped `.dark` class).
 * - Exposes a React Context (`ShuffleMcpThemeContext`) so internal raw
 *   components — and views that compose other library components without
 *   going through the public wrapped exports — see the resolved mode.
 * - Stamps the scope className onto MUI portaled paper (Drawer, Dialog,
 *   Menu, Popover, Tooltip), so portals rendered into <body> still resolve
 *   our `hsl(var(--…))` tokens against the pinned theme instead of the
 *   host's `<html>`.
 *
 * Wrap your MCP usage at any level:
 *
 *     <ShuffleMcpThemeProvider mode="dark">
 *       <ShuffleMCP ... />
 *     </ShuffleMcpThemeProvider>
 */
import React from "react";
import { ThemeProvider, createTheme, useTheme as useMuiTheme } from "@mui/material";

export type ShuffleTokenStyle = React.CSSProperties & Record<`--${string}`, string>;

export const lightTokenStyle: ShuffleTokenStyle = {
  "--background": "0 0% 98%",
  "--background-elevated": "0 0% 100%",
  "--background-surface": "0 0% 96%",
  "--foreground": "0 0% 9%",
  "--foreground-muted": "0 0% 40%",
  "--card": "0 0% 100%",
  "--card-foreground": "0 0% 9%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "0 0% 9%",
  "--primary": "22 100% 50%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "0 0% 94%",
  "--secondary-foreground": "0 0% 9%",
  "--muted": "0 0% 94%",
  "--muted-foreground": "0 0% 45%",
  "--accent": "0 0% 92%",
  "--accent-foreground": "0 0% 9%",
  "--destructive": "0 84% 60%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "0 0% 80%",
  "--border-subtle": "0 0% 86%",
  "--input": "0 0% 94%",
  "--ring": "22 100% 50%",
  "--severity-critical": "0 84% 60%",
  "--severity-high": "12 92% 52%",
  "--severity-medium": "45 93% 47%",
  "--severity-low": "142 71% 45%",
  "--severity-info": "210 100% 56%",
  "--sidebar-background": "0 0% 97%",
  "--sidebar-foreground": "0 0% 9%",
  "--sidebar-accent": "0 0% 94%",
  "--sidebar-accent-foreground": "0 0% 9%",
  "--sidebar-border": "0 0% 80%",
  "--gradient-card": "linear-gradient(145deg, hsl(0 0% 100%) 0%, hsl(0 0% 98%) 100%)",
};

export const darkTokenStyle: ShuffleTokenStyle = {
  ...lightTokenStyle,
  "--background": "0 0% 10%",
  "--background-elevated": "0 0% 13%",
  "--background-surface": "0 0% 16%",
  "--foreground": "0 0% 100%",
  "--foreground-muted": "0 0% 60%",
  "--card": "0 0% 13%",
  "--card-foreground": "0 0% 100%",
  "--popover": "0 0% 12%",
  "--popover-foreground": "0 0% 100%",
  "--secondary": "0 0% 18%",
  "--secondary-foreground": "0 0% 100%",
  "--muted": "0 0% 16%",
  "--muted-foreground": "0 0% 50%",
  "--accent": "0 0% 20%",
  "--accent-foreground": "0 0% 100%",
  "--destructive": "0 84% 60%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "0 0% 20%",
  "--border-subtle": "0 0% 16%",
  "--input": "0 0% 18%",
  "--sidebar-background": "0 0% 9%",
  "--sidebar-foreground": "0 0% 100%",
  "--sidebar-accent": "0 0% 16%",
  "--sidebar-accent-foreground": "0 0% 100%",
  "--sidebar-border": "0 0% 16%",
  "--gradient-card": "linear-gradient(145deg, hsl(0 0% 14%) 0%, hsl(0 0% 12%) 100%)",
};

export const SHUFFLE_MCP_BASE_CSS = `
:where(:root) {
  --background: 0 0% 10%;
  --background-elevated: 0 0% 13%;
  --background-surface: 0 0% 16%;
  --foreground: 0 0% 98%;
  --card: 0 0% 13%;
  --card-foreground: 0 0% 100%;
  --popover: 0 0% 13%;
  --popover-foreground: 0 0% 100%;
  --primary: 22 100% 50%;
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 16%;
  --secondary-foreground: 0 0% 100%;
  --muted: 0 0% 16%;
  --muted-foreground: 0 0% 65%;
  --accent: 22 100% 50%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --border: 0 0% 20%;
  --input: 0 0% 16%;
  --ring: 22 100% 50%;
  --severity-info: 210 90% 60%;
  --severity-low: 142 70% 45%;
  --severity-medium: 38 92% 50%;
  --severity-high: 12 92% 52%;
  --severity-critical: 0 84% 60%;
  --infra-email: 210 90% 60%;
}

.shuffle-mcp-scope,
.shuffle-mcp-scope *,
.shuffle-mcp-scope *::before,
.shuffle-mcp-scope *::after {
  box-sizing: border-box;
}

.shuffle-mcp-scope {
  color: hsl(var(--foreground));
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  isolation: isolate;
}

:root:not(.dark) .shuffle-mcp-scope:not(.dark),
html:not(.dark) .shuffle-mcp-scope:not(.dark),
body:not(.dark) .shuffle-mcp-scope:not(.dark),
.shuffle-mcp-scope.light,
[data-shuffle-mode="light"] .shuffle-mcp-scope,
[data-shuffle-mode="light"] {
  --background: 0 0% 98%;
  --background-elevated: 0 0% 100%;
  --background-surface: 0 0% 96%;
  --foreground: 0 0% 9%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 9%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 9%;
  --secondary: 0 0% 94%;
  --secondary-foreground: 0 0% 9%;
  --muted: 0 0% 94%;
  --muted-foreground: 0 0% 40%;
  --accent: 0 0% 92%;
  --accent-foreground: 0 0% 9%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 100%;
  --border: 0 0% 78%;
  --input: 0 0% 94%;
  --severity-info: 215 90% 45%;
  --severity-low: 142 72% 31%;
  --severity-medium: 38 92% 33%;
  --severity-high: 12 88% 46%;
  --severity-critical: 0 72% 51%;
  --infra-email: 215 90% 45%;
}

.dark .shuffle-mcp-scope:not(.light),
.shuffle-mcp-scope.dark,
[data-shuffle-mode="dark"] .shuffle-mcp-scope,
[data-shuffle-mode="dark"] {
  --background: 0 0% 10%;
  --background-elevated: 0 0% 13%;
  --background-surface: 0 0% 16%;
  --foreground: 0 0% 100%;
  --card: 0 0% 13%;
  --card-foreground: 0 0% 100%;
  --popover: 0 0% 12%;
  --popover-foreground: 0 0% 100%;
  --secondary: 0 0% 18%;
  --secondary-foreground: 0 0% 100%;
  --muted: 0 0% 16%;
  --muted-foreground: 0 0% 50%;
  --accent: 0 0% 20%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --border: 0 0% 20%;
  --input: 0 0% 18%;
}

.MuiTooltip-tooltip.shuffle-mcp-scope {
  background-color: hsl(var(--popover)) !important;
  color: hsl(var(--popover-foreground)) !important;
  border: 1px solid hsl(var(--border)) !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
  border-radius: 8px !important;
}

.MuiTooltip-tooltip.shuffle-mcp-scope .MuiTooltip-arrow {
  color: hsl(var(--popover)) !important;
}

.MuiTooltip-tooltip.shuffle-mcp-scope .MuiTooltip-arrow::before {
  border: 1px solid hsl(var(--border)) !important;
  box-sizing: border-box;
}

@keyframes singul-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes singul-skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
`;

export const ensureShuffleMcpStyles = (): void => {
  if (typeof document === "undefined") return;
  const STYLE_ID = "shuffle-mcp-injected-styles";
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SHUFFLE_MCP_BASE_CSS;
  document.head.appendChild(style);
};

if (typeof document !== "undefined") {
  ensureShuffleMcpStyles();
}

export type ShuffleMcpColorMode = "light" | "dark" | "auto";

const readHtmlDarkClass = (): boolean => {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.classList.contains("dark") ||
    (Boolean(document.body) && document.body.classList.contains("dark"))
  );
};

/**
 * Resolve "auto" theme by inspecting the nearest ancestor that already
 * declares a Shuffle theme scope (set by either ShuffleCoreThemeProvider or
 * ShuffleMcpThemeProvider). This is what makes a pinned Shuffle-Core subtree
 * cascade into a Shuffle-MCPs subtree (and vice versa) even across the
 * package boundary where React contexts cannot be shared.
 */
const readAncestorDark = (anchor: Element | null): boolean | null => {
  if (!anchor || typeof document === "undefined") return null;
  // anchorRef is placed inside this provider's own root element ([data-shuffle-core-root] / [data-shuffle-mcp-root]).
  // We must skip this provider's own element and inspect true ancestors strictly above it.
  const ownRoot = anchor.closest('[data-shuffle-core-root], [data-shuffle-mcp-root]');
  const start = ownRoot ? ownRoot.parentElement : anchor.parentElement;
  if (!start) return null;
  const scoped = start.closest('[data-shuffle-mode="dark"], [data-shuffle-mode="light"]');
  if (scoped) return scoped.getAttribute("data-shuffle-mode") === "dark";
  const darkAncestor = start.closest(".dark");
  if (darkAncestor) return true;
  return null;
};

const useAutoDarkClass = (enabled: boolean, anchorRef: React.RefObject<HTMLElement | null>): boolean => {
  const [isDark, setIsDark] = React.useState<boolean>(() => (enabled ? readHtmlDarkClass() : false));
  React.useLayoutEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const recompute = () => {
      const ancestor = readAncestorDark(anchorRef.current);
      setIsDark(ancestor !== null ? ancestor : readHtmlDarkClass());
    };
    recompute();
    const observer = new MutationObserver(recompute);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    const ownRoot = anchorRef.current?.closest('[data-shuffle-core-root], [data-shuffle-mcp-root]');
    let node: HTMLElement | null = ownRoot ? ownRoot.parentElement : anchorRef.current?.parentElement ?? null;
    while (node) {
      observer.observe(node, { attributes: true, attributeFilter: ["class", "data-shuffle-mode"] });
      node = node.parentElement;
    }
    window.addEventListener("shuffle:theme-change", recompute);
    return () => {
      observer.disconnect();
      window.removeEventListener("shuffle:theme-change", recompute);
    };
  }, [enabled, anchorRef]);
  return isDark;
};

interface ShuffleMcpThemeContextValue {
  /** Mode requested by the caller. */
  mode: ShuffleMcpColorMode;
  /** Resolved boolean (auto → reflects current html.dark). */
  isDark: boolean;
  /** className to stamp on portaled MUI paper so HSL tokens resolve correctly. */
  scopeClassName: string;
}

export const ShuffleMcpThemeContext = React.createContext<ShuffleMcpThemeContextValue | null>(null);

/** Hook for internal components to read the resolved theme. */
export const useShuffleMcpTheme = (): ShuffleMcpThemeContextValue | null =>
  React.useContext(ShuffleMcpThemeContext);

const buildComponentOverrides = (scopeClassName: string, scopeStyle: ShuffleTokenStyle) => ({
  MuiButton: { defaultProps: { size: "small" as const } },
  MuiAutocomplete: {
    defaultProps: {
      slotProps: {
        popper: { className: scopeClassName, style: scopeStyle, sx: { zIndex: 10040 } },
        paper: { className: scopeClassName, style: scopeStyle },
      },
    },
  },
  MuiPopper: {
    defaultProps: {
      className: scopeClassName,
      style: scopeStyle,
    },
    styleOverrides: {
      root: { zIndex: 10040 },
    },
  },
  MuiInputBase: {
    styleOverrides: {
      root: { color: "hsl(var(--foreground))" },
      input: {
        color: "hsl(var(--foreground))",
        "&::placeholder": { color: "hsl(var(--muted-foreground))", opacity: 1 },
      },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        backgroundColor: "hsl(var(--input))",
        color: "hsl(var(--foreground))",
        borderRadius: 8,
        "& .MuiOutlinedInput-notchedOutline": { borderColor: "hsl(var(--border))" },
        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "hsl(var(--border))" },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "hsl(var(--primary))" },
        "&.Mui-disabled": {
          backgroundColor: "hsl(var(--muted))",
          color: "hsl(var(--muted-foreground))",
        },
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: "none",
        backgroundColor: "hsl(var(--card))",
        color: "hsl(var(--card-foreground))",
      },
    },
  },
  // ---- Portaled surfaces: stamp scopeClassName and scopeStyle so HSL tokens resolve ----
  MuiDrawer: {
    defaultProps: { slotProps: { paper: { className: scopeClassName, style: scopeStyle } } },
    styleOverrides: {
      paper: {
        backgroundColor: "hsl(var(--sidebar-background, var(--card)))",
        color: "hsl(var(--sidebar-foreground, var(--foreground)))",
        borderRight: "1px solid hsl(var(--sidebar-border, var(--border)))",
      },
    },
  },
  MuiDialog: {
    defaultProps: { slotProps: { paper: { className: scopeClassName, style: scopeStyle } } },
    styleOverrides: {
      root: { zIndex: 10010 },
      paper: {
        backgroundColor: "hsl(var(--card))",
        color: "hsl(var(--card-foreground))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.2)",
      },
    },
  },
  MuiMenu: {
    defaultProps: { slotProps: { paper: { className: scopeClassName, style: scopeStyle } } },
    styleOverrides: {
      root: { zIndex: 10040 },
      paper: {
        backgroundColor: "hsl(var(--popover))",
        color: "hsl(var(--popover-foreground))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
      },
    },
  },
  MuiPopover: {
    defaultProps: { slotProps: { paper: { className: scopeClassName, style: scopeStyle } } },
    styleOverrides: {
      root: { zIndex: 10040 },
      paper: {
        backgroundColor: "hsl(var(--popover))",
        color: "hsl(var(--popover-foreground))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
      },
    },
  },
  MuiTooltip: {
    defaultProps: {
      slotProps: {
        tooltip: { className: scopeClassName, style: scopeStyle },
        // Render above app drawers, dialogs, menus, and popovers.
        popper: { sx: { zIndex: 10050 } },
      },
    },
    styleOverrides: {
      tooltip: {
        backgroundColor: "hsl(var(--popover))",
        color: "hsl(var(--popover-foreground))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
        fontSize: "0.75rem",
        borderRadius: 8,
      },
      arrow: {
        color: "hsl(var(--popover))",
        "&::before": {
          border: "1px solid hsl(var(--border))",
          boxSizing: "border-box",
        },
      },
    },
  },
  MuiDivider: {
    styleOverrides: { root: { borderColor: "hsl(var(--border))" } },
  },
});

export interface ShuffleMcpThemeProviderProps {
  children?: React.ReactNode;
  /**
   * Color mode for the wrapped subtree.
   * - `"auto"` (default) — follow the host page's `.dark` class on `<html>`.
   * - `"light"` / `"dark"` — pin the subtree (and any portals rendered from
   *   within it) to that scheme.
   */
  mode?: ShuffleMcpColorMode;
}

export const ShuffleMcpThemeProvider: React.FC<ShuffleMcpThemeProviderProps> = ({
  children,
  mode = "auto",
}) => {
  const parent = useMuiTheme();
  const parentCtx = useShuffleMcpTheme();
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const autoIsDark = useAutoDarkClass(mode === "auto", anchorRef);
  const effectiveDark = mode === "auto" ? autoIsDark : mode === "dark";

  const sameAsParent =
    parentCtx !== null && parentCtx.isDark === effectiveDark;

  const scopeClassName = effectiveDark ? "shuffle-mcp-scope dark" : "shuffle-mcp-scope light";
  const resolvedModeAttr = effectiveDark ? "dark" : "light";
  const scopeStyle = effectiveDark ? darkTokenStyle : lightTokenStyle;

  const merged = React.useMemo(
    () =>
      createTheme({
        ...parent,
        palette: {
          ...(parent as any).palette,
          mode: effectiveDark ? "dark" : "light",
        },
        components: {
          ...(parent as any).components,
          ...buildComponentOverrides(scopeClassName, scopeStyle),
        },
      }),
    [parent, effectiveDark, scopeClassName, scopeStyle],
  );

  const ctxValue = React.useMemo<ShuffleMcpThemeContextValue>(
    () => ({ mode, isDark: effectiveDark, scopeClassName }),
    [mode, effectiveDark, scopeClassName],
  );

  React.useEffect(() => {
    ensureShuffleMcpStyles();
  }, []);

  if (sameAsParent) {
    return (
      <ShuffleMcpThemeContext.Provider value={ctxValue}>
        <span ref={anchorRef} style={{ display: "none" }} aria-hidden />
        {children}
      </ShuffleMcpThemeContext.Provider>
    );
  }

  return (
    <ShuffleMcpThemeContext.Provider value={ctxValue}>
      <ThemeProvider theme={merged}>
        <div className={scopeClassName} style={scopeStyle} data-shuffle-mode={resolvedModeAttr} data-shuffle-mcp-root>
          <span ref={anchorRef} style={{ display: "none" }} aria-hidden />
          {children}
        </div>
      </ThemeProvider>
    </ShuffleMcpThemeContext.Provider>
  );
};

export default ShuffleMcpThemeProvider;
