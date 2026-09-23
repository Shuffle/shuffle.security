/**
 * ShuffleCoreThemeProvider
 *
 * - Pins MUI component defaults (`size="small"`).
 * - Bridges the host app's light/dark scheme into MUI (`palette.mode`) and
 *   into our HSL token system (scoped `.dark` class).
 * - Exposes `ShuffleCoreThemeContext` so internal raw components — and
 *   views that compose other Shuffle-Core components without going through
 *   the public wrapped exports — see the resolved mode.
 * - Stamps the scope className onto MUI portaled paper (Drawer, Dialog,
 *   Menu, Popover, Tooltip), so portals rendered into <body> still resolve
 *   our `hsl(var(--…))` tokens against the pinned theme.
 */
import React from "react";
import { ThemeProvider, createTheme, useTheme as useMuiTheme } from "@mui/material";
// Pull in the Shuffle-Core HSL token stylesheet so ANY consumer that wraps
// itself in this provider (or imports anything that does — e.g.
// `@/Shuffle-Core/onboarding`) automatically gets `.shuffle-core-scope[.dark]`
// tokens. Previously only `src/Shuffle-Core/index.tsx` imported the CSS, so
// sub-entry points like `onboarding/index.tsx` rendered unstyled when the
// host hadn't separately loaded it. Bundlers de-dupe the import.
import "../shuffle-core.css";


export type ShuffleColorMode = "light" | "dark" | "auto";

const readHtmlDarkClass = (): boolean => {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.classList.contains("dark") ||
    (Boolean(document.body) && document.body.classList.contains("dark"))
  );
};

/**
 * Resolve "auto" theme by inspecting the nearest ancestor that already
 * declares a Shuffle theme scope. Makes a pinned scope cascade across the
 * Shuffle-Core / Shuffle-MCPs package boundary (React context can't, since
 * each package ships its own copy).
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
  // Keep the first server and browser render identical. The layout effect
  // resolves the host theme immediately after hydration.
  const [isDark, setIsDark] = React.useState<boolean>(false);
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

interface ShuffleCoreThemeContextValue {
  mode: ShuffleColorMode;
  isDark: boolean;
  scopeClassName: string;
}

type ShuffleTokenStyle = React.CSSProperties & Record<`--${string}`, string>;

const lightTokenStyle: ShuffleTokenStyle = {
  "--background": "0 0% 98%",
  "--background-elevated": "0 0% 100%",
  "--background-surface": "0 0% 96%",
  "--foreground": "0 0% 9%",
  "--foreground-muted": "0 0% 40%",
  "--card": "0 0% 100%",
  "--card-foreground": "0 0% 9%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "0 0% 9%",
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

const darkTokenStyle: ShuffleTokenStyle = {
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

export const ShuffleCoreThemeContext = React.createContext<ShuffleCoreThemeContextValue | null>(null);

export const useShuffleCoreTheme = (): ShuffleCoreThemeContextValue | null =>
  React.useContext(ShuffleCoreThemeContext);

const buildComponentOverrides = (scopeClassName: string, scopeStyle: ShuffleTokenStyle) => ({
  MuiButton: { defaultProps: { size: "small" as const } },
  MuiAutocomplete: {
    defaultProps: {
      slotProps: { popper: { sx: { zIndex: 10020 } } },
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
  MuiInputLabel: {
    styleOverrides: {
      root: {
        color: "hsl(var(--muted-foreground))",
        "&.Mui-focused": { color: "hsl(var(--primary))" },
      },
    },
  },
  MuiFormLabel: {
    styleOverrides: {
      root: {
        color: "hsl(var(--muted-foreground))",
        "&.Mui-focused": { color: "hsl(var(--primary))" },
      },
    },
  },
  MuiTypography: {
    styleOverrides: {
      root: {
        color: "inherit",
        "&.MuiTypography-colorTextSecondary": { color: "hsl(var(--muted-foreground))" },
      },
    },
  },
  MuiDivider: {
    styleOverrides: { root: { borderColor: "hsl(var(--border))" } },
  },
  MuiCheckbox: {
    styleOverrides: {
      root: {
        color: "hsl(var(--muted-foreground))",
        "&.Mui-checked": { color: "hsl(var(--primary))" },
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
  MuiDrawer: {
    defaultProps: { slotProps: { paper: { className: scopeClassName, style: scopeStyle } } },
    styleOverrides: {
      paper: {
        backgroundColor: "hsl(var(--sidebar-background))",
        color: "hsl(var(--sidebar-foreground))",
        borderColor: "hsl(var(--sidebar-border))",
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
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: "none",
        backgroundColor: "hsl(var(--card))",
        color: "hsl(var(--card-foreground))",
      },
    },
  },
  MuiMenu: {
    defaultProps: { slotProps: { paper: { className: scopeClassName, style: scopeStyle } } },
    styleOverrides: {
      root: { zIndex: 10020 },
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
      root: { zIndex: 10020 },
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
      // Match the host MUI theme: tooltips need to render above Drawers /
      // Popovers / Dialogs that use z-index 9999 in this app (e.g. the
      // usecase config drawer + sidebar popovers). MUI's default popper
      // z-index (1500) puts them UNDER those panels.
      slotProps: {
        tooltip: { className: scopeClassName, style: scopeStyle },
        popper: { sx: { zIndex: 10030 } },
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
});

export interface ShuffleCoreThemeProviderProps {
  children: React.ReactNode;
  /**
   * - `"auto"` (default) — follow the host page's `.dark` class on `<html>`.
   * - `"light"` / `"dark"` — pin the subtree (and portals from within it).
   */
  mode?: ShuffleColorMode;
}

