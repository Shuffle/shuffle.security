import { Link, useLocation } from "@/lib/router-compat";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import AgentIcon from "@/Shuffle-Core/components/AgentIcon";
import shuffleInfraLogo from "@/assets/shuffle-infrastructure-logo.png";
import { usePageMeta } from "@/hooks/usePageMeta";
import { getShuffleCoreUrl } from "@/lib/shuffleUrls";
import { navigateToShuffleCore } from "@/lib/authHandoff";

const NotFound = () => {
  usePageMeta({
    title: "Page not found",
    description:
      "The page you are looking for does not exist on Shuffle Security.",
    url: "/404",
  });
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-4xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
            404 — Page not found
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            We could not find that page
          </h1>
          <p className="mx-auto max-w-xl text-base text-muted-foreground">
            The route{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground">
              {location.pathname}
            </code>{" "}
            does not exist. Pick a destination below to get back on track.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/dashboard"
            className="group flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary hover:bg-card/80"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center">
              <AgentIcon size={40} />
            </div>
            <h2 className="mb-1 text-lg font-semibold text-foreground">
              Return to Shuffle Security
            </h2>
            <p className="mb-4 flex-1 text-sm text-muted-foreground">
              Head back to your incidents, detections, and security operations
              workspace.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Open Shuffle Security
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          <a
            href={getShuffleCoreUrl()}
            onClick={async (e) => {
              e.preventDefault();
              const isNewTab = e.ctrlKey || e.metaKey || e.button === 1;
              await navigateToShuffleCore(getShuffleCoreUrl(), {
                newTab: isNewTab,
              });
            }}
            className="group flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary hover:bg-card/80"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center">
              <img
                src={shuffleInfraLogo}
                alt="Shuffle Automation"
                width={40}
                height={40}
                style={{ borderRadius: 6 }}
              />
            </div>
            <h2 className="mb-1 text-lg font-semibold text-foreground">
              Return to Shuffle Automation
            </h2>
            <p className="mb-4 flex-1 text-sm text-muted-foreground">
              Go to the Shuffle Automation platform to manage workflows and
              apps.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Open Shuffle Automation
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Or go to the landing page
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
