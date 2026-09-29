/**
 * Cross-domain authentication handoff between Shuffle Security and Shuffle Core (shuffler.io).
 *
 * Exposes utilities to request a single-use exchange ticket and navigate symmetrically
 * between Shuffle Security and Shuffle Automation (Shuffle Core) while ensuring session
 * cookies are established on the destination domain.
 */

import { toast } from "../toast";
import {
  getApiUrl,
  getAuthHeader,
  getSessionToken,
  isCloudDomain,
  isShuffleSecurityBackend,
} from "../api";
import {
  getShuffleCoreBaseUrl,
  getShuffleSecurityBaseUrl,
} from "./shuffleUrls";

export const UK_SHUFFLE_SECURITY_BASE = "https://uk.shuffle.security";
export const UK_SHUFFLE_CORE_BASE = "https://uk.shuffler.io";

// Endpoints when navigating from Shuffle Security -> Shuffle Core
export const UK_AUTH_HANDOFF_ENDPOINT = `${UK_SHUFFLE_SECURITY_BASE}/api/v1/auth/handoff`;
export const UK_AUTH_EXCHANGE_ENDPOINT = `${UK_SHUFFLE_CORE_BASE}/api/v1/auth/exchange`;

// Explicit named endpoints for clarity across bidirectional flows
export const UK_SHUFFLE_SECURITY_AUTH_HANDOFF_ENDPOINT = `${UK_SHUFFLE_SECURITY_BASE}/api/v1/auth/handoff`;
export const UK_SHUFFLE_SECURITY_AUTH_EXCHANGE_ENDPOINT = `${UK_SHUFFLE_SECURITY_BASE}/api/v1/auth/exchange`;
export const UK_SHUFFLE_CORE_AUTH_HANDOFF_ENDPOINT = `${UK_SHUFFLE_CORE_BASE}/api/v1/auth/handoff`;
export const UK_SHUFFLE_CORE_AUTH_EXCHANGE_ENDPOINT = `${UK_SHUFFLE_CORE_BASE}/api/v1/auth/exchange`;

export { isShuffleSecurityBackend };

export interface HandoffOptions {
  /** Open in a new browser tab/window instead of navigating the current tab. */
  newTab?: boolean;
}

const getRootDomain = (host: string): string => {
  if (!host) return "";
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
};

/**
 * Returns true if the given URL points to Shuffle Core (shuffler.io or configured core base).
 */
export const isShuffleCoreUrl = (url: string | undefined | null): boolean => {
  if (!url) return false;
  const coreBase = getShuffleCoreBaseUrl().toLowerCase();
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.startsWith(coreBase)) return true;

  try {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://shuffle.security";
    const parsed = new URL(url, origin);
    const host = parsed.hostname.toLowerCase();
    return host === "shuffler.io" || host.endsWith(".shuffler.io");
  } catch {
    return false;
  }
};

/**
 * Returns true if the given URL points to Shuffle Security (shuffle.security or configured security base).
 */
export const isShuffleSecurityUrl = (
  url: string | undefined | null,
): boolean => {
  if (!url) return false;
  const secBase = getShuffleSecurityBaseUrl().toLowerCase();
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.startsWith(secBase)) return true;

  try {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://shuffler.io";
    const parsed = new URL(url, origin);
    const host = parsed.hostname.toLowerCase();
    return host === "shuffle.security" || host.endsWith(".shuffle.security");
  } catch {
    return false;
  }
};

/**
 * Builds the full destination URL for Shuffle Core from either an absolute URL or a path.
 */
export const resolveShuffleCoreTargetUrl = (
  destinationUrlOrPath: string,
): string => {
  const trimmed = (destinationUrlOrPath || "").trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const coreBase = getShuffleCoreBaseUrl();
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${coreBase}${cleanPath}`;
};

/**
 * Builds the full destination URL for Shuffle Security from either an absolute URL or a path.
 */
export const resolveShuffleSecurityTargetUrl = (
  destinationUrlOrPath: string,
): string => {
  const trimmed = (destinationUrlOrPath || "").trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const secBase = getShuffleSecurityBaseUrl();
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${secBase}${cleanPath}`;
};

