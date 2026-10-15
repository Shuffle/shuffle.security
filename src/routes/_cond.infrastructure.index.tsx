import { createFileRoute } from "@tanstack/react-router";
import { lazy } from 'react';
import { routeMeta } from '@/lib/routeMeta';
import InfrastructurePage from '@/pages/dashboard/InfrastructurePage';
import { useAuth } from '@/context/AuthContext';

const GuestSampleView = lazy(() => import('@/pages/dashboard/GuestSampleView'));

/** Signed in: real infrastructure page. Signed out: same page filled with sample data. */
const InfrastructureRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <InfrastructurePage />;
  return (
    <GuestSampleView returnPath="/infrastructure" pageName="the infrastructure for your own tenant">
      <InfrastructurePage />
    </GuestSampleView>
  );
};

export const Route = createFileRoute("/_cond/infrastructure/")({
  head: () =>
    routeMeta({
      title: "Infrastructure",
      description: "Manage ingestion, forwarding and the apps that power your automation.",
      url: "/infrastructure",
      noindex: true,
    }),
  component: InfrastructureRoute,
});
