import { createFileRoute } from "@tanstack/react-router";
import { lazy } from 'react';
import { routeMeta } from '@/lib/routeMeta';
import MonitorsPage from '@/pages/dashboard/MonitorsPage';
import { useAuth } from '@/context/AuthContext';
import { useSearchParams } from '@/lib/router-compat';
import { isHostDeploymentRequested } from '@/Shuffle-Core/views/monitors/deploymentLoginRedirect';

const GuestMonitorsPage = lazy(() => import('@/pages/dashboard/GuestMonitorsPage'));

/** Signed in: real host monitors. Signed out: sample hosts; actions ask to sign in. */
const MonitorsRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  if (isLoading) return null;
  // Deployment links (add_host=true) keep their existing sign-in redirect.
  if (isAuthenticated || isHostDeploymentRequested(searchParams.get('add_host'))) return <MonitorsPage />;
  return <GuestMonitorsPage />;
};

export const Route = createFileRoute("/_cond/monitors/")({
  head: () =>
    routeMeta({
      title: "Host monitors",
      description: "Deploy and manage host monitors for compliance and vulnerability data.",
      url: "/monitors",
      noindex: true,
    }),
  component: MonitorsRoute,
});
