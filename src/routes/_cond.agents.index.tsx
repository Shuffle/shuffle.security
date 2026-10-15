import { createFileRoute } from "@tanstack/react-router";
import { lazy } from 'react';
import { routeMeta } from '@/lib/routeMeta';
import { AgentsRoute } from '@/components/routing/routeShims';
import { useAuth } from '@/context/AuthContext';

const GuestSampleView = lazy(() => import('@/pages/dashboard/GuestSampleView'));

/** Signed in: real agent page. Signed out: same page filled with sample data. */
const AgentsPage = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <AgentsRoute />;
  return (
    <GuestSampleView returnPath="/agents" pageName="agent activity">
      <AgentsRoute />
    </GuestSampleView>
  );
};

export const Route = createFileRoute("/_cond/agents/")({
  head: () =>
    routeMeta({
      title: "Agent activity",
      description: "Monitor AI agent runs, decisions and handoffs across your security operations.",
      url: "/agents",
      noindex: true,
    }),
  component: AgentsPage,
});
