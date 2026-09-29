import * as React from "react";
import { motion, LayoutGroup } from "framer-motion";

/**
 * SegmentedControl
 *
 * iOS-style pill with a smoothly sliding active background (shared layoutId).
 * Items can be tabs (`type: 'tab'`, default) OR action buttons
 * (`type: 'action'`) — actions just fire onClick and never become "active".
 * A vertical divider can be inserted with `{ type: 'divider' }`.
 *
 * IMPORTANT: This component is part of the Shuffle-MCPs library and MUST
 * work on host apps that do NOT have Tailwind installed. All styling is
 * therefore inline and only relies on shadcn-style HSL CSS custom
 * properties (`--foreground`, `--muted`, `--muted-foreground`, `--border`,
 * `--ring`). The companion `shuffle-mcp.css` file ships with `:where(:root)`
 * fallbacks for these tokens so the control still renders correctly when
 * the host hasn't defined them.
 */

export type SegmentedItem<V extends string = string> =
  | {
      type?: "tab";
      value: V;
      label: React.ReactNode;
      count?: number | string;
      title?: string;
      disabled?: boolean;
      dataTour?: string;
    }
  | {
      type: "action";
      /** Stable key, required since `value` is absent. */
      key: string;
      label: React.ReactNode;
      title?: string;
      disabled?: boolean;
      onClick: () => void;
      dataTour?: string;
    }
  | {
      type: "divider";
      key?: string;
    };

// Back-compat alias.
export type SegmentedOption<V extends string = string> = SegmentedItem<V>;

export interface SegmentedControlProps<V extends string = string> {
  options: SegmentedItem<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: "sm" | "md";
  /**
   * Visual style:
   * - "outline" (default): transparent track + hairline border, filled active pill.
   * - "filled": subtly filled track + no border, filled active pill (iOS-style).
   */
  variant?: "outline" | "filled";
  className?: string;
  ariaLabel?: string;
  /** Unique id so multiple segmented controls on a page do not share their pill. */
  layoutId?: string;
  /**
   * Optional node rendered INSIDE the pill container, after the options.
   * Use this to append host-framework elements (e.g. a rich tooltip-wrapped
   * spinner) so they line up with the other items while keeping their own
   * tooltip/interaction behaviour that the framework-agnostic control
   * cannot provide via the plain `title` attribute.
   */
  trailing?: React.ReactNode;
}

type SizeTokens = {
  containerPadding: string;
  fontSize: string;
  itemPaddingY: string;
  itemPaddingX: string;
  itemGap: string;
  countMin: string;
  countH: string;
  countPx: string;
  countFs: string;
  dividerH: string;
  dividerMx: string;
};

const SIZE: Record<"sm" | "md", SizeTokens> = {
  sm: {
    containerPadding: "2px",
    fontSize: "11px",
    itemPaddingY: "4px",
    itemPaddingX: "10px",
    itemGap: "6px",
    countMin: "16px",
    countH: "16px",
    countPx: "4px",
    countFs: "10px",
    dividerH: "16px",
    dividerMx: "2px",
  },
  md: {
    containerPadding: "4px",
    fontSize: "12px",
    itemPaddingY: "6px",
    itemPaddingX: "12px",
    itemGap: "6px",
    countMin: "18px",
    countH: "18px",
    countPx: "6px",
    countFs: "10px",
    dividerH: "20px",
    dividerMx: "4px",
  },
};

let uid = 0;
function useUniqueId(prefix: string) {
  const ref = React.useRef<string | undefined>(undefined);
  if (!ref.current) {
    uid += 1;
    ref.current = `${prefix}-${uid}`;
  }
  return ref.current;
}

export function SegmentedControl<V extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  variant = "outline",
  className,
  ariaLabel,
  layoutId,
  trailing,
}: SegmentedControlProps<V>) {
  const autoId = useUniqueId("segmented");
  const groupId = layoutId ?? autoId;
  const s = SIZE[size];

  return (
    <LayoutGroup id={groupId}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "2px",
          borderRadius: 9999,
          padding: s.containerPadding,
          fontSize: s.fontSize,
          border:
            variant === "outline"
              ? "1px solid hsl(var(--border))"
              : "1px solid transparent",
          background:
            variant === "outline"
              ? "transparent"
              : "hsl(var(--muted) / 0.4)",
        }}
      >
        {options.map((opt, i) => {
          if (opt.type === "divider") {
            return (
              <span
                key={opt.key ?? `divider-${i}`}
                aria-hidden
                style={{
                  width: 1,
                  height: s.dividerH,
                  margin: `0 ${s.dividerMx}`,
                  background: "hsl(var(--border))",
                  alignSelf: "center",
                }}
              />
            );
          }

          const isAction = opt.type === "action";
          const active = !isAction && opt.value === value;
          const key = isAction ? opt.key : opt.value;

          return (
            <button
              key={key}
              type="button"
              data-tour={opt.dataTour}
              data-active={active ? "true" : "false"}
              role={isAction ? "button" : "tab"}
              aria-selected={isAction ? undefined : active}
              title={opt.title}
              disabled={opt.disabled}
              onClick={() => {
                if (opt.disabled) return;
                if (isAction) opt.onClick();
                else onChange(opt.value);
              }}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: s.itemGap,
                padding: `${s.itemPaddingY} ${s.itemPaddingX}`,
                borderRadius: 9999,
                fontWeight: 500,
                fontSize: s.fontSize,
                background: "transparent",
                border: "none",
                cursor: opt.disabled ? "not-allowed" : "pointer",
                color: active
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--muted-foreground))",
                opacity: opt.disabled ? 0.5 : 1,
                transition: "color 200ms ease",
                outline: "none",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                if (!active && !opt.disabled) {
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "hsl(var(--foreground))";
                }
              }}
              onMouseLeave={(e) => {
                if (!active && !opt.disabled) {
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "hsl(var(--muted-foreground))";
                }
              }}
            >
              {active && (
                <motion.span
                  layoutId={`${groupId}-pill`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 9999,
                    background: "hsl(var(--muted))",
                    border: "1px solid hsl(var(--border))",
                  }}
                  initial={false}
                  transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 30,
                  }}
                />
              )}
              <span
                style={{
                  position: "relative",
                  zIndex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: s.itemGap,
                }}
              >
                {opt.label}
              </span>
              {!isAction && (typeof opt.count === "number" || typeof opt.count === "string") && (
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: s.countMin,
                    height: s.countH,
                    padding: `0 ${s.countPx}`,
                    fontSize: s.countFs,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    borderRadius: 6,
                    border: "1px solid hsl(var(--border) / 0.6)",
                    color: active
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--muted-foreground))",
                    background: "transparent",
                  }}
                >
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
        {trailing != null && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              alignSelf: "center",
            }}
          >
            {trailing}
          </span>
        )}
      </div>
    </LayoutGroup>
  );
}

export default SegmentedControl;
