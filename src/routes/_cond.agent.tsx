import { createFileRoute } from "@tanstack/react-router";
import { routeMeta } from '@/lib/routeMeta';
import { Navigate } from '@/lib/router-compat';

export const Route = createFileRoute("/_cond/agent")({
  head: () =>
    routeMeta({
      title: "AI Agent",
      description: "Configure the Shuffle Security AI agent: skills, tools, permissions and LLM providers.",
      url: "/agent",
      noindex: true,
    }),
  component: () => <Navigate to="/agents" replace />,
});
