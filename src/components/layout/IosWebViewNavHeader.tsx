import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Menu,
  MenuItem,
  ButtonBase,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Collapse,
  Divider,
  Avatar,
  Tooltip,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Check,
  Menu as MenuIcon,
  Search as SearchIcon,
  X as CloseIcon,
  Sun,
  Moon,
  Monitor,
  Plus as PlusIcon,
} from 'lucide-react';
import { useLocation, useNavigate, Link } from '@/lib/router-compat';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ShuffleLogo } from '@/components/common/ShuffleLogo';
import shuffleInfraLogo from '@/assets/shuffle-infrastructure-logo.png';
import { isCapacitorNative, getPlatform } from '@/lib/platform';
import { useEntityPreference, useSidebarTabs } from '@/hooks/useEntityLabel';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { SIDEBAR_NAV } from '@/config/sidebarNav';
import { NOTIFICATIONS_OPEN_EVENT } from '@/Shuffle-Core';
import { getShuffleCoreUrl } from '@/Shuffle-Core/api';
import { navigateToShuffleCore } from '@/lib/authHandoff';
import { prefetchRoute } from '@/lib/routePrefetch';
import { getRegionFlag } from '@/lib/regionFlag';
import { RegionFlagImage } from '@/components/shared/RegionFlagImage';
import { SidebarSearchDialog } from './SidebarSearchDialog';

