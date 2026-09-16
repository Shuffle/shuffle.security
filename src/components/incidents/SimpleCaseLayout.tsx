import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Box, Button, Typography } from "@mui/material";
import {
  FileText,
  ListChecks,
  SlidersHorizontal,
  Fingerprint,
  Network,
  Mail,
} from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import type { IncidentTask } from "@/config/ocsfIncidentSchema";
import type { LinkedIncidentSummary } from "@/hooks/useRelatedIncidents";
import { groupTasksByCategory } from "./SimpleTasksView";

const TIMELINE_WIDTH_STORAGE_KEY = "shuffle_simple_timeline_width";
const DEFAULT_TIMELINE_WIDTH = 260;
const MIN_TIMELINE_WIDTH = 180;
const MAX_TIMELINE_WIDTH = 500;

interface SimpleCaseLayoutProps {
  narrativeLabel: string;
  overview?: ReactNode;
  emailThread?: ReactNode;
  emailThreadCount?: number;
  narrative: ReactNode;
  timeline: ReactNode;
  /** Filter/count control rendered on the same line as the Timeline title. */
  timelineActions?: ReactNode;
  tasks: ReactNode;
  /** Optional custom fields block, rendered below Tasks when the case has any. */
  customFields?: ReactNode;
  observables: ReactNode;
  correlations: ReactNode;
  /** Configuration controls (share access, actions menu) shown above Overview. */
  contentsActions?: ReactNode;
  taskItems: IncidentTask[];
  customFieldsCount?: number;
  observableCount: number;
  correlationCount: number;
  /** Incidents merged into this one, shown at the bottom of the Overview rail. */
  relatedIncidents?: LinkedIncidentSummary[];
  /** Closure details shown in the Overview rail once the case is resolved. */
  resolution?: {
    reasonLabel: string;
    notes?: string;
    resolvedBy?: string;
    resolvedAt?: number;
  };
}

const SECTIONS = [
  "emailThread",
  "narrative",
  "tasks",
  "customFields",
  "observables",
  "correlations",
] as const;
type SectionKey = (typeof SECTIONS)[number];

const SECTION_ICONS: Record<SectionKey, typeof FileText> = {
  emailThread: Mail,
  narrative: FileText,
  tasks: ListChecks,
  customFields: SlidersHorizontal,
  observables: Fingerprint,
  correlations: Network,
};

const getScrollContainer = (el: HTMLElement | null): HTMLElement | null => {
  let parent = el?.parentElement;
  while (
    parent &&
    parent !== document.body &&
    parent !== document.documentElement
  ) {
    const style = window.getComputedStyle(parent);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }
  const main = el?.closest("main");
  if (main instanceof HTMLElement) return main;
  return null;
};

