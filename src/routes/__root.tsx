import "@/lib/crypto-polyfill";
import "@/lib/browser-shims";
import { useState, Suspense, useEffect, useMemo, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { ThemeProvider as MuiThemeProvider, CssBaseline, Box } from "@mui/material";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import appCss from "../styles.css?url";

import { createMuiTheme } from "@/theme/muiTheme";
import { ThemeProvider, useTheme, applyDomTheme } from "@/context/ThemeContext";
import { AuthProvider, useOptionalAuth } from "@/context/AuthContext";
import { setToastImpl } from "@/Shuffle-MCPs/toast";
import { toast as hostToast } from "@/lib/toast";
import { trackReferralParams, initAnalytics } from "@/lib/analytics";
import { installLocalStorageQuotaGuard } from "@/utils/safeLocalStorage";
import { installWorkflowFetchGate } from "@/lib/workflowFetchGate";
import { installGlobalOverlayAutoLayer } from "@/Shuffle-MCPs/drawerLayer";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import ExternalLinkConfirmDialog from "@/components/common/ExternalLinkConfirmDialog";
import { ScrollToTop } from "@/components/ScrollToTop";
import { DemoProvider } from "@/context/DemoContext";
import { DemoTourDrawer } from "@/components/demo/DemoTourDrawer";
import { DemoSpotlight } from "@/components/demo/DemoSpotlight";
import { DemoCompletionWatcher } from "@/components/demo/DemoCompletionWatcher";
import { DemoResumePill } from "@/components/demo/DemoResumePill";
import GlobalAgentDrawer from "@/components/agent/GlobalAgentDrawer";
import GlobalWorkflowRunDrawer from "@/components/agent/GlobalWorkflowRunDrawer";
import GlobalNotificationsDrawer from "@/components/notifications/GlobalNotificationsDrawer";
import { AppDetailProvider } from "@/Shuffle-MCPs/AppDetailContext";
import { GlobalAppDetailDrawer } from "@/components/shared/AppDetailDrawer";
import NotFound from "@/pages/NotFound";
import { useCapacitorMobile } from "@/hooks/useCapacitorMobile";
import { GlobalErrorBoundary } from "@/components/common/GlobalErrorBoundary";
import { recordCrash, copyCrashLogsToClipboard } from "@/lib/crashReporter";
import { getPlatform, isCapacitorNative } from "@/lib/platform";

// ported from main.tsx / App.tsx module scope
setToastImpl((arg, opts) => {
  // Bridge MCP-lib toast shape ({ title, description, variant }) onto the
  // host react-toastify wrapper. Plain strings pass through.
  if (typeof arg === "string") {
    hostToast(arg, opts as any);
    return;
  }
  const { title, description, variant } = (arg ?? {}) as {
    title?: string;
    description?: string;
    variant?: string;
  };
  const message = title || description || "";
  const mergedOpts = { description: title ? description : undefined, ...(opts || {}) };
  if (variant === "destructive" || variant === "error") hostToast.error(message, mergedOpts as any);
  else if (variant === "warning") hostToast.warning(message, mergedOpts as any);
  else if (variant === "success") hostToast.success(message, mergedOpts as any);
  else if (variant === "info") hostToast.info(message, mergedOpts as any);
  else hostToast(message, mergedOpts as any);
});

// ported from main.tsx
if (typeof window !== "undefined") {
  installLocalStorageQuotaGuard();
  installWorkflowFetchGate();
  installGlobalOverlayAutoLayer();

  // Clean up any legacy Service Workers silently in the background (web browsers only).
  // Never reload the page, which causes infinite loops in WKWebView / private mode.
  const isCapacitor = Boolean((window as any).Capacitor?.isNativePlatform?.() || (window as any)._capacitor);
  if (!isCapacitor && typeof navigator !== "undefined" && Boolean(navigator.serviceWorker)) {
    try {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((r) => {
          // Keep the Firebase messaging worker: it is what produces the web push token.
          const script = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          if (script.includes("firebase-messaging-sw.js")) return;
          r.unregister().catch(() => {});
        });
      }).catch(() => {});
    } catch {}

    if (typeof window !== "undefined" && "caches" in window && Boolean(window.caches)) {
      try {
        window.caches.keys().then((cacheNames) => {
          cacheNames.forEach((n) => window.caches?.delete(n).catch(() => {}));
        }).catch(() => {});
      } catch {}
    }
  }
}


// Pre-paint theme & brand bootstrap: ThemeContext applies classes after hydration,
// but SSR paints first — resolve shuffle-theme (default: system) and custom brand color
// before first paint to avoid flashes of wrong theme or default orange.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("shuffle-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var root=document.documentElement;root.classList.remove("light","dark");root.classList.add(t);root.style.colorScheme=t;root.setAttribute("data-theme",t);if(document.body){document.body.classList.remove("light","dark");document.body.classList.add(t);document.body.style.colorScheme=t;document.body.setAttribute("data-theme",t);}var bc=localStorage.getItem("shuffle-brand-color");if(!bc){try{var u=JSON.parse(localStorage.getItem("shuffle_user_info")||"{}");bc=u&&u.active_org&&u.active_org.branding&&u.active_org.branding.brand_color;}catch(e){}}if(bc&&typeof bc==="string"){var hex=bc.replace(/^#/,"");if(hex.length===3)hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];if(hex.length===6){var r=parseInt(hex.substring(0,2),16)/255,g=parseInt(hex.substring(2,4),16)/255,b=parseInt(hex.substring(4,6),16)/255;var max=Math.max(r,g,b),min=Math.min(r,g,b);var h=0,s=0,l=(max+min)/2;if(max!==min){var d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}var H=Math.round(h*360),S=Math.round(s*100),L=Math.round(l*100);var hsl=H+" "+S+"% "+L+"%";var glowL=Math.min(L+10,100);var fg=L>60?"0 0% 9%":"0 0% 100%";root.style.setProperty("--primary",hsl);root.style.setProperty("--ring",hsl);root.style.setProperty("--sidebar-primary",hsl);root.style.setProperty("--sidebar-ring",hsl);root.style.setProperty("--status-open",hsl);root.style.setProperty("--primary-glow",H+" "+S+"% "+glowL+"%");root.style.setProperty("--primary-foreground",fg);root.style.setProperty("--sidebar-primary-foreground",fg);}}}catch(e){}})();`;

