import { useState, useRef, useEffect, useMemo, forwardRef } from "react";
import shuffleInfraLogo from "@/assets/shuffle-infrastructure-logo.png";
import { ShuffleLogo } from "@/components/common/ShuffleLogo";
import { useLocation, Link, useNavigate } from "@/lib/router-compat";
import { prefetchRoute } from "@/lib/routePrefetch";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Avatar,
  Tooltip,
  IconButton,
  Collapse,
  Autocomplete,
  TextField,
  Menu,
  MenuItem,
  CircularProgress,
  Paper,
  Button,
} from "@mui/material";
import { NOTIFICATIONS_OPEN_EVENT } from "@/Shuffle-Core";
import {
  Activity,
  Sun,
  Moon,
  Monitor,
  Shield,
  Radar,
  Users,
  AlertTriangle as WarningAmberIcon,
  Users as PeopleIcon,
  Building2 as BusinessIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ChevronUp as ExpandLess,
  ChevronDown as ExpandMore,
  Search as SearchIcon,
  Settings as SettingsIcon,
  FileText as DescriptionIcon,
  Fingerprint as FingerprintIcon,
  Rss as RssFeedIcon,
  Radar as RadarIcon,
  LogOut as LogoutIcon,
  ShieldCheck as AdminPanelSettingsIcon,
  Rocket as RocketLaunchIcon,
  Bell as BellIcon,
  Plus as PlusIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { SHUFFLE_AUTOMATION_URL, getShuffleCoreUrl } from "@/Shuffle-MCPs/api";
import { navigateToShuffleCore } from "@/lib/authHandoff";
// IntegrationStatus removed from sidebar; it now lives only on relevant pages (e.g. /onboarding/sources, infrastructure).
import { SidebarSearchDialog } from "./SidebarSearchDialog";

import { useEntityPreference, useSidebarTabs } from "@/hooks/useEntityLabel";
import { SIDEBAR_NAV, SidebarChildSpec } from "@/config/sidebarNav";
import { getRegionFlag } from "@/lib/regionFlag";
import { useSubOrgs } from "@/hooks/useSubOrgs";
import { resolveUserAvatar } from "@/components/incidents/UserHoverCard";
import { useUsers } from "@/hooks/useUsers";

const drawerWidth = 260;
const collapsedWidth = 64;
const hoverCollapseDelay = 150;

// Render-time nav node — derived inside the component from the shared
// SIDEBAR_NAV config plus the user's entity-label preference (Incidents
// adapts to Alerts/Cases/…). The `__divider__` sentinel keeps the existing
// rendering loop's grouping visuals intact.
interface NavChild {
  label: string;
  path: string;
  icon: React.ReactNode;
  disabled?: boolean;
  supportOnly?: boolean;
  badge?: string;
}

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: NavChild[];
  supportOnly?: boolean;
  badge?: string;
}

const childToNav = (c: SidebarChildSpec): NavChild => ({
  label: c.label,
  path: c.path,
  icon: c.icon,
  supportOnly: c.supportOnly,
  badge: c.badge,
});

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// Sort orgs with parent-child hierarchy
const sortOrgsWithHierarchy = (
  orgs: Array<{
    id: string;
    name: string;
    creator_org?: string;
    region_url?: string;
  }>,
) => {
  const orgMap = new Map(orgs.map((org) => [org.id, org]));
  const result: Array<{ org: (typeof orgs)[0]; level: number }> = [];
  const processed = new Set<string>();

  // Find root orgs (no creator_org or creator_org not in list)
  const rootOrgs = orgs.filter(
    (org) => !org.creator_org || !orgMap.has(org.creator_org),
  );

  const addOrgWithChildren = (org: (typeof orgs)[0], level: number) => {
    if (processed.has(org.id)) return;
    processed.add(org.id);
    result.push({ org, level });

    // Find children
    const children = orgs.filter((o) => o.creator_org === org.id);
    children.sort((a, b) => a.name.localeCompare(b.name));
    children.forEach((child) => addOrgWithChildren(child, level + 1));
  };

  // Sort root orgs alphabetically and process
  rootOrgs.sort((a, b) => a.name.localeCompare(b.name));
  rootOrgs.forEach((org) => addOrgWithChildren(org, 0));

  // Add any remaining orgs that weren't processed (orphans with missing parents)
  orgs.forEach((org) => {
    if (!processed.has(org.id)) {
      result.push({ org, level: 1 }); // Treat as sub-org level
    }
  });

  return result;
};

const TenantAutocompletePaper = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLElement>
>((props, ref) => {
  const { children, ...other } = props;
  const navigate = useNavigate();

  return (
    <Paper
      ref={ref}
      {...other}
      sx={{
        backgroundColor: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 1,
        mt: 0.5,
        minWidth: 280,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        ...((other as any).sx || {}),
      }}
    >
      <Box
        sx={{
          maxHeight: 260,
          overflowY: "auto",
          "& .MuiAutocomplete-listbox": {
            padding: 0,
            maxHeight: "none",
          },
        }}
      >
        {children}
      </Box>
      <Divider sx={{ borderColor: "hsl(var(--border))" }} />
      <Box sx={{ p: 0.75 }}>
        <Button
          fullWidth
          size="small"
          startIcon={<PlusIcon size={14} />}
          onMouseDown={(e) => {
            // Prevent autocomplete input from blurring before click completes
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("close-tenant-autocomplete"));
            navigate("/admin/tenants?click=add-tenant");
          }}
          sx={{
            justifyContent: "flex-start",
            color: "hsl(var(--primary))",
            fontSize: "0.8125rem",
            fontWeight: 500,
            textTransform: "none",
            py: 0.75,
            px: 1.5,
            borderRadius: 1,
            "&:hover": {
              bgcolor: "hsl(var(--muted))",
            },
          }}
        >
          Add tenant
        </Button>
      </Box>
    </Paper>
  );
});
TenantAutocompletePaper.displayName = "TenantAutocompletePaper";

