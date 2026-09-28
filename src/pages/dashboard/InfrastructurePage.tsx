/**
 * InfrastructurePage — Visual map of security tool categories and data flows.
 * Uses @xyflow/react for an interactive node-based diagram.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_CONFIG, getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { deduplicateAuthApps, backfillAppImages, type AuthAppEntry } from '@/lib/utils';
import { setDatastoreItem, getDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Position,
  Handle,
  Connection,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
  reconnectEdge,
  
  BaseEdge,
  EdgeLabelRenderer,
  useViewport,
  type EdgeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useNavigate } from '@/lib/router-compat';
import { Box, Typography, Chip, Avatar, IconButton, Drawer, Tooltip, Button, Menu, MenuItem } from '@mui/material';
import { ArrowRight, ChevronRight, Activity, Download, Zap, X, ExternalLink, X as CloseIcon } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { IntegrationStatus } from '@/Shuffle-MCPs/components/IntegrationStatus';
import { AddAppModal } from '@/components/infrastructure/AddAppModal';
import {
  TOOL_CATEGORIES,
  FLOW_PHASES,
  DEFAULT_USECASES,
  CATEGORY_KEYWORDS,
  matchAppToCategory,
  normalizeCategory,
  type ToolCategory,
  type FlowPhase,
  type Usecase,
} from '@/config/usecases';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { UsecaseDrawer } from '@/Shuffle-Core';
import { useUsecases, type UsecaseDrift } from '@/hooks/useUsecases';

// Re-export for any external consumers
export { type FlowPhase, FLOW_PHASES };

// Alias DATA_FLOWS to DEFAULT_USECASES for minimal diff in rendering logic
const DATA_FLOWS = DEFAULT_USECASES;

interface MatchedApp {
  name: string;
  image: string;
  hasValidAuth?: boolean;
}

// ── Orthogonal path builder (only H/V segments with rounded corners) ────────

function expandToOrthogonal(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  // Filter out any null/undefined entries
  const valid = points.filter((p): p is { x: number; y: number } => p != null && typeof p.x === 'number' && typeof p.y === 'number');
  if (valid.length < 2) return valid;
  const expanded: Array<{ x: number; y: number }> = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const prev = expanded[expanded.length - 1];
    const curr = valid[i];
    if (Math.abs(prev.x - curr.x) > 1 && Math.abs(prev.y - curr.y) > 1) {
      expanded.push({ x: curr.x, y: prev.y });
    }
    expanded.push(curr);
  }
  return expanded;
}

function buildOrthogonalPath(
  points: Array<{ x: number; y: number }>,
  borderRadius: number = 12,
): string {
  const expanded = expandToOrthogonal(points);
  if (expanded.length < 2) return '';
  if (expanded.length === 2) {
    return `M ${expanded[0].x} ${expanded[0].y} L ${expanded[1].x} ${expanded[1].y}`;
  }

  let path = `M ${expanded[0].x} ${expanded[0].y}`;
  for (let i = 1; i < expanded.length - 1; i++) {
    const prev = expanded[i - 1];
    const curr = expanded[i];
    const next = expanded[i + 1];
    const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (len1 === 0 || len2 === 0) { path += ` L ${curr.x} ${curr.y}`; continue; }
    const r = Math.min(borderRadius, len1 / 2, len2 / 2);
    const bx = curr.x - (dx1 / len1) * r, by = curr.y - (dy1 / len1) * r;
    const ax = curr.x + (dx2 / len2) * r, ay = curr.y + (dy2 / len2) * r;
    path += ` L ${bx} ${by} Q ${curr.x} ${curr.y} ${ax} ${ay}`;
  }
  path += ` L ${expanded[expanded.length - 1].x} ${expanded[expanded.length - 1].y}`;
  return path;
}

// ── Custom Gradient Edge with waypoint support ─────────────────────────────────

const GradientEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  style = {},
  markerEnd,
}: EdgeProps) => {
  const reactFlowInstance = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<{ type: 'waypoint' | 'midpoint' | 'hpair' | 'vpair'; index: number } | null>(null);
  const draggingIdxRef = useRef<{ type: 'waypoint' | 'midpoint' | 'hpair' | 'vpair'; index: number } | null>(null);
  const isVisible = hovered || !!data?.isEdgeHovered;
  const isSelected = !!data?.isEdgeSelected;
  const waypoints: Array<{ x: number; y: number }> = (data?.waypoints || []).filter((p: any) => p != null && typeof p?.x === 'number' && typeof p?.y === 'number');
  const onWaypointsChange: ((wp: Array<{ x: number; y: number }>) => void) | undefined = data?.onWaypointsChange;

  // Build path through waypoints (filter out any null/undefined entries)
  const allPoints = [
    { x: sourceX, y: sourceY },
    ...waypoints,
    { x: targetX, y: targetY },
  ].filter((p): p is { x: number; y: number } => p != null && typeof p?.x === 'number' && typeof p?.y === 'number');

  // Always use orthogonal path for consistency between rendered edge and handles
  const edgePath = buildOrthogonalPath(allPoints);

  // Label position: midpoint of all points
  const labelX = allPoints.reduce((s, p) => s + p.x, 0) / allPoints.length;
  const labelY = allPoints.reduce((s, p) => s + p.y, 0) / allPoints.length;

  // Compute midpoint handles: one on EVERY rendered H/V segment of the orthogonal path
  const expandedPoints = expandToOrthogonal(allPoints);
  const segmentMidpoints = useMemo(() => {
    let logIdx = 0;
    return expandedPoints.slice(0, -1)
      .map((p, i) => {
        const next = expandedPoints[i + 1];
        if (logIdx < allPoints.length - 1) {
          const ap = allPoints[logIdx + 1];
          if (ap && Math.abs(p.x - ap.x) < 1 && Math.abs(p.y - ap.y) < 1) {
            logIdx++;
          }
        }
        const isHorizontal = Math.abs(p.y - next.y) < 1;
        const segLen = Math.abs(next.x - p.x) + Math.abs(next.y - p.y);
        return {
          x: (p.x + next.x) / 2,
          y: (p.y + next.y) / 2,
          isHorizontal,
          segStart: p,
          segEnd: next,
          wpInsertIdx: logIdx,
          segLen,
        };
      })
      // Skip only zero-length segments (degenerate points), show handles on all real segments
      .filter(seg => seg.segLen > 2);
  }, [allPoints, expandedPoints]);

  const sourceColor = data?.sourceColor || 'hsl(var(--primary))';
  const targetColor = data?.targetColor || 'hsl(var(--primary))';
  const gradientId = `gradient-${id}`;

  // Use refs for drag handler to avoid stale closures
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;
  const segmentMidpointsRef = useRef(segmentMidpoints);
  segmentMidpointsRef.current = segmentMidpoints;
  const onWaypointsChangeRef = useRef(onWaypointsChange);
  onWaypointsChangeRef.current = onWaypointsChange;

  // Keep ref in sync so the mousemove handler always reads the latest value
  // without needing to re-register listeners on every state change (which caused the double-step bug)
  draggingIdxRef.current = draggingIdx;

  // Drag handling — registered once, reads draggingIdxRef to avoid stale closure
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const current = draggingIdxRef.current;
      if (!current) return;
      const pos = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const currentWp = waypointsRef.current;
      const onChange = onWaypointsChangeRef.current;

      if (current.type === 'waypoint') {
        const newWp = [...currentWp];
        newWp[current.index] = { x: Math.round(pos.x / 10) * 10, y: Math.round(pos.y / 10) * 10 };
        onChange?.(newWp);
      } else if (current.type === 'midpoint') {
        const seg = segmentMidpointsRef.current[current.index];
        if (!seg) return;
        const snapped = { x: Math.round(pos.x / 10) * 10, y: Math.round(pos.y / 10) * 10 };
        const newWp = [...currentWp];
        const wpInsertIdx = seg.wpInsertIdx;
        if (seg.isHorizontal) {
          const corner1 = { x: seg.segStart.x, y: snapped.y };
          const corner2 = { x: seg.segEnd.x, y: snapped.y };
          newWp.splice(wpInsertIdx, 0, corner1, corner2);
          onChange?.(newWp);
          // Update ref immediately so the very next mousemove event uses 'hpair' logic
          const next = { type: 'hpair' as const, index: wpInsertIdx };
          draggingIdxRef.current = next;
          setDraggingIdx(next);
        } else {
          const corner1 = { x: snapped.x, y: seg.segStart.y };
          const corner2 = { x: snapped.x, y: seg.segEnd.y };
          newWp.splice(wpInsertIdx, 0, corner1, corner2);
          onChange?.(newWp);
          // Update ref immediately so the very next mousemove event uses 'vpair' logic
          const next = { type: 'vpair' as const, index: wpInsertIdx };
          draggingIdxRef.current = next;
          setDraggingIdx(next);
        }
      } else if (current.type === 'hpair') {
        const snappedY = Math.round(pos.y / 10) * 10;
        const newWp = [...currentWp];
        if (newWp[current.index] && newWp[current.index + 1]) {
          newWp[current.index] = { ...newWp[current.index], y: snappedY };
          newWp[current.index + 1] = { ...newWp[current.index + 1], y: snappedY };
          onChange?.(newWp);
        }
      } else if (current.type === 'vpair') {
        const snappedX = Math.round(pos.x / 10) * 10;
        const newWp = [...currentWp];
        if (newWp[current.index] && newWp[current.index + 1]) {
          newWp[current.index] = { ...newWp[current.index], x: snappedX };
          newWp[current.index + 1] = { ...newWp[current.index + 1], x: snappedX };
          onChange?.(newWp);
        }
      }
    };
    const onMouseUp = () => {
      draggingIdxRef.current = null;
      setDraggingIdx(null);
      // Clean up redundant waypoints: remove collinear points and near-duplicates
      const wp = waypointsRef.current;
      if (wp.length > 0) {
        const source = { x: sourceX, y: sourceY };
        const target = { x: targetX, y: targetY };
        const cleaned: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < wp.length; i++) {
          const prev = i === 0 ? source : cleaned[cleaned.length - 1] || source;
          const curr = wp[i];
          const next = i < wp.length - 1 ? wp[i + 1] : target;
          if (!curr) continue;
          // Skip if collinear horizontally (all share same y)
          if (Math.abs(prev.y - curr.y) < 2 && Math.abs(curr.y - next.y) < 2) continue;
          // Skip if collinear vertically (all share same x)
          if (Math.abs(prev.x - curr.x) < 2 && Math.abs(curr.x - next.x) < 2) continue;
          // Skip near-duplicate of previous
          if (cleaned.length > 0) {
            const last = cleaned[cleaned.length - 1];
            if (Math.abs(last.x - curr.x) < 2 && Math.abs(last.y - curr.y) < 2) continue;
          }
          cleaned.push(curr);
        }
        if (cleaned.length !== wp.length) {
          onWaypointsChangeRef.current?.(cleaned);
        }
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactFlowInstance]);

  // Double-click waypoint to remove it
  const handleWaypointDoubleClick = (wpIdx: number) => {
    const newWp = waypoints.filter((_, i) => i !== wpIdx);
    onWaypointsChange?.(newWp);
  };

  // Arrow angle is derived purely from which side of the target node the handle is on.
  // This is always correct regardless of how the path routes to get there.
  const arrowAngleMap: Partial<Record<Position, number>> = {
    [Position.Left]:   0,    // handle on left side  → arrow points right (→) into node
    [Position.Right]:  180,  // handle on right side → arrow points left  (←) into node
    [Position.Top]:    90,   // handle on top side   → arrow points down  (↓) into node
    [Position.Bottom]: -90,  // handle on bottom     → arrow points up    (↑) into node
  };
  const arrowAngle = arrowAngleMap[targetPosition] ?? 0;
  const arrowColor = data?.useGradient ? targetColor : (style.stroke as string || 'hsl(var(--muted-foreground))');
  // Push the tip slightly inside the node border for a clean overlap
  const inset = 5;
  const insetX = Math.cos(arrowAngle * Math.PI / 180) * inset;
  const insetY = Math.sin(arrowAngle * Math.PI / 180) * inset;
  // Arrow size: tip at (0,0) pointing right, body extends LEFT — so tip is always exactly at targetX,targetY
  const S = 8;  // half-height
  const L = 10; // length

  return (
    <>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={sourceColor} />
          <stop offset="100%" stopColor={targetColor} />
        </linearGradient>
      </defs>
      {/* Invisible wider path for easier hover/click target */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ pointerEvents: 'stroke' }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: data?.useGradient ? `url(#${gradientId})` : style.stroke,
          strokeWidth: isVisible ? 3 : (style.strokeWidth || 2),
          transition: 'stroke-width 0.15s ease',
        }}
      />
      {/* Tip is at (0,0); body extends to (-L, ±S). Translate to targetX,targetY so tip sits exactly on the handle. */}
      <polygon
        points={`0,0 ${-L},${-S} ${-L},${S}`}
        fill={arrowColor}
        transform={`translate(${targetX + insetX},${targetY + insetY}) rotate(${arrowAngle})`}
        style={{ pointerEvents: 'none', transition: 'fill 0.2s' }}
      />
      {/* Label on hover */}
      {label && isVisible && (
        <EdgeLabelRenderer>
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              background: 'hsl(var(--background))',
              opacity: 0.95,
              padding: '3px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
      {/* Waypoint drag handles (visible only when edge is selected) */}
      {isSelected && (
        <EdgeLabelRenderer>
          {/* Existing waypoint handles — drag to move, double-click to remove */}
          {waypoints.map((wp, i) => (
            <div
              key={`wp-${i}`}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setDraggingIdx({ type: 'waypoint', index: i });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleWaypointDoubleClick(i);
              }}
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${wp.x}px,${wp.y}px)`,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: 'hsl(var(--primary))',
                border: '2px solid hsl(var(--background))',
                cursor: 'grab',
                pointerEvents: 'all',
                zIndex: 20,
                boxShadow: '0 0 6px hsla(var(--primary) / 0.5)',
              }}
            />
          ))}
          {/* Segment midpoint handles — drag to insert a new waypoint */}
          {segmentMidpoints.map((mp, i) => (
            <div
              key={`mid-${i}`}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setDraggingIdx({ type: 'midpoint', index: i });
              }}
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${mp.x}px,${mp.y}px)`,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: 'hsla(var(--primary) / 0.5)',
                border: '2px solid hsl(var(--primary))',
                cursor: 'grab',
                pointerEvents: 'all',
                zIndex: 19,
                opacity: 0.7,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => { (e.target as HTMLDivElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.target as HTMLDivElement).style.opacity = '0.7'; }}
            />
          ))}
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const edgeTypes = { gradient: GradientEdge };