// Show the mobile login CTA bar on the auth-checking overlay immediately,
// before React hydrates, so it is visible even when the backend is slow.
const MOBILE_LOGIN_BAR_BOOTSTRAP = `(function(){try{var token=localStorage.getItem("session_token");var info=localStorage.getItem("shuffle_user_info");if(!token&&!info&&window.matchMedia("(max-width: 767px)").matches){document.documentElement.classList.add("show-mobile-login-bar");}}catch(e){}})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { title: "Shuffle Security — Open Source Alert & Case Management" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0, viewport-fit=cover",
      },
      {
        name: "description",
        content:
          "Open-source AI-powered incident response platform with 3,000+ integrations. Automatic security you control — cloud, on-prem, hybrid.",
      },
      {
        name: "keywords",
        content:
          "case management, alert management, cybersecurity, SOAR, incident response, open source, security automation, shuffle security",
      },
      { name: "author", content: "Shuffle Security" },
      { name: "robots", content: "index, follow" },
      { name: "theme-color", content: "#FF6600" },
      { name: "google-site-verification", content: "vLSnl-3IrXafKlglMz1T_LjnYu55mIdalktw88-cEZU" },
      { name: "google-site-verification", content: "XurySgWyZ4XH_J6GfrhvD167TYueG3DgElpwf0NOcXs" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Shuffle Security" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@shuffleio" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/pwa-192x192.png" },
    ],
    scripts: [
      { children: THEME_BOOTSTRAP },
      { children: MOBILE_LOGIN_BAR_BOOTSTRAP },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Shuffle Security",
          applicationCategory: "SecurityApplication",
          operatingSystem: "Web",
          description:
            "Open-source cybersecurity alert and case management platform for managing alerts, cases, tasks, and observables.",
          url: "https://shuffle.security",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          author: {
            "@type": "Organization",
            name: "Shuffle Security",
            url: "https://shuffle.security",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Shuffle Security",
          url: "https://shuffle.security",
          logo: "https://shuffle.security/favicon.ico",
          sameAs: [
            "https://twitter.com/shuffleio",
            "https://github.com/shuffle",
            "https://www.linkedin.com/company/shuffler",
          ],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Shuffle Security",
          url: "https://shuffle.security",
          publisher: { "@type": "Organization", name: "Shuffle Security", url: "https://shuffle.security" },
        }),
      },
      { src: "https://js.stripe.com/v3" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="/env-config.js" />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthenticatedDrawers() {
  const auth = useOptionalAuth();
  if (!auth?.isAuthenticated) return null;

  return (
    <>
      <GlobalWorkflowRunDrawer />
      <GlobalNotificationsDrawer />
      <DemoTourDrawer />
      <DemoSpotlight />
      <DemoCompletionWatcher />
      <DemoResumePill />
    </>
  );
}

/** MUI theming shell — the old ThemedApp from App.tsx, minus BrowserRouter. */
function ThemedShell({ children }: { children: ReactNode }) {
  const { resolvedTheme, brandColor } = useTheme();
  const muiTheme = useMemo(() => createMuiTheme(resolvedTheme, brandColor), [resolvedTheme, brandColor]);
  useCapacitorMobile({ theme: resolvedTheme });

  useEffect(() => {
    applyDomTheme(resolvedTheme);
  }, [resolvedTheme]);

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      <ExternalLinkConfirmDialog />
      <ToastContainer
        position="bottom-right"
        theme={resolvedTheme}
        autoClose={4000}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        hideProgressBar={false}
        style={{ width: "auto", maxWidth: 420 }}
      />
      <AuthProvider>
        <AppDetailProvider>
          <ScrollToTop />
          <DemoProvider>
            <GlobalAgentDrawer />
            <AuthenticatedDrawers />
            <GlobalAppDetailDrawer />
            <Suspense
              fallback={
                <Box
                  sx={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    zIndex: 2000,
                    backgroundColor: "hsl(var(--primary))",
                    opacity: 0.85,
                    animation: "shuffle-route-progress 1s ease-in-out infinite",
                  }}
                />
              }
            >
              {children}
            </Suspense>
          </DemoProvider>
        </AppDetailProvider>
      </AuthProvider>
    </MuiThemeProvider>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    initAnalytics();
    trackReferralParams();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <GlobalErrorBoundary>
          <ThemedShell>
            <Outlet />
          </ThemedShell>
        </GlobalErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    recordCrash(error, { source: "react_boundary", extra: { boundary: "tanstack_root_error_component" } });
  }, [error]);

  const handleCopyReport = async () => {
    const success = await copyCrashLogsToClipboard();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md p-8 text-center rounded-2xl border border-border bg-card shadow-lg">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-bold text-foreground">View Recovered</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          {error?.message || "Something went wrong while rendering this page."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </button>
          <a
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            href="/incidents"
          >
            Go to Incidents
          </a>
          <button
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            onClick={handleCopyReport}
          >
            {copied ? "Copied!" : "Copy Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