export const AppSidebar = ({ collapsed, onToggle }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userInfo, setActiveOrg, logout } = useAuth();
  const { theme: currentTheme, setTheme, brandColor, brandName } = useTheme();
  const primaryColor = brandColor || "#FF6600";
  const { plural: entityPlural, basePath: entityBasePath } =
    useEntityPreference();
  const sidebarTabs = useSidebarTabs();
  const { users } = useUsers();
  const isSupport = userInfo?.support === true;

  // Filter the shared SIDEBAR_NAV against the user's preferences and
  // support flag, then convert to runtime nav items. The visibility map is
  // keyed by `tabKey`, so this stays in lock-step with /preferences without
  // any path/label lookup tables.
  const navItems = useMemo(() => {
    const out: NavItem[] = [];
    for (const spec of SIDEBAR_NAV) {
      // Top-level visibility gate (Incidents is alwaysVisible).
      if (spec.supportOnly && !isSupport) continue;
      if (!spec.alwaysVisible && sidebarTabs[spec.tabKey] === false) continue;

      const filteredChildren = spec.children
        ?.filter((c) => {
          if (c.supportOnly && !isSupport) return false;
          if (sidebarTabs[c.tabKey] === false) return false;
          return true;
        })
        .map(childToNav);

      const isIncidents = spec.tabKey === "incidents";
      out.push({
        label: isIncidents ? entityPlural : spec.label,
        icon: spec.icon,
        path: isIncidents ? entityBasePath : spec.path,
        supportOnly: spec.supportOnly,
        badge: spec.badge,
        children:
          filteredChildren && filteredChildren.length > 0
            ? filteredChildren
            : undefined,
      });

      // Divider after the Detection group, matching the previous layout.
      if (spec.tabKey === "detection") {
        out.push({ label: "__divider__", icon: <></> });
      }
    }
    return out;
  }, [entityPlural, entityBasePath, isSupport, sidebarTabs]);
  // Initialise expanded state from the CURRENT route so we never flash a
  // stale group (e.g. Incidents) open on mount before the effect corrects it.
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    const path = location.pathname;
    const matches = (p?: string) =>
      !!p && (path === p || path.startsWith(p + "/"));
    const owning = navItems.find(
      (item) =>
        matches(item.path) || item.children?.some((c) => matches(c.path)),
    );
    return owning ? [owning.label] : [];
  });
  const [changingOrg, setChangingOrg] = useState(false);

  const [toolMenuAnchor, setToolMenuAnchor] = useState<null | HTMLElement>(
    null,
  );
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(
    null,
  );
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, []);

  // Auto-expand the nav group whose own path or any child path matches the
  // current route. When switching between sibling groups we stage the change:
  // first close the previously-open group, then open the new one after the
  // close animation finishes. This avoids the "jump" of two Collapses firing
  // in the same tick.
  const expandTransitionMs = 220;
  const pendingExpandRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const path = location.pathname;
    const matches = (p?: string) =>
      !!p && (path === p || path.startsWith(p + "/"));
    const owning = navItems.find((item) => {
      if (matches(item.path)) return true;
      if (item.children?.some((c) => matches(c.path))) return true;
      return false;
    });
    const target = owning ? [owning.label] : [];

    setExpandedItems((prev) => {
      // Already correct — no-op.
      if (
        prev.length === target.length &&
        prev.every((v, i) => v === target[i])
      ) {
        return prev;
      }
      // Switching between two different groups: close first, then open the
      // new one on a delay so the two animations run sequentially.
      if (prev.length > 0 && target.length > 0 && prev[0] !== target[0]) {
        if (pendingExpandRef.current) clearTimeout(pendingExpandRef.current);
        pendingExpandRef.current = setTimeout(() => {
          setExpandedItems(target);
          pendingExpandRef.current = null;
        }, expandTransitionMs);
        return [];
      }
      // Opening from empty, closing to empty, or same-group edge case.
      return target;
    });
  }, [location.pathname, navItems]);

  useEffect(
    () => () => {
      if (pendingExpandRef.current) clearTimeout(pendingExpandRef.current);
    },
    [],
  );

  // The sidebar appears expanded if it's actually expanded OR hover-expanded
  const visuallyCollapsed = collapsed && !hoverExpanded;

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (!collapsed) return;
    setHoverExpanded(true);
    setOrgSelectOpen(false);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverExpanded(false);
      setOrgSelectOpen(false);
      setToolMenuAnchor(null);
      setUserMenuAnchor(null);
    }, hoverCollapseDelay);
  };

  // The session payload does not always carry `region_url` for every tenant,
  // which made the switcher fall back to the default region and label every
  // tenant UK even when the tenant list said otherwise. Fill the gaps from the
  // tenant list, which always reports each tenant's own region.
  const { subOrgs: sidebarSubOrgs, parentOrg: sidebarParentOrg } = useSubOrgs(
    userInfo?.active_org?.id,
  );
  const regionUrlByOrgId = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of sidebarSubOrgs)
      if (o.region_url) map.set(o.id, o.region_url);
    if (sidebarParentOrg?.region_url)
      map.set(sidebarParentOrg.id, sidebarParentOrg.region_url);
    if (userInfo?.active_org?.region_url)
      map.set(userInfo.active_org.id, userInfo.active_org.region_url);
    return map;
  }, [
    sidebarSubOrgs,
    sidebarParentOrg,
    userInfo?.active_org?.id,
    userInfo?.active_org?.region_url,
  ]);

  const organizations = useMemo(
    () =>
      (userInfo?.orgs || []).map((org) => ({
        ...org,
        region_url: org.region_url || regionUrlByOrgId.get(org.id),
      })),
    [userInfo?.orgs, regionUrlByOrgId],
  );
  const sortedOrgs = sortOrgsWithHierarchy(organizations);
  const selectedOrg = userInfo?.active_org || organizations[0];
  const [orgSelectOpen, setOrgSelectOpen] = useState(false);

  useEffect(() => {
    const handleClose = () => setOrgSelectOpen(false);
    window.addEventListener("close-tenant-autocomplete", handleClose);
    return () =>
      window.removeEventListener("close-tenant-autocomplete", handleClose);
  }, []);

  // Ensure tenant popover and floating menus close when sidebar collapses or re-opens
  useEffect(() => {
    setOrgSelectOpen(false);
    setToolMenuAnchor(null);
    setUserMenuAnchor(null);
  }, [collapsed]);

  // When visually collapsed (e.g. hover ends), guarantee tenant popover is closed
  useEffect(() => {
    if (visuallyCollapsed) {
      setOrgSelectOpen(false);
      setToolMenuAnchor(null);
      setUserMenuAnchor(null);
    }
  }, [visuallyCollapsed]);

  // Close tenant popover and floating menus on route change
  useEffect(() => {
    setOrgSelectOpen(false);
    setToolMenuAnchor(null);
    setUserMenuAnchor(null);
  }, [location.pathname]);

  const handleExpand = (label: string) => {
    // Only allow one expanded item at a time - toggle off if already open, otherwise switch to new one
    setExpandedItems((prev) => (prev.includes(label) ? [] : [label]));
  };

  const isActive = (path?: string) => {
    if (!path) return false;
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  const getUserInitial = () => {
    if (userInfo?.username) {
      return userInfo.username.charAt(0).toUpperCase();
    }
    return "U";
  };

  // Prefer the user's synced profile picture (GitHub/Gravatar) over the
  // generic initial avatar.
  const currentUserAvatar = resolveUserAvatar(
    userInfo?.username || "",
    users,
  ).src;

  const handleOrgChange = async (org: { id: string; name: string } | null) => {
    if (org) {
      setOrgSelectOpen(false);
      setChangingOrg(true);
      await setActiveOrg(org.id);
    }
  };

  return (
    <>
      {/* Full-screen overlay when changing org */}
      {changingOrg && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            backgroundColor: "hsla(var(--background) / 0.85)",
            backdropFilter: "blur(4px)",
          }}
        >
          <CircularProgress size={32} sx={{ color: "hsl(var(--primary))" }} />
          <Typography
            variant="body2"
            sx={{ color: "hsl(var(--muted-foreground))" }}
          >
            Changing tenant…
          </Typography>
        </Box>
      )}

      {/* Toggle button - fixed position outside sidebar to avoid clipping */}
      <IconButton
        onClick={() => {
          setOrgSelectOpen(false);
          setToolMenuAnchor(null);
          setUserMenuAnchor(null);
          onToggle();
        }}
        size="small"
        sx={{
          position: "fixed",
          left: `calc(${(collapsed ? collapsedWidth : drawerWidth) + 10 - 12}px + env(safe-area-inset-left, 0px))`,
          top: collapsed ? "calc(2.5% + 100px)" : "calc(2.5% + 104px)",
          color: "hsl(var(--muted-foreground))",
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 1,
          width: 24,
          height: 24,
          zIndex: 1460,
          display: { xs: "none", sm: hoverExpanded ? "none" : "flex" },
          transition: "left 0.2s ease",
          "&:hover": {
            backgroundColor: "hsl(var(--muted))",
          },
        }}
      >
        {collapsed ? (
          <ChevronRightIcon size={16} />
        ) : (
          <ChevronLeftIcon size={16} />
        )}
      </IconButton>

      <Box
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        sx={{
          position: "fixed",
          left: "calc(10px + env(safe-area-inset-left, 0px))",
          top: "2.5%",
          height: "95%",
          width: visuallyCollapsed ? collapsedWidth : drawerWidth,
          backgroundColor: "hsl(var(--card))",
          borderRadius: 2,
          border: "1px solid hsl(var(--border))",
          display: { xs: "none", sm: "flex" },
          flexDirection: "column",
          transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
          zIndex: hoverExpanded ? 1450 : 1400,
        }}
      >
        {/* Header with Logo and Toggle */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            p: 2,
            minHeight: 64,
          }}
        >
          <Box
            onClick={(e) =>
              !visuallyCollapsed && setToolMenuAnchor(e.currentTarget)
            }
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              flexShrink: 0,
              cursor: visuallyCollapsed ? "default" : "pointer",
              borderRadius: 1,
              "&:hover": {
                opacity: 0.8,
              },
            }}
          >
            <ShuffleLogo size={32} color={primaryColor} />
            {!visuallyCollapsed && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
                  {brandName ? (
                    <Typography
                      sx={{
                        color: primaryColor,
                        fontWeight: 600,
                        fontSize: "1rem",
                      }}
                    >
                      {brandName}
                    </Typography>
                  ) : (
                    <>
                      <Typography
                        sx={{
                          color: primaryColor,
                          fontWeight: 600,
                          fontSize: "1rem",
                        }}
                      >
                        Shuffle
                      </Typography>
                      <Typography
                        sx={{
                          color: "hsl(var(--foreground))",
                          fontWeight: 600,
                          fontSize: "1rem",
                        }}
                      >
                        Security
                      </Typography>
                    </>
                  )}
                </Box>
                <ExpandMore
                  size={16}
                  style={{
                    color: "hsl(var(--muted-foreground))",
                    marginLeft: "4px",
                  }}
                />
              </Box>
            )}
          </Box>
          <Menu
            anchorEl={toolMenuAnchor}
            open={Boolean(toolMenuAnchor)}
            onClose={() => setToolMenuAnchor(null)}
            anchorOrigin={{ vertical: "top", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            slotProps={{
              paper: {
                sx: {
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 1.5,
                  minWidth: 230,
                  zIndex: 1400,
                },
              },
            }}
          >
            <MenuItem
              component="a"
              href="/"
              selected
              sx={{
                py: 1.5,
                px: 2,
                gap: 1.5,
                backgroundColor: "hsla(var(--primary) / 0.12) !important",
                border: "1px solid hsla(var(--primary) / 0.3)",
                borderRadius: 1,
                mx: 0.5,
                textDecoration: "none",
                color: "inherit",
                "&:hover": {
                  backgroundColor: "hsla(var(--primary) / 0.18) !important",
                },
              }}
              onClick={(e: React.MouseEvent) => {
                // Allow ctrl/cmd+click to open in new tab naturally
                if (!e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  setToolMenuAnchor(null);
                  navigate("/");
                }
              }}
            >
              <ShuffleLogo size={24} color={primaryColor} />
              <Typography
                sx={{
                  fontSize: "0.875rem",
                  color: "hsl(var(--foreground))",
                  fontWeight: 600,
                }}
              >
                <span style={{ color: primaryColor }}>Shuffle</span> Security
              </Typography>
            </MenuItem>
            <MenuItem
              component="a"
              href={getShuffleCoreUrl("/new-dashboard")}
              sx={{
                py: 1.5,
                px: 2,
                gap: 1.5,
                mx: 0.5,
                textDecoration: "none",
                color: "inherit",
                "&:hover": { backgroundColor: "hsl(var(--muted))" },
              }}
              onClick={async (e: React.MouseEvent) => {
                e.preventDefault();
                setToolMenuAnchor(null);
                const isNewTab = e.ctrlKey || e.metaKey || e.button === 1;
                await navigateToShuffleCore("/new-dashboard", {
                  newTab: isNewTab,
                });
              }}
            >
              <img
                src={shuffleInfraLogo}
                alt="Shuffle Automation"
                width={24}
                height={24}
                style={{ borderRadius: 4 }}
              />
              <Typography
                sx={{ fontSize: "0.875rem", color: "hsl(var(--foreground))" }}
              >
                <span style={{ color: primaryColor }}>Shuffle</span> Automation
              </Typography>
            </MenuItem>
          </Menu>
        </Box>

        {/* Search Bar */}
        {!visuallyCollapsed ? (
          <Box sx={{ px: 2, mb: 2 }}>
            <Box
              onClick={() => setSearchOpen(true)}
              sx={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "hsl(var(--muted))",
                borderRadius: 1,
                px: 1.5,
                py: 1,
                gap: 1,
                cursor: "pointer",
                "&:hover": {
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "transparent",
                },
                border: "1px solid transparent",
              }}
            >
              <SearchIcon
                size={20}
                style={{ color: "hsl(var(--muted-foreground))" }}
              />
              <Typography
                sx={{
                  color: "hsl(var(--muted-foreground))",
                  fontSize: "0.875rem",
                  flexGrow: 1,
                }}
              >
                Search
              </Typography>
              <Typography
                sx={{
                  color: "hsl(var(--muted-foreground))",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                }}
              >
                Ctrl+K
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
            <Tooltip title="Search (Ctrl+K)" placement="right">
              <IconButton
                size="small"
                onClick={() => setSearchOpen(true)}
                sx={{ color: "hsl(var(--muted-foreground))" }}
              >
                <SearchIcon size={20} />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        <Divider
          sx={{
            borderColor: "hsl(var(--border))",
            mx: visuallyCollapsed ? 1 : 2,
          }}
        />

        {/* Scrollable area: nav items + integrations */}
        <Box
          sx={{
            flexGrow: 1,
            overflowY: visuallyCollapsed ? "hidden" : "auto",
            overflowX: "hidden",
            minHeight: 0,
            ...(visuallyCollapsed
              ? {
                  scrollbarWidth: "none",
                  "&::-webkit-scrollbar": { display: "none" },
                }
              : {}),
          }}
        >
          <List sx={{ px: 1, py: 2 }}>
            {navItems.map((item, idx) => (
              <Box
                key={
                  item.label === "__divider__" ? `divider-${idx}` : item.label
                }
              >
                {item.label === "__divider__" ? (
                  <Divider
                    sx={{
                      borderColor: "hsl(var(--border))",
                      mx: visuallyCollapsed ? 1 : 1.5,
                      my: 1,
                    }}
                  />
                ) : item.children ? (
                  <>
                    <Tooltip
                      title={visuallyCollapsed ? item.label : ""}
                      placement="right"
                    >
                      <ListItem disablePadding sx={{ mb: 0.5 }}>
                        <ListItemButton
                          component={Link}
                          to={item.path!}
                          onPointerEnter={() => prefetchRoute(item.path)}
                          onPointerDown={() => prefetchRoute(item.path)}
                          data-tour={
                            item.path === entityBasePath
                              ? "sidebar-incidents-link"
                              : undefined
                          }
                          onClick={() => {
                            // Let the route-change effect stage the animation
                            // (close previous group first, then open this one).
                            // Only pre-open when nothing is currently expanded so
                            // opening from empty stays instant.
                            setExpandedItems((prev) =>
                              prev.length === 0 ? [item.label] : prev,
                            );
                          }}
                          sx={{
                            borderRadius: 1,
                            minHeight: 40,
                            justifyContent: visuallyCollapsed
                              ? "center"
                              : "flex-start",
                            px: visuallyCollapsed ? 1.5 : 2,
                            backgroundColor: isActive(item.path)
                              ? "hsl(var(--muted))"
                              : "transparent",
                            "&:hover": {
                              backgroundColor: "hsl(var(--muted))",
                            },
                          }}
                        >
                          <ListItemIcon
                            sx={{
                              minWidth: visuallyCollapsed ? 0 : 36,
                              color: isActive(item.path)
                                ? "hsl(var(--primary))"
                                : "hsl(var(--muted-foreground))",
                            }}
                          >
                            {item.icon}
                          </ListItemIcon>
                          {!visuallyCollapsed && (
                            <>
                              <ListItemText
                                primary={
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 1,
                                    }}
                                  >
                                    <span>{item.label}</span>
                                    {item.supportOnly && (
                                      <Typography
                                        component="span"
                                        sx={{
                                          fontSize: "0.6rem",
                                          fontWeight: 700,
                                          textTransform: "uppercase",
                                          letterSpacing: "0.04em",
                                          px: 0.8,
                                          py: 0.2,
                                          borderRadius: "4px",
                                          backgroundColor:
                                            "hsla(var(--primary) / 0.12)",
                                          color: "hsl(var(--primary))",
                                          lineHeight: 1.4,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        Support
                                      </Typography>
                                    )}
                                    {item.badge && !item.supportOnly && (
                                      <Typography
                                        component="span"
                                        sx={{
                                          fontSize: "0.6rem",
                                          fontWeight: 700,
                                          textTransform: "uppercase",
                                          letterSpacing: "0.04em",
                                          px: 0.8,
                                          py: 0.2,
                                          borderRadius: "4px",
                                          backgroundColor:
                                            "hsla(var(--primary) / 0.12)",
                                          color: "hsl(var(--primary))",
                                          lineHeight: 1.4,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {item.badge}
                                      </Typography>
                                    )}
                                  </Box>
                                }
                                primaryTypographyProps={{
                                  fontSize: "0.875rem",
                                  fontWeight: isActive(item.path) ? 500 : 400,
                                  color: "hsl(var(--foreground))",
                                }}
                              />
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleExpand(item.label);
                                }}
                                sx={{
                                  p: 0.25,
                                  color: "hsl(var(--muted-foreground))",
                                  "&:hover": {
                                    color: "hsl(var(--foreground))",
                                  },
                                }}
                              >
                                {expandedItems.includes(item.label) ? (
                                  <ExpandLess size={18} />
                                ) : (
                                  <ExpandMore size={18} />
                                )}
                              </IconButton>
                            </>
                          )}
                        </ListItemButton>
                      </ListItem>
                    </Tooltip>
                    {/* Expanded: show children in collapsible list */}
                    {!visuallyCollapsed && (
                      <Collapse
                        in={expandedItems.includes(item.label)}
                        timeout={220}
                        appear
                      >
                        <List component="div" disablePadding>
                          {item.children.map((child) => (
                            <ListItem
                              key={child.path}
                              disablePadding
                              sx={{ mb: 0.5 }}
                            >
                              <ListItemButton
                                component={child.disabled ? "div" : Link}
                                {...(child.disabled ? {} : { to: child.path })}
                                disabled={child.disabled}
                                sx={{
                                  pl: 3,
                                  borderRadius: 1,
                                  minHeight: 36,
                                  backgroundColor: isActive(child.path)
                                    ? "hsl(var(--muted))"
                                    : "transparent",
                                  "&:hover": {
                                    backgroundColor: child.disabled
                                      ? "transparent"
                                      : "hsl(var(--muted))",
                                  },
                                  opacity: child.disabled ? 0.45 : 1,
                                  pointerEvents: child.disabled
                                    ? "none"
                                    : "auto",
                                }}
                              >
                                <ListItemIcon
                                  sx={{
                                    minWidth: 28,
                                    color: isActive(child.path)
                                      ? "hsl(var(--primary))"
                                      : "hsl(var(--muted-foreground))",
                                  }}
                                >
                                  {child.icon}
                                </ListItemIcon>
                                <ListItemText
                                  primary={
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 0.75,
                                      }}
                                    >
                                      <span>{child.label}</span>
                                      {child.supportOnly && (
                                        <Typography
                                          component="span"
                                          sx={{
                                            fontSize: "0.6rem",
                                            fontWeight: 600,
                                            color: "hsl(var(--primary))",
                                            backgroundColor:
                                              "hsl(var(--primary) / 0.1)",
                                            px: 0.6,
                                            py: 0.15,
                                            borderRadius: 0.5,
                                            lineHeight: 1.2,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.03em",
                                          }}
                                        >
                                          Support
                                        </Typography>
                                      )}
                                      {child.badge && !child.supportOnly && (
                                        <Typography
                                          component="span"
                                          sx={{
                                            fontSize: "0.6rem",
                                            fontWeight: 600,
                                            color: "hsl(var(--primary))",
                                            backgroundColor:
                                              "hsl(var(--primary) / 0.1)",
                                            px: 0.6,
                                            py: 0.15,
                                            borderRadius: 0.5,
                                            lineHeight: 1.2,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.03em",
                                          }}
                                        >
                                          {child.badge}
                                        </Typography>
                                      )}
                                    </Box>
                                  }
                                  primaryTypographyProps={{
                                    fontSize: "0.875rem",
                                    fontWeight: isActive(child.path)
                                      ? 500
                                      : 400,
                                    color: isActive(child.path)
                                      ? "hsl(var(--foreground))"
                                      : "hsl(var(--muted-foreground))",
                                  }}
                                />
                              </ListItemButton>
                            </ListItem>
                          ))}
                        </List>
                      </Collapse>
                    )}
                  </>
                ) : (
                  <Tooltip
                    title={visuallyCollapsed ? item.label : ""}
                    placement="right"
                  >
                    <ListItem disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton
                        component={Link}
                        to={item.path!}
                        onPointerEnter={() => prefetchRoute(item.path)}
                        onPointerDown={() => prefetchRoute(item.path)}
                        sx={{
                          borderRadius: 1,
                          minHeight: 40,
                          justifyContent: visuallyCollapsed
                            ? "center"
                            : "flex-start",
                          px: visuallyCollapsed ? 1.5 : 2,
                          backgroundColor: isActive(item.path)
                            ? "hsl(var(--muted))"
                            : "transparent",
                          "&:hover": {
                            backgroundColor: "hsl(var(--muted))",
                          },
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: visuallyCollapsed ? 0 : 36,
                            color: isActive(item.path)
                              ? "hsl(var(--primary))"
                              : "hsl(var(--muted-foreground))",
                          }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        {!visuallyCollapsed && (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              flex: 1,
                            }}
                          >
                            <ListItemText
                              primary={item.label}
                              primaryTypographyProps={{
                                fontSize: "0.875rem",
                                fontWeight: isActive(item.path) ? 500 : 400,
                                color: "hsl(var(--foreground))",
                              }}
                            />
                            {item.supportOnly && (
                              <Typography
                                sx={{
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                  px: 0.8,
                                  py: 0.2,
                                  borderRadius: "4px",
                                  backgroundColor:
                                    "hsla(var(--primary) / 0.12)",
                                  color: "hsl(var(--primary))",
                                  lineHeight: 1.4,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Support
                              </Typography>
                            )}
                            {item.badge && !item.supportOnly && (
                              <Typography
                                sx={{
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                  px: 0.8,
                                  py: 0.2,
                                  borderRadius: "4px",
                                  backgroundColor:
                                    "hsla(var(--primary) / 0.12)",
                                  color: "hsl(var(--primary))",
                                  lineHeight: 1.4,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.badge}
                              </Typography>
                            )}
                          </Box>
                        )}
                      </ListItemButton>
                    </ListItem>
                  </Tooltip>
                )}
              </Box>
            ))}
          </List>
        </Box>

        {/* Bottom Section */}
        <Box sx={{ mt: "auto" }}>
          <Divider
            sx={{
              borderColor: "hsl(var(--border))",
              mx: visuallyCollapsed ? 1 : 2,
            }}
          />

          {/* Organization Selector */}
          {!visuallyCollapsed ? (
            <Box sx={{ p: 2 }}>
              <Autocomplete
                open={orgSelectOpen && !visuallyCollapsed && !collapsed}
                onOpen={() => {
                  if (visuallyCollapsed || collapsed) return;
                  setOrgSelectOpen(true);
                  // Scroll the currently-selected tenant into the middle of the
                  // listbox so users in deeply-nested child tenants don't have
                  // to hunt from the top of an alphabetised list.
                  requestAnimationFrame(() => {
                    // The listbox is portaled into a popper outside the sidebar.
                    const listboxes = document.querySelectorAll<HTMLElement>(
                      ".MuiAutocomplete-listbox",
                    );
                    const listbox = listboxes[listboxes.length - 1];
                    if (!listbox) return;
                    const selected = listbox.querySelector<HTMLElement>(
                      'li[aria-selected="true"]',
                    );
                    if (selected) {
                      selected.scrollIntoView({ block: "center" });
                    }
                  });
                }}
                onClose={() => setOrgSelectOpen(false)}
                value={selectedOrg}
                onChange={(_, newValue) => handleOrgChange(newValue)}
                options={sortedOrgs.map((item) => item.org)}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                size="small"
                disableClearable
                PaperComponent={TenantAutocompletePaper}
                slotProps={{
                  paper: {
                    onMouseEnter: handleMouseEnter,
                    onMouseLeave: handleMouseLeave,
                  },
                }}
                renderInput={(params) => {
                  // Find the full org data from the list to get region_url
                  const fullOrgData = organizations.find(
                    (org) => org.id === selectedOrg?.id,
                  );
                  const region = getRegionFlag(
                    fullOrgData?.region_url || selectedOrg?.region_url,
                  );
                  return (
                    <TextField
                      {...params}
                      placeholder="Select tenant"
                      slotProps={{
                        input: {
                          ...params.InputProps,
                          startAdornment: selectedOrg ? (
                            <Tooltip
                              title={
                                !region.code
                                  ? `Region URL: ${fullOrgData?.region_url || selectedOrg?.region_url || "none"}`
                                  : region.code
                              }
                              placement="bottom"
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                  ml: 0.5,
                                  cursor: !region.code ? "help" : "default",
                                }}
                              >
                                <span style={{ fontSize: "14px" }}>
                                  {region.flag}
                                </span>
                                <Typography
                                  sx={{
                                    fontSize: "0.75rem",
                                    color: "hsl(var(--muted-foreground))",
                                  }}
                                >
                                  {region.code || "?"}
                                </Typography>
                              </Box>
                            </Tooltip>
                          ) : null,
                        },
                      }}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          backgroundColor: "hsl(var(--muted))",
                          borderRadius: 1,
                          fontSize: "0.875rem",
                          "& fieldset": {
                            borderColor: "transparent",
                          },
                          "&:hover fieldset": {
                            borderColor: "hsl(var(--border))",
                          },
                          "&.Mui-focused fieldset": {
                            borderColor: "hsl(var(--primary))",
                          },
                        },
                        "& .MuiInputBase-input": {
                          color: "hsl(var(--foreground))",
                        },
                      }}
                    />
                  );
                }}
                renderOption={(props, option) => {
                  const sortedItem = sortedOrgs.find(
                    (item) => item.org.id === option.id,
                  );
                  const level = sortedItem?.level || 0;
                  const region = getRegionFlag(option.region_url);
                  const { key, ...restProps } = props;
                  const isCurrentOrg = option.id === selectedOrg?.id;

                  return (
                    <Box
                      component="li"
                      key={option.id}
                      {...restProps}
                      sx={{
                        fontSize: "0.875rem",
                        color: isCurrentOrg
                          ? "hsl(var(--primary))"
                          : "hsl(var(--foreground))",
                        backgroundColor: isCurrentOrg
                          ? "rgba(255, 102, 0, 0.1)"
                          : "hsl(var(--card))",
                        pl: `${16 + level * 16}px !important`,
                        py: 1,
                        borderLeft: isCurrentOrg
                          ? "2px solid hsl(var(--primary))"
                          : "2px solid transparent",
                        "&:hover": {
                          backgroundColor: isCurrentOrg
                            ? "rgba(255, 102, 0, 0.15) !important"
                            : "hsl(var(--muted)) !important",
                        },
                        "&.Mui-focused": {
                          backgroundColor: isCurrentOrg
                            ? "rgba(255, 102, 0, 0.15) !important"
                            : "hsl(var(--muted)) !important",
                        },
                      }}
                    >
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Tooltip
                          title={
                            !region.code
                              ? `Region URL: ${option.region_url || "none"}`
                              : ""
                          }
                          placement="left"
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                              cursor: !region.code ? "help" : "default",
                            }}
                          >
                            <span style={{ fontSize: "14px" }}>
                              {region.flag}
                            </span>
                            <Typography
                              sx={{
                                fontSize: "0.75rem",
                                color: "hsl(var(--muted-foreground))",
                                minWidth: 28,
                              }}
                            >
                              {region.code || "?"}
                            </Typography>
                          </Box>
                        </Tooltip>
                        <Typography
                          sx={{
                            fontSize: "0.875rem",
                            fontWeight: isCurrentOrg ? 600 : 400,
                            color: isCurrentOrg
                              ? "hsl(var(--primary))"
                              : "inherit",
                          }}
                        >
                          {option.name}
                        </Typography>
                      </Box>
                    </Box>
                  );
                }}
              />
            </Box>
          ) : (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <Tooltip
                title={selectedOrg?.name || "No tenant"}
                placement="right"
              >
                <IconButton
                  size="small"
                  sx={{ color: "hsl(var(--muted-foreground))" }}
                >
                  <BusinessIcon size={20} />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          {/* Execution Usage Warning */}
          {typeof userInfo?.app_execution_limit === "number" &&
          userInfo.app_execution_limit > 0
            ? (() => {
                const usage =
                  (userInfo.app_execution_usage || 0) +
                  (userInfo.app_executions_suborgs || 0);
                const limit = userInfo.app_execution_limit;
                const pct = (usage / limit) * 100;
                if (pct < 65) return null;
                const isOver = pct >= 100;

                // Collapsed: show a small icon indicator
                if (visuallyCollapsed) {
                  return (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "center",
                        pb: 1.5,
                      }}
                    >
                      <Tooltip
                        title={
                          isOver
                            ? "App run limit reached"
                            : `${pct.toFixed(0)}% of app runs used`
                        }
                        placement="right"
                      >
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            bgcolor: isOver
                              ? "hsl(var(--destructive) / 0.15)"
                              : "hsl(var(--severity-medium) / 0.15)",
                            border: `1.5px solid ${isOver ? "hsl(var(--destructive) / 0.5)" : "hsl(var(--severity-medium) / 0.5)"}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "default",
                          }}
                        >
                          <WarningAmberIcon
                            size={16}
                            style={{
                              color: isOver
                                ? "hsl(var(--destructive))"
                                : "hsl(var(--severity-medium))",
                            }}
                          />
                        </Box>
                      </Tooltip>
                    </Box>
                  );
                }

                return (
                  <Box sx={{ px: 2, pb: 1.5 }}>
                    <Box
                      sx={{
                        borderRadius: 2,
                        overflow: "hidden",
                        bgcolor: isOver
                          ? "hsl(var(--destructive) / 0.08)"
                          : "hsl(var(--severity-medium) / 0.08)",
                        border: `1px solid ${isOver ? "hsl(var(--destructive) / 0.2)" : "hsl(var(--severity-medium) / 0.2)"}`,
                        position: "relative",
                      }}
                    >
                      <Box sx={{ p: 1.5, pb: 1.25 }}>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            mb: 0.5,
                          }}
                        >
                          <WarningAmberIcon
                            size={14}
                            style={{
                              color: isOver
                                ? "hsl(var(--destructive))"
                                : "hsl(var(--severity-medium))",
                            }}
                          />
                          <Typography
                            sx={{
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              color: isOver
                                ? "hsl(var(--destructive))"
                                : "hsl(var(--severity-medium))",
                            }}
                          >
                            {isOver
                              ? "App run limit reached"
                              : "App run limit warning"}
                          </Typography>
                        </Box>
                        <Typography
                          sx={{
                            fontSize: "0.65rem",
                            color: "hsl(var(--muted-foreground))",
                            lineHeight: 1.4,
                            mb: 1,
                          }}
                        >
                          {isOver
                            ? `Automation will stop until ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString("en-US", { month: "long", day: "numeric" })}, but incidents and detections still work.`
                            : `${pct.toFixed(0)}% of app runs used. Automation may stop soon, but incidents and detections still work.`}
                        </Typography>
                        {/* Action links */}
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 2 }}
                        >
                          <Box
                            component="a"
                            href="https://shuffler.io/pricing"
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              fontSize: "0.65rem",
                              fontWeight: 600,
                              color: isOver
                                ? "hsl(var(--destructive))"
                                : "hsl(var(--severity-medium))",
                              textDecoration: "none",
                              "&:hover": { textDecoration: "underline" },
                            }}
                          >
                            Upgrade →
                          </Box>
                          <Box
                            component="a"
                            href="https://shuffler.io/contact?category=support"
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              fontSize: "0.65rem",
                              fontWeight: 500,
                              color: "hsl(var(--muted-foreground))",
                              textDecoration: "none",
                              "&:hover": { textDecoration: "underline" },
                            }}
                          >
                            Contact support
                          </Box>
                        </Box>
                        <Typography
                          sx={{
                            fontSize: "0.6rem",
                            color: "hsl(var(--muted-foreground))",
                            mt: 0.75,
                            opacity: 0.7,
                          }}
                        >
                          {usage.toLocaleString()} / {limit.toLocaleString()}{" "}
                          runs
                        </Typography>
                      </Box>
                      {/* Bottom border progress bar */}
                      <Box
                        sx={{
                          width: "100%",
                          height: 3,
                          bgcolor: "hsl(var(--muted) / 0.5)",
                        }}
                      >
                        <Box
                          sx={{
                            width: `${Math.min(pct, 100)}%`,
                            height: "100%",
                            bgcolor: isOver
                              ? "hsl(var(--destructive))"
                              : "hsl(var(--severity-medium))",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </Box>
                    </Box>
                  </Box>
                );
              })()
            : null}

          {/* Settings Button (User Section) */}
          <Box
            onClick={(e) => setUserMenuAnchor(e.currentTarget)}
            sx={{
              p: 2,
              pt: 0,
              cursor: "pointer",
              textDecoration: "none",
              display: "block",
              "&:hover": {
                "& .settings-container": {
                  backgroundColor: "hsl(var(--muted))",
                },
              },
            }}
          >
            <Box
              className="settings-container"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                justifyContent: visuallyCollapsed ? "center" : "flex-start",
                p: 1.5,
                borderRadius: 1,
                transition: "background-color 0.15s ease",
              }}
            >
              <Avatar
                src={currentUserAvatar || undefined}
                alt={userInfo?.username || "User"}
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: "hsl(var(--primary))",
                  color: "hsl(var(--primary-foreground))",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                }}
              >
                {getUserInitial()}
              </Avatar>
              {!visuallyCollapsed && (
                <>
                  <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        color: "hsl(var(--foreground))",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {userInfo?.username || "User"}
                    </Typography>
                  </Box>
                  <SettingsIcon
                    size={18}
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  />
                </>
              )}
            </Box>
          </Box>
          <Menu
            anchorEl={userMenuAnchor}
            open={Boolean(userMenuAnchor)}
            onClose={() => setUserMenuAnchor(null)}
            autoFocus={false}
            disableAutoFocusItem
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
            transformOrigin={{ vertical: "bottom", horizontal: "left" }}
            slotProps={{
              paper: {
                sx: {
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 1.5,
                  minWidth: 180,
                  mb: 1,
                  zIndex: 1400,
                },
              },
            }}
          >
            <MenuItem
              component={Link}
              to="/usecases"
              selected={
                location.pathname === "/usecases" ||
                location.pathname.startsWith("/usecases/")
              }
              onClick={() => setUserMenuAnchor(null)}
              sx={{
                py: 1.25,
                px: 2,
                gap: 1.5,
                fontSize: "0.875rem",
                color: "hsl(var(--foreground))",
                "&:hover": { backgroundColor: "hsl(var(--muted))" },
                "&.Mui-selected": { backgroundColor: "hsl(var(--muted))" },
                "&.Mui-selected:hover": {
                  backgroundColor: "hsl(var(--muted))",
                },
              }}
            >
              <Activity
                size={18}
                style={{ color: "hsl(var(--muted-foreground))" }}
              />
              Usecases
            </MenuItem>
            <MenuItem
              component={Link}
              to="/onboarding/sources"
              selected={
                location.pathname === "/onboarding" ||
                location.pathname.startsWith("/onboarding/")
              }
              onClick={() => setUserMenuAnchor(null)}
              sx={{
                py: 1.25,
                px: 2,
                gap: 1.5,
                fontSize: "0.875rem",
                color: "hsl(var(--foreground))",
                "&:hover": { backgroundColor: "hsl(var(--muted))" },
                "&.Mui-selected": { backgroundColor: "hsl(var(--muted))" },
                "&.Mui-selected:hover": {
                  backgroundColor: "hsl(var(--muted))",
                },
              }}
            >
              <RocketLaunchIcon
                size={18}
                style={{ color: "hsl(var(--muted-foreground))" }}
              />
              Onboarding
            </MenuItem>
            <Divider sx={{ borderColor: "hsl(var(--border))", my: 0.5 }} />
            <MenuItem
              component={Link}
              to="/admin"
              selected={
                location.pathname === "/admin" ||
                location.pathname.startsWith("/admin/")
              }
              onClick={() => setUserMenuAnchor(null)}
              sx={{
                py: 1.25,
                px: 2,
                gap: 1.5,
                fontSize: "0.875rem",
                color: "hsl(var(--foreground))",
                "&:hover": { backgroundColor: "hsl(var(--muted))" },
                "&.Mui-selected": { backgroundColor: "hsl(var(--muted))" },
                "&.Mui-selected:hover": {
                  backgroundColor: "hsl(var(--muted))",
                },
              }}
            >
              <AdminPanelSettingsIcon
                size={18}
                style={{ color: "hsl(var(--muted-foreground))" }}
              />
              Tenant Admin
            </MenuItem>
            <MenuItem
              onClick={() => {
                setUserMenuAnchor(null);
                window.dispatchEvent(new CustomEvent(NOTIFICATIONS_OPEN_EVENT));
              }}
              sx={{
                py: 1.25,
                px: 2,
                gap: 1.5,
                fontSize: "0.875rem",
                color: "hsl(var(--foreground))",
                "&:hover": { backgroundColor: "hsl(var(--muted))" },
              }}
            >
              <BellIcon
                size={18}
                style={{ color: "hsl(var(--muted-foreground))" }}
              />
              Notifications
            </MenuItem>
            <MenuItem
              component={Link}
              to="/settings"
              selected={
                location.pathname === "/settings" ||
                location.pathname.startsWith("/settings/")
              }
              onClick={() => setUserMenuAnchor(null)}
              sx={{
                py: 1.25,
                px: 2,
                gap: 1.5,
                fontSize: "0.875rem",
                color: "hsl(var(--foreground))",
                "&:hover": { backgroundColor: "hsl(var(--muted))" },
                "&.Mui-selected": { backgroundColor: "hsl(var(--muted))" },
                "&.Mui-selected:hover": {
                  backgroundColor: "hsl(var(--muted))",
                },
              }}
            >
              <SettingsIcon
                size={18}
                style={{ color: "hsl(var(--muted-foreground))" }}
              />
              User Settings
            </MenuItem>
            <Divider sx={{ borderColor: "hsl(var(--border))", my: 0.5 }} />
            {/* Theme Toggle - icon only with tooltips */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                gap: 0.25,
                py: 0.75,
                px: 1.5,
              }}
            >
              {[
                {
                  value: "light" as const,
                  icon: <Sun size={16} />,
                  label: "Light",
                },
                {
                  value: "dark" as const,
                  icon: <Moon size={16} />,
                  label: "Dark",
                },
                {
                  value: "system" as const,
                  icon: <Monitor size={16} />,
                  label: "System",
                },
              ].map(({ value, icon, label }) => (
                <Tooltip key={value} title={label} placement="top">
                  <IconButton
                    size="small"
                    onClick={() => setTheme(value)}
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1,
                      color:
                        currentTheme === value
                          ? "hsl(var(--foreground))"
                          : "hsl(var(--muted-foreground))",
                      bgcolor:
                        currentTheme === value
                          ? "hsl(var(--muted))"
                          : "transparent",
                      "&:hover": {
                        bgcolor: "hsl(var(--muted))",
                        color: "hsl(var(--foreground))",
                      },
                    }}
                  >
                    {icon}
                  </IconButton>
                </Tooltip>
              ))}
            </Box>
            <Divider sx={{ borderColor: "hsl(var(--border))", my: 0.5 }} />
            <MenuItem
              onClick={() => {
                setUserMenuAnchor(null);
                logout();
              }}
              sx={{
                py: 1.25,
                px: 2,
                gap: 1.5,
                fontSize: "0.875rem",
                color: "hsl(var(--destructive, 0 84% 60%))",
                "&:hover": {
                  backgroundColor: "hsl(var(--destructive, 0 84% 60%) / 0.1)",
                },
              }}
            >
              <LogoutIcon size={18} />
              Logout
            </MenuItem>
          </Menu>
        </Box>
      </Box>
      <SidebarSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
};
