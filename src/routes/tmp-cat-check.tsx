import { createFileRoute } from "@tanstack/react-router";
import { Box } from "@mui/material";
import { IncidentRoutingEditor } from "@/components/settings/IncidentRoutingEditor";

export const Route = createFileRoute("/tmp-cat-check")({
  head: () => ({
    meta: [
      { title: "Temp check" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [],
  }),
  component: () => (
    <Box sx={{ p: 4, maxWidth: 900, mx: "auto" }}>
      <IncidentRoutingEditor forceShow borderless />
    </Box>
  ),
});