// ── Custom Node Component ──────────────────────────────────────────────────────

interface CategoryNodeData {
  category: ToolCategory;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  isSelected: boolean;
  isHovered: boolean;
  isEdgeUpdating: boolean;
  edgeUpdateHandleType: 'source' | 'target' | null;
  matchedApps: MatchedApp[];
  [key: string]: unknown;
}

const CategoryNode = ({ data }: { data: CategoryNodeData }) => {
  const { category, onSelect, onHover, isSelected, isHovered, isEdgeUpdating, edgeUpdateHandleType, matchedApps } = data;
  const colorVar = category.color;
  const highlighted = isSelected || isHovered;
  const hasApps = matchedApps.length > 0;

  return (
    <>
      {/* Each side has both source and target handles, both pinned to the exact center of their side */}
      {(['Top', 'Bottom', 'Left', 'Right'] as const).map(side => {
        // When dragging source end, RF needs a target handle to drop on (and vice versa)
        const showTarget = isEdgeUpdating && edgeUpdateHandleType === 'source';
        const showSource = isEdgeUpdating && edgeUpdateHandleType === 'target';

        // Force handles to the exact geometric center of each side.
        // Compute size-aware margin offsets so ReactFlow's bounding-rect
        // edge-attachment calculation always lands on the true center.
        const targetSize = showTarget ? 16 : 10;
        const sourceSize = showSource ? 16 : 10;
        const isVerticalSide = side === 'Top' || side === 'Bottom';
        const targetCenterStyle: React.CSSProperties = isVerticalSide
          ? { left: '50%', marginLeft: -targetSize / 2 }
          : { top: '50%', marginTop: -targetSize / 2 };
        const sourceCenterStyle: React.CSSProperties = isVerticalSide
          ? { left: '50%', marginLeft: -sourceSize / 2 }
          : { top: '50%', marginTop: -sourceSize / 2 };

        return (
          <React.Fragment key={side}>
            <Handle
              type="target"
              position={Position[side]}
              id={`${side.toLowerCase()}-target`}
              className="infra-handle"
              style={{
                ...targetCenterStyle,
                width: showTarget ? 16 : 10,
                height: showTarget ? 16 : 10,
                borderRadius: '50%',
                background: `hsl(var(${colorVar}))`,
                border: showTarget ? `3px solid hsl(var(${colorVar}))` : '2px solid hsl(var(--background))',
                opacity: showTarget ? 1 : 0,
                transition: 'all 0.15s ease',
                boxShadow: showTarget ? `0 0 8px hsla(var(${colorVar}) / 0.5)` : 'none',
                zIndex: showTarget ? 10 : 0,
                pointerEvents: showTarget ? 'auto' : 'none',
              }}
            />
            <Handle
              type="source"
              position={Position[side]}
              id={`${side.toLowerCase()}-source`}
              className="infra-handle"
              style={{
                ...sourceCenterStyle,
                width: showSource ? 16 : 10,
                height: showSource ? 16 : 10,
                borderRadius: '50%',
                background: `hsl(var(${colorVar}))`,
                border: showSource ? `3px solid hsl(var(${colorVar}))` : '2px solid hsl(var(--background))',
                opacity: showSource ? 1 : 0,
                transition: 'all 0.15s ease',
                boxShadow: showSource ? `0 0 8px hsla(var(${colorVar}) / 0.5)` : 'none',
                zIndex: showSource ? 10 : 0,
                pointerEvents: showSource ? 'auto' : 'none',
              }}
            />
          </React.Fragment>
        );
      })}

      <Box
        onClick={() => onSelect(category.id)}
        onMouseEnter={() => onHover(category.id)}
        onMouseLeave={() => onHover(null)}
        sx={{
          width: 200,
          p: 2,
          borderRadius: 3,
          border: highlighted
            ? `2px solid hsl(var(${colorVar}))`
            : hasApps
              ? `1px solid hsla(var(${colorVar}) / 0.4)`
              : '1px solid hsl(var(--border))',
          bgcolor: highlighted
            ? `hsla(var(${colorVar}) / 0.08)`
            : hasApps
              ? `hsla(var(${colorVar}) / 0.04)`
              : 'hsl(var(--card))',
          opacity: hasApps ? 1 : 0.45,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            opacity: 1,
            transform: 'translateY(-2px)',
            boxShadow: `0 8px 24px hsla(var(${colorVar}) / 0.15)`,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: `hsla(var(${colorVar}) / 0.12)`,
            color: `hsl(var(${colorVar}))`,
            flexShrink: 0,
          }}>
            {category.icon}
          </Box>
          <Typography sx={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: hasApps ? `hsl(var(${colorVar}))` : 'hsl(var(--muted-foreground))',
          }}>
            {category.label}
          </Typography>
        </Box>

      </Box>
    </>
  );
};

const nodeTypes = { category: CategoryNode };

// ── Layout positions ───────────────────────────────────────────────────────────

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  case_management:  { x: 640,  y: 518 },
  siem:             { x: 432,  y: 284 },
  network:          { x: 862,  y: 0   },
  edr:              { x: 574,  y: 0   },
  communication:    { x: 640,  y: 768 },
  email:            { x: 1124, y: 0   },
  threat_intel:     { x: 844,  y: 284 },
  asset_management: { x: 6,    y: 284 },
  iam:              { x: 296,  y: 0   },
  cloud:            { x: 6,    y: 0   },
};

const DEFAULT_HANDLES: Record<string, { sourceHandle: string; targetHandle: string }> = {
  'siem_case_management_1':             { sourceHandle: 'right-source',  targetHandle: 'top-target'    },
  'network_siem_1':                     { sourceHandle: 'bottom-source', targetHandle: 'top-target'    },
  'edr_siem_1':                         { sourceHandle: 'bottom-source', targetHandle: 'top-target'    },
  'iam_siem_1':                         { sourceHandle: 'bottom-source', targetHandle: 'top-target'    },
  'email_case_management_1':            { sourceHandle: 'bottom-source', targetHandle: 'right-target'  },
  'threat_intel_case_management_1':     { sourceHandle: 'left-source',   targetHandle: 'top-target'    },
  'threat_intel_network_1':             { sourceHandle: 'top-source',    targetHandle: 'left-target'   },
  'threat_intel_edr_1':                 { sourceHandle: 'top-source',    targetHandle: 'right-target'  },
  'case_management_communication_1':    { sourceHandle: 'bottom-source', targetHandle: 'top-target'    },
  'case_management_iam_1':              { sourceHandle: 'left-source',   targetHandle: 'top-target'    },
  'case_management_edr_1':             { sourceHandle: 'left-source',   targetHandle: 'top-target'    },
  'asset_management_case_management_1': { sourceHandle: 'bottom-source', targetHandle: 'top-target'    },
  'email_threat_intel_1':               { sourceHandle: 'bottom-source', targetHandle: 'right-target'  },
  'cloud_siem_1':                       { sourceHandle: 'right-source',  targetHandle: 'top-target'    },
  'cloud_iam_1':                        { sourceHandle: 'right-source',  targetHandle: 'left-target'   },
  'threat_intel_cloud_1':               { sourceHandle: 'top-source',    targetHandle: 'left-target'   },
  'case_management_cloud_1':            { sourceHandle: 'left-source',   targetHandle: 'top-target'    },
  'case_management_network_1':          { sourceHandle: 'left-source',   targetHandle: 'top-target'    },
  'case_management_email_1':            { sourceHandle: 'left-source',   targetHandle: 'top-target'    },
  'edr_case_management_1':              { sourceHandle: 'bottom-source', targetHandle: 'top-target'    },
  'cloud_asset_management_1':           { sourceHandle: 'bottom-source', targetHandle: 'top-target'    },
  'asset_management_siem_1':            { sourceHandle: 'right-source',  targetHandle: 'left-target'   },
};

const DEFAULT_WAYPOINTS: Record<string, Array<{ x: number; y: number }>> = {
  'case_management_network_1':          [{ x: 620, y: 572.500007395668 }, { x: 620, y: 550 }, { x: -90, y: 550 }, { x: -90, y: -80 }, { x: 957.0001131550472, y: -80 }],
  'case_management_iam_1':              [{ x: -90, y: 510 }, { x: -90, y: -80 }, { x: 379.9999514722607, y: -80 }],
  'case_management_cloud_1':            [{ x: -90, y: 280 }, { x: -90, y: -80 }, { x: 20, y: -80 }],
  'iam_siem_1':                         [{ x: 390, y: 170 }, { x: 524.9999180976944, y: 170 }],
  'cloud_siem_1':                       [{ x: 240, y: 120 }, { x: 240, y: 170 }, { x: 379.99998791616144, y: 170 }],
  'network_siem_1':                     [{ x: 960, y: 170 }],
  'case_management_email_1':            [{ x: -90, y: 520 }, { x: -90, y: -80 }, { x: 660.0000874212913, y: -80 }],
  'case_management_edr_1':              [{ x: -90, y: 490 }, { x: -90, y: -80 }, { x: 670, y: -80 }],
  'email_threat_intel_1':               [{ x: 1220, y: 320 }, { x: 1047.9948242907149, y: 320 }],
  'edr_case_management_1':              [{ x: 670, y: 230 }, { x: 710, y: 230 }],
  'email_case_management_1':            [{ x: 1220, y: 550 }],
  'asset_management_case_management_1': [{ x: 100, y: 430 }, { x: 730, y: 430 }],
  'threat_intel_network_1':             [{ x: 940, y: 230 }, { x: 1090, y: 50 }, { x: 1090, y: -200 }, { x: 810, y: -200 }, { x: 810, y: 30 }],
  'edr_siem_1':                         [{ x: 670.0002400192376, y: 170 }, { x: 600, y: 170 }],
  'threat_intel_edr_1':                 [{ x: 940.0001620468963, y: 230 }, { x: 1090, y: 230 }, { x: 1090, y: -200 }, { x: 810, y: -200 }, { x: 810, y: 30 }],
  'threat_intel_cloud_1':               [{ x: 939.0000547527465, y: 230 }, { x: 1080, y: 230 }, { x: 1090, y: -200 }, { x: -40, y: 31.847815166393243 }],
};




/** Look up a tool category's color CSS variable and icon by ID. Reusable across the app. */
export const getToolCategoryMeta = (categoryId: string): { color: string; icon: React.ReactNode; label: string } | null => {
  const cat = TOOL_CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return null;
  return { color: cat.color, icon: cat.icon, label: cat.label };
};

// ── Tag color map ──────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  Alert:      { color: 'hsl(var(--infra-siem))',          bg: 'hsla(var(--infra-siem) / 0.1)',          border: 'hsla(var(--infra-siem) / 0.25)' },
  Detection:  { color: 'hsl(var(--infra-edr))',           bg: 'hsla(var(--infra-edr) / 0.1)',           border: 'hsla(var(--infra-edr) / 0.25)' },
  Logs:       { color: 'hsl(var(--infra-network))',       bg: 'hsla(var(--infra-network) / 0.1)',       border: 'hsla(var(--infra-network) / 0.25)' },
  Intel:      { color: 'hsl(var(--infra-threat-intel))',  bg: 'hsla(var(--infra-threat-intel) / 0.1)',  border: 'hsla(var(--infra-threat-intel) / 0.25)' },
  Response:   { color: 'hsl(var(--infra-case-mgmt))',     bg: 'hsla(var(--infra-case-mgmt) / 0.1)',     border: 'hsla(var(--infra-case-mgmt) / 0.25)' },
  Prevention: { color: 'hsl(var(--infra-iam))',           bg: 'hsla(var(--infra-iam) / 0.1)',           border: 'hsla(var(--infra-iam) / 0.25)' },
  Containment:{ color: 'hsl(var(--destructive))',         bg: 'hsla(var(--destructive) / 0.08)',        border: 'hsla(var(--destructive) / 0.2)' },
  Correlation:{ color: 'hsl(var(--infra-cloud))',         bg: 'hsla(var(--infra-cloud) / 0.1)',         border: 'hsla(var(--infra-cloud) / 0.25)' },
  Context:    { color: 'hsl(var(--infra-asset-mgmt))',    bg: 'hsla(var(--infra-asset-mgmt) / 0.1)',   border: 'hsla(var(--infra-asset-mgmt) / 0.25)' },
};

const DEFAULT_TAG_COLOR = { color: 'hsl(var(--muted-foreground))', bg: 'hsla(var(--muted-foreground) / 0.08)', border: 'hsla(var(--muted-foreground) / 0.2)' };

// ── Flow state helpers ─────────────────────────────────────────────────────────

type FlowState = 'disabled' | 'missing_config' | 'enabled';

/**
 * disabled      — one or both categories have no apps configured at all
 * missing_config — both categories have apps configured (Enabled requires an explicit per-flow test)
 * enabled       — reserved for future explicit per-flow test verification
 */
const getFlowState = (
  sourceConfigured: boolean,
  targetConfigured: boolean,
): FlowState => {
  if (sourceConfigured && targetConfigured) return 'missing_config';
  return 'disabled';
};

const FLOW_STATE_BADGE: Record<FlowState, { label: string; color: string; bg: string; border: string }> = {
  disabled: {
    label: 'Disabled',
    color: 'hsla(var(--muted-foreground) / 0.7)',
    bg: 'hsla(var(--muted-foreground) / 0.08)',
    border: 'hsla(var(--muted-foreground) / 0.2)',
  },
  missing_config: {
    label: 'Misconfigured',
    color: 'hsl(45 93% 47%)',
    bg: 'hsla(45 93% 47% / 0.1)',
    border: 'hsla(45 93% 47% / 0.3)',
  },
  enabled: {
    label: 'Enabled',
    color: 'hsl(142 71% 45%)',
    bg: 'hsla(142 71% 45% / 0.1)',
    border: 'hsla(142 71% 45% / 0.3)',
  },
};

// ── Shared Data Flow Card ──────────────────────────────────────────────────────

