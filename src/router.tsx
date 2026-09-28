// Must be first: installs crypto.randomUUID polyfill for insecure HTTP contexts
// and in-memory localStorage/sessionStorage shim for SSR.
import "./lib/crypto-polyfill";
import "./lib/browser-shims";
import "./lib/ssr-storage";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
