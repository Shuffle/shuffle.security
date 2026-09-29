/**
 * Route-level helper components ported from the Classic src/App.tsx during
 * the TanStack Start migration. These were previously defined inline in
 * App.tsx; route files under src/routes/ import them from here.
 */
import { lazy, useState } from 'react';
import { Box } from '@mui/material';
import { Navigate, Outlet, useNavigate, useParams } from '@/lib/router-compat';
import { API_CONFIG } from '@/Shuffle-MCPs';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { AgentsView } from '@/Shuffle-MCPs';
import PermissionsPanel from '@/components/agent/PermissionsPanel';
import UsecasesPageRaw from '@/pages/dashboard/UsecasesPage';
import MonitorsView from '@/Shuffle-Core/views/monitors/MonitorsView';
import { useUsecaseAgentFilters } from '@/hooks/useUsecaseAgentFilters';
import { useHostMonitorCount } from '@/hooks/useHostMonitorCount';
import { useRealIncidentCount } from '@/hooks/useRealIncidentCount';

// Lazy-load the heaviest pages so route transitions render an immediate
// Suspense fallback instead of appearing to hang while the new page mounts.
export const IncidentsPage = lazy(() => import('@/pages/dashboard/IncidentsPage'));
const IncidentDetailPageImpl = lazy(() => import('@/pages/dashboard/IncidentDetailPage'));
export const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));

export const IncidentDetailPage = () => {
  const { id } = useParams<{ id?: string }>();
  // Remount on id change so all internal state/fetches reset cleanly.
  return <IncidentDetailPageImpl key={id || 'none'} />;
};

/** Layout that conditionally shows sidebar for authenticated users, navbar + content for guests */
export const ConditionalDashboardLayout = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <Outlet />;
  if (isAuthenticated) return <DashboardLayout />;
  return (
    <>
      <LandingNavbar />
      <Box sx={{ pt: '72px', mr: { xs: 0, md: 'var(--ask-ai-panel-width, 0px)' }, transition: 'margin 0.2s ease' }}>
        <Outlet />
      </Box>
    </>
  );
};

/** Guard that only allows support users; redirects others to incidents */
export const SupportOnly = ({ children }: { children: React.ReactNode }) => {
  const { userInfo } = useAuth();
  if (userInfo?.support !== true) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

/** /agents route wrapper — injects userdata so AgentsView's Local LLM panel can fetch sync_features. */
export const AgentsRoute = () => {
  const { resolvedTheme } = useTheme();
  const { userInfo, isAuthenticated, isLoading } = useAuth();
  const usecaseFilters = useUsecaseAgentFilters();
  const navigate = useNavigate();
  const hostMonitorCount = useHostMonitorCount();
  const incidentCount = useRealIncidentCount();
  const [addHostOpen, setAddHostOpen] = useState(false);
  const userdata = userInfo ? {
    id: userInfo.id,
    username: userInfo.username,
    support: userInfo.support,
    active_org: userInfo.active_org,
    sync_features: (userInfo as any).sync_features,
  } : undefined;
  return (
    <>
      <AgentsView
        globalUrl={API_CONFIG.baseUrl}
        theme={resolvedTheme}
        userdata={userdata as any}
        isLoaded={!isLoading}
        isLoggedIn={isAuthenticated}
        permissionsSlot={<PermissionsPanel compact />}
        usecaseFilters={usecaseFilters}
        presetCtas={{
          'host-monitor-control': {
            show: hostMonitorCount === 0,
            message: 'No host monitors are registered yet. Deploy one to let the agent act on hosts.',
            actionLabel: 'Add host monitor',
            onAction: () => setAddHostOpen(true),
          },
          'incident-response': {
            show: incidentCount === 0,
            message: 'No incidents have been ingested yet. Connect a source so the agent has something to triage.',
            actionLabel: 'Set up ingestion',
            onAction: () => navigate('/usecases'),
          },
        }}
      />
      {addHostOpen && (
        <MonitorsView
          mode="add-host-dialog"
          onClose={() => setAddHostOpen(false)}
        />
      )}
    </>
  );
};

/** Bridge AuthContext -> UsecasesPage so the in-page "Get started free" CTA
    correctly hides for already-authenticated dashboard users. */
export const UsecasesPage = () => {
  const { isAuthenticated, isLoading, userInfo } = useAuth();
  return (
    <UsecasesPageRaw
      isLoaded={!isLoading}
      isLoggedIn={isAuthenticated}
      globalUrl={API_CONFIG.baseUrl}
      userdata={userInfo ? {
        id: userInfo.id,
        username: userInfo.username,
        support: userInfo.support,
      } as any : undefined}
    />
  );
};

/** Legacy /incidents-simple/:id → /incidents/:id redirect (preserves the id and query string).
    The route file redirects on the server via beforeLoad; this component only
    runs on the client, so guard against SSR where window is undefined. */
export const RedirectIncidentsSimple = () => {
  if (typeof window === 'undefined') return null;
  const { pathname, search } = window.location;
  const id = pathname.split('/').filter(Boolean)[1] || '';
  return <Navigate to={`/incidents/${id}${search}`} replace />;
};

/** Redirect /articles, /blog (and their /:name children) to shuffler.io with the same path. */
export const ShufflerExternalRedirect = () => {
  if (typeof window !== 'undefined') {
    const { pathname, search, hash } = window.location;
    window.location.replace(`https://shuffler.io${pathname}${search}${hash}`);
  }
  return null;
};
