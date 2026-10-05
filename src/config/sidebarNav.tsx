/**
 * Single source of truth for the left sidebar's navigation tree.
 *
 * Both `AppSidebar` (the actual nav rendered on every dashboard page) and the
 * "Sidebar Navigation" card on `/preferences` consume this module. That way
 * the preferences toggles cannot drift from what's actually in the sidebar
 * — adding a new item here automatically makes it appear in both places.
 *
 * Each item carries:
 *   - `tabKey`: stable id used to look up visibility in `useSidebarTabs()`
 *               (and to write the preference back via `setSidebarTabVisibility`).
 *               Items with `alwaysVisible: true` ignore this key.
 *   - `label`, `icon`, `path`: used by the sidebar to render.
 *   - `supportOnly`: hidden from non-support users (also hidden from the
 *                    preferences UI for those users so we don't expose a
 *                    toggle that does nothing).
 *   - `alwaysVisible`: the item is always shown in the sidebar and rendered
 *                      in preferences as a read-only "Always visible" row
 *                      (currently used for Incidents).
 *
 * To add a new sidebar item, add it here and it will automatically appear
 * in `/preferences`. To remove one, delete it here.
 */
import { Braces, Waypoints, Network, BookOpen, LayoutDashboard, HardDrive, MonitorCheck, Bug, Zap, Terminal, AlertTriangle as WarningAmberIcon, Radar as RadarIcon, FileText as DescriptionIcon, SlidersHorizontal as TuneIcon, Rss as RssFeedIcon, Fingerprint as FingerprintIcon } from 'lucide-react';
import AgentIcon from '@/Shuffle-Core/components/AgentIcon';

/** Stable identifiers used as keys in the persisted visibility map.
 *  NEVER renumber/rename — these end up in the org datastore. New items
 *  should default to visible (see `DEFAULT_SIDEBAR_TABS` in useEntityLabel). */
export type SidebarItemKey =
  | 'dashboard'
  | 'incidents'
  | 'incidents_templates'
  | 'incidents_custom_fields'
  | 'host_monitors'
  | 'host_monitors_response'
  | 'host_monitors_terminal'
  | 'vulnerabilities'
  | 'vulnerabilities_assets'
  | 'detection'
  | 'detection_rules'
  | 'detection_pipelines'
  | 'detection_mitre'
  | 'detection_threat_feeds'
  | 'detection_ioc_types'
  | 'agents'
  | 'documentation';

export interface SidebarChildSpec {
  tabKey: SidebarItemKey;
  label: string;
  /** Routed path. */
  path: string;
  /** Lucide / MUI icon node — pass an already-instantiated element. */
  icon: React.ReactNode;
  supportOnly?: boolean;
  /** Optional badge label (e.g. 'Beta') displayed alongside the item */
  badge?: string;
  /** Default visibility when no preference is persisted. Defaults to true. */
  defaultVisible?: boolean;
}

export interface SidebarItemSpec {
  tabKey: SidebarItemKey;
  /** Used by the sidebar for the active label (Incidents adapts to the
   *  org's "entity" preference: incidents/alerts/cases/…). */
  label: string;
  icon: React.ReactNode;
  path?: string;
  /** When true, the item ignores the visibility map (always shown). */
  alwaysVisible?: boolean;
  supportOnly?: boolean;
  /** Optional badge label (e.g. 'Beta') displayed alongside the item */
  badge?: string;
  /** Default visibility when no preference is persisted. Defaults to true. */
  defaultVisible?: boolean;
  children?: SidebarChildSpec[];
}

/** Top-level sidebar order. The one-and-only declaration of what's in the
 *  navigation tree — both `AppSidebar` and the preferences UI iterate this. */
export const SIDEBAR_NAV: SidebarItemSpec[] = [
  {
    tabKey: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={20} />,
    path: '/dashboard',
  },
  {
    tabKey: 'incidents',
    label: 'Incidents',
    icon: <WarningAmberIcon />,
    path: '/incidents',
    alwaysVisible: true,
    children: [
      {
        tabKey: 'incidents_templates',
        label: 'Templates',
        path: '/incidents/templates',
        icon: <ClipboardListIcon size={16} />,
      },
      {
        tabKey: 'incidents_custom_fields',
        label: 'Custom Fields',
        path: '/incidents/custom-fields',
        icon: <TuneIcon size={20} />,
      },
      {
        tabKey: 'detection_threat_feeds',
        label: 'Threat Feeds',
        path: '/incidents/threat-feeds',
        icon: <RssFeedIcon size={20} />,
      },
      {
        tabKey: 'detection_ioc_types',
        label: 'Observables',
        path: '/incidents/observables',
        icon: <FingerprintIcon size={20} />,
      },
    ],
  },
  {
    tabKey: 'vulnerabilities',
    label: 'Vulnerabilities',
    icon: <Bug size={20} />,
    path: '/vulnerabilities',
    children: [
      {
        tabKey: 'vulnerabilities_assets',
        label: 'Assets',
        path: '/assets',
        icon: <HardDrive size={16} />,
        badge: 'Beta',
      },
    ],
  },
  {
    tabKey: 'host_monitors',
    label: 'Host Monitors',
    icon: <MonitorCheck size={20} />,
    path: '/monitors',
    children: [
      {
        tabKey: 'host_monitors_terminal',
        label: 'Remote Control',
        path: '/monitors/terminal',
        icon: <Terminal size={16} />,
      },
      {
        tabKey: 'host_monitors_response',
        label: 'Response',
        path: '/monitors/response',
        icon: <Zap size={16} />,
        supportOnly: true,
      },
    ],
  },
  {
    tabKey: 'detection',
    label: 'Detection',
    icon: <RadarIcon />,
    path: '/detection',
    defaultVisible: false,
    children: [
      { tabKey: 'detection_rules',     label: 'Rules',     path: '/detection/sigma',     icon: <Braces size={16} />,    defaultVisible: false },
      { tabKey: 'detection_pipelines', label: 'Pipelines', path: '/detection/pipelines', icon: <Network size={16} />,   defaultVisible: false },
      { tabKey: 'detection_mitre',     label: 'ATT&CK',    path: '/detection/mitre',     icon: <Waypoints size={16} />, supportOnly: true, defaultVisible: false },
    ],
  },
  {
    tabKey: 'agents',
    label: 'Agents',
    icon: <AgentIcon size={20} />,
    path: '/agents',
  },
  {
    tabKey: 'documentation',
    label: 'Documentation',
    icon: <BookOpen size={20} />,
    path: '/docs',
  },
];

/** Flat list of every togglable key. Used to seed defaults and to validate
 *  saved visibility maps in `useEntityLabel`. */
export const ALL_SIDEBAR_KEYS: SidebarItemKey[] = SIDEBAR_NAV.flatMap((item) => [
  item.tabKey,
  ...(item.children?.map((c) => c.tabKey) ?? []),
]);

/** Per-key default visibility. Items without `defaultVisible: false` default to true. */
export const SIDEBAR_DEFAULT_VISIBILITY: Record<SidebarItemKey, boolean> = SIDEBAR_NAV.reduce(
  (acc, item) => {
    acc[item.tabKey] = item.defaultVisible !== false;
    for (const c of item.children ?? []) {
      acc[c.tabKey] = c.defaultVisible !== false;
    }
    return acc;
  },
  {} as Record<SidebarItemKey, boolean>,
);

