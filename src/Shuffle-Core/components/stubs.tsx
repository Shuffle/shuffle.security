// @ts-nocheck
/**
 * Shared stubs / utilities used by FormInput.tsx and EditWorkflow.tsx.
 *
 * These were originally Shuffle Core internal modules that are NOT (yet)
 * ported into this library. Behavior may differ from production:
 *  - ReactJson:        replaced by <pre> JSON dump (no expand/collapse UI)
 *  - rehypeRaw:        undefined (raw HTML inside markdown will be escaped)
 *  - GetIconInfo:      returns null (app icons may not show in some lists)
 *  - collapseField:    identity (no field collapsing)
 *  - AngularWorkflow colors: simple HSL semantic fallbacks
 *  - CodeHandler/Img/OuterLink: minimal HTML fallbacks for react-markdown
 *  - Context:          only exposes themeMode/brandColor/supportEmail defaults
 *  - useInterval:      minimal { start, stop } shim (react-powerhooks compatible)
 *  - getTheme:         shadcn-style HSL semantic fallbacks
 */
import React from "react";

export const green = "hsl(140 60% 45%)";
export const yellow = "hsl(45 90% 55%)";
export const red = "hsl(0 75% 55%)";
export const grey = "hsl(0 0% 60%)";

export const CodeHandler = ({ value }: any) => (
  <pre style={{ background: "hsl(var(--muted))", padding: 12, borderRadius: 6, overflow: "auto" }}>
    <code>{String(value ?? "")}</code>
  </pre>
);
export const Img = (props: any) => <img {...props} alt={props?.alt || ""} />;
export const OuterLink = ({ href, children, ...rest }: any) => (
  <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
);

export const validateJson = (input: any) => {
  try {
    if (typeof input === "string") return { valid: true, result: JSON.parse(input) };
    return { valid: true, result: input };
  } catch {
    return { valid: false, result: input };
  }
};

export const collapseField = (value: any) => value;
export const GetIconInfo = (_app: any) => null;

export const ReactJson: React.FC<any> = (props) => (
  <pre
    style={{
      background: "hsl(var(--muted))",
      color: "hsl(var(--foreground))",
      padding: 12,
      borderRadius: 6,
      maxHeight: 400,
      overflow: "auto",
      fontSize: 12,
    }}
  >
    {(() => {
      try { return JSON.stringify(props?.src, null, 2); }
      catch { return String(props?.src); }
    })()}
  </pre>
);

export const Context = React.createContext<any>({
  themeMode: "dark",
  brandColor: "#FF6600",
  supportEmail: "support@shuffler.io",
});

export const useInterval = ({ duration, callback, startImmediate }: { duration: number; callback: () => void; startImmediate?: boolean }) => {
  const ref = React.useRef<any>(null);
  const savedCallback = React.useRef(callback);
  React.useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const start = React.useCallback(() => {
    if (ref.current) return;
    ref.current = setInterval(() => {
      savedCallback.current?.();
    }, duration);
  }, [duration]);

  const stop = React.useCallback(() => {
    if (ref.current) { clearInterval(ref.current); ref.current = null; }
  }, []);

  React.useEffect(() => {
    if (startImmediate) {
      start();
    }
    return () => stop();
  }, [startImmediate, start, stop]);

  return { start, stop };
};

export const getTheme = (themeMode: string = "dark", brandColor: string = "#FF6600") => ({
  palette: {
    mode: themeMode,
    primaryColor: brandColor,
    secondary: brandColor,
    inputColor: "hsl(var(--input))",
    surfaceColor: "hsl(var(--card))",
    backgroundColor: "hsl(var(--background))",
    textColor: "hsl(var(--foreground))",
    hoverColor: "hsl(var(--accent))",
    borderRadius: 8,
    defaultImage: "",
    jsonTheme: "monokai",
    reactJsonStyle: { padding: 12, borderRadius: 6 },
    jsonIconStyle: "circle",
    jsonCollapseStringsAfterLength: 100,
    textFieldStyle: {},
    DialogStyle: {
      color: "hsl(var(--foreground))",
      backgroundColor: "hsl(var(--card))",
      borderRadius: 8,
    },
  },
});

/**
 * EditWorkflow-specific stubs for sub-components not (yet) ported into
 * Shuffle-Core. They render a minimal placeholder so the surrounding UI keeps
 * working. Replace with real ports when needed.
 */
export const UsecaseSearch: React.FC<any> = () => (
  <div style={{ padding: 12, border: "1px dashed hsl(var(--border))", borderRadius: 6, color: "hsl(var(--muted-foreground))", fontSize: 12 }}>
    UsecaseSearch is not available in Shuffle-Core (stub).
  </div>
);

export const WorkflowGrid: React.FC<any> = () => (
  <div style={{ padding: 12, border: "1px dashed hsl(var(--border))", borderRadius: 6, color: "hsl(var(--muted-foreground))", fontSize: 12 }}>
    WorkflowGrid is not available in Shuffle-Core (stub).
  </div>
);

export const WorkflowTemplatePopup: React.FC<any> = () => null;

export const WorkflowValidationTimeline: React.FC<any> = () => null;

/** Stub of MUI v4 useStyles({ notchedOutline }) result. */
export const useStyles = () => ({ notchedOutline: "" });
