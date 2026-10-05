import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_dash/templates")({
  beforeLoad: () => {
    throw redirect({ to: "/incidents/templates", replace: true });
  },
});

