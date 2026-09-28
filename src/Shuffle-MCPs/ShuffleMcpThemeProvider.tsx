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
// Pull in the Shuffle-MCPs HSL token stylesheet so ANY consumer that wraps
// itself in this provider (or imports anything that does) automatically gets
// `.shuffle-mcp-scope[.dark]` tokens — even when entering through a sub-entry
// point that doesn't import the top-level `src/Shuffle-MCPs/index.ts`.
// Bundlers de-dupe the import.
import "./shuffle-mcp.css";


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

const buildComponentOverrides = (scopeClassName: string) => ({
  MuiButton: { defaultProps: { size: "small" as const } },
  MuiAutocomplete: {
    defaultProps: {
      slotProps: {
        popper: { className: scopeClassName, sx: { zIndex: 10040 } },
        paper: { className: scopeClassName },
      },
    },
  },
  MuiPopper: {
    defaultProps: {
      className: scopeClassName,
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
  // ---- Portaled surfaces: stamp scopeClassName so HSL tokens resolve ----
  MuiDrawer: {
    defaultProps: { slotProps: { paper: { className: scopeClassName } } },
    styleOverrides: {
      paper: {
        backgroundColor: "hsl(var(--sidebar-background, var(--card)))",
        color: "hsl(var(--sidebar-foreground, var(--foreground)))",
        borderRight: "1px solid hsl(var(--sidebar-border, var(--border)))",
      },
    },
  },
  MuiDialog: {
    defaultProps: { slotProps: { paper: { className: scopeClassName } } },
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
    defaultProps: { slotProps: { paper: { className: scopeClassName } } },
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
    defaultProps: { slotProps: { paper: { className: scopeClassName } } },
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
        tooltip: { className: scopeClassName },
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
          ...buildComponentOverrides(scopeClassName),
        },
      }),
    [parent, effectiveDark, scopeClassName],
  );

  const ctxValue = React.useMemo<ShuffleMcpThemeContextValue>(
    () => ({ mode, isDark: effectiveDark, scopeClassName }),
    [mode, effectiveDark, scopeClassName],
  );

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
        <div className={scopeClassName} data-shuffle-mode={resolvedModeAttr} data-shuffle-mcp-root>
          <span ref={anchorRef} style={{ display: "none" }} aria-hidden />
          {children}
        </div>
      </ThemeProvider>
    </ShuffleMcpThemeContext.Provider>
  );
};

export default ShuffleMcpThemeProvider;