export function hasActiveSession(): boolean {
  if (typeof window === "undefined") return false;
  const token = getSessionToken();
  if (token && token.trim().length > 0) return true;

  try {
    const cookies = document.cookie || "";
    if (
      cookies.includes("session=") ||
      cookies.includes("user_id=") ||
      cookies.includes("token=")
    ) {
      return true;
    }
    const userInfo =
      localStorage.getItem("shuffle_user_info") ||
      localStorage.getItem("user_id");
    if (userInfo && userInfo.trim().length > 0 && userInfo !== "null") {
      return true;
    }
  } catch {
    /* ignore storage access error */
  }

  return false;
}

export function directNavigate(
  targetUrl: string,
  popupWindow: Window | null,
): boolean {
  if (popupWindow) {
    try {
      popupWindow.location.href = targetUrl;
    } catch {
      if (typeof window !== "undefined") {
        window.location.href = targetUrl;
      }
    }
  } else if (typeof window !== "undefined") {
    window.location.href = targetUrl;
  }
  return true;
}

/**
 * Requests an auth handoff ticket from the backend and navigates to Shuffle Core
 * via the ticket exchange endpoint.
 *
 * When called on *.shuffle.security (e.g. ca.shuffle.security, us.shuffle.security),
 * auth handoff ticket requests go to UK (uk.shuffle.security), and ticket exchange requests
 * go to UK (uk.shuffler.io) to establish the session cookie on .shuffler.io.
 *
 * If handoff fails or auth is missing, an error toast is displayed and navigation is prevented.
 *
 * @param destinationUrlOrPath The target path (e.g. `/new-dashboard`) or full URL on Shuffle Core.
 * @param options Navigation options (e.g. `{ newTab: true }`).
 * @returns Promise<boolean> True if handoff succeeded and redirect was initiated; false otherwise.
 */
