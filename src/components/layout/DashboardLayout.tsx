import { useState, useEffect, ReactNode, Suspense } from 'react';
import { Outlet, useLocation } from '@/lib/router-compat';
import { Box, Alert, Button } from '@mui/material';
import { AppSidebar } from './AppSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import AgentHandoffWatcher from '@/components/agent/AgentHandoffWatcher';
import { GlobalPagerWatcher } from '@/components/notifications/GlobalPagerWatcher';
import { PageSkeleton } from './PageSkeleton';
import { prefetchCommonRoutes } from '@/lib/routePrefetch';

import { useAuth } from '@/context/AuthContext';
import { loadAgentToolsFromDatastore } from '@/lib/agentTools';
import { IosWebViewNavHeader } from './IosWebViewNavHeader';
import { MobilePageTitleHider } from './MobilePageTitleHider';
import { useLifecycleConfig } from '@/hooks/useLifecycleConfig';

const drawerWidth = 260;
const collapsedWidth = 64;
const SIDEBAR_STATE_KEY = 'shuffle-security-sidebar-collapsed';

interface DashboardLayoutProps {
  children?: ReactNode;
  defaultCollapsed?: boolean;
}

export const DashboardLayout = ({ children, defaultCollapsed }: DashboardLayoutProps) => {
  const location = useLocation();
  // Applies tenant status/severity overrides to the shared incident config.
  useLifecycleConfig();
  const { orgMismatchWarning, dismissOrgMismatch, setActiveOrg, userInfo } = useAuth();
  const isOnboarding = location.pathname === '/onboarding' || location.pathname.startsWith('/onboarding/');


  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Always collapse on onboarding page regardless of saved state
    if (isOnboarding || defaultCollapsed) return true;
    const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
    return saved === 'true';
  });

  // Force collapse when navigating to onboarding
  useEffect(() => {
    if (isOnboarding) {
      setSidebarCollapsed(true);
    }
  }, [isOnboarding]);

  // Allow other parts of the app (e.g. demo mode startup) to request the
  // sidebar be collapsed for more screen real-estate. Dispatched as a
  // window event so callers do not need access to this component's state.
  useEffect(() => {
    const onCollapse = () => setSidebarCollapsed(true);
    window.addEventListener('shuffle:sidebar-collapse', onCollapse);
    return () => window.removeEventListener('shuffle:sidebar-collapse', onCollapse);
  }, []);

  // Only persist state when NOT on onboarding page
  useEffect(() => {
    if (!isOnboarding) {
      localStorage.setItem(SIDEBAR_STATE_KEY, String(sidebarCollapsed));
    }
  }, [sidebarCollapsed, isOnboarding]);

  // Expose the sidebar's right edge as a CSS variable so global styles can
  // clip MUI backdrops and keep the sidebar clickable while drawers are open.
  useEffect(() => {
    const width = sidebarCollapsed ? collapsedWidth : drawerWidth;
    // sidebar sits at left:10 with a small breathing gap; match DashboardLayout marginLeft (+20)
    const right = 10 + width + 10;
    document.documentElement.style.setProperty('--app-sidebar-right', `${right}px`);
    return () => {
      document.documentElement.style.setProperty('--app-sidebar-right', '0px');
    };
  }, [sidebarCollapsed]);

  // Hydrate the agent-tools cache from the datastore once we have an active
  // org. This keeps "Assigned tools" in sync across browsers/devices instead
  // of being a per-browser localStorage list.
  useEffect(() => {
    if (!userInfo?.active_org?.id) return;
    loadAgentToolsFromDatastore();
  }, [userInfo?.active_org?.id]);

  // Warm the heaviest route chunks while idle so the first click on
  // "Incidents" (and the first incident opened) does not wait on a download.
  useEffect(() => {
    prefetchCommonRoutes();
  }, []);



  return (
    <Box
      sx={{
          display: 'flex',
          height: '100dvh',
          backgroundColor: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          width: '100%',
          maxWidth: '100vw',
          overflowX: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100dvh',
            minWidth: 0,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            backgroundColor: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))',
            transition: 'margin 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            marginLeft: { 
              xs: 0, 
              sm: `${(sidebarCollapsed ? collapsedWidth : drawerWidth) + 16}px`,
              md: `${(sidebarCollapsed ? collapsedWidth : drawerWidth) + 20}px`,
            },
            marginRight: {
              xs: 0,
              md: 'var(--ask-ai-panel-width, 0px)',
            },
            overflowY: 'auto',
            overflowX: 'hidden',
            pl: 'env(safe-area-inset-left, 0px)',
            pr: 'env(safe-area-inset-right, 0px)',
            // Add bottom padding on mobile for the bottom nav and safe area
            pb: { xs: 'calc(76px + env(safe-area-inset-bottom, 0px))', sm: 0 },
          }}
        >
          <IosWebViewNavHeader />
          <MobilePageTitleHider />
          <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            {orgMismatchWarning && (
              <Alert
                severity="warning"
                sx={{ mb: 2 }}
                action={
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {userInfo?.active_org?.id && (
                      <Button color="inherit" size="small" variant="outlined" onClick={() => setActiveOrg(userInfo.active_org!.id)}>
                        Change back
                      </Button>
                    )}
                    <Button color="inherit" size="small" onClick={dismissOrgMismatch}>
                      Dismiss
                    </Button>
                    <Button color="warning" size="small" variant="outlined" onClick={() => window.location.reload()}>
                      Refresh
                    </Button>
                  </Box>
                }
              >
                Your active tenant has changed in another tab. Refresh to sync.
              </Alert>
            )}


            {/* Local Suspense boundary: route chunks resolve here so the
                sidebar stays mounted and clickable, and the content area
                paints a skeleton immediately instead of appearing frozen. */}
            <Suspense fallback={<PageSkeleton />}>
              {children || <Outlet />}
            </Suspense>
          </Box>
        </Box>
        <MobileBottomNav />
        {/* Global watcher: surfaces stuck AI Agent handoffs (approvals + open
            questions) as toasts on every page. Polls once per minute via the
            shared useAgentNotifications query. */}
        <AgentHandoffWatcher />
        {/* Global on-call pager watcher & incoming call alert popups */}
        <GlobalPagerWatcher />
        {/* GlobalAgentDrawer is mounted at App-level so it works on public
            routes (e.g. /usecases) too. */}
      </Box>
  );
};