const DataFlowCard = ({
  flow,
  edgeId,
  enabled,
  flowState = 'disabled',
  highlighted = false,
  isAgentic = false,
  showTags = false,
  drift,
  onSetFlowState,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  flow: (typeof DATA_FLOWS)[number];
  edgeId: string;
  enabled: boolean;
  flowState?: FlowState;
  highlighted?: boolean;
  isAgentic?: boolean;
  showTags?: boolean;
  drift?: import('@/hooks/useUsecases').UsecaseDrift;
  onSetFlowState?: (edgeId: string, state: FlowState) => void;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) => {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const sourceCat = TOOL_CATEGORIES.find(c => c.id === flow.source);
  const targetCat = TOOL_CATEGORIES.find(c => c.id === flow.target);
  const flowColor = sourceCat?.color || '--primary';

  return (
    <Box
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        ml: 1,
        mb: 0.5,
        borderRadius: 1.5,
        border: highlighted ? `1px solid hsla(var(${flowColor}) / 0.4)` : '1px solid transparent',
        bgcolor: highlighted ? `hsla(var(${flowColor}) / 0.08)` : 'transparent',
        cursor: 'pointer',
        opacity: flowState === 'disabled' ? 0.4 : 1,
        transition: 'all 0.15s ease',
        '&:hover': {
          bgcolor: highlighted ? `hsla(var(${flowColor}) / 0.12)` : 'hsla(var(--muted-foreground) / 0.06)',
          borderColor: highlighted ? `hsla(var(${flowColor}) / 0.5)` : 'hsl(var(--border))',
          opacity: flowState === 'disabled' ? 0.65 : 1,
          '& .flow-detail-link': { opacity: 0.6 },
        },
      }}
    >
      <Box sx={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        bgcolor: flowState === 'enabled' ? `hsl(var(${flowColor}))` : FLOW_STATE_BADGE[flowState].color,
        flexShrink: 0,
      }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: flowState === 'enabled' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
            {flow.label}
          </Typography>
          <Typography sx={{ fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))' }}>
            → {targetCat?.label || flow.target}
          </Typography>
        </Box>
        {showTags && flow.tags && flow.tags.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mt: 0.25 }}>
            {flow.tags.slice(0, 3).map(tag => (
              <Typography key={tag} sx={{ fontSize: '0.55rem', px: 0.5, py: 0.1, borderRadius: 0.5, fontWeight: 600, letterSpacing: '0.03em', color: 'hsl(var(--muted-foreground))', bgcolor: 'hsla(var(--muted-foreground) / 0.08)', border: '1px solid hsla(var(--muted-foreground) / 0.15)', lineHeight: 1.3 }}>
                {tag}
              </Typography>
            ))}
            {flow.manualVerification && (
              <Tooltip title="Requires manual verification — log forwarding can't be auto-detected" arrow>
                <Typography sx={{ fontSize: '0.55rem', px: 0.5, py: 0.1, borderRadius: 0.5, fontWeight: 700, letterSpacing: '0.03em', color: 'hsl(35 92% 50%)', bgcolor: 'hsla(35 92% 50% / 0.1)', border: '1px solid hsla(35 92% 50% / 0.25)', lineHeight: 1.3 }}>
                  Manual
                </Typography>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>
      {isAgentic && (
        <Tooltip title="Agentic mode enabled" arrow>
          <Typography sx={{ fontSize: '0.6rem', px: 0.75, py: 0.25, borderRadius: 0.75, flexShrink: 0, bgcolor: 'hsla(var(--primary) / 0.12)', border: '1px solid hsla(var(--primary) / 0.3)', color: 'hsl(var(--primary))', fontWeight: 700, letterSpacing: '0.04em' }}>
            AI
          </Typography>
        </Tooltip>
      )}
      {drift && (
        <Tooltip title={
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {drift.drifts.includes('local_only') ? 'No API Usecase' : 'API Drift'}
            </Typography>
            {drift.drifts.map(d => (
              <Typography key={d} variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                • {d === 'local_only' ? 'This data flow has no matching usecase in the API'
                  : d === 'api_only' ? 'This API usecase has no matching data flow'
                  : d === 'phase_mismatch' ? `Phase mismatch: API says "${drift.apiCategory}"`
                  : d.replace(/_/g, ' ')}
              </Typography>
            ))}
            {drift.apiUsecase && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7, fontStyle: 'italic' }}>
                API: "{drift.apiUsecase.name}" ({drift.apiCategory})
              </Typography>
            )}
          </Box>
        } arrow>
          <Typography sx={{
            fontSize: '0.6rem', px: 0.75, py: 0.25, borderRadius: 0.75, flexShrink: 0, fontWeight: 700, letterSpacing: '0.04em',
            bgcolor: drift.drifts.includes('local_only')
              ? 'hsla(45 93% 47% / 0.12)'
              : 'hsla(200 80% 50% / 0.12)',
            border: drift.drifts.includes('local_only')
              ? '1px solid hsla(45 93% 47% / 0.3)'
              : '1px solid hsla(200 80% 50% / 0.3)',
            color: drift.drifts.includes('local_only')
              ? 'hsl(45 93% 47%)'
              : 'hsl(200 80% 50%)',
          }}>
            {drift.drifts.includes('local_only') ? 'NO API' : 'DRIFT'}
          </Typography>
        </Tooltip>
      )}
      {/* Status dropdown */}
      {onSetFlowState ? (
        <>
          <Typography
            onClick={(e) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}
            sx={{
              fontSize: '0.6rem', color: FLOW_STATE_BADGE[flowState].color, bgcolor: FLOW_STATE_BADGE[flowState].bg,
              border: `1px solid ${FLOW_STATE_BADGE[flowState].border}`, px: 0.75, py: 0.25, borderRadius: 0.75,
              flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.3,
              '&:hover': { opacity: 0.8 },
            }}
          >
            {FLOW_STATE_BADGE[flowState].label}
            <Box component="span" sx={{ fontSize: '0.5rem', ml: 0.15 }}>▼</Box>
          </Typography>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={(e: any) => { e?.stopPropagation?.(); setMenuAnchor(null); }}
            onClick={(e) => e.stopPropagation()}
            sx={{ '& .MuiPaper-root': { bgcolor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 2, minWidth: 150, boxShadow: '0 8px 24px hsla(0 0% 0% / 0.3)', zIndex: 10040 } }}
          >
            {(['disabled', 'missing_config', 'enabled'] as FlowState[]).map(state => (
              <MenuItem
                key={state}
                selected={flowState === state}
                onClick={(e) => { e.stopPropagation(); onSetFlowState(edgeId, state); setMenuAnchor(null); }}
                sx={{ fontSize: '0.78rem', py: 0.75, gap: 1, color: 'hsl(var(--foreground))' }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: FLOW_STATE_BADGE[state].color, flexShrink: 0 }} />
                {FLOW_STATE_BADGE[state].label}
              </MenuItem>
            ))}
          </Menu>
        </>
      ) : (
        flowState !== 'enabled' && (
          <Typography sx={{ fontSize: '0.6rem', color: FLOW_STATE_BADGE[flowState].color, bgcolor: FLOW_STATE_BADGE[flowState].bg, border: `1px solid ${FLOW_STATE_BADGE[flowState].border}`, px: 0.75, py: 0.25, borderRadius: 0.75, flexShrink: 0 }}>
            {FLOW_STATE_BADGE[flowState].label}
          </Typography>
        )
      )}
      <Box
        component="a"
        href={`/infrastructure/flows/${flow.id}`}
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); }}
        sx={{ display: 'flex', alignItems: 'center', color: 'hsl(var(--muted-foreground))', opacity: 0, transition: 'opacity 0.15s', '&:hover': { opacity: 1, color: 'hsl(var(--primary))' } }}
        className="flow-detail-link"
      >
        <ExternalLink size={13} />
      </Box>
      {targetCat && (
        <Box sx={{ color: flowState === 'enabled' ? `hsl(var(${targetCat.color}))` : 'hsl(var(--muted-foreground))', display: 'flex', '& svg': { width: 14, height: 14 }, opacity: 0.6 }}>
          {targetCat.icon}
        </Box>
      )}
    </Box>
  );
};


// ── All Data Flows Drawer ──────────────────────────────────────────────────────

const PHASE_ICONS: Record<FlowPhase, React.ReactNode> = {
  ingest: <Download size={16} />,
  response: <Zap size={16} />,
  correlation: <Activity size={16} />,
};

const AllDataFlowsDrawer = ({
  open,
  onClose,
  onSelectFlow,
  onSelectCategory,
  activeCategories,
  configuredCategories,
  highlightEdgeIdx,
  flowStateOverrides,
  agenticFlows,
  initialFilter,
  onEdgeHover,
  driftMap,
  isSupport,
}: {
  open: boolean;
  onClose: () => void;
  onSelectFlow: (edgeIdx: number) => void;
  onSelectCategory: (categoryId: string) => void;
  activeCategories: Set<string>;
  configuredCategories: Set<string>;
  highlightEdgeIdx: number | null;
  flowStateOverrides: Map<string, FlowState>;
  agenticFlows: Set<string>;
  initialFilter?: FlowState | null;
  onEdgeHover: (edgeId: string | null) => void;
  driftMap?: Map<string, UsecaseDrift>;
  isSupport?: boolean;
}) => {
  const [activeFilter, setActiveFilter] = useState<FlowState | null>(null);

  // Sync filter when drawer opens with a pre-selected filter
  useEffect(() => {
    if (open) setActiveFilter(initialFilter ?? null);
  }, [open, initialFilter]);

  // Compute flow state for each flow
  const flowsWithState = useMemo(() => DATA_FLOWS.map((flow, idx) => {
    const override = flowStateOverrides.get(flow.id);
    const base = getFlowState(configuredCategories.has(flow.source), configuredCategories.has(flow.target));
    const state: FlowState = override || base;
    return { flow, idx, state };
  }), [configuredCategories, flowStateOverrides]);

  // Group flows by phase, applying filter
  const groupedByPhase = useMemo(() => {
    const groups: Record<FlowPhase, { flow: (typeof DATA_FLOWS)[number]; idx: number; state: FlowState }[]> = {
      ingest: [],
      response: [],
      correlation: [],
    };
    flowsWithState.forEach(({ flow, idx, state }) => {
      if (activeFilter && state !== activeFilter) return;
      groups[flow.phase].push({ flow, idx, state });
    });
    return groups;
  }, [flowsWithState, activeFilter]);

  const filteredTotal = useMemo(() => flowsWithState.filter(f => !activeFilter || f.state === activeFilter).length, [flowsWithState, activeFilter]);

  // Filter pill button
  const FilterPill = ({ state, label, color }: { state: FlowState; label: string; color: string }) => {
    const count = flowsWithState.filter(f => f.state === state).length;
    const isActive = activeFilter === state;
    return (
      <Box
        onClick={() => setActiveFilter(isActive ? null : state)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.4,
          borderRadius: 1.5,
          border: `1px solid ${isActive ? color : 'hsl(var(--border))'}`,
          bgcolor: isActive ? `${color}22` : 'transparent',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          '&:hover': { borderColor: color, bgcolor: `${color}14` },
        }}
      >
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
        <Typography sx={{ fontSize: '0.68rem', color: isActive ? color : 'hsl(var(--muted-foreground))', fontWeight: isActive ? 700 : 500 }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: '0.65rem', color: isActive ? color : 'hsl(var(--muted-foreground))', fontWeight: 700, ml: 0.25 }}>
          {count}
        </Typography>
      </Box>
    );
  };

  return (
    <Drawer
      anchor="right"
      variant="persistent"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          boxSizing: 'border-box',
          width: { xs: '100vw', sm: 440 },
          minWidth: { xs: '100vw', sm: 380 },
          maxWidth: { xs: '100vw', sm: 600 },
        },
      }}
      PaperProps={{
        sx: {
          boxSizing: 'border-box',
          width: { xs: '100%', sm: 440 },
          minWidth: { xs: '100vw', sm: 380 },
          maxWidth: { xs: '100vw', sm: 600 },
          background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
          borderLeft: '1px solid hsl(var(--border))',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
        },
      }}
    >
      {/* Header */}
      <Box sx={{
        px: 3,
        py: 2.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderBottom: '1px solid hsl(var(--border))',
      }}>
        <Box sx={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'hsla(var(--primary) / 0.12)',
          color: 'hsl(var(--primary))',
        }}>
          <Activity size={22} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'hsl(var(--foreground))' }}>
            All Data Flows
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
            {activeFilter ? `${filteredTotal} of ${DATA_FLOWS.length}` : DATA_FLOWS.length} connections
            {isSupport && driftMap && (() => {
              const actualDrifts = Array.from(driftMap.values()).filter(d => d.drifts.length > 0).length;
              if (actualDrifts === 0) return null;
              return (
                <Box component="span" sx={{ ml: 1, color: 'hsl(200 80% 50%)', fontWeight: 700 }}>
                  • {actualDrifts} drift{actualDrifts > 1 ? 's' : ''}
                </Box>
              );
            })()}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: 'hsl(var(--muted-foreground))' }}>
          <CloseIcon size={20} />
        </IconButton>
      </Box>

      {/* Phase guide intro + filter pills */}
      <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid hsl(var(--border))', bgcolor: 'hsla(var(--muted) / 0.3)' }}>
        <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.6, mb: 1.25 }}>
          Data flows are organised into <strong style={{ color: 'hsl(var(--foreground))' }}>3 phases</strong> — work through them in order to build a fully automated security stack.
        </Typography>
        {/* Filter pills */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.6rem', color: 'hsl(var(--muted-foreground))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', mr: 0.25 }}>Filter:</Typography>
          <FilterPill state="enabled" label="Enabled" color="hsl(142 71% 45%)" />
          <FilterPill state="missing_config" label="Misconfigured" color="hsl(45 93% 47%)" />
          <FilterPill state="disabled" label="Disabled" color="hsla(var(--muted-foreground) / 0.6)" />
          {activeFilter && (
            <Box
              onClick={() => setActiveFilter(null)}
              sx={{ ml: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.25 }}
            >
              <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--primary))' }}>Clear</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Flow list grouped by phase */}
      <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
        {FLOW_PHASES.map((phase) => {
          const flows = groupedByPhase[phase.id];
          if (!flows.length) return null;

          return (
            <Box key={phase.id} sx={{ mb: 3 }}>
              {/* Phase header */}
              <Box sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
                mb: 1.5,
                p: 1.5,
                borderRadius: 2,
                border: `1px solid hsla(var(${phase.color}) / 0.25)`,
                bgcolor: `hsla(var(${phase.color}) / 0.06)`,
              }}>
                {/* Step badge */}
                <Box sx={{
                  minWidth: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: `hsl(var(${phase.color}))`,
                  color: 'hsl(var(--background))',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  flexShrink: 0,
                  mt: 0.1,
                }}>
                  {phase.step}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                    <Box sx={{ color: `hsl(var(${phase.color}))`, display: 'flex' }}>
                      {PHASE_ICONS[phase.id]}
                    </Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: `hsl(var(${phase.color}))` }}>
                      {phase.label}
                    </Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', ml: 'auto', flexShrink: 0 }}>
                      {flows.length} flow{flows.length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.5 }}>
                    {phase.subtitle}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ ml: 0.5 }}>
                {[...flows].sort((a, b) => {
                  const tagA = a.flow.tags?.[0] || '';
                  const tagB = b.flow.tags?.[0] || '';
                  return tagA.localeCompare(tagB);
                }).map(({ flow, idx, state }) => (
                  <DataFlowCard
                    key={flow.id}
                    flow={flow}
                    edgeId={flow.id}
                    enabled={activeCategories.has(flow.source) && activeCategories.has(flow.target)}
                    flowState={state}
                    highlighted={highlightEdgeIdx === idx}
                    isAgentic={agenticFlows.has(flow.id)}
                    showTags
                    drift={isSupport ? driftMap?.get(flow.id) : undefined}
                    onClick={() => { onClose(); onSelectFlow(idx); }}
                    onMouseEnter={() => onEdgeHover(flow.id)}
                    onMouseLeave={() => onEdgeHover(null)}
                  />
                ))}
              </Box>
            </Box>
          );
        })}
        {filteredTotal === 0 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>No flows match this filter.</Typography>
          </Box>
        )}

        {/* API-only usecases (support view) */}
        {isSupport && driftMap && (() => {
          const apiOnlyDrifts = Array.from(driftMap.values()).filter(d => d.drifts.includes('api_only'));
          if (apiOnlyDrifts.length === 0) return null;
          return (
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid hsla(200 80% 50% / 0.2)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'hsla(200 80% 50% / 0.15)', color: 'hsl(200 80% 50%)', fontSize: '0.65rem', fontWeight: 700 }}>
                  !
                </Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'hsl(200 80% 50%)' }}>
                  API Usecases Without Data Flows
                </Typography>
                <Typography sx={{ fontSize: '0.65rem', color: 'hsl(200 80% 50%)', ml: 'auto', fontWeight: 700 }}>
                  {apiOnlyDrifts.length}
                </Typography>
              </Box>
              {apiOnlyDrifts.map((drift) => {
                const source = normalizeCategory(drift.apiUsecase!.type ?? '');
                const target = normalizeCategory(drift.apiUsecase!.last ?? '');
                const sourceCat = TOOL_CATEGORIES.find(c => c.id === source);
                const targetCat = TOOL_CATEGORIES.find(c => c.id === target);
                return (
                  <Box
                    key={drift.usecaseId}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, ml: 1, mb: 0.5,
                      borderRadius: 1.5, border: '1px solid hsla(200 80% 50% / 0.15)',
                      bgcolor: 'hsla(200 80% 50% / 0.04)',
                    }}
                  >
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'hsl(200 80% 50%)', flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(200 80% 50%)' }}>
                        {drift.apiUsecase!.name}
                      </Typography>
                      <Typography sx={{ fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sourceCat?.label || source} → {targetCat?.label || target} • {drift.apiCategory}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.6rem', px: 0.75, py: 0.25, borderRadius: 0.75, flexShrink: 0, bgcolor: 'hsla(200 80% 50% / 0.12)', border: '1px solid hsla(200 80% 50% / 0.3)', color: 'hsl(200 80% 50%)', fontWeight: 700 }}>
                      API ONLY
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          );
        })()}
      </Box>
    </Drawer>
  );
};