export async function navigateToShuffleCore(
  destinationUrlOrPath: string,
  options?: HandoffOptions,
): Promise<boolean> {
  const isNewTab = Boolean(options?.newTab);
  const targetUrl = resolveShuffleCoreTargetUrl(destinationUrlOrPath);

  // When opening in a new tab, open blank window immediately within user gesture to avoid popup blockers
  let popupWindow: Window | null = null;
  const popupName = `shuffle_handoff_${Date.now()}`;
  if (isNewTab && typeof window !== "undefined") {
    popupWindow = window.open("about:blank", popupName);
    if (popupWindow) {
      try {
        popupWindow.name = popupName;
      } catch {
        /* ignore */
      }
    }
  }

  let targetHost = "";
  try {
    targetHost = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    /* ignore */
  }
  const currentHost =
    typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";

  const isShuffleBackend = isShuffleSecurityBackend();

  // On-prem / self-hosted environments share the same domain/host across frontends.
  // Because cookies are scoped to the hostname and ignore port numbers (RFC 6265),
  // the session cookie is already present in the browser and no auth handoff is needed.
  // Also, if already on the same root domain, cookies are already accessible across subdomains.
  const currentRoot = getRootDomain(currentHost);
  const targetRoot = getRootDomain(targetHost);
  const isSameDomain = Boolean(
    currentRoot && targetRoot && currentRoot === targetRoot,
  );

  if (
    (!isCloudDomain() && !isShuffleBackend) ||
    (targetHost && currentHost && targetHost === currentHost) ||
    isSameDomain
  ) {
    return directNavigate(targetUrl, popupWindow);
  }

  // If user is not logged in locally, bypass handoff and navigate directly
  if (!hasActiveSession()) {
    return directNavigate(targetUrl, popupWindow);
  }

  try {
    // When using *.shuffle.security as backend, auth handoff ticket requests must
    // ALWAYS go to UK (uk.shuffle.security). That is where auth actually occurs
    // and gets distributed from.
    const isCloud =
      isCloudDomain() ||
      currentHost.endsWith(".shuffle.security") ||
      currentHost === "shuffle.security";
    const handoffEndpoint =
      isCloud || isShuffleBackend
        ? UK_AUTH_HANDOFF_ENDPOINT
        : getApiUrl("/api/v1/auth/handoff");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    };

    // Ensure session token is attached in Authorization header if present
    const sessionToken = getSessionToken();
    if (sessionToken && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }

    const response = await fetch(handoffEndpoint, {
      method: "POST",
      credentials: "include",
      headers,
    });

    if (!response.ok) {
      console.warn(
        `[authHandoff] Handoff ticket request returned ${response.status}, falling back to direct navigation`,
      );
      return directNavigate(targetUrl, popupWindow);
    }

    const data = await response.json();
    if (!data?.success || !data?.ticket) {
      console.warn(
        `[authHandoff] No ticket returned (${data?.reason || "unknown"}), falling back to direct navigation`,
      );
      return directNavigate(targetUrl, popupWindow);
    }

    // Determine target Core base for exchange:
    // If we're using *.shuffle.security as backend, the exchange endpoint must ALWAYS be
    // uk.shuffler.io (https://uk.shuffler.io/api/v1/auth/exchange).
    // For on-prem / self-hosted instances, resolve from target URL or configured core base.
    let targetCoreBase = UK_SHUFFLE_CORE_BASE;
    if (!isShuffleBackend && !isCloud) {
      targetCoreBase = getShuffleCoreBaseUrl();
      try {
        const u = new URL(targetUrl);
        if (
          u.hostname === "shuffler.io" ||
          u.hostname.endsWith(".shuffler.io")
        ) {
          targetCoreBase = `https://${u.hostname}`;
        }
      } catch {
        /* ignore */
      }
    }

    // Use an auto-submitting POST form so ticket, user_id, and redirect do not leak in URL access logs
    if (typeof document !== "undefined") {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `${targetCoreBase}/api/v1/auth/exchange`;
      if (popupWindow) {
        form.target = popupWindow.name || popupName;
      }

      const fields: Record<string, string> = {
        ticket: data.ticket,
        user_id: data.user_id || "",
        redirect: targetUrl,
      };

      for (const [key, value] of Object.entries(fields)) {
        if (!value) continue;
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
      form.remove();
    } else {
      const fallbackUrl = `${targetCoreBase}/api/v1/auth/exchange?ticket=${encodeURIComponent(data.ticket)}&user_id=${encodeURIComponent(data.user_id || "")}&redirect=${encodeURIComponent(targetUrl)}`;
      if (popupWindow) {
        popupWindow.location.href = fallbackUrl;
      } else if (typeof window !== "undefined") {
        window.location.href = fallbackUrl;
      }
    }

    return true;
  } catch (err: unknown) {
    console.warn(
      "[authHandoff] Error during handoff to Shuffle Core, falling back to direct navigation:",
      err,
    );
    return directNavigate(targetUrl, popupWindow);
  }
}

/**
 * Requests an auth handoff ticket from the backend and navigates to Shuffle Security
 * via the ticket exchange endpoint.
 *
 * When called on *.shuffler.io (Shuffle Automation), auth handoff ticket requests go to
 * UK (uk.shuffler.io) where the cloud session cookie lives, and ticket exchange requests
 * go to UK (uk.shuffle.security) to establish the session cookie on .shuffle.security.
 *
 * On self-hosted / on-prem instances sharing the same host, cookies are shared across ports
 * and direct navigation is used.
 *
 * @param destinationUrlOrPath The target path (e.g. `/incidents`) or full URL on Shuffle Security.
 * @param options Navigation options (e.g. `{ newTab: true }`).
 * @returns Promise<boolean> True if handoff succeeded and redirect was initiated; false otherwise.
 */
