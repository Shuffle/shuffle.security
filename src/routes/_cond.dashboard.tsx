import { createFileRoute } from "@tanstack/react-router";
import { lazy } from 'react';
import { routeMeta } from '@/lib/routeMeta';
import { DashboardPage } from '@/components/routing/routeShims';
import { useAuth } from '@/context/AuthContext';

const GuestDashboardPage = lazy(() => import('@/pages/dashboard/GuestDashboardPage'));

/** Signed in: real dashboard. Signed out: same charts filled with sample data. */
const DashboardRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  return isAuthenticated ? <DashboardPage /> : <GuestDashboardPage />;
};

export const Route = createFileRoute("/_cond/dashboard")({
  head: () =>
    routeMeta({
      title: "Dashboard",
      description: "Live overview of incidents, automation coverage, agents and vulnerabilities.",
      url: "/dashboard",
      noindex: true,
    }),
  component: DashboardRoute,
});