export const SimpleCaseLayout = ({
  narrativeLabel,
  overview,
  emailThread,
  emailThreadCount,
  narrative,
  timeline,
  timelineActions,
  tasks,
  customFields,
  observables,
  correlations,
  contentsActions,
  taskItems,
  customFieldsCount,
  observableCount,
  correlationCount,
  relatedIncidents,
  resolution,
}: SimpleCaseLayoutProps) => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>(() =>
    emailThread ? "emailThread" : "narrative",
  );
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const refs = useRef<Record<SectionKey, HTMLElement | null>>({
    emailThread: null,
    narrative: null,
    tasks: null,
    customFields: null,
    observables: null,
    correlations: null,
  });

  const categoryGroups = useMemo(
    () => groupTasksByCategory(taskItems),
    [taskItems],
  );

  useEffect(() => {
    if (!emailThread && activeSection === "emailThread") {
      setActiveSection("narrative");
    }
  }, [emailThread, activeSection]);

  // A short case fits entirely on one screen, so scroll position alone cannot
  // tell which section the user cares about — clicking "Tasks" would instantly
  // snap the highlight back to the last visible section. Any deliberate action
  // (clicking a rail entry, or typing/clicking inside a section) therefore
  // takes over the highlight and locks out scroll tracking for a moment.
  const lockUntil = useRef(0);
  const focusSection = (key: SectionKey, lockMs = 1200) => {
    lockUntil.current = Date.now() + lockMs;
    setActiveSection((prev) => (prev === key ? prev : key));
  };

  useEffect(() => {
    let ticking = false;

    const computeActiveSection = () => {
      ticking = false;
      if (Date.now() < lockUntil.current) return;

      const sections: Array<{ key: SectionKey; el: HTMLElement }> = [];
      for (const key of SECTIONS) {
        const el = refs.current[key];
        if (el && el.isConnected) {
          sections.push({ key, el });
        }
      }
      if (sections.length === 0) return;

      const scroller = getScrollContainer(rootRef.current);
      const scrollTop = scroller
        ? scroller.scrollTop
        : window.scrollY ||
          window.pageYOffset ||
          document.documentElement.scrollTop;
      const scrollHeight = scroller
        ? scroller.scrollHeight
        : document.documentElement.scrollHeight;
      const clientHeight = scroller
        ? scroller.clientHeight
        : window.innerHeight;

      // If the container is not scrollable, maintain current selection
      const isScrollable = scrollHeight > clientHeight + 60;
      if (!isScrollable) return;

      // Top of container: lock to first section
      if (scrollTop <= 10) {
        setActiveSection(sections[0].key);
        return;
      }

      // Bottom of container: lock to last section
      const scrollBottom = clientHeight + scrollTop;
      if (scrollBottom >= scrollHeight - 30) {
        setActiveSection(sections[sections.length - 1].key);
        return;
      }

      // Reading trigger line: comfortably below sticky overview header
      const containerTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const triggerLine =
        containerTop + Math.min(240, Math.max(140, clientHeight * 0.25));

      let currentKey = sections[0].key;
      for (let i = 0; i < sections.length; i++) {
        const rect = sections[i].el.getBoundingClientRect();
        if (rect.top <= triggerLine) {
          currentKey = sections[i].key;
        } else {
          break;
        }
      }

      setActiveSection((prev) => (prev === currentKey ? prev : currentKey));

      if (currentKey === "tasks") {
        const catEls = document.querySelectorAll<HTMLElement>(
          "[data-simple-task-category]",
        );
        if (catEls.length > 0) {
          let matchedCat: string | null = catEls[0].getAttribute(
            "data-simple-task-category",
          );
          for (let i = 0; i < catEls.length; i++) {
            const r = catEls[i].getBoundingClientRect();
            if (r.top <= triggerLine) {
              matchedCat = catEls[i].getAttribute("data-simple-task-category");
            } else {
              break;
            }
          }
          if (matchedCat) {
            setActiveCategory(matchedCat);
          }
        }
      } else {
        setActiveCategory(null);
      }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(computeActiveSection);
      }
    };

    computeActiveSection();

    const scroller = getScrollContainer(rootRef.current);
    if (scroller) {
      scroller.addEventListener("scroll", onScroll, { passive: true });
    }
    window.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && scroller) {
      resizeObserver = new ResizeObserver(onScroll);
      resizeObserver.observe(scroller);
    }

    return () => {
      if (scroller) {
        scroller.removeEventListener("scroll", onScroll);
      }
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      resizeObserver?.disconnect();
    };
  }, []);

  const scrollTo = (key: SectionKey, taskId?: string) => {
    const target = taskId
      ? document.querySelector(`[data-simple-task-id="${CSS.escape(taskId)}"]`)
      : refs.current[key];
    focusSection(key, 1500);
    if (key === "tasks" && !taskId && categoryGroups.length > 0) {
      setActiveCategory(categoryGroups[0].categoryKey);
    }
    if (!(target instanceof HTMLElement)) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToCategory = (categoryKey: string) => {
    const target = document.querySelector(
      `[data-simple-task-category="${CSS.escape(categoryKey)}"]`,
    );
    focusSection("tasks", 1500);
    setActiveCategory(categoryKey);
    if (!(target instanceof HTMLElement)) {
      refs.current.tasks?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** Shared props so interacting anywhere inside a section highlights it. */
  const sectionActivation = (key: SectionKey) => ({
    onPointerDown: () => focusSection(key),
    onFocusCapture: () => focusSection(key),
    onInputCapture: () => focusSection(key),
  });

  // The timeline column is sticky, but before the page is scrolled its top
  // starts below the incident header, so a flat 100vh height overflows the
  // screen and hides the comment box. Measure the available space instead.
  const timelineColRef = useRef<HTMLDivElement | null>(null);
  const [timelineHeight, setTimelineHeight] = useState<number | null>(null);

  useEffect(() => {
    const findFeed = () => {
      const el = timelineColRef.current;
      const feed = el?.querySelector("[data-simple-timeline-feed]");
      return feed instanceof HTMLElement ? feed : null;
    };
    const update = () => {
      const el = timelineColRef.current;
      if (!el) return;
      const top = Math.max(el.getBoundingClientRect().top, 24);
      const next = Math.max(320, window.innerHeight - top - 24);
      // Page scrolling changes the available height for the sticky column,
      // which resizes the timeline's scroll box and makes its content appear
      // to drift. Only react to meaningful changes, and re-pin the feed to the
      // newest entry when it was already at the bottom.
      setTimelineHeight((prev) => {
        if (prev !== null && Math.abs(prev - next) < 8) return prev;
        const feed = findFeed();
        const wasAtBottom = feed
          ? feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48
          : false;
        if (wasAtBottom) {
          requestAnimationFrame(() => {
            const f = findFeed();
            if (f) f.scrollTop = f.scrollHeight;
          });
        }
        return next;
      });
    };
    update();
    const scroller = getScrollContainer(rootRef.current);
    if (scroller) {
      scroller.addEventListener("scroll", update, { passive: true });
    }
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      if (scroller) {
        scroller.removeEventListener("scroll", update);
      }
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);

  const openTasks = taskItems.filter(
    (task) => !task.completed && !task.disabled,
  );
  const sectionData: Array<{
    key: SectionKey;
    label: string;
    count?: number;
    icon: typeof FileText;
  }> = [
    ...(emailThread
      ? [
          {
            key: "emailThread" as SectionKey,
            label: "Email Thread",
            count: emailThreadCount,
            icon: SECTION_ICONS.emailThread,
          },
        ]
      : []),
    { key: "narrative", label: narrativeLabel, icon: SECTION_ICONS.narrative },
    {
      key: "tasks",
      label: "Tasks",
      count: openTasks.length,
      icon: SECTION_ICONS.tasks,
    },
    ...(customFields
      ? [
          {
            key: "customFields" as SectionKey,
            label: "Custom Fields",
            count: customFieldsCount !== undefined ? customFieldsCount : 1,
            icon: SECTION_ICONS.customFields,
          },
        ]
      : []),
    {
      key: "observables",
      label: "Observables",
      count: observableCount,
      icon: SECTION_ICONS.observables,
    },
    {
      key: "correlations",
      label: "Correlations",
      count: correlationCount,
      icon: SECTION_ICONS.correlations,
    },
  ];

  const [timelineWidth, setTimelineWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(TIMELINE_WIDTH_STORAGE_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (
          !Number.isNaN(parsed) &&
          parsed >= MIN_TIMELINE_WIDTH &&
          parsed <= MAX_TIMELINE_WIDTH
        ) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_TIMELINE_WIDTH;
  });
  const [isResizingTimeline, setIsResizingTimeline] = useState(false);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingTimeline(true);
    const startX = e.clientX;
    const startWidth = timelineWidth;

    if (typeof document !== "undefined") {
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxAllowed = Math.min(
        MAX_TIMELINE_WIDTH,
        Math.max(MIN_TIMELINE_WIDTH, (window.innerWidth || 1200) * 0.45),
      );
      const nextWidth = Math.round(
        Math.max(MIN_TIMELINE_WIDTH, Math.min(maxAllowed, startWidth + deltaX)),
      );
      setTimelineWidth(nextWidth);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsResizingTimeline(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (typeof document !== "undefined") {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
      const deltaX = upEvent.clientX - startX;
      const maxAllowed = Math.min(
        MAX_TIMELINE_WIDTH,
        Math.max(MIN_TIMELINE_WIDTH, (window.innerWidth || 1200) * 0.45),
      );
      const finalWidth = Math.round(
        Math.max(MIN_TIMELINE_WIDTH, Math.min(maxAllowed, startWidth + deltaX)),
      );
      try {
        localStorage.setItem(TIMELINE_WIDTH_STORAGE_KEY, String(finalWidth));
      } catch {}
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleTouchResizeStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsResizingTimeline(true);
    const startX = e.touches[0].clientX;
    const startWidth = timelineWidth;

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      const deltaX = moveEvent.touches[0].clientX - startX;
      const maxAllowed = Math.min(
        MAX_TIMELINE_WIDTH,
        Math.max(MIN_TIMELINE_WIDTH, (window.innerWidth || 1200) * 0.45),
      );
      const nextWidth = Math.round(
        Math.max(MIN_TIMELINE_WIDTH, Math.min(maxAllowed, startWidth + deltaX)),
      );
      setTimelineWidth(nextWidth);
    };

    const handleTouchEnd = (endEvent: TouchEvent) => {
      setIsResizingTimeline(false);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      const clientX = endEvent.changedTouches[0]?.clientX ?? startX;
      const deltaX = clientX - startX;
      const maxAllowed = Math.min(
        MAX_TIMELINE_WIDTH,
        Math.max(MIN_TIMELINE_WIDTH, (window.innerWidth || 1200) * 0.45),
      );
      const finalWidth = Math.round(
        Math.max(MIN_TIMELINE_WIDTH, Math.min(maxAllowed, startWidth + deltaX)),
      );
      try {
        localStorage.setItem(TIMELINE_WIDTH_STORAGE_KEY, String(finalWidth));
      } catch {}
    };

    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);
  };

  const sectionSx = {
    scrollMarginTop: 88,
    pb: { xs: 4, md: 7 },
  } as const;

  return (
    <Box
      ref={rootRef}
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          md: `${timelineWidth}px minmax(0, 1fr)`,
          lg: `${timelineWidth}px minmax(0, 1fr) minmax(180px, 220px)`,
        },
        gap: { xs: 3, md: 3.625 },
        alignItems: "start",
      }}
    >
      <Box
        ref={timelineColRef}
        sx={{
          order: { xs: 2, md: 1 },
          position: { md: "sticky" },
          top: { md: 24 },
          minWidth: 0,
          height: {
            xs: "auto",
            md: timelineHeight ? `${timelineHeight}px` : "calc(100vh - 48px)",
          },
          display: "flex",
          flexDirection: "column",
          overflow: "visible",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            mb: 1.5,
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "hsl(var(--muted-foreground))",
              textTransform: "uppercase",
            }}
          >
            Timeline
          </Typography>
          {timelineActions}
        </Box>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {timeline}
        </Box>

        {/* Draggable Divider Handle between Timeline and Central View */}
        <Box
          onMouseDown={handleResizeStart}
          onTouchStart={handleTouchResizeStart}
          onDoubleClick={() => {
            setTimelineWidth(DEFAULT_TIMELINE_WIDTH);
            try {
              localStorage.setItem(
                TIMELINE_WIDTH_STORAGE_KEY,
                String(DEFAULT_TIMELINE_WIDTH),
              );
            } catch {}
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize timeline panel"
          title="Drag to resize timeline, double-click to reset"
          sx={{
            display: { xs: "none", md: "block" },
            position: "absolute",
            top: 0,
            bottom: 0,
            right: { md: -22, lg: -22 },
            width: 16,
            cursor: "col-resize",
            zIndex: 10,
            userSelect: "none",
            touchAction: "none",
            "&::after": {
              content: '""',
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 7,
              width: 2,
              borderRadius: 1,
              bgcolor: isResizingTimeline
                ? "hsl(var(--primary))"
                : "transparent",
              transition: "background-color 0.15s ease",
            },
            "&:hover::after": {
              bgcolor: isResizingTimeline
                ? "hsl(var(--primary))"
                : "hsl(var(--muted-foreground) / 0.4)",
            },
          }}
        />
      </Box>

      <Box
        sx={{
          order: { xs: 1, md: 2 },
          minWidth: 0,
          maxWidth: 820,
          width: "100%",
          mx: "auto",
          pb: "200px",
        }}
      >
        {/* Overview (source, title, severity/status/assignee) stays pinned to
            the top of the center column while the body scrolls. */}
        {overview && (
          <Box
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 3,
              bgcolor: "hsl(var(--background))",
              pt: 1,
            }}
          >
            {overview}
          </Box>
        )}
        {emailThread && (
          <Box
            id="simple-case-email-thread"
            ref={(node: HTMLElement | null) => {
              refs.current.emailThread = node;
            }}
            data-simple-section="emailThread"
            sx={sectionSx}
            {...sectionActivation("emailThread")}
          >
            {emailThread}
          </Box>
        )}
        <Box
          id="simple-case-narrative"
          ref={(node: HTMLElement | null) => {
            refs.current.narrative = node;
          }}
          data-simple-section="narrative"
          sx={sectionSx}
          {...sectionActivation("narrative")}
        >
          <Typography
            component="h2"
            sx={{ fontSize: "1.15rem", fontWeight: 700, mb: 2.5 }}
          >
            {narrativeLabel}
          </Typography>
          {narrative}
        </Box>
        <Box
          id="simple-case-tasks"
          ref={(node: HTMLElement | null) => {
            refs.current.tasks = node;
          }}
          data-simple-section="tasks"
          sx={sectionSx}
          {...sectionActivation("tasks")}
        >
          <Typography
            component="h2"
            sx={{ fontSize: "1.15rem", fontWeight: 700, mb: 2.5 }}
          >
            Tasks
          </Typography>
          {tasks}
        </Box>
        {customFields && (
          <Box
            id="simple-case-custom-fields"
            ref={(node: HTMLElement | null) => {
              refs.current.customFields = node;
            }}
            data-simple-section="customFields"
            sx={sectionSx}
            {...sectionActivation("customFields")}
          >
            <Typography
              component="h2"
              sx={{ fontSize: "1.15rem", fontWeight: 700, mb: 2.5 }}
            >
              Custom Fields
            </Typography>
            {customFields}
          </Box>
        )}
        <Box
          id="simple-case-observables"
          ref={(node: HTMLElement | null) => {
            refs.current.observables = node;
          }}
          data-simple-section="observables"
          sx={sectionSx}
          {...sectionActivation("observables")}
        >
          <Typography
            component="h2"
            sx={{ fontSize: "1.15rem", fontWeight: 700, mb: 2.5 }}
          >
            Observables
          </Typography>
          {observables}
        </Box>
        <Box
          id="simple-case-correlations"
          ref={(node: HTMLElement | null) => {
            refs.current.correlations = node;
          }}
          data-simple-section="correlations"
          sx={{ ...sectionSx, pb: 0 }}
          {...sectionActivation("correlations")}
        >
          <Typography
            component="h2"
            sx={{ fontSize: "1.15rem", fontWeight: 700, mb: 2.5 }}
          >
            Correlations
          </Typography>
          {correlations}
        </Box>
      </Box>

      <Box
        component="nav"
        aria-label="Case overview"
        sx={{
          display: { xs: "none", lg: "block" },
          order: 3,
          position: "sticky",
          top: 24,
          minWidth: 0,
        }}
      >
        {contentsActions && (
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 2.5 }}
          >
            {contentsActions}
          </Box>
        )}
        <Typography
          sx={{
            fontSize: "0.7rem",
            fontWeight: 700,
            color: "hsl(var(--muted-foreground))",
            textTransform: "uppercase",
            mb: 1.25,
          }}
        >
          Overview
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}
        >
          {sectionData.map(({ key, label, count, icon: Icon }) => {
            const isActive = activeSection === key;
            return (
              <Fragment key={key}>
                <Button
                  onClick={() => scrollTo(key)}
                  sx={{
                    minHeight: 32,
                    justifyContent: "flex-start",
                    gap: 1,
                    px: 1,
                    textTransform: "none",
                    fontSize: "0.78rem",
                    fontWeight: isActive ? 700 : 500,
                    color: isActive
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--muted-foreground))",
                    borderRadius: 1,
                    "&:hover": { bgcolor: "hsl(var(--muted) / 0.35)" },
                  }}
                >
                  <Icon
                    size={14}
                    style={{
                      color: isActive ? "hsl(var(--primary))" : "inherit",
                      flexShrink: 0,
                    }}
                  />
                  <Box component="span" sx={{ flex: 1, textAlign: "left" }}>
                    {label}
                  </Box>
                  {count !== undefined && <span>{count}</span>}
                </Button>

                {/* Category Sub-areas under Tasks */}
                {key === "tasks" && categoryGroups.length > 0 && (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      pl: 2.75,
                      pr: 0.5,
                      py: 0.25,
                      gap: 0.25,
                    }}
                  >
                    {categoryGroups.map((group) => {
                      const isCatActive =
                        isActive && activeCategory === group.categoryKey;
                      return (
                        <Button
                          key={group.categoryKey}
                          onClick={(e) => {
                            e.stopPropagation();
                            scrollToCategory(group.categoryKey);
                          }}
                          sx={{
                            minHeight: 26,
                            justifyContent: "flex-start",
                            px: 1,
                            py: 0.25,
                            textTransform: "none",
                            fontSize: "0.73rem",
                            fontWeight: isCatActive ? 600 : 400,
                            color: isCatActive
                              ? "hsl(var(--foreground))"
                              : "hsl(var(--muted-foreground))",
                            borderRadius: 0.75,
                            borderLeft: isCatActive
                              ? `2px solid ${group.color}`
                              : "2px solid transparent",
                            "&:hover": {
                              bgcolor: "hsl(var(--muted) / 0.35)",
                              color: "hsl(var(--foreground))",
                            },
                          }}
                        >
                          <Box
                            component="span"
                            sx={{
                              flex: 1,
                              textAlign: "left",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {group.label}
                          </Box>
                          <Typography
                            component="span"
                            sx={{
                              fontSize: "0.68rem",
                              color: isCatActive
                                ? group.color
                                : "hsl(var(--muted-foreground))",
                              fontWeight: 600,
                              ml: 0.5,
                            }}
                          >
                            {group.openCount > 0 ? group.openCount : "Done"}
                          </Typography>
                        </Button>
                      );
                    })}
                  </Box>
                )}
              </Fragment>
            );
          })}
        </Box>
        {resolution && (
          <Box sx={{ mt: 3 }}>
            <Typography
              sx={{
                fontSize: "0.68rem",
                fontWeight: 700,
                color: "hsl(var(--muted-foreground))",
                textTransform: "uppercase",
                mb: 0.75,
              }}
            >
              Resolution
            </Typography>
            <Box
              sx={{ px: 1, display: "flex", flexDirection: "column", gap: 0.5 }}
            >
              <Typography
                sx={{
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  color: "hsl(var(--foreground))",
                }}
              >
                {resolution.reasonLabel}
              </Typography>
              {resolution.notes && (
                <Typography
                  sx={{
                    fontSize: "0.72rem",
                    color: "hsl(var(--muted-foreground))",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {resolution.notes}
                </Typography>
              )}
              {(resolution.resolvedBy || resolution.resolvedAt) && (
                <Typography
                  sx={{
                    fontSize: "0.66rem",
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  {[
                    resolution.resolvedBy || null,
                    resolution.resolvedAt
                      ? new Date(resolution.resolvedAt).toLocaleString()
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              )}
            </Box>
          </Box>
        )}
        {openTasks.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography
              sx={{
                fontSize: "0.68rem",
                fontWeight: 700,
                color: "hsl(var(--muted-foreground))",
                textTransform: "uppercase",
                mb: 0.75,
              }}
            >
              Open tasks
            </Typography>
            {categoryGroups
              .filter((g) => g.openCount > 0)
              .map((group) => {
                const catOpen = group.tasks.filter(
                  (t) => !t.completed && !t.disabled,
                );
                return (
                  <Box key={group.categoryKey} sx={{ mb: 1 }}>
                    <Typography
                      sx={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        color: group.color,
                        px: 1,
                        pt: 0.5,
                        pb: 0.25,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {group.label}
                    </Typography>
                    {catOpen.slice(0, 6).map((task) => (
                      <Button
                        key={task.id}
                        onClick={() => scrollTo("tasks", task.id)}
                        title={task.title}
                        sx={{
                          display: "block",
                          width: "100%",
                          minHeight: 28,
                          px: 1,
                          py: 0.25,
                          textAlign: "left",
                          textTransform: "none",
                          color: "hsl(var(--muted-foreground))",
                          fontSize: "0.73rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          borderRadius: 0.75,
                          "&:hover": {
                            color: "hsl(var(--foreground))",
                            bgcolor: "hsl(var(--muted) / 0.3)",
                          },
                        }}
                      >
                        {task.title}
                      </Button>
                    ))}
                  </Box>
                );
              })}
          </Box>
        )}
        {(relatedIncidents ?? []).length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography
              sx={{
                fontSize: "0.68rem",
                fontWeight: 700,
                color: "hsl(var(--muted-foreground))",
                textTransform: "uppercase",
                mb: 0.75,
              }}
            >
              Related incidents
            </Typography>
            {(relatedIncidents ?? []).slice(0, 8).map((ri) => (
              <Button
                key={ri.id}
                onClick={() =>
                  navigate(`/incidents/${encodeURIComponent(ri.id)}`)
                }
                title={ri.title}
                sx={{
                  display: "block",
                  width: "100%",
                  minHeight: 30,
                  px: 1,
                  textAlign: "left",
                  textTransform: "none",
                  color: "hsl(var(--muted-foreground))",
                  fontSize: "0.74rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {ri.title}
              </Button>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default SimpleCaseLayout;