const EdgeDetailDrawer = ({
  flow,
  edgeIdx,
  open,
  onClose,
  onSelectCategory,
  onViewAllFlows,
  activeCategories,
  configuredCategories,
  categoryApps,
  flowStateOverrides,
  onSetFlowState,
  agenticFlows,
  onToggleAgentic,
  disabledApps,
  onToggleAppDisabled,
  driftMap,
  isSupport,
  apiLoaded,
  usecasesLoading,
}: {
  flow: (typeof DATA_FLOWS)[number] | null;
  edgeIdx: number | null;
  open: boolean;
  onClose: () => void;
  onSelectCategory: (categoryId: string) => void;
  onViewAllFlows: (fromEdgeIdx: number) => void;
  activeCategories: Set<string>;
  configuredCategories: Set<string>;
  categoryApps: Record<string, MatchedApp[]>;
  flowStateOverrides: Map<string, FlowState>;
  onSetFlowState: (edgeId: string, state: FlowState) => void;
  agenticFlows: Set<string>;
  onToggleAgentic: (edgeId: string) => void;
  disabledApps: Set<string>;
  onToggleAppDisabled: (appName: string) => void;
  driftMap?: Map<string, UsecaseDrift>;
  isSupport?: boolean;
  apiLoaded?: boolean;
  usecasesLoading?: boolean;
}) => {
  if (!flow) return null;
  const edgeId = edgeIdx !== null ? (DATA_FLOWS[edgeIdx]?.id ?? '') : '';
  const overrideState = flowStateOverrides.get(edgeId);

  const sourceCat = getToolCategoryMeta(flow.source);
  const targetCat = getToolCategoryMeta(flow.target);
  const headerColor = sourceCat?.color || '--primary';

  const sourceConfigured = configuredCategories.has(flow.source);
  const targetConfigured = configuredCategories.has(flow.target);
  const sourceActive = activeCategories.has(flow.source);
  const targetActive = activeCategories.has(flow.target);
  const baseFlowState = getFlowState(sourceConfigured, targetConfigured);
  const flowState: FlowState = overrideState || baseFlowState;
  const badge = FLOW_STATE_BADGE[flowState];

  // Check if at least one side has a validated app
  const sourceApps = categoryApps[flow.source] || [];
  const targetApps = categoryApps[flow.target] || [];
  const hasValidApp = sourceApps.some(a => a.hasValidAuth) || targetApps.some(a => a.hasValidAuth);
  const canEnable = baseFlowState === 'missing_config' && hasValidApp;

  return (
    <Drawer
      anchor="right"
      variant="persistent"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          boxSizing: 'border-box',
          width: { xs: '100vw', sm: 440 },
          minWidth: { xs: '100vw', sm: 380 },
          maxWidth: { xs: '100vw', sm: 600 },
        },
      }}
      PaperProps={{
        sx: {
          boxSizing: 'border-box',
          width: { xs: '100%', sm: 440 },
          minWidth: { xs: '100vw', sm: 380 },
          maxWidth: { xs: '100vw', sm: 600 },
          background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
          borderLeft: '1px solid hsl(var(--border))',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
        },
      }}
    >
      {/* Back to All Data Flows */}
      <Box
        onClick={() => edgeIdx !== null && onViewAllFlows(edgeIdx)}
        sx={{
          px: 3,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          cursor: 'pointer',
          borderBottom: '1px solid hsl(var(--border))',
          transition: 'background 0.15s ease',
          '&:hover': { bgcolor: 'hsla(var(--primary) / 0.06)' },
        }}
      >
        <ChevronRight size={14} style={{ color: 'hsl(var(--primary))', transform: 'rotate(180deg)' }} />
        <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--primary))', fontWeight: 600 }}>
          All Data Flows
        </Typography>
      </Box>

      {/* Header */}
      <Box sx={{
        px: 3,
        py: 2.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderBottom: '1px solid hsl(var(--border))',
      }}>
        <Box sx={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: `hsla(var(${headerColor}) / 0.12)`,
          color: `hsl(var(${headerColor}))`,
        }}>
          {sourceCat?.icon || <ArrowRight size={22} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>
            {flow.label}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
            Data Flow Connection
          </Typography>
        </Box>
        <Tooltip title="Open detail page" arrow>
          <IconButton
            component="a"
            href={`/infrastructure/flows/${flow.id}`}
            size="small"
            sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--primary))' } }}
          >
            <ExternalLink size={16} />
          </IconButton>
        </Tooltip>
        <IconButton onClick={onClose} size="small" sx={{ color: 'hsl(var(--muted-foreground))' }}>
          <CloseIcon size={20} />
        </IconButton>
      </Box>

      {/* Status */}
      <Box sx={{
        px: 3,
        py: 2,
        borderBottom: '1px solid hsl(var(--border))',
        bgcolor: `${badge.bg}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
      }}>
        <Box sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: badge.color,
          mt: '5px',
          flexShrink: 0,
          boxShadow: flowState === 'enabled' ? `0 0 6px ${badge.color}` : 'none',
        }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: badge.color, lineHeight: 1.3 }}>
            {badge.label}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mt: 0.25 }}>
            {flowState === 'enabled'
              ? 'Both endpoints are configured and the flow has been verified.'
              : flowState === 'missing_config'
              ? 'Both categories are configured but this flow has not been tested yet.'
              : 'One or both categories have no apps configured yet.'}
          </Typography>
          {/* Enable / Revert buttons */}
          {flowState === 'enabled' ? (
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'hsl(142 71% 45%)', fontWeight: 600 }}>
                ✓ Manually marked as Enabled
              </Typography>
              <Button
                size="small"
                onClick={() => onSetFlowState(edgeId, 'missing_config')}
                sx={{
                  color: 'hsl(var(--muted-foreground))',
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  px: 1.5,
                  py: 0.25,
                  borderRadius: 1,
                  textTransform: 'none',
                  border: '1px solid hsla(var(--muted-foreground) / 0.25)',
                  '&:hover': { bgcolor: 'hsla(var(--muted-foreground) / 0.1)', borderColor: 'hsl(var(--muted-foreground))' },
                }}
              >
                Mark as Misconfigured
              </Button>
            </Box>
          ) : canEnable ? (
            <Box sx={{ mt: 1.5 }}>
              <Button
                size="small"
                onClick={() => onSetFlowState(edgeId, 'enabled')}
                sx={{
                  bgcolor: 'hsl(142 71% 45%)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  px: 2,
                  py: 0.5,
                  borderRadius: 1.5,
                  textTransform: 'none',
                  '&:hover': { bgcolor: 'hsl(142 71% 38%)' },
                }}
              >
                Mark as Enabled
              </Button>
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* Flow direction */}
      <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid hsl(var(--border))' }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
          Connection Path
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          {sourceCat && (
            <Chip
              icon={<Box sx={{ display: 'flex', color: sourceActive ? `hsl(var(${sourceCat.color}))` : 'hsl(var(--muted-foreground))' }}>{sourceCat.icon}</Box>}
              label={sourceCat.label}
              size="small"
              onClick={() => onSelectCategory(flow.source)}
              sx={{
                bgcolor: sourceActive ? `hsla(var(${sourceCat.color}) / 0.1)` : 'hsla(var(--muted-foreground) / 0.08)',
                color: sourceActive ? `hsl(var(${sourceCat.color}))` : 'hsl(var(--muted-foreground))',
                fontWeight: 600,
                fontSize: '0.8rem',
                border: sourceActive
                  ? `1px solid hsla(var(${sourceCat.color}) / 0.25)`
                  : '1px solid hsla(var(--muted-foreground) / 0.2)',
                cursor: 'pointer',
                '&:hover': { bgcolor: sourceActive ? `hsla(var(${sourceCat.color}) / 0.2)` : 'hsla(var(--muted-foreground) / 0.15)' },
              }}
            />
          )}
          <ArrowRight size={16} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
          {targetCat && (
            <Chip
              icon={<Box sx={{ display: 'flex', color: targetActive ? `hsl(var(${targetCat.color}))` : 'hsl(var(--muted-foreground))' }}>{targetCat.icon}</Box>}
              label={targetCat.label}
              size="small"
              onClick={() => onSelectCategory(flow.target)}
              sx={{
                bgcolor: targetActive ? `hsla(var(${targetCat.color}) / 0.1)` : 'hsla(var(--muted-foreground) / 0.08)',
                color: targetActive ? `hsl(var(${targetCat.color}))` : 'hsl(var(--muted-foreground))',
                fontWeight: 600,
                fontSize: '0.8rem',
                border: targetActive
                  ? `1px solid hsla(var(${targetCat.color}) / 0.25)`
                  : '1px solid hsla(var(--muted-foreground) / 0.2)',
                cursor: 'pointer',
                '&:hover': { bgcolor: targetActive ? `hsla(var(${targetCat.color}) / 0.2)` : 'hsla(var(--muted-foreground) / 0.15)' },
              }}
            />
          )}
        </Box>
      </Box>

      {/* Description */}
      <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid hsl(var(--border))' }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
          Why This Matters
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', lineHeight: 1.7 }}>
          {flow.description}
        </Typography>
        {flow.tags && flow.tags.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.5 }}>
            {flow.tags.map(tag => {
              const tc = TAG_COLORS[tag] ?? DEFAULT_TAG_COLOR;
              return (
                <Typography key={tag} sx={{ fontSize: '0.65rem', px: 1, py: 0.3, borderRadius: 1, fontWeight: 600, letterSpacing: '0.04em', color: tc.color, bgcolor: tc.bg, border: `1px solid ${tc.border}` }}>
                  {tag}
                </Typography>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Agentic section */}
      {(() => {
        const edgeId = edgeIdx !== null ? (DATA_FLOWS[edgeIdx]?.id ?? '') : '';
        const isAgenticEnabled = agenticFlows.has(edgeId);
        return (
          <Box sx={{ px: 3, py: 2.5, bgcolor: isAgenticEnabled ? 'hsla(var(--primary) / 0.04)' : 'transparent', transition: 'background 0.2s' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: isAgenticEnabled ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
                Agentic Mode
              </Typography>
              <Button
                size="small"
                onClick={() => onToggleAgentic(edgeId)}
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  px: 1.5,
                  py: 0.25,
                  borderRadius: 1,
                  textTransform: 'none',
                  ...(isAgenticEnabled ? {
                    bgcolor: 'hsla(var(--primary) / 0.15)',
                    color: 'hsl(var(--primary))',
                    border: '1px solid hsla(var(--primary) / 0.35)',
                    '&:hover': { bgcolor: 'hsla(var(--primary) / 0.25)' },
                  } : {
                    bgcolor: 'transparent',
                    color: 'hsl(var(--muted-foreground))',
                    border: '1px solid hsla(var(--muted-foreground) / 0.25)',
                    '&:hover': { bgcolor: 'hsla(var(--muted-foreground) / 0.08)', borderColor: 'hsl(var(--muted-foreground))' },
                  }),
                }}
              >
                {isAgenticEnabled ? 'Enabled — Disable' : 'Enable Agentic'}
              </Button>
            </Box>
            {!isAgenticEnabled && (
              <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.6, mb: 1 }}>
                Disabled by default. Enable to allow an AI agent to actively interact with this data flow beyond simple automation.
              </Typography>
            )}
            <Typography sx={{ fontSize: '0.82rem', color: isAgenticEnabled ? 'hsl(var(--foreground))' : 'hsla(var(--muted-foreground) / 0.7)', lineHeight: 1.7, fontStyle: isAgenticEnabled ? 'normal' : 'italic', transition: 'color 0.2s' }}>
              {flow.agenticDescription}
            </Typography>
          </Box>
        );
      })()}

      {/* API Usecase mapping (support only) */}
      {isSupport && (() => {
        if (usecasesLoading) {
          return (
            <Box sx={{ px: 3, py: 2.5, borderTop: '1px solid hsl(var(--border))', bgcolor: 'hsla(var(--muted-foreground) / 0.03)' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box component="span" sx={{ width: 16, height: 16, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'hsla(var(--muted-foreground) / 0.15)', fontSize: '0.55rem', fontWeight: 800 }}>
                  …
                </Box>
                API Usecase
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', mt: 1 }}>
                Loading usecase data…
              </Typography>
            </Box>
          );
        }
        // If API data not loaded yet, just proceed — the match logic below handles "no match" gracefully

        const drift = driftMap?.get(flow.id);
        const matchedApiUc = drift?.apiUsecase;
        const matchedCategory = drift?.apiCategory;
        const hasMatch = !!matchedApiUc;
        const hasDrifts = drift ? drift.drifts.filter(d => d !== 'local_only').length > 0 : false;

        // Matching details for debug display
        const normalizedSource = normalizeCategory(flow.source);
        const normalizedTarget = normalizeCategory(flow.target);
        const matchKey = `${normalizedSource}→${normalizedTarget}`;

        return (
          <Box sx={{ px: 3, py: 2.5, borderTop: '1px solid hsl(var(--border))', bgcolor: hasMatch ? 'hsla(200 80% 50% / 0.02)' : 'hsla(45 93% 47% / 0.03)' }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: hasMatch ? 'hsl(200 80% 50%)' : 'hsl(45 93% 47%)', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box component="span" sx={{
                width: 16, height: 16, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: hasMatch ? 'hsla(200 80% 50% / 0.15)' : 'hsla(45 93% 47% / 0.15)',
                fontSize: '0.55rem', fontWeight: 800,
              }}>
                {hasMatch ? '✓' : '✗'}
              </Box>
              {hasMatch ? 'Matched Usecase' : 'No Matched Usecase'}
            </Typography>

            {/* Match resolution debug box */}
            <Box sx={{ borderRadius: 1.5, border: '1px solid hsl(var(--border))', bgcolor: 'hsla(var(--muted-foreground) / 0.03)', p: 1.5, mb: 1.5, fontFamily: 'monospace' }}>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
                Match Resolution
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                  Data Flow: <Box component="span" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>{flow.source}</Box> → <Box component="span" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>{flow.target}</Box>
                </Typography>
                {(normalizedSource !== flow.source || normalizedTarget !== flow.target) && (
                  <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                    Normalized: <Box component="span" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>{normalizedSource}</Box> → <Box component="span" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>{normalizedTarget}</Box>
                  </Typography>
                )}
                <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                  Match Key: <Box component="span" sx={{ color: hasMatch ? 'hsl(142 71% 45%)' : 'hsl(45 93% 47%)', fontWeight: 700 }}>{matchKey}</Box>
                </Typography>
                {hasMatch && matchedApiUc && (
                  <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                    API Route: <Box component="span" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>{matchedApiUc.type}</Box> → <Box component="span" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>{matchedApiUc.last}</Box>
                    {' '}= <Box component="span" sx={{ color: 'hsl(142 71% 45%)', fontWeight: 700 }}>{normalizeCategory(matchedApiUc.type ?? '')}→{normalizeCategory(matchedApiUc.last ?? '')}</Box>
                  </Typography>
                )}
              </Box>
            </Box>

            {hasMatch && matchedApiUc ? (
              <Box sx={{ borderRadius: 2, border: '1px solid hsla(200 80% 50% / 0.2)', bgcolor: 'hsla(200 80% 50% / 0.04)', p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>
                    {matchedApiUc.name}
                  </Typography>
                  {matchedCategory && (
                    <Typography sx={{ fontSize: '0.6rem', px: 0.75, py: 0.25, borderRadius: 0.75, bgcolor: 'hsla(200 80% 50% / 0.12)', border: '1px solid hsla(200 80% 50% / 0.3)', color: 'hsl(200 80% 50%)', fontWeight: 700 }}>
                      {matchedCategory}
                    </Typography>
                  )}
                </Box>
                {matchedApiUc.description && (
                  <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--foreground))', lineHeight: 1.6, mb: 1.5 }}>
                    {matchedApiUc.description}
                  </Typography>
                )}
                {/* Drift indicators */}
                {hasDrifts && drift && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                    {drift.drifts.filter(d => d !== 'local_only').map(d => (
                      <Typography key={d} sx={{ fontSize: '0.6rem', px: 0.75, py: 0.25, borderRadius: 0.75, fontWeight: 700, bgcolor: d === 'phase_mismatch' ? 'hsla(45 93% 47% / 0.12)' : 'hsla(200 80% 50% / 0.12)', border: d === 'phase_mismatch' ? '1px solid hsla(45 93% 47% / 0.3)' : '1px solid hsla(200 80% 50% / 0.3)', color: d === 'phase_mismatch' ? 'hsl(45 93% 47%)' : 'hsl(200 80% 50%)' }}>
                        {d.replace(/_/g, ' ').toUpperCase()}
                      </Typography>
                    ))}
                  </Box>
                )}
                {/* Links */}
                {(matchedApiUc.video || matchedApiUc.blogpost) && (
                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                    {matchedApiUc.video && (
                      <Typography component="a" href={matchedApiUc.video} target="_blank" rel="noopener noreferrer"
                        sx={{ fontSize: '0.75rem', color: 'hsl(200 80% 50%)', fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                        ▶ Video
                      </Typography>
                    )}
                    {matchedApiUc.blogpost && (
                      <Typography component="a" href={matchedApiUc.blogpost} target="_blank" rel="noopener noreferrer"
                        sx={{ fontSize: '0.75rem', color: 'hsl(200 80% 50%)', fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                        📝 Blog Post
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            ) : (
              <Box sx={{ borderRadius: 2, border: '1px solid hsla(0 65% 50% / 0.25)', bgcolor: 'hsla(0 65% 50% / 0.04)', p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'hsl(0 65% 50%)' }} />
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'hsl(0 65% 50%)' }}>
                    Unmatched Data Flow
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>
                  No API usecase matches the route <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'hsl(var(--foreground))' }}>{matchKey}</Box>. This data flow needs a corresponding entry in <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>/api/v1/workflows/usecases</Box>.
                </Typography>
              </Box>
            )}
          </Box>
        );
      })()}
    </Drawer>
  );
};


// ── Detail Drawer ──────────────────────────────────────────────────────────────

const CategoryDetailDrawer = ({
  category,
  matchedApps,
  open,
  onClose,
  onEdgeHover,
  onEdgeClick,
  onViewAllFlows,
  activeCategories,
  configuredCategories,
  disabledAppsForCategory,
  onToggleAppDisabledForCategory,
  onRefreshApps,
}: {
  category: ToolCategory | null;
  matchedApps: MatchedApp[];
  open: boolean;
  onClose: () => void;
  onEdgeHover: (edgeId: string | null) => void;
  onEdgeClick: (edgeIdx: number) => void;
  onViewAllFlows: () => void;
  activeCategories: Set<string>;
  configuredCategories: Set<string>;
  disabledAppsForCategory?: Set<string>;
  onToggleAppDisabledForCategory?: (appName: string) => void;
  onRefreshApps?: () => void;
}) => {
  const navigate = useNavigate();
  const hasApps = matchedApps.length > 0;
  const [expanded, setExpanded] = React.useState(!hasApps);
  const [showSearch, setShowSearch] = React.useState(false);

  if (!category) return null;
  const colorVar = category.color;

  // Find all branches connected to this category
  const connectedFlows = DATA_FLOWS.map((flow, idx) => {
    const isSource = flow.source === category.id;
    const isTarget = flow.target === category.id;
    if (!isSource && !isTarget) return null;
    const otherCatId = isSource ? flow.target : flow.source;
    const otherCat = TOOL_CATEGORIES.find(c => c.id === otherCatId);
    return { flow, idx, isSource, otherCat };
  }).filter(Boolean) as { flow: (typeof DATA_FLOWS)[number]; idx: number; isSource: boolean; otherCat: ToolCategory | undefined }[];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          boxSizing: 'border-box',
          width: { xs: '100vw', sm: 440 },
          minWidth: { xs: '100vw', sm: 380 },
          maxWidth: { xs: '100vw', sm: 600 },
        },
      }}
      PaperProps={{
        sx: {
          boxSizing: 'border-box',
          width: { xs: '100%', sm: 440 },
          minWidth: { xs: '100vw', sm: 380 },
          maxWidth: { xs: '100vw', sm: 600 },
          background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
          borderLeft: '1px solid hsl(var(--border))',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
        },
      }}
    >
      {/* Header */}
      <Box sx={{
        px: 3,
        py: 2.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderBottom: '1px solid hsl(var(--border))',
      }}>
        <Box sx={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: `hsla(var(${colorVar}) / 0.12)`,
          color: `hsl(var(${colorVar}))`,
        }}>
          {category.icon}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'hsl(var(--foreground))' }}>
            {category.label}
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>
            {category.description}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: 'hsl(var(--muted-foreground))' }}>
          <CloseIcon size={20} />
        </IconButton>
      </Box>

      <Box sx={{ p: 3, overflowY: 'auto', flex: 1 }}>
        {/* Your Apps — filtered IntegrationStatus for this category */}
        {matchedApps.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <IntegrationStatus
              collapsed={false}
              filterApps={matchedApps.map(a => a.name)}
              onAddClick={() => setShowSearch(true)}
              iconSize={36}
              disabledApps={disabledAppsForCategory}
              onDisable={onToggleAppDisabledForCategory}
            />
          </Box>
        )}

        {/* Add App Modal — shown when Plus is clicked or no apps yet */}
        {!hasApps && (
          <Box sx={{ mb: 2 }}>
            <Typography
              sx={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'hsl(var(--muted-foreground))',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                mb: 1,
              }}
            >
              Find & Add Apps
            </Typography>
            <Box
              onClick={() => setShowSearch(true)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                px: 2,
                py: 1.75,
                borderRadius: 2,
                border: '1.5px solid hsl(var(--primary))',
                cursor: 'pointer',
                color: 'hsl(var(--primary))',
                bgcolor: 'hsla(var(--primary) / 0.06)',
                transition: 'all 0.15s ease',
                '&:hover': {
                  bgcolor: 'hsla(var(--primary) / 0.12)',
                  boxShadow: '0 0 0 1px hsl(var(--primary) / 0.3)',
                },
              }}
            >
              <X size={15} style={{ transform: 'rotate(45deg)' }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Find your {category.label} tools...
              </Typography>
            </Box>
          </Box>
        )}

        {/* Add App Modal */}
        <AddAppModal
          open={showSearch}
          onClose={() => {
            setShowSearch(false);
            onRefreshApps?.();
          }}
          initialQuery={category.label}
          categoryLabel={category.label}
        />


        {!hasApps && <Box sx={{ mb: 3, border: '1px solid hsl(var(--border))', borderRadius: 2, overflow: 'hidden' }}>
              {/* Collapsible header */}
              <Box
                onClick={() => setExpanded(v => !v)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1.5,
                  cursor: 'pointer',
                  bgcolor: expanded ? `hsla(var(${colorVar}) / 0.06)` : 'transparent',
                  transition: 'background 0.15s',
                  '&:hover': { bgcolor: `hsla(var(${colorVar}) / 0.08)` },
                }}
              >
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Common Tools &amp; Sub-categories
                </Typography>
                <Box sx={{ color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </Box>
              </Box>
              {/* Collapsible content */}
              {expanded && (
                <Box sx={{ px: 2, pt: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {/* Common Tools */}
                  <Box>
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
                      Common Tools
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      {category.examples.slice(0, 6).map(ex => (
                        <Chip
                          key={ex}
                          avatar={<Avatar src={`https://shuffler.io/images/apps/${ex.toLowerCase().replace(/\s+/g, '_')}.png`} sx={{ width: 18, height: 18, '& img': { objectFit: 'contain' } }} />}
                          label={ex}
                          size="small"
                          clickable
                          onClick={() => navigate(`/apps/${ex.toLowerCase().replace(/\s+/g, '_')}`)}
                          sx={{
                            height: 26,
                            fontSize: '0.72rem',
                            bgcolor: `hsla(var(${colorVar}) / 0.08)`,
                            color: 'hsl(var(--foreground))',
                            border: `1px solid hsla(var(${colorVar}) / 0.2)`,
                            cursor: 'pointer',
                            '&:hover': {
                              bgcolor: `hsla(var(${colorVar}) / 0.18)`,
                              borderColor: `hsla(var(${colorVar}) / 0.4)`,
                            },
                          }}
                        />
                      ))}
                    </Box>
                  </Box>

                  {/* Sub-categories */}
                  {category.subcategories.length > 0 && (
                    <Box>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
                        Sub-categories
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        {category.subcategories.map(sub => (
                          <Box
                            key={sub.label}
                            sx={{
                              px: 1.5,
                              py: 1,
                              borderRadius: 1.5,
                              bgcolor: `hsla(var(${colorVar}) / 0.06)`,
                              border: `1px solid hsla(var(${colorVar}) / 0.15)`,
                            }}
                          >
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: `hsl(var(${colorVar}))` }}>
                              {sub.label}
                            </Typography>
                            <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', mt: 0.25 }}>
                              {sub.description}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              )}
            </Box>}

        {/* Data Flows — grouped by phase */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Data Flows
            </Typography>
            <Chip
              label="View All"
              size="small"
              icon={<Activity size={11} />}
              onClick={onViewAllFlows}
              sx={{
                height: 22,
                fontSize: '0.65rem',
                bgcolor: 'hsla(var(--primary) / 0.08)',
                color: 'hsl(var(--primary))',
                border: '1px solid hsla(var(--primary) / 0.2)',
                cursor: 'pointer',
                '& .MuiChip-icon': { color: 'hsl(var(--primary))' },
                '&:hover': { bgcolor: 'hsla(var(--primary) / 0.16)' },
              }}
            />
          </Box>
          {FLOW_PHASES.map((phase) => {
            const phaseFlows = connectedFlows.filter(({ flow }) => flow.phase === phase.id);
            if (!phaseFlows.length) return null;
            return (
              <Box key={phase.id} sx={{ mb: 2.5 }}>
                {/* Phase header */}
                <Box sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  mb: 1.5,
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid hsla(var(${phase.color}) / 0.25)`,
                  bgcolor: `hsla(var(${phase.color}) / 0.06)`,
                }}>
                  <Box sx={{
                    minWidth: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: `hsl(var(${phase.color}))`,
                    color: 'hsl(var(--background))',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    flexShrink: 0,
                    mt: 0.1,
                  }}>
                    {phase.step}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                      <Box sx={{ color: `hsl(var(${phase.color}))`, display: 'flex' }}>
                        {PHASE_ICONS[phase.id]}
                      </Box>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: `hsl(var(${phase.color}))` }}>
                        {phase.label}
                      </Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', ml: 'auto', flexShrink: 0 }}>
                        {phaseFlows.length} flow{phaseFlows.length !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.5 }}>
                      {phase.subtitle}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ ml: 0.5 }}>
                  {[...phaseFlows].sort((a, b) => {
                    const tagA = a.flow.tags?.[0] || '';
                    const tagB = b.flow.tags?.[0] || '';
                    return tagA.localeCompare(tagB);
                  }).map(({ flow, idx }) => {
                    const isEnabled = activeCategories.has(flow.source) && activeCategories.has(flow.target);
                    const flowState = getFlowState(configuredCategories.has(flow.source), configuredCategories.has(flow.target));
                    return (
                      <DataFlowCard
                        key={flow.id}
                        flow={flow}
                        edgeId={flow.id}
                        enabled={isEnabled}
                        flowState={flowState}
                        showTags
                        onClick={() => onEdgeClick(idx)}
                        onMouseEnter={() => onEdgeHover(flow.id)}
                        onMouseLeave={() => onEdgeHover(null)}
                      />
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Drawer>
  );
};

// ── Helper Lines Renderer ──────────────────────────────────────────────────────

const HelperLinesRenderer = ({ horizontal, vertical }: { horizontal?: number; vertical?: number }) => {
  const { x, y, zoom } = useViewport();
  if (horizontal === undefined && vertical === undefined) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {horizontal !== undefined && (
        <line
          x1="0"
          x2="100%"
          y1={horizontal * zoom + y}
          y2={horizontal * zoom + y}
          stroke="hsl(var(--primary))"
          strokeWidth={1}
          strokeDasharray="6 3"
          opacity={0.7}
        />
      )}
      {vertical !== undefined && (
        <line
          x1={vertical * zoom + x}
          x2={vertical * zoom + x}
          y1="0"
          y2="100%"
          stroke="hsl(var(--primary))"
          strokeWidth={1}
          strokeDasharray="6 3"
          opacity={0.7}
        />
      )}
    </svg>
  );
};

// ── Page Component ─────────────────────────────────────────────────────────────

const POSITION_CACHE_KEY = 'infrastructure_node_positions';
const HANDLE_CACHE_KEY = 'infrastructure_edge_handles';
const WAYPOINT_CACHE_KEY = 'infrastructure_edge_waypoints';
const ENABLED_FLOWS_CACHE_KEY = 'infrastructure_enabled_flows';
const AGENTIC_FLOWS_CACHE_KEY = 'infrastructure_agentic_flows';
const DISABLED_APPS_CACHE_KEY = 'infrastructure_disabled_apps_per_flow';

type WaypointOverrides = Record<string, Array<{ x: number; y: number }>>;
type HandleOverrides = Record<string, { sourceHandle?: string; targetHandle?: string }>;

const InfrastructureContent = () => {
  usePageMeta({ title: 'Infrastructure', description: 'Security tool integrations and data flow visualization' });
  const reactFlowInstance = useReactFlow();
  const { userInfo } = useAuth();
  const { resolvedTheme } = useTheme();
  const { driftMap, hasDrift, apiLoaded, isLoading: usecasesLoading } = useUsecases();
  const isSupport = userInfo?.support === true;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);
  const [showAllFlows, setShowAllFlows] = useState(false);
  const [allFlowsFilter, setAllFlowsFilter] = useState<FlowState | null>(null);
  const [lastViewedEdgeIdx, setLastViewedEdgeIdx] = useState<number | null>(null);
  const [categoryApps, setCategoryApps] = useState<Record<string, MatchedApp[]>>({});
  const [savedHandles, setSavedHandles] = useState<HandleOverrides>({});
  const [savedWaypoints, setSavedWaypoints] = useState<WaypointOverrides>({});
  const [flowStateOverrides, setFlowStateOverrides] = useState<Map<string, FlowState>>(new Map());
  const [agenticFlows, setAgenticFlows] = useState<Set<string>>(new Set());
  // disabledApps: global set of app names disabled across all flows and category drawers
  const [disabledApps, setDisabledApps] = useState<Set<string>>(new Set());
  const [updatingEdgeNodes, setUpdatingEdgeNodes] = useState<{ source: string; target: string; draggedEnd: 'source' | 'target' } | null>(null);
  const updatingEdgeNodesRef = useRef<{ source: string; target: string; draggedEnd: 'source' | 'target' } | null>(null);
  const [savedPositions, setSavedPositions] = useState<Record<string, { x: number; y: number }> | null>(null);
  const [positionsLoaded, setPositionsLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isResettingRef = useRef(false);
  const [helperLines, setHelperLines] = useState<{ horizontal?: number; vertical?: number }>({});
  const [simulatedPhases, setSimulatedPhases] = useState<Set<FlowPhase>>(new Set());

  const toggleSimulatedPhase = useCallback((phase: FlowPhase) => {
    setSimulatedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }, []);

  // All edge indices and category IDs covered by currently simulated phases
  const simulatedEdgeIds = useMemo(() => {
    if (simulatedPhases.size === 0) return new Set<string>();
    const ids = new Set<string>();
    DATA_FLOWS.forEach((flow) => {
      if (simulatedPhases.has(flow.phase)) ids.add(flow.id);
    });
    return ids;
  }, [simulatedPhases]);

  const simulatedCategoryIds = useMemo(() => {
    if (simulatedPhases.size === 0) return new Set<string>();
    const ids = new Set<string>();
    DATA_FLOWS.forEach(flow => {
      if (simulatedPhases.has(flow.phase)) {
        ids.add(flow.source);
        ids.add(flow.target);
      }
    });
    return ids;
  }, [simulatedPhases]);

  // Load saved positions and handle overrides from datastore on mount
  useEffect(() => {
    const loadData = async () => {
      try {
      const [posResult, handleResult, waypointResult, enabledResult, agenticResult, disabledAppsResult] = await Promise.all([
        getDatastoreItem(POSITION_CACHE_KEY, DATASTORE_CATEGORIES.INFRASTRUCTURE),
        getDatastoreItem(HANDLE_CACHE_KEY, DATASTORE_CATEGORIES.INFRASTRUCTURE),
        getDatastoreItem(WAYPOINT_CACHE_KEY, DATASTORE_CATEGORIES.INFRASTRUCTURE),
        getDatastoreItem(ENABLED_FLOWS_CACHE_KEY, DATASTORE_CATEGORIES.INFRASTRUCTURE),
        getDatastoreItem(AGENTIC_FLOWS_CACHE_KEY, DATASTORE_CATEGORIES.INFRASTRUCTURE),
        getDatastoreItem(DISABLED_APPS_CACHE_KEY, DATASTORE_CATEGORIES.INFRASTRUCTURE),
      ]);
      if (posResult.success && posResult.item?.value) {
        const parsed = typeof posResult.item.value === 'string' ? JSON.parse(posResult.item.value) : posResult.item.value;
        if (parsed && typeof parsed === 'object') setSavedPositions(parsed);
      }
      if (handleResult.success && handleResult.item?.value) {
        const parsed = typeof handleResult.item.value === 'string' ? JSON.parse(handleResult.item.value) : handleResult.item.value;
        if (parsed && typeof parsed === 'object') setSavedHandles(parsed);
      }
      if (waypointResult.success && waypointResult.item?.value) {
        const parsed = typeof waypointResult.item.value === 'string' ? JSON.parse(waypointResult.item.value) : waypointResult.item.value;
        if (parsed && typeof parsed === 'object') setSavedWaypoints(parsed);
      }
      if (enabledResult.success && enabledResult.item?.value) {
        const parsed = typeof enabledResult.item.value === 'string' ? JSON.parse(enabledResult.item.value) : enabledResult.item.value;
        // Support both old format (array of IDs = enabled) and new format (object { id: state })
        if (Array.isArray(parsed)) {
          const map = new Map<string, FlowState>();
          parsed.forEach((id: string) => map.set(id, 'enabled'));
          setFlowStateOverrides(map);
        } else if (parsed && typeof parsed === 'object') {
          setFlowStateOverrides(new Map(Object.entries(parsed) as [string, FlowState][]));
        }
      }
      if (agenticResult.success && agenticResult.item?.value) {
        const parsed = typeof agenticResult.item.value === 'string' ? JSON.parse(agenticResult.item.value) : agenticResult.item.value;
        if (Array.isArray(parsed)) setAgenticFlows(new Set(parsed));
      }
      if (disabledAppsResult.success && disabledAppsResult.item?.value) {
        const parsed = typeof disabledAppsResult.item.value === 'string' ? JSON.parse(disabledAppsResult.item.value) : disabledAppsResult.item.value;
        if (Array.isArray(parsed)) {
          setDisabledApps(new Set(parsed as string[]));
        }
      }
      } catch (e) {
        console.warn('Failed to load infrastructure config:', e);
      } finally {
        setPositionsLoaded(true);
      }
    };
    loadData();
  }, []);

  // Set a flow to a specific state, persisted to datastore
  const setFlowStateFn = useCallback((edgeId: string, state: FlowState) => {
    setFlowStateOverrides(prev => {
      const next = new Map(prev);
      // If setting to the auto-computed default, remove the override
      next.set(edgeId, state);
      const obj = Object.fromEntries(next);
      setTimeout(() => {
        setDatastoreItem(ENABLED_FLOWS_CACHE_KEY, obj, DATASTORE_CATEGORIES.INFRASTRUCTURE)
          .catch(e => console.warn('Failed to save flow states:', e));
      }, 0);
      return next;
    });
  }, []);

  // Toggle agentic mode for a flow, persisted to datastore
  const toggleAgenticFlow = useCallback((edgeId: string) => {
    setAgenticFlows(prev => {
      const next = new Set(prev);
      if (next.has(edgeId)) next.delete(edgeId);
      else next.add(edgeId);
      const arr = Array.from(next);
      setTimeout(() => {
        setDatastoreItem(AGENTIC_FLOWS_CACHE_KEY, arr, DATASTORE_CATEGORIES.INFRASTRUCTURE)
          .catch(e => console.warn('Failed to save agentic flows:', e));
      }, 0);
      return next;
    });
  }, []);

  // Toggle a specific app as disabled/enabled globally, persisted to datastore
  const toggleAppDisabled = useCallback((appName: string) => {
    setDisabledApps(prev => {
      const next = new Set(prev);
      if (next.has(appName)) next.delete(appName);
      else next.add(appName);
      const arr = Array.from(next);
      setTimeout(() => {
        setDatastoreItem(DISABLED_APPS_CACHE_KEY, arr, DATASTORE_CATEGORIES.INFRASTRUCTURE)
          .catch(e => console.warn('Failed to save disabled apps:', e));
      }, 0);
      return next;
    });
  }, []);
  const persistPositions = useCallback((positions: Record<string, { x: number; y: number }>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setDatastoreItem(POSITION_CACHE_KEY, positions, DATASTORE_CATEGORIES.INFRASTRUCTURE)
        .catch(e => console.warn('Failed to save positions:', e));
    }, 1000);
  }, []);

  // Save handle overrides to datastore
  const handleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistHandles = useCallback((handles: HandleOverrides) => {
    if (handleSaveTimer.current) clearTimeout(handleSaveTimer.current);
    handleSaveTimer.current = setTimeout(() => {
      setDatastoreItem(HANDLE_CACHE_KEY, handles, DATASTORE_CATEGORIES.INFRASTRUCTURE)
        .catch(e => console.warn('Failed to save handle overrides:', e));
    }, 500);
  }, []);

  // Save waypoint overrides to datastore
  const waypointSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistWaypoints = useCallback((waypoints: WaypointOverrides) => {
    if (waypointSaveTimer.current) clearTimeout(waypointSaveTimer.current);
    waypointSaveTimer.current = setTimeout(() => {
      setDatastoreItem(WAYPOINT_CACHE_KEY, waypoints, DATASTORE_CATEGORIES.INFRASTRUCTURE)
        .catch(e => console.warn('Failed to save waypoints:', e));
    }, 500);
  }, []);

  // Fetch authenticated apps and map to categories
  const fetchApps = useCallback(async () => {
    try {
      const response = await fetch(getApiUrl('/api/v1/apps/authentication'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      if (!response.ok) return;
      const result = await response.json();
      const authData: AuthAppEntry[] = result.data || result;
      if (!Array.isArray(authData)) return;

      const dedupedApps = deduplicateAuthApps(authData);
      await backfillAppImages(dedupedApps);
      const mapped: Record<string, MatchedApp[]> = {};

      dedupedApps.forEach(({ app, bestImage, hasValidAuth }) => {
        const catId = matchAppToCategory(app.name, app.categories || []);
        if (!catId) return;
        if (!mapped[catId]) mapped[catId] = [];
        mapped[catId].push({ name: app.name, image: bestImage || app.large_image || '', hasValidAuth });
      });

      setCategoryApps(mapped);
    } catch (e) {
      console.error('Failed to fetch apps for infrastructure:', e);
    }
  }, []);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const activeId = selectedId || hoveredId;

  // Find the color var for the active category
  const activeCat = activeId ? TOOL_CATEGORIES.find(c => c.id === activeId) : null;
  const activeColor = activeCat ? `hsl(var(${activeCat.color}))` : 'hsl(var(--primary))';

  // Categories that have apps configured (any auth entry) — global view
  const activeCategories = useMemo(() => {
    const set = new Set<string>();
    for (const [catId, apps] of Object.entries(categoryApps)) {
      if (apps.length > 0) set.add(catId);
    }
    return set;
  }, [categoryApps]);

  // Per-edge helper: does this category have at least one non-disabled app?
  const isCategoryActiveForEdge = useCallback((catId: string) => {
    const apps = categoryApps[catId] || [];
    return apps.some(a => !disabledApps.has(a.name));
  }, [categoryApps, disabledApps]);


  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
    setSelectedEdgeIdx(null);
  }, []);

  const handleHover = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  // Use saved positions if available, else default
  const getNodePosition = useCallback((catId: string) => {
    if (savedPositions && savedPositions[catId]) return savedPositions[catId];
    return NODE_POSITIONS[catId] || { x: 0, y: 0 };
  }, [savedPositions]);

  // Build initial nodes only on first load (positions + initial categoryApps)
  const initialNodes: Node[] = useMemo(() =>
    TOOL_CATEGORIES.map(cat => ({
      id: cat.id,
      type: 'category',
      position: getNodePosition(cat.id),
      draggable: true,
      data: {
        category: cat,
        onSelect: handleSelect,
        onHover: handleHover,
        isSelected: false,
        isHovered: false,
        matchedApps: categoryApps[cat.id] || [],
      },
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positionsLoaded]
  );

  const initialEdges: Edge[] = useMemo(() =>
    DATA_FLOWS.map((flow, idx) => {
      const edgeId = flow.id;
      // Use global disabled apps check
      const sourceActive = isCategoryActiveForEdge(flow.source);
      const targetActive = isCategoryActiveForEdge(flow.target);
      const overrideState = flowStateOverrides.get(edgeId);
      const isSimulated = simulatedEdgeIds.has(edgeId);

      // Effective state: override takes priority, otherwise compute from config
      const baseFlowState = getFlowState(sourceActive, targetActive);
      const flowState: FlowState = overrideState || baseFlowState;
      // Simulated edges are treated as if fully enabled
      const bothActive = flowState === 'enabled' || isSimulated;

      const isSelected = selectedEdgeIdx === idx;
      // When a branch is selected, ignore hover on other edges
      const isEdgeHovered = selectedEdgeIdx !== null ? isSelected : hoveredEdgeId === edgeId;
      // Node hover: connected edges should highlight just like edge-hover
      const isNodeHovered = !isEdgeHovered && !!hoveredId && (flow.source === hoveredId || flow.target === hoveredId);
      // Highlight on hover/select
      const isConnected = isEdgeHovered || isNodeHovered || isSimulated || (activeId && (flow.source === activeId || flow.target === activeId));
      const isFullyHighlighted = isConnected && bothActive;

      const hasAnyFocus = selectedEdgeIdx !== null || activeId || hoveredEdgeId || simulatedPhases.size > 0;
      // Don't dim edges that are in simulated phases even if focus is elsewhere
      const isDimmed = hasAnyFocus && !isConnected && !isSimulated;

      // Get category colors for gradient
      const srcCat = TOOL_CATEGORIES.find(c => c.id === flow.source);
      const tgtCat = TOOL_CATEGORIES.find(c => c.id === flow.target);
      const srcColor = srcCat ? `hsl(var(${srcCat.color}))` : 'hsl(var(--primary))';
      const tgtColor = tgtCat ? `hsl(var(${tgtCat.color}))` : 'hsl(var(--primary))';

      // Determine stroke color — simulated/enabled edges show gradient, hover always shows gradient
      const isEnabled = flowState === 'enabled' && !isSimulated;
      let stroke: string;
      let useGradient = false;
      if (isEdgeHovered || isNodeHovered) {
        useGradient = true;
        stroke = srcColor;
      } else if (isSimulated) {
        // Simulation: always show full gradient
        useGradient = true;
        stroke = srcColor;
      } else if (isFullyHighlighted) {
        useGradient = true;
        stroke = activeColor;
      } else if (isDimmed) {
        // Something else is focused — dim this edge regardless of enabled state
        stroke = 'hsla(var(--muted-foreground) / 0.06)';
      } else if (isEnabled) {
        useGradient = true;
        stroke = srcColor;
      } else if (isConnected && !bothActive) {
        stroke = flowState === 'missing_config' ? 'hsl(45 93% 47%)' : 'hsla(var(--muted-foreground) / 0.4)';
      } else if (bothActive) {
        useGradient = true;
        stroke = srcColor;
      } else if (flowState === 'missing_config') {
        stroke = 'hsl(45 93% 47%)';
      } else {
        stroke = 'hsla(var(--muted-foreground) / 0.38)';
      }

      // Stroke dash pattern: simulated, enabled and hovered edges are solid; others get dashes
      const strokeDasharray: string | undefined = (isEnabled || isEdgeHovered || isNodeHovered || isSimulated) ? undefined : '3 5';

      // Apply saved handle overrides or use defaults
      const handleOverride = savedHandles[edgeId];
      const sourceHandle = handleOverride?.sourceHandle || 'bottom-source';
      const targetHandle = handleOverride?.targetHandle || 'top-target';

      return {
        id: edgeId,
        source: flow.source,
        target: flow.target,
        sourceHandle,
        targetHandle,
        label: flow.label,
        animated: !!isConnected || isEnabled || isSimulated,
        reconnectable: true,
        zIndex: isConnected ? 10 : 0,
        type: 'gradient',
        data: {
          useGradient,
          sourceColor: useGradient ? srcColor : stroke,
          targetColor: useGradient ? tgtColor : stroke,
          isEdgeHovered: isEdgeHovered || isNodeHovered,
          isEdgeSelected: isSelected,
          waypoints: savedWaypoints[edgeId] || [],
          onWaypointsChange: (newWaypoints: Array<{ x: number; y: number }>) => {
            setSavedWaypoints(prev => {
              const updated = { ...prev, [edgeId]: newWaypoints };
              if (newWaypoints.length === 0) delete updated[edgeId];
              persistWaypoints(updated);
              return updated;
            });
          },
        },
        style: {
          stroke,
          strokeWidth: isSimulated ? 2.5 : (isFullyHighlighted ? 2.5 : (bothActive ? 1.5 : 1)),
          strokeDasharray,
          opacity: 1,
          transition: 'stroke 0.2s, stroke-width 0.2s',
          cursor: 'pointer',
        },
        labelStyle: {
          fontSize: (isEdgeHovered || isNodeHovered) ? 12 : 10,
          fontWeight: (isFullyHighlighted || isSimulated) ? 600 : 500,
          fill: (isFullyHighlighted || isSimulated)
            ? 'hsl(var(--foreground))'
            : 'hsl(var(--muted-foreground))',
          opacity: isDimmed ? 0.15 : 0.8,
        },
        labelBgStyle: {
          fill: 'hsl(var(--background))',
          fillOpacity: 0.85,
        },
        // Arrow is drawn as a custom SVG polygon inside GradientEdge, always oriented to the last segment
      };
    }),
    [activeId, hoveredId, activeColor, activeCategories, isCategoryActiveForEdge, flowStateOverrides, hoveredEdgeId, selectedEdgeIdx, savedHandles, savedWaypoints, persistWaypoints, simulatedEdgeIds, simulatedPhases]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync initial nodes on first load only
  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);

  // When saved positions change (reset or loaded), update positions without resetting data
  useEffect(() => {
    if (savedPositions) {
      setNodes(prev => prev.map(node => ({
        ...node,
        position: savedPositions[node.id] || NODE_POSITIONS[node.id] || node.position,
      })));
    }
  }, [savedPositions, setNodes]);

  // Update node data (hover/select/apps) WITHOUT resetting positions
  useEffect(() => {
    setNodes(prev => prev.map(node => ({
      ...node,
      data: {
        ...node.data,
        onSelect: handleSelect,
        onHover: handleHover,
        isSelected: selectedId === node.id || simulatedCategoryIds.has(node.id),
        isHovered: hoveredId === node.id,
        isEdgeUpdating: updatingEdgeNodes
          ? (updatingEdgeNodes.draggedEnd === 'source'
              ? node.id === updatingEdgeNodes.target
              : node.id === updatingEdgeNodes.source)
          : false,
        edgeUpdateHandleType: updatingEdgeNodes?.draggedEnd || null,
        matchedApps: categoryApps[node.id] || [],
      },
    })));
  }, [selectedId, hoveredId, categoryApps, updatingEdgeNodes, handleSelect, handleHover, setNodes, simulatedCategoryIds]);

  useEffect(() => { setEdges(initialEdges); }, [initialEdges, setEdges]);

  // Alignment snap threshold (px in flow coordinates)
  const SNAP_THRESHOLD = 5;
  const NODE_W = 160; // approx node width for center calc
  const NODE_H = 80;  // approx node height for center calc

  // Max distance (in the perpendicular axis) for two nodes to be considered
  // "in the same row" or "in the same column". Keeps snapping scoped so that
  // dragging horizontally only highlights row-mates, not nodes in other rows.
  const ROW_COL_PROXIMITY = 200;

  const handleNodeDrag = useCallback((_event: any, draggedNode: any) => {
    const allNodes = reactFlowInstance.getNodes();
    const lines: { horizontal?: number; vertical?: number } = {};
    const dragCX = draggedNode.position.x + NODE_W / 2;
    const dragCY = draggedNode.position.y + NODE_H / 2;

    for (const n of allNodes) {
      if (n.id === draggedNode.id) continue;
      const cx = n.position.x + NODE_W / 2;
      const cy = n.position.y + NODE_H / 2;

      // Horizontal alignment — only snap to nodes roughly in the same row
      // (their X distance doesn't matter, but Y must already be close)
      const yDiff = Math.abs(dragCY - cy);
      if (yDiff < SNAP_THRESHOLD && Math.abs(dragCY - cy) < ROW_COL_PROXIMITY) {
        lines.horizontal = cy;
        draggedNode.position.y = cy - NODE_H / 2;
      }

      // Vertical alignment — only snap to nodes roughly in the same column
      const xDiff = Math.abs(dragCX - cx);
      if (xDiff < SNAP_THRESHOLD && Math.abs(dragCX - cx) < ROW_COL_PROXIMITY) {
        lines.vertical = cx;
        draggedNode.position.x = cx - NODE_W / 2;
      }
    }
    setHelperLines(lines);
  }, [reactFlowInstance]);

  // Persist positions when a node drag ends
  const handleNodeDragStop = useCallback((_event: any, _node: any) => {
    setHelperLines({});
    // Skip saving if a reset just happened — don't overwrite defaults
    if (isResettingRef.current) return;
    const currentNodes = reactFlowInstance.getNodes();
    const positions: Record<string, { x: number; y: number }> = {};
    currentNodes.forEach(n => {
      positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    });
    setSavedPositions(positions);
    persistPositions(positions);
  }, [reactFlowInstance, persistPositions]);

  // Track reconnection state for visual feedback
  const edgeUpdateSuccessful = useRef(true);

  const onEdgeUpdateStart = useCallback((_: any, edge: Edge, handleType: 'source' | 'target') => {
    console.log('[EdgeUpdateStart] edge:', edge.id, 'handleType:', handleType, 'source:', edge.source, 'target:', edge.target);
    edgeUpdateSuccessful.current = false;
    const info = { source: edge.source, target: edge.target, draggedEnd: handleType };
    updatingEdgeNodesRef.current = info;
    setUpdatingEdgeNodes(info);
  }, []);

  // Allow all connections during edge update — our onEdgeUpdate normalizes direction
  const isValidConnection = useCallback((connection: Connection) => {
    if (!updatingEdgeNodes) return true;
    const { source, target } = updatingEdgeNodes;
    const valid = (
      connection.source === source || connection.source === target ||
      connection.target === source || connection.target === target
    );
    console.log('[isValidConnection]', JSON.parse(JSON.stringify(connection)), 'valid:', valid);
    return valid;
  }, [updatingEdgeNodes]);

  // Handle edge reconnection — only allow reconnecting to same source/target nodes (different handles)
  const onEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    console.log('[EdgeUpdate] oldEdge:', { id: oldEdge.id, source: oldEdge.source, target: oldEdge.target, sourceHandle: oldEdge.sourceHandle, targetHandle: oldEdge.targetHandle });
    console.log('[EdgeUpdate] newConnection:', JSON.parse(JSON.stringify(newConnection)));
    console.log('[EdgeUpdate] draggedEnd:', updatingEdgeNodesRef.current?.draggedEnd);
    edgeUpdateSuccessful.current = true;

    // Determine which end was being dragged (use ref for synchronous access)
    const draggedEnd = updatingEdgeNodesRef.current?.draggedEnd as 'source' | 'target' | undefined;

    // Normalize: ensure source and target nodes stay the same, only handles change
    let sourceNode = oldEdge.source;
    let targetNode = oldEdge.target;
    let newSourceHandle = oldEdge.sourceHandle || 'bottom-source';
    let newTargetHandle = oldEdge.targetHandle || 'top-target';

    if (draggedEnd === 'target') {
      // RF reports handleType 'target' when the source end is being dragged
      if (newConnection.source === sourceNode) {
        const handleSide = (newConnection.sourceHandle || '').replace(/-source|-target/, '');
        newSourceHandle = `${handleSide}-source`;
        console.log('[EdgeUpdate] source match via newConnection.source, handleSide:', handleSide);
      } else if (newConnection.target === sourceNode) {
        const handleSide = (newConnection.targetHandle || '').replace(/-source|-target/, '');
        newSourceHandle = `${handleSide}-source`;
        console.log('[EdgeUpdate] source match via newConnection.target, handleSide:', handleSide);
      } else {
        console.log('[EdgeUpdate] REJECTED: dragged source end but neither newConnection.source nor .target matches sourceNode', sourceNode);
        return;
      }
    } else {
      if (newConnection.target === targetNode) {
        const handleSide = (newConnection.targetHandle || '').replace(/-source|-target/, '');
        newTargetHandle = `${handleSide}-target`;
        console.log('[EdgeUpdate] target match via newConnection.target, handleSide:', handleSide);
      } else if (newConnection.source === targetNode) {
        const handleSide = (newConnection.sourceHandle || '').replace(/-source|-target/, '');
        newTargetHandle = `${handleSide}-target`;
        console.log('[EdgeUpdate] target match via newConnection.source, handleSide:', handleSide);
      } else {
        console.log('[EdgeUpdate] REJECTED: dragged target end but neither newConnection.source nor .target matches targetNode', targetNode);
        return;
      }
    }

    console.log('[EdgeUpdate] ACCEPTED:', { sourceNode, targetNode, newSourceHandle, newTargetHandle });

    const normalizedConnection: Connection = {
      source: sourceNode,
      target: targetNode,
      sourceHandle: newSourceHandle,
      targetHandle: newTargetHandle,
    };

    setEdges((els) => reconnectEdge(oldEdge, normalizedConnection, els));
    setSavedHandles(prev => {
      const updated = {
        ...prev,
        [oldEdge.id]: {
          sourceHandle: newSourceHandle,
          targetHandle: newTargetHandle,
        },
      };
      persistHandles(updated);
      return updated;
    });
  }, [setEdges, persistHandles]);

  const onEdgeUpdateEnd = useCallback((_: MouseEvent | TouchEvent, edge: Edge) => {
    console.log('[EdgeUpdateEnd] edgeUpdateSuccessful:', edgeUpdateSuccessful.current, 'edge:', edge.id);
    setUpdatingEdgeNodes(null);
    updatingEdgeNodesRef.current = null;
    if (!edgeUpdateSuccessful.current) {
      console.log('[EdgeUpdateEnd] Update failed — snapping back');
    }
  }, []);




  // Reset everything to defaults: positions, handles, waypoints
  const handleResetPositions = useCallback(() => {
    // Guard so drag-stop events fired right after reset don't overwrite defaults
    isResettingRef.current = true;
    setTimeout(() => { isResettingRef.current = false; }, 500);

    setSavedPositions({ ...NODE_POSITIONS });
    setSavedHandles({ ...DEFAULT_HANDLES });
    setSavedWaypoints({ ...DEFAULT_WAYPOINTS });

    // Immediately update ReactFlow's internal node state so getNodes() returns defaults
    setNodes(prev => prev.map(node => ({
      ...node,
      position: NODE_POSITIONS[node.id] || node.position,
    })));
    reactFlowInstance.setNodes(prev => prev.map(node => ({
      ...node,
      position: NODE_POSITIONS[node.id] || node.position,
    })));

    // Persist defaults
    Promise.all([
      setDatastoreItem(POSITION_CACHE_KEY, JSON.stringify(NODE_POSITIONS), DATASTORE_CATEGORIES.INFRASTRUCTURE),
      setDatastoreItem(HANDLE_CACHE_KEY, JSON.stringify(DEFAULT_HANDLES), DATASTORE_CATEGORIES.INFRASTRUCTURE),
      setDatastoreItem(WAYPOINT_CACHE_KEY, JSON.stringify(DEFAULT_WAYPOINTS), DATASTORE_CATEGORIES.INFRASTRUCTURE),
    ]).catch(e => console.warn('Failed to reset:', e));

    // Refit after nodes update
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.25, duration: 300 }), 50);
  }, [reactFlowInstance, setNodes]);

  const selectedCategory = selectedId
    ? TOOL_CATEGORIES.find(c => c.id === selectedId) || null
    : null;

  if (!positionsLoaded) {
    return (
      <Box sx={{ height: 'calc(100vh - 48px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>Loading infrastructure…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 48px)', position: 'relative' }}>
      {/* Fullscreen flow canvas */}
      <Box sx={{
        position: 'absolute',
        inset: 0,
        '& .react-flow__attribution': { display: 'none' },
        '& .react-flow__controls': {
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        },
        '& .react-flow__controls-button': {
          bgcolor: 'hsl(var(--card))',
          borderBottom: '1px solid hsl(var(--border))',
          color: 'hsl(var(--foreground))',
          '&:hover': { bgcolor: 'hsl(var(--muted))' },
          '& svg': { fill: 'hsl(var(--foreground))' },
        },
        '& .react-flow__minimap': {
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'hsl(var(--card))',
        },
      }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onEdgesChange={onEdgesChange}
          snapToGrid
          snapGrid={[2, 2]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.3}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          onPaneClick={() => { setSelectedId(null); setSelectedEdgeIdx(null); }}
          nodesConnectable={false}
          onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdgeId(null)}
          onEdgeClick={(_, edge) => {
            const idx = DATA_FLOWS.findIndex(f => f.id === edge.id);
            setSelectedEdgeIdx(prev => prev === idx ? null : idx);
            setSelectedId(null);
          }}
          edgesUpdatable
          edgeUpdaterRadius={25}
          onEdgeUpdateStart={onEdgeUpdateStart}
          onEdgeUpdate={onEdgeUpdate}
          onEdgeUpdateEnd={onEdgeUpdateEnd}
          isValidConnection={isValidConnection}
          connectionLineStyle={{ stroke: 'hsl(var(--primary))', strokeWidth: 2.5, strokeDasharray: '6 3' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsla(var(--muted-foreground) / 0.1)" />
          {/* Alignment helper lines rendered in flow-space via viewport transform */}
          <HelperLinesRenderer horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
          <Controls showInteractive={false} />
          {/* Layout buttons */}
          <Box sx={{
            position: 'absolute',
            bottom: 10,
            left: 60,
            zIndex: 5,
            display: 'flex',
            gap: 0.75,
          }}>
            <Button
              size="small"
              onClick={handleResetPositions}
              sx={{
                minWidth: 'auto',
                px: 1.5,
                py: 0.5,
                fontSize: '0.7rem',
                bgcolor: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 2,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                '&:hover': { bgcolor: 'hsl(var(--muted))' },
              }}
            >
              Reset View
            </Button>
          </Box>
          <MiniMap
            nodeColor={() => 'hsl(var(--primary))'}
            maskColor="hsla(var(--background) / 0.8)"
            style={{ width: 120, height: 80 }}
          />
        </ReactFlow>
      </Box>

      {/* Floating header bar */}
      <Box sx={{
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        zIndex: 10,
        px: 3,
        py: 2,
        borderRadius: 3,
        bgcolor: 'hsla(var(--card) / 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid hsl(var(--border))',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
          <Activity size={20} style={{ color: 'hsl(var(--primary))' }} />
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>
            Infrastructure
          </Typography>
        </Box>
        <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
          Click any node to see details and data flows
        </Typography>
        <Box sx={{ flex: 1 }} />

        {/* Simulate phase buttons */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, flexShrink: 0, px: 1 }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Simulate
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {FLOW_PHASES.map((phase) => {
            const isActive = simulatedPhases.has(phase.id);
            const flowsInPhase = DATA_FLOWS.filter(f => f.phase === phase.id);
            const categoryIds = new Set(flowsInPhase.flatMap(f => [f.source, f.target]));
            const tooltipLines = [
              `Phase ${phase.step}: ${phase.label}`,
              phase.subtitle,
              '',
              `Highlights ${flowsInPhase.length} flows across ${categoryIds.size} categories.`,
            ].join('\n');
            return (
              <Tooltip
                key={phase.id}
                title={
                  <Box>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: `hsl(var(${phase.color}))` }}>
                      Phase {phase.step}: {phase.label}
                    </Typography>
                    <Typography sx={{ fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))', mt: 0.25 }}>
                      {phase.subtitle}
                    </Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', mt: 0.5, opacity: 0.7 }}>
                      {flowsInPhase.length} flows · {categoryIds.size} categories
                    </Typography>
                  </Box>
                }
                arrow
                placement="bottom"
              >
                <Box
                  onClick={() => toggleSimulatedPhase(phase.id)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 1.5,
                    border: `1px solid ${isActive ? `hsl(var(${phase.color}))` : 'hsl(var(--border))'}`,
                    bgcolor: isActive ? `hsla(var(${phase.color}) / 0.15)` : 'transparent',
                    color: isActive ? `hsl(var(${phase.color}))` : 'hsl(var(--muted-foreground))',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                    '&:hover': {
                      borderColor: `hsl(var(${phase.color}))`,
                      bgcolor: `hsla(var(${phase.color}) / 0.1)`,
                      color: `hsl(var(${phase.color}))`,
                    },
                  }}
                >
                  {phase.step}
                </Box>
              </Tooltip>
            );
          })}
          </Box>
        </Box>

        <IntegrationStatus collapsed={false} />
        <Tooltip title="Export positions & connections as JSON" arrow>
          <IconButton
            size="small"
            onClick={() => {
              const currentNodes = reactFlowInstance.getNodes();
              const positions: Record<string, { x: number; y: number; label: string }> = {};
              currentNodes.forEach(n => {
                const cat = TOOL_CATEGORIES.find(c => c.id === n.id);
                positions[n.id] = {
                  x: Math.round(n.position.x),
                  y: Math.round(n.position.y),
                  label: cat?.label || n.id,
                };
              });
              const connections = DATA_FLOWS.map(f => ({
                source: f.source,
                target: f.target,
                label: f.label,
                source_label: TOOL_CATEGORIES.find(c => c.id === f.source)?.label || f.source,
                target_label: TOOL_CATEGORIES.find(c => c.id === f.target)?.label || f.target,
              }));
              const exportData = {
                positions,
                handles: savedHandles,
                waypoints: savedWaypoints,
                connections,
                exported_at: new Date().toISOString(),
              };
              try {
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'infrastructure-layout.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (e) {
                console.error('Failed to export infrastructure layout:', e);
              }
            }}
            sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--foreground))' } }}
          >
            <Download size={18} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Detail drawers */}
      <CategoryDetailDrawer
        category={selectedCategory}
        matchedApps={selectedCategory ? (categoryApps[selectedCategory.id] || []) : []}
        open={!!selectedCategory}
        onClose={() => setSelectedId(null)}
        onEdgeHover={(edgeId) => setHoveredEdgeId(edgeId)}
        onEdgeClick={(edgeIdx) => {
          setSelectedId(null);
          setSelectedEdgeIdx(edgeIdx);
        }}
        onViewAllFlows={() => {
          setSelectedId(null);
          setLastViewedEdgeIdx(null);
          setShowAllFlows(true);
        }}
        activeCategories={activeCategories}
        configuredCategories={activeCategories}
        disabledAppsForCategory={disabledApps}
        onToggleAppDisabledForCategory={toggleAppDisabled}
        onRefreshApps={fetchApps}
      />

      {/* Edge state legend — bottom-right overlay */}
        <Box sx={{
          position: 'absolute',
          bottom: 16,
          right: 16,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        bgcolor: 'hsla(var(--card) / 0.92)',
        border: '1px solid hsl(var(--border))',
        borderRadius: 2,
        px: 1.5,
        py: 1.25,
        backdropFilter: 'blur(8px)',
        pointerEvents: 'auto',
      }}>
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>
          Connection State
        </Typography>
        {/* Enabled */}
        {(() => {
          const count = DATA_FLOWS.filter((flow) => {
            const base = getFlowState(activeCategories.has(flow.source), activeCategories.has(flow.target));
            const effective = flowStateOverrides.get(flow.id) || base;
            return effective === 'enabled';
          }).length;
          const enabledCount = count;
          return (
            <Tooltip title="Both categories have apps configured and the data flow has been explicitly verified. Click to filter." placement="right" arrow>
              <Box onClick={() => { setAllFlowsFilter('enabled'); setShowAllFlows(true); }} sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', borderRadius: 1, px: 0.5, py: 0.25, transition: 'background 0.15s', '&:hover': { bgcolor: 'hsla(142 71% 45% / 0.08)' } }}>
                <svg width="28" height="8" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="4" x2="28" y2="4" stroke="hsl(142 71% 45%)" strokeWidth="2" />
                  <polygon points="22,1 28,4 22,7" fill="hsl(142 71% 45%)" />
                </svg>
                <Typography sx={{ fontSize: '0.68rem', color: 'hsl(var(--foreground))' }}>Enabled</Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(142 71% 45%)', ml: 'auto', minWidth: 16, textAlign: 'right' }}>{enabledCount}</Typography>
              </Box>
            </Tooltip>
          );
        })()}
        {/* Misconfigured */}
        {(() => {
          const count = DATA_FLOWS.filter((flow) => {
            const base = getFlowState(activeCategories.has(flow.source), activeCategories.has(flow.target));
            const effective = flowStateOverrides.get(flow.id) || base;
            return effective === 'missing_config';
          }).length;
          return (
            <Tooltip title="Both categories have apps configured, but the flow has not been verified yet. Click to filter." placement="right" arrow>
              <Box onClick={() => { setAllFlowsFilter('missing_config'); setShowAllFlows(true); }} sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', borderRadius: 1, px: 0.5, py: 0.25, transition: 'background 0.15s', '&:hover': { bgcolor: 'hsla(45 93% 47% / 0.08)' } }}>
                <svg width="28" height="8" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="4" x2="28" y2="4" stroke="hsl(45 93% 47%)" strokeWidth="1.5" strokeDasharray="3 5" />
                  <polygon points="22,1 28,4 22,7" fill="hsl(45 93% 47%)" />
                </svg>
                <Typography sx={{ fontSize: '0.68rem', color: 'hsl(45 93% 47%)' }}>Misconfigured</Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(45 93% 47%)', ml: 'auto', minWidth: 16, textAlign: 'right' }}>{count}</Typography>
              </Box>
            </Tooltip>
          );
        })()}
        {/* Disabled */}
        {(() => {
          const count = DATA_FLOWS.filter((_, i) => getFlowState(activeCategories.has(DATA_FLOWS[i].source), activeCategories.has(DATA_FLOWS[i].target)) === 'disabled').length;
          return (
            <Tooltip title="One or both categories have no apps configured. Click to filter." placement="right" arrow>
              <Box onClick={() => { setAllFlowsFilter('disabled'); setShowAllFlows(true); }} sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', borderRadius: 1, px: 0.5, py: 0.25, transition: 'background 0.15s', '&:hover': { bgcolor: 'hsla(var(--muted-foreground) / 0.08)' } }}>
                <svg width="28" height="8" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="4" x2="28" y2="4" stroke="hsla(var(--muted-foreground) / 0.5)" strokeWidth="1.5" strokeDasharray="3 5" />
                  <polygon points="22,1 28,4 22,7" fill="hsla(var(--muted-foreground) / 0.5)" />
                </svg>
                <Typography sx={{ fontSize: '0.68rem', color: 'hsl(var(--muted-foreground))' }}>Disabled</Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', ml: 'auto', minWidth: 16, textAlign: 'right' }}>{count}</Typography>
              </Box>
            </Tooltip>
          );
        })()}
      </Box>
      <AllDataFlowsDrawer
        open={showAllFlows}
        onClose={() => { setShowAllFlows(false); setAllFlowsFilter(null); }}
        onSelectFlow={(edgeIdx) => {
          setShowAllFlows(false);
          setAllFlowsFilter(null);
          setSelectedEdgeIdx(edgeIdx);
        }}
        onSelectCategory={(catId) => {
          setShowAllFlows(false);
          setAllFlowsFilter(null);
          setSelectedId(catId);
        }}
        activeCategories={activeCategories}
        configuredCategories={activeCategories}
        highlightEdgeIdx={lastViewedEdgeIdx}
        flowStateOverrides={flowStateOverrides}
        agenticFlows={agenticFlows}
        initialFilter={allFlowsFilter}
        onEdgeHover={(edgeId) => setHoveredEdgeId(edgeId)}
        driftMap={driftMap}
        isSupport={isSupport}
      />
      <UsecaseDrawer
        open={selectedEdgeIdx !== null}
        onClose={() => setSelectedEdgeIdx(null)}
        flowId={selectedEdgeIdx !== null ? (DATA_FLOWS[selectedEdgeIdx]?.id ?? null) : null}
        globalUrl={API_CONFIG.baseUrl}
        userdata={userInfo as any}
        isLoaded={true}
        isLoggedIn={!!userInfo}
        theme={resolvedTheme}
      />

    </Box>
  );
};

const InfrastructurePage = () => (
  <ReactFlowProvider>
    <InfrastructureContent />
  </ReactFlowProvider>
);

export default InfrastructurePage;