export const getPageTitle = (pathname: string): { title: string; parentPath?: string; parentLabel?: string } => {
  const clean = pathname.replace(/\/$/, '') || '/';

  if (clean === '/' || clean === '/incidents') {
    return { title: 'Incidents' };
  }
  if (clean === '/dashboard' || clean === '/dashboard-view') {
    return { title: 'Dashboard', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/incidents/templates') || clean === '/templates') {
    return { title: 'Incident Templates', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/incidents/custom-fields')) {
    return { title: 'Custom Fields', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/incidents/threat-feeds')) {
    return { title: 'Threat Feeds', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/incidents/observables')) {
    return { title: 'Observables', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/incidents/response-actions')) {
    return { title: 'Response Actions', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/incidents/ioc-types')) {
    return { title: 'IOC Types', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/incidents/routing')) {
    return { title: 'Incident Routing', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/incidents/')) {
    return { title: 'Incident Details', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean === '/ai-agent' || clean === '/agent') {
    return { title: 'AI Agent', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean === '/agents') {
    return { title: 'Agents', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/agents/')) {
    return { title: 'Agent Run', parentPath: '/agents', parentLabel: 'Agents' };
  }
  if (clean === '/admin') {
    return { title: 'Admin Overview', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean === '/admin/users' || clean === '/users') {
    return { title: 'Users & On-Call', parentPath: '/admin', parentLabel: 'Admin' };
  }
  if (clean === '/admin/tenants' || clean === '/organizations') {
    return { title: 'Tenant Management', parentPath: '/admin', parentLabel: 'Admin' };
  }
  if (clean === '/admin/runtime-locations' || clean === '/admin/locations') {
    return { title: 'Runtime Locations', parentPath: '/admin', parentLabel: 'Admin' };
  }
  if (clean === '/admin/datastore') {
    return { title: 'Shuffle Datastore', parentPath: '/admin', parentLabel: 'Admin' };
  }
  if (clean === '/admin/preferences' || clean === '/preferences') {
    return { title: 'UI Preferences', parentPath: '/admin', parentLabel: 'Admin' };
  }
  if (clean === '/settings') {
    return { title: 'User Settings', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/workflows')) {
    return { title: 'Workflows', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean === '/detection/sigma') {
    return { title: 'Detection Rules', parentPath: '/detection', parentLabel: 'Detection' };
  }
  if (clean === '/detection/pipelines') {
    return { title: 'Pipelines', parentPath: '/detection', parentLabel: 'Detection' };
  }
  if (clean === '/detection/mitre') {
    return { title: 'MITRE ATT&CK', parentPath: '/detection', parentLabel: 'Detection' };
  }
  if (clean.startsWith('/detection')) {
    return { title: 'Detection', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/vulnerabilities')) {
    return { title: 'Vulnerabilities', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/assets')) {
    return { title: 'Assets & Hosts', parentPath: '/vulnerabilities', parentLabel: 'Vulnerabilities' };
  }
  if (clean === '/monitors/terminal') {
    return { title: 'Remote Control', parentPath: '/monitors', parentLabel: 'Monitors' };
  }
  if (clean === '/monitors/response') {
    return { title: 'Response', parentPath: '/monitors', parentLabel: 'Monitors' };
  }
  if (clean.startsWith('/monitors')) {
    return { title: 'Host Monitors', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/usecases')) {
    return { title: 'Usecases', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/apps')) {
    return { title: 'Apps & Integrations', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/onboarding')) {
    return { title: 'Onboarding', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/forms')) {
    return { title: 'Collection Forms', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/infrastructure')) {
    return { title: 'Infrastructure', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/docs')) {
    return { title: 'Documentation', parentPath: '/incidents', parentLabel: 'Incidents' };
  }
  if (clean.startsWith('/search')) {
    return { title: 'Search', parentPath: '/incidents', parentLabel: 'Incidents' };
  }

  // Fallback for custom routes
  const segments = clean.split('/').filter(Boolean);
  if (segments.length > 0) {
    const raw = segments[segments.length - 1];
    const formatted = raw.charAt(0).toUpperCase() + raw.slice(1).replace(/[-_]/g, ' ');
    return { title: formatted, parentPath: '/incidents', parentLabel: 'Back' };
  }

  return { title: 'Shuffle Security' };
};

const headerControlButtonSx = {
  p: 0.75,
  width: 32,
  height: 32,
  borderRadius: 1.5,
  border: '1px solid hsl(var(--border))',
  bgcolor: 'hsl(var(--muted) / 0.6)',
  color: 'hsl(var(--foreground))',
  flexShrink: 0,
  '&:hover': {
    bgcolor: 'hsl(var(--muted))',
  },
};

const TenantSelector: React.FC<{ maxWidth?: number; fullWidth?: boolean }> = ({
  maxWidth = 130,
  fullWidth = false,
}) => {
  const { userInfo, setActiveOrg } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [switching, setSwitching] = useState(false);

  const activeOrg = userInfo?.active_org;
  const orgs = useMemo(
    () => [...(userInfo?.orgs || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [userInfo?.orgs]
  );

  if (!activeOrg?.name) return null;

  const activeRegion = getRegionFlag(activeOrg.region_url);

  const handleSelect = async (orgId: string) => {
    setAnchorEl(null);
    if (orgId === activeOrg.id || switching) return;
    setSwitching(true);
    try {
      await setActiveOrg(orgId);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchorEl(e.currentTarget)}
        disabled={switching || orgs.length === 0}
        aria-label="Switch tenant"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: fullWidth ? 'space-between' : 'flex-start',
          gap: 0.75,
          px: 1.1,
          height: 32,
          borderRadius: 1.5,
          bgcolor: 'hsl(var(--muted) / 0.6)',
          border: '1px solid hsl(var(--border))',
          width: fullWidth ? '100%' : 'auto',
          maxWidth: fullWidth ? '100%' : maxWidth,
          minWidth: 0,
          '&:hover': {
            bgcolor: 'hsl(var(--muted))',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flex: 1 }}>
          <RegionFlagImage code={activeRegion.code} />
          <Typography
            noWrap
            variant="caption"
            sx={{
              color: 'hsl(var(--foreground))',
              fontSize: '0.75rem',
              fontWeight: 500,
              minWidth: 0,
            }}
          >
            {activeOrg.name}
          </Typography>
        </Box>
        <ChevronDown size={13} style={{ flexShrink: 0, color: 'hsl(var(--muted-foreground))' }} />
      </ButtonBase>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              maxHeight: 340,
              minWidth: 220,
              maxWidth: '88vw',
              bgcolor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 1.5,
            },
          },
        }}
      >
        {orgs.map((org) => {
          const region = getRegionFlag(org.region_url);
          const isCurrent = org.id === activeOrg.id;
          return (
            <MenuItem
              key={org.id}
              onClick={() => handleSelect(org.id)}
              selected={isCurrent}
              sx={{
                gap: 1,
                py: 1,
                fontSize: '0.82rem',
                color: isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                fontWeight: isCurrent ? 600 : 400,
              }}
            >
              <Box sx={{ width: 14, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {isCurrent && <Check size={14} />}
              </Box>
              <RegionFlagImage code={region.code} />
              <Typography noWrap sx={{ fontSize: '0.82rem', flex: 1 }}>
                {org.name}
              </Typography>
            </MenuItem>
          );
        })}
        <Divider sx={{ borderColor: 'hsl(var(--border))', my: 0.5 }} />
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            navigate('/admin/tenants?click=add-tenant');
          }}
          sx={{
            gap: 1,
            py: 1,
            fontSize: '0.82rem',
            color: 'hsl(var(--primary))',
            fontWeight: 600,
          }}
        >
          <PlusIcon size={14} />
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>Add tenant</Typography>
        </MenuItem>
      </Menu>
    </>
  );
};

interface DrawerNavGroup {
  label: string;
  path?: string;
  badge?: string;
  supportOnly?: boolean;
  children?: {
    label: string;
    path: string;
    disabled?: boolean;
    badge?: string;
    supportOnly?: boolean;
  }[];
}

export const MobileNavHeader: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userInfo, logout } = useAuth();
  const { theme: currentTheme, setTheme, brandColor, brandName } = useTheme();
  const primaryColor = brandColor || '#FF6600';
  const { plural: entityPlural, basePath: entityBasePath } = useEntityPreference();
  const sidebarTabs = useSidebarTabs();
  const isAdmin = useIsAdmin();
  const isSupport = userInfo?.support === true;

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [productMenuAnchor, setProductMenuAnchor] = useState<HTMLElement | null>(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(null);

  // The extra status-bar / notch padding is only needed inside the native
  // Capacitor app. In a normal browser the header should sit flush on top.
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [isNativeIos, setIsNativeIos] = useState(false);
  useEffect(() => {
    const native = isCapacitorNative();
    setIsNativeApp(native);
    setIsNativeIos(native && getPlatform() === 'ios');
  }, []);

  // Build primary platform navigation items from the shared SIDEBAR_NAV
  const platformNavItems = useMemo<DrawerNavGroup[]>(() => {
    const out: DrawerNavGroup[] = [];
    for (const spec of SIDEBAR_NAV) {
      if (spec.supportOnly && !isSupport) continue;
      if (!spec.alwaysVisible && sidebarTabs[spec.tabKey] === false) continue;

      const filteredChildren = spec.children
        ?.filter((c) => {
          if (c.supportOnly && !isSupport) return false;
          if (sidebarTabs[c.tabKey] === false) return false;
          return true;
        })
        .map((c) => ({
          label: c.label,
          path: c.path,
          disabled: c.disabled,
          badge: c.badge,
          supportOnly: c.supportOnly,
        }));

      const isIncidents = spec.tabKey === 'incidents';
      out.push({
        label: isIncidents ? entityPlural : spec.label,
        path: isIncidents ? entityBasePath : spec.path,
        supportOnly: spec.supportOnly,
        badge: spec.badge,
        children: filteredChildren && filteredChildren.length > 0 ? filteredChildren : undefined,
      });
    }
    return out;
  }, [entityPlural, entityBasePath, isSupport, sidebarTabs]);

  // Admin sub-navigation for quick discovery on mobile
  const adminChildren = useMemo(() => {
    const items = [
      { label: 'Overview', path: '/admin' },
      ...(isAdmin ? [{ label: 'Users & On-Call', path: '/admin/users' }] : []),
      { label: 'Tenants', path: '/admin/tenants' },
      ...(isAdmin
        ? [
            { label: 'Runtime Locations', path: '/admin/runtime-locations' },
            { label: 'Datastore', path: '/admin/datastore' },
            { label: 'UI Preferences', path: '/admin/preferences' },
          ]
        : []),
    ];
    return items;
  }, [isAdmin]);

  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Auto-expand active group when route changes, and close menus/drawer
  useEffect(() => {
    setMobileDrawerOpen(false);
    setProductMenuAnchor(null);
    setUserMenuAnchor(null);

    const path = location.pathname;
    const matches = (p?: string) => Boolean(p && (path === p || path.startsWith(p + '/')));
    const nextExpanded: string[] = [];

    for (const item of platformNavItems) {
      if (item.children && (matches(item.path) || item.children.some((c) => matches(c.path)))) {
        nextExpanded.push(item.label);
      }
    }
    if (matches('/admin')) {
      nextExpanded.push('Tenant Admin');
    }
    setExpandedGroups(nextExpanded);
  }, [location.pathname, location.search, platformNavItems]);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  };

  const isActive = (path?: string, exact = false) => {
    if (!path) return false;
    if (exact) return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const { title, parentPath, parentLabel } = useMemo(
    () => getPageTitle(location.pathname),
    [location.pathname]
  );

  const isRootPage =
    location.pathname === '/' ||
    location.pathname === '/incidents' ||
    location.pathname === '/agent' ||
    location.pathname === '/agents' ||
    location.pathname === '/admin';

  // Browsers have their own back control, and Android has the system back
  // button, so the in-app back arrow is only shown in the native iOS app.
  const showBackButton = !isRootPage && isNativeIos;

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else if (parentPath) {
      navigate(parentPath);
    } else {
      navigate('/incidents');
    }
  };

  const userInitial = userInfo?.username ? userInfo.username.charAt(0).toUpperCase() : 'U';

  return (
    <>
      <Box
        component="header"
        aria-label="Mobile Navigation Header"
        sx={{
          display: { xs: 'flex', sm: 'none' },
          flexDirection: 'column',
          justifyContent: 'flex-end',
          width: '100%',
          maxWidth: '100vw',
          boxSizing: 'border-box',
          // Top padding ensures all header elements are pushed safely below Dynamic Island / notch / status bar
          pt: isNativeApp ? 'max(calc(env(safe-area-inset-top, 0px) + 8px), 52px)' : 1,
          pb: 1,
          px: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          pr: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          bgcolor: 'hsl(var(--background) / 0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid hsl(var(--border) / 0.8)',
          position: 'relative',
          zIndex: 1100,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            width: '100%',
            minHeight: 40,
          }}
        >
          {/* Left: Navigation Drawer Trigger + Brand / Page Title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
            <Tooltip title="Open navigation menu">
              <IconButton
                size="small"
                aria-label="Open navigation menu"
                onClick={() => setMobileDrawerOpen(true)}
                sx={headerControlButtonSx}
              >
                <MenuIcon size={18} />
              </IconButton>
            </Tooltip>

            {showBackButton && (
              <Tooltip title={parentLabel ? `Back to ${parentLabel}` : 'Back'}>
                <IconButton
                  size="small"
                  aria-label={parentLabel ? `Back to ${parentLabel}` : 'Back'}
                  onClick={handleBack}
                  sx={headerControlButtonSx}
                >
                  <ChevronLeft size={18} />
                </IconButton>
              </Tooltip>
            )}

            {isRootPage ? (
              <Box
                component={Link}
                to="/incidents"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  textDecoration: 'none',
                  color: 'inherit',
                  minWidth: 0,
                }}
              >
                <ShuffleLogo size={22} color={primaryColor} />
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.4, minWidth: 0 }}>
                  {brandName ? (
                    <Typography
                      noWrap
                      sx={{
                        color: primaryColor,
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        letterSpacing: '-0.3px',
                      }}
                    >
                      {brandName}
                    </Typography>
                  ) : (
                    <>
                      <Typography
                        noWrap
                        sx={{
                          color: primaryColor,
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          letterSpacing: '-0.3px',
                        }}
                      >
                        Shuffle
                      </Typography>
                      <Typography
                        noWrap
                        sx={{
                          color: 'hsl(var(--foreground))',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          letterSpacing: '-0.3px',
                        }}
                      >
                        Security
                      </Typography>
                    </>
                  )}
                </Box>
              </Box>
            ) : (
              <Typography
                noWrap
                sx={{
                  fontWeight: 700,
                  fontSize: '0.925rem',
                  color: 'hsl(var(--foreground))',
                  letterSpacing: '-0.2px',
                  minWidth: 0,
                }}
              >
                {title}
              </Typography>
            )}
          </Box>

          {/* Right: Search, Tenant Selector, User Account Menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            <Tooltip title="Search">
              <IconButton
                size="small"
                aria-label="Search"
                onClick={() => setSearchOpen(true)}
                sx={headerControlButtonSx}
              >
                <SearchIcon size={18} />
              </IconButton>
            </Tooltip>

            <TenantSelector maxWidth={112} />

            <Tooltip title="Account & Settings">
              <IconButton
                size="small"
                aria-label="Account and settings menu"
                onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                sx={{
                  ...headerControlButtonSx,
                  p: 0.25,
                }}
              >
                <Avatar
                  sx={{
                    width: 24,
                    height: 24,
                    bgcolor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  {userInitial}
                </Avatar>
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* Top-Right User / Account Menu */}
      <Menu
        anchorEl={userMenuAnchor}
        open={Boolean(userMenuAnchor)}
        onClose={() => setUserMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              minWidth: 210,
              bgcolor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 1.5,
            },
          },
        }}
      >
        {userInfo?.username && (
          <Box sx={{ px: 2, py: 1, borderBottom: '1px solid hsl(var(--border))' }}>
            <Typography
              noWrap
              sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}
            >
              {userInfo.username}
            </Typography>
            {userInfo.active_org?.name && (
              <Typography
                noWrap
                sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))' }}
              >
                {userInfo.active_org.name}
              </Typography>
            )}
          </Box>
        )}

        <MenuItem
          component={Link}
          to="/usecases"
          selected={isActive('/usecases')}
          onClick={() => setUserMenuAnchor(null)}
          sx={{ py: 1.1, px: 2, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}
        >
          Usecases
        </MenuItem>
        <MenuItem
          component={Link}
          to="/apps"
          selected={isActive('/apps')}
          onClick={() => setUserMenuAnchor(null)}
          sx={{ py: 1.1, px: 2, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}
        >
          Apps & Integrations
        </MenuItem>
        <MenuItem
          component={Link}
          to="/onboarding/sources"
          selected={isActive('/onboarding')}
          onClick={() => setUserMenuAnchor(null)}
          sx={{ py: 1.1, px: 2, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}
        >
          Onboarding
        </MenuItem>

        <Divider sx={{ borderColor: 'hsl(var(--border))', my: 0.5 }} />

        <MenuItem
          component={Link}
          to="/admin"
          selected={isActive('/admin')}
          onClick={() => setUserMenuAnchor(null)}
          sx={{ py: 1.1, px: 2, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}
        >
          Tenant Admin
        </MenuItem>
        <MenuItem
          onClick={() => {
            setUserMenuAnchor(null);
            window.dispatchEvent(new CustomEvent(NOTIFICATIONS_OPEN_EVENT));
          }}
          sx={{ py: 1.1, px: 2, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}
        >
          Notifications
        </MenuItem>
        <MenuItem
          component={Link}
          to="/settings"
          selected={isActive('/settings')}
          onClick={() => setUserMenuAnchor(null)}
          sx={{ py: 1.1, px: 2, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}
        >
          User Settings
        </MenuItem>

        <Divider sx={{ borderColor: 'hsl(var(--border))', my: 0.5 }} />

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 0.75,
          }}
        >
          <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>
            Theme
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {[
              { value: 'light' as const, icon: <Sun size={16} />, label: 'Light' },
              { value: 'dark' as const, icon: <Moon size={16} />, label: 'Dark' },
              { value: 'system' as const, icon: <Monitor size={16} />, label: 'System' },
            ].map(({ value, icon, label }) => (
              <Tooltip key={value} title={label} placement="top">
                <IconButton
                  size="small"
                  onClick={() => setTheme(value)}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1,
                    color:
                      currentTheme === value
                        ? 'hsl(var(--foreground))'
                        : 'hsl(var(--muted-foreground))',
                    bgcolor: currentTheme === value ? 'hsl(var(--muted))' : 'transparent',
                    border:
                      currentTheme === value
                        ? '1px solid hsl(var(--border))'
                        : '1px solid transparent',
                  }}
                >
                  {icon}
                </IconButton>
              </Tooltip>
            ))}
          </Box>
        </Box>

        <Divider sx={{ borderColor: 'hsl(var(--border))', my: 0.5 }} />

        <MenuItem
          onClick={() => {
            setUserMenuAnchor(null);
            logout();
          }}
          sx={{
            py: 1.1,
            px: 2,
            fontSize: '0.85rem',
            color: 'hsl(var(--destructive, 0 84% 60%))',
          }}
        >
          Logout
        </MenuItem>
      </Menu>

      {/* Left Slide-Over Full Navigation Drawer */}
      <Drawer
        anchor="left"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          zIndex: 1450,
          '& .MuiDrawer-paper': {
            width: 300,
            maxWidth: '86vw',
            boxSizing: 'border-box',
            bgcolor: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            borderRight: '1px solid hsl(var(--border))',
            display: 'flex',
            flexDirection: 'column',
            pt: isNativeApp ? 'max(env(safe-area-inset-top, 0px), 44px)' : 0,
            pb: 'env(safe-area-inset-bottom, 0px)',
          },
        }}
      >
        {/* Drawer Header: Product Switcher + Close Button */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            borderBottom: '1px solid hsl(var(--border))',
          }}
        >
          <ButtonBase
            onClick={(e) => setProductMenuAnchor(e.currentTarget)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              borderRadius: 1,
              py: 0.5,
              pr: 1,
            }}
          >
            <ShuffleLogo size={26} color={primaryColor} />
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
              {brandName ? (
                <Typography sx={{ color: primaryColor, fontWeight: 700, fontSize: '0.95rem' }}>
                  {brandName}
                </Typography>
              ) : (
                <>
                  <Typography sx={{ color: primaryColor, fontWeight: 700, fontSize: '0.95rem' }}>
                    Shuffle
                  </Typography>
                  <Typography
                    sx={{
                      color: 'hsl(var(--foreground))',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                    }}
                  >
                    Security
                  </Typography>
                </>
              )}
            </Box>
            <ChevronDown size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </ButtonBase>

          <Tooltip title="Close menu">
            <IconButton
              size="small"
              aria-label="Close navigation menu"
              onClick={() => setMobileDrawerOpen(false)}
              sx={headerControlButtonSx}
            >
              <CloseIcon size={18} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Product Switcher Menu */}
        <Menu
          anchorEl={productMenuAnchor}
          open={Boolean(productMenuAnchor)}
          onClose={() => setProductMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{
            paper: {
              sx: {
                mt: 0.5,
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 1.5,
                minWidth: 230,
                zIndex: 1500,
              },
            },
          }}
        >
          <MenuItem
            selected
            onClick={() => {
              setProductMenuAnchor(null);
              setMobileDrawerOpen(false);
              navigate('/');
            }}
            sx={{
              py: 1.25,
              px: 2,
              gap: 1.5,
              backgroundColor: 'hsla(var(--primary) / 0.12) !important',
              border: '1px solid hsla(var(--primary) / 0.3)',
              borderRadius: 1,
              mx: 0.5,
            }}
          >
            <ShuffleLogo size={22} color={primaryColor} />
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              <span style={{ color: primaryColor }}>Shuffle</span> Security
            </Typography>
          </MenuItem>
          <MenuItem
            component="a"
            href={getShuffleCoreUrl('/dashboard')}
            onClick={async (e: React.MouseEvent) => {
              e.preventDefault();
              setProductMenuAnchor(null);
              setMobileDrawerOpen(false);
              await navigateToShuffleCore('/dashboard', { newTab: false });
            }}
            sx={{
              py: 1.25,
              px: 2,
              gap: 1.5,
              mx: 0.5,
              mt: 0.5,
              borderRadius: 1,
              color: 'hsl(var(--foreground))',
            }}
          >
            <img
              src={shuffleInfraLogo}
              alt="Shuffle Automation"
              width={22}
              height={22}
              style={{ borderRadius: 4 }}
            />
            <Typography sx={{ fontSize: '0.875rem', color: 'hsl(var(--foreground))' }}>
              <span style={{ color: primaryColor }}>Shuffle</span> Automation
            </Typography>
          </MenuItem>
        </Menu>

        {/* Search Trigger Bar */}
        <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
          <ButtonBase
            onClick={() => {
              setMobileDrawerOpen(false);
              setSearchOpen(true);
            }}
            sx={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 1.5,
              px: 1.5,
              py: 1,
              textAlign: 'left',
            }}
          >
            <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))' }}>
              Search pages, incidents, apps...
            </Typography>
            <SearchIcon size={16} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
          </ButtonBase>
        </Box>

        {/* Scrollable Navigation Sections */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1 }}>
          <Typography
            sx={{
              px: 1.25,
              pt: 0.5,
              pb: 0.75,
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            Platform
          </Typography>

          <List disablePadding>
            {platformNavItems.map((item) => {
              const active = isActive(item.path);
              const isExpanded = expandedGroups.includes(item.label);
              const hasChildren = Boolean(item.children && item.children.length > 0);

              return (
                <Box key={item.label} sx={{ mb: 0.25 }}>
                  <ListItem
                    disablePadding
                    secondaryAction={
                      hasChildren ? (
                        <IconButton
                          size="small"
                          edge="end"
                          aria-label={isExpanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleGroup(item.label);
                          }}
                          sx={{
                            color: 'hsl(var(--muted-foreground))',
                            p: 0.5,
                          }}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </IconButton>
                      ) : undefined
                    }
                  >
                    <ListItemButton
                      component={Link}
                      to={item.path || '/incidents'}
                      onPointerDown={() => prefetchRoute(item.path)}
                      onClick={() => setMobileDrawerOpen(false)}
                      sx={{
                        borderRadius: 1.25,
                        minHeight: 38,
                        px: 1.5,
                        pr: hasChildren ? 5 : 1.5,
                        backgroundColor: active ? 'hsl(var(--muted))' : 'transparent',
                        '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <span>{item.label}</span>
                            {item.supportOnly && (
                              <Typography
                                component="span"
                                sx={{
                                  fontSize: '0.6rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                  px: 0.7,
                                  py: 0.15,
                                  borderRadius: '4px',
                                  backgroundColor: 'hsla(var(--primary) / 0.12)',
                                  color: 'hsl(var(--primary))',
                                  lineHeight: 1.3,
                                }}
                              >
                                Support
                              </Typography>
                            )}
                            {item.badge && !item.supportOnly && (
                              <Typography
                                component="span"
                                sx={{
                                  fontSize: '0.6rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                  px: 0.7,
                                  py: 0.15,
                                  borderRadius: '4px',
                                  backgroundColor: 'hsla(var(--primary) / 0.12)',
                                  color: 'hsl(var(--primary))',
                                  lineHeight: 1.3,
                                }}
                              >
                                {item.badge}
                              </Typography>
                            )}
                          </Box>
                        }
                        primaryTypographyProps={{
                          fontSize: '0.875rem',
                          fontWeight: active ? 600 : 400,
                          color: active ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                        }}
                      />
                    </ListItemButton>
                  </ListItem>

                  {hasChildren && (
                    <Collapse in={isExpanded} timeout={180} unmountOnExit>
                      <List
                        disablePadding
                        sx={{
                          ml: 1.75,
                          pl: 1.25,
                          my: 0.25,
                          borderLeft: '1px solid hsl(var(--border))',
                        }}
                      >
                        {item.children!.map((child) => {
                          const childActive = isActive(child.path);
                          return (
                            <ListItem key={child.path} disablePadding sx={{ mb: 0.25 }}>
                              <ListItemButton
                                component={child.disabled ? 'div' : Link}
                                {...(child.disabled ? {} : { to: child.path })}
                                disabled={child.disabled}
                                onClick={() => {
                                  if (!child.disabled) setMobileDrawerOpen(false);
                                }}
                                sx={{
                                  borderRadius: 1,
                                  minHeight: 34,
                                  px: 1.25,
                                  py: 0.4,
                                  backgroundColor: childActive ? 'hsl(var(--muted))' : 'transparent',
                                  '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                                }}
                              >
                                <ListItemText
                                  primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                      <span>{child.label}</span>
                                      {child.supportOnly && (
                                        <Typography
                                          component="span"
                                          sx={{
                                            fontSize: '0.58rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            px: 0.6,
                                            py: 0.1,
                                            borderRadius: 0.5,
                                            backgroundColor: 'hsl(var(--primary) / 0.1)',
                                            color: 'hsl(var(--primary))',
                                          }}
                                        >
                                          Support
                                        </Typography>
                                      )}
                                      {child.badge && !child.supportOnly && (
                                        <Typography
                                          component="span"
                                          sx={{
                                            fontSize: '0.58rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            px: 0.6,
                                            py: 0.1,
                                            borderRadius: 0.5,
                                            backgroundColor: 'hsl(var(--primary) / 0.1)',
                                            color: 'hsl(var(--primary))',
                                          }}
                                        >
                                          {child.badge}
                                        </Typography>
                                      )}
                                    </Box>
                                  }
                                  primaryTypographyProps={{
                                    fontSize: '0.825rem',
                                    fontWeight: childActive ? 600 : 400,
                                    color: childActive
                                      ? 'hsl(var(--primary))'
                                      : 'hsl(var(--muted-foreground))',
                                  }}
                                />
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </List>
                    </Collapse>
                  )}
                </Box>
              );
            })}
          </List>

          <Divider sx={{ borderColor: 'hsl(var(--border))', my: 1.25 }} />

          {/* Workspace, Administration & Resources Section */}
          <Typography
            sx={{
              px: 1.25,
              pt: 0.25,
              pb: 0.75,
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            Workspace & Resources
          </Typography>

          <List disablePadding>
            {/* Tenant Admin with sub-pages */}
            <Box sx={{ mb: 0.25 }}>
              <ListItem
                disablePadding
                secondaryAction={
                  <IconButton
                    size="small"
                    edge="end"
                    aria-label={
                      expandedGroups.includes('Tenant Admin')
                        ? 'Collapse Tenant Admin'
                        : 'Expand Tenant Admin'
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleGroup('Tenant Admin');
                    }}
                    sx={{ color: 'hsl(var(--muted-foreground))', p: 0.5 }}
                  >
                    {expandedGroups.includes('Tenant Admin') ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </IconButton>
                }
              >
                <ListItemButton
                  component={Link}
                  to="/admin"
                  onClick={() => setMobileDrawerOpen(false)}
                  sx={{
                    borderRadius: 1.25,
                    minHeight: 38,
                    px: 1.5,
                    pr: 5,
                    backgroundColor: isActive('/admin') ? 'hsl(var(--muted))' : 'transparent',
                    '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                  }}
                >
                  <ListItemText
                    primary="Tenant Admin"
                    primaryTypographyProps={{
                      fontSize: '0.875rem',
                      fontWeight: isActive('/admin') ? 600 : 400,
                      color: isActive('/admin') ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                    }}
                  />
                </ListItemButton>
              </ListItem>
              <Collapse in={expandedGroups.includes('Tenant Admin')} timeout={180} unmountOnExit>
                <List
                  disablePadding
                  sx={{
                    ml: 1.75,
                    pl: 1.25,
                    my: 0.25,
                    borderLeft: '1px solid hsl(var(--border))',
                  }}
                >
                  {adminChildren.map((child) => {
                    const childActive = isActive(child.path, child.path === '/admin');
                    return (
                      <ListItem key={child.path} disablePadding sx={{ mb: 0.25 }}>
                        <ListItemButton
                          component={Link}
                          to={child.path}
                          onClick={() => setMobileDrawerOpen(false)}
                          sx={{
                            borderRadius: 1,
                            minHeight: 34,
                            px: 1.25,
                            py: 0.4,
                            backgroundColor: childActive ? 'hsl(var(--muted))' : 'transparent',
                            '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                          }}
                        >
                          <ListItemText
                            primary={child.label}
                            primaryTypographyProps={{
                              fontSize: '0.825rem',
                              fontWeight: childActive ? 600 : 400,
                              color: childActive
                                ? 'hsl(var(--primary))'
                                : 'hsl(var(--muted-foreground))',
                            }}
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </Collapse>
            </Box>

            {[
              { label: 'Usecases', path: '/usecases' },
              { label: 'Apps & Integrations', path: '/apps' },
              { label: 'Onboarding', path: '/onboarding/sources' },
              { label: 'User Settings', path: '/settings' },
            ].map((linkItem) => {
              const active = isActive(linkItem.path);
              return (
                <ListItem key={linkItem.path} disablePadding sx={{ mb: 0.25 }}>
                  <ListItemButton
                    component={Link}
                    to={linkItem.path}
                    onClick={() => setMobileDrawerOpen(false)}
                    sx={{
                      borderRadius: 1.25,
                      minHeight: 38,
                      px: 1.5,
                      backgroundColor: active ? 'hsl(var(--muted))' : 'transparent',
                      '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                    }}
                  >
                    <ListItemText
                      primary={linkItem.label}
                      primaryTypographyProps={{
                        fontSize: '0.875rem',
                        fontWeight: active ? 600 : 400,
                        color: active ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}

            <ListItem disablePadding sx={{ mb: 0.25 }}>
              <ListItemButton
                onClick={() => {
                  setMobileDrawerOpen(false);
                  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_OPEN_EVENT));
                }}
                sx={{
                  borderRadius: 1.25,
                  minHeight: 38,
                  px: 1.5,
                  '&:hover': { backgroundColor: 'hsl(var(--muted))' },
                }}
              >
                <ListItemText
                  primary="Notifications"
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: 400,
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>

        {/* Drawer Footer: Tenant Switcher, Theme Selector, and Logout */}
        <Box
          sx={{
            p: 2,
            borderTop: '1px solid hsl(var(--border))',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
            bgcolor: 'hsl(var(--card))',
          }}
        >
          <TenantSelector fullWidth />

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {[
                { value: 'light' as const, icon: <Sun size={16} />, label: 'Light' },
                { value: 'dark' as const, icon: <Moon size={16} />, label: 'Dark' },
                { value: 'system' as const, icon: <Monitor size={16} />, label: 'System' },
              ].map(({ value, icon, label }) => (
                <Tooltip key={value} title={`${label} theme`} placement="top">
                  <IconButton
                    size="small"
                    onClick={() => setTheme(value)}
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: 1,
                      color:
                        currentTheme === value
                          ? 'hsl(var(--foreground))'
                          : 'hsl(var(--muted-foreground))',
                      bgcolor: currentTheme === value ? 'hsl(var(--muted))' : 'transparent',
                      border:
                        currentTheme === value
                          ? '1px solid hsl(var(--border))'
                          : '1px solid transparent',
                    }}
                  >
                    {icon}
                  </IconButton>
                </Tooltip>
              ))}
            </Box>

            <ButtonBase
              onClick={() => {
                setMobileDrawerOpen(false);
                logout();
              }}
              sx={{
                px: 1.25,
                py: 0.6,
                borderRadius: 1,
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'hsl(var(--destructive, 0 84% 60%))',
                border: '1px solid hsl(var(--destructive, 0 84% 60%) / 0.3)',
                '&:hover': {
                  bgcolor: 'hsl(var(--destructive, 0 84% 60%) / 0.1)',
                },
              }}
            >
              Logout
            </ButtonBase>
          </Box>
        </Box>
      </Drawer>

      <SidebarSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
};

export const IosWebViewNavHeader = MobileNavHeader;