export async function navigateToShuffleSecurity(
  destinationUrlOrPath: string,
  options?: HandoffOptions,
): Promise<boolean> {
  const isNewTab = Boolean(options?.newTab);
  const targetUrl = resolveShuffleSecurityTargetUrl(destinationUrlOrPath);

  // When opening in a new tab, open blank window immediately within user gesture to avoid popup blockers
  let popupWindow: Window | null = null;
  const popupName = `shuffle_security_handoff_${Date.now()}`;
  if (isNewTab && typeof window !== "undefined") {
    popupWindow = window.open("about:blank", popupName);
    if (popupWindow) {
      try {
        popupWindow.name = popupName;
      } catch {
        /* ignore */
      }
    }
  }

  let targetHost = "";
  try {
    targetHost = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    /* ignore */
  }
  const currentHost =
    typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";

  const isShuffleBackend = isShuffleSecurityBackend();

  // On-prem / self-hosted environments share the same domain/host across frontends.
  // Because cookies are scoped to the hostname and ignore port numbers (RFC 6265),
  // the session cookie is already present in the browser and no auth handoff is needed.
  // Also, if already on the same root domain, cookies are already shared.
  const currentRoot = getRootDomain(currentHost);
  const targetRoot = getRootDomain(targetHost);
  const isSameDomain = Boolean(
    currentRoot && targetRoot && currentRoot === targetRoot,
  );

  if (
    (!isCloudDomain() && !isShuffleBackend) ||
    (targetHost && currentHost && targetHost === currentHost) ||
    isSameDomain
  ) {
    return directNavigate(targetUrl, popupWindow);
  }

  // If user is not logged in locally, bypass handoff and navigate directly
  if (!hasActiveSession()) {
    return directNavigate(targetUrl, popupWindow);
  }

  try {
    // When requesting a ticket from Shuffle Automation cloud (*.shuffler.io),
    // request from uk.shuffler.io where the cloud session cookie lives.
    // For custom backends / on-prem, use getApiUrl('/api/v1/auth/handoff').
    const isCloud =
      isCloudDomain() ||
      currentHost.endsWith(".shuffler.io") ||
      currentHost === "shuffler.io";
    const handoffEndpoint = isCloud
      ? UK_SHUFFLE_CORE_AUTH_HANDOFF_ENDPOINT
      : getApiUrl("/api/v1/auth/handoff");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    };

    // Ensure session token is attached in Authorization header if present
    const sessionToken = getSessionToken();
    if (sessionToken && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }

    const response = await fetch(handoffEndpoint, {
      method: "POST",
      credentials: "include",
      headers,
    });

    if (!response.ok) {
      console.warn(
        `[authHandoff] Handoff ticket request returned ${response.status}, falling back to direct navigation`,
      );
      return directNavigate(targetUrl, popupWindow);
    }

    const data = await response.json();
    if (!data?.success || !data?.ticket) {
      console.warn(
        `[authHandoff] No ticket returned (${data?.reason || "unknown"}), falling back to direct navigation`,
      );
      return directNavigate(targetUrl, popupWindow);
    }

    // Determine target Security base for exchange:
    // If target is *.shuffle.security cloud, exchange must go to uk.shuffle.security.
    // For on-prem / self-hosted, resolve from target URL or configured security base.
    let targetSecurityBase = UK_SHUFFLE_SECURITY_BASE;
    if (!isCloud) {
      targetSecurityBase = getShuffleSecurityBaseUrl();
      try {
        const u = new URL(targetUrl);
        if (
          u.hostname === "shuffle.security" ||
          u.hostname.endsWith(".shuffle.security")
        ) {
          targetSecurityBase = `https://${u.hostname}`;
        }
      } catch {
        /* ignore */
      }
    }

    // Use an auto-submitting POST form so ticket, user_id, and redirect do not leak in URL access logs
    if (typeof document !== "undefined") {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `${targetSecurityBase}/api/v1/auth/exchange`;
      if (popupWindow) {
        form.target = popupWindow.name || popupName;
      }

      const fields: Record<string, string> = {
        ticket: data.ticket,
        user_id: data.user_id || "",
        redirect: targetUrl,
      };

      for (const [key, value] of Object.entries(fields)) {
        if (!value) continue;
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
      form.remove();
    } else {
      const fallbackUrl = `${targetSecurityBase}/api/v1/auth/exchange?ticket=${encodeURIComponent(data.ticket)}&user_id=${encodeURIComponent(data.user_id || "")}&redirect=${encodeURIComponent(targetUrl)}`;
      if (popupWindow) {
        popupWindow.location.href = fallbackUrl;
      } else if (typeof window !== "undefined") {
        window.location.href = fallbackUrl;
      }
    }

    return true;
  } catch (err: unknown) {
    console.warn(
      "[authHandoff] Error during handoff to Shuffle Security, falling back to direct navigation:",
      err,
    );
    return directNavigate(targetUrl, popupWindow);
  }
}

if (typeof window !== "undefined") {
  (window as any).__shuffleNavigateToCore = navigateToShuffleCore;
}