export const ShuffleCoreThemeProvider: React.FC<ShuffleCoreThemeProviderProps> = ({
  children,
  mode = "auto",
}) => {
  const parent = useMuiTheme();
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const autoIsDark = useAutoDarkClass(mode === "auto", anchorRef);
  const effectiveDark = mode === "auto" ? autoIsDark : mode === "dark";

  const scopeClassName = effectiveDark ? "shuffle-core-scope dark" : "shuffle-core-scope light";
  const resolvedModeAttr = effectiveDark ? "dark" : "light";
  const scopeStyle = effectiveDark ? darkTokenStyle : lightTokenStyle;

  const merged = React.useMemo(
    () => {
      // Shuffle-Core legacy views (Billing, etc.) read a bunch of custom
      // palette keys that aren't part of MUI. Provide safe defaults wired to
      // our HSL token system so those views don't crash when the host app
      // didn't pre-populate them.
      const shuffleDefaults = {
        platformColor: "hsl(var(--background))",
        surfaceColor: "hsl(var(--background-surface))",
        inputColor: "hsl(var(--input))",
        cardBackgroundColor: "hsl(var(--card))",
        cardHoverColor: "hsl(var(--accent))",
        defaultBorder: "1px solid hsl(var(--border))",
        scrollbarColor: "hsl(var(--muted))",
        scrollbarColorTransparent: "transparent",
        slateGrayColor: "hsl(var(--muted-foreground))",
        green: "hsl(142 71% 45%)",
        textFieldStyle: { backgroundColor: "hsl(var(--input))" },
        DialogStyle: { backgroundColor: "hsl(var(--card))" },
      };
      const parentPalette = (parent as any).palette || {};
      return createTheme({
        ...parent,
        palette: {
          ...shuffleDefaults,
          ...parentPalette,
          textFieldStyle: { ...shuffleDefaults.textFieldStyle, ...(parentPalette.textFieldStyle || {}) },
          DialogStyle: { ...shuffleDefaults.DialogStyle, ...(parentPalette.DialogStyle || {}) },
          mode: effectiveDark ? "dark" : "light",
        },
        components: {
          ...(parent as any).components,
          ...buildComponentOverrides(scopeClassName, scopeStyle),
        },
      });
    },
    [parent, effectiveDark, scopeClassName, scopeStyle],
  );

  const ctxValue = React.useMemo<ShuffleCoreThemeContextValue>(
    () => ({ mode, isDark: effectiveDark, scopeClassName }),
    [mode, effectiveDark, scopeClassName],
  );

  return (
    <ShuffleCoreThemeContext.Provider value={ctxValue}>
      <ThemeProvider theme={merged}>
        <div className={scopeClassName} style={scopeStyle} data-shuffle-mode={resolvedModeAttr} data-shuffle-core-root>
          <span ref={anchorRef} style={{ display: "none" }} aria-hidden />
          {children}
        </div>
      </ThemeProvider>
    </ShuffleCoreThemeContext.Provider>
  );
};
