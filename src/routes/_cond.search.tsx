import { createFileRoute } from "@tanstack/react-router";
import { routeMeta } from "@/lib/routeMeta";
import SearchPage from "@/pages/SearchPage";

export const Route = createFileRoute("/_cond/search")({
  head: () =>
    routeMeta({
      title: "Search",
      description: "Unified search across integrations, workflows, incidents, documentation, and system navigation.",
      url: "/search",
      noindex: true,
    }),
  component: SearchPage,
});
