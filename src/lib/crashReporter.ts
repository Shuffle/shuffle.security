/**
 * Comprehensive Cross-Platform Crash Reporting & Diagnostics Engine.
 * Captures, buffers, and surfaces unhandled runtime exceptions, React component
 * crashes, promise rejections, and mobile plugin errors across iOS, Android, and Web.
 */

import { getPlatform, isCapacitorNative, getDeviceDiagnostics } from './platform';
import { reportLovableError } from './lovable-error-reporting';

export interface Breadcrumb {
  timestamp: number;
  category: 'navigation' | 'ui' | 'network' | 'auth' | 'pager' | 'storage' | 'system';
  message: string;
  data?: Record<string, unknown>;
}

export interface CrashLog {
  id: string;
  timestamp: number;
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  source: 'window_error' | 'unhandled_rejection' | 'react_boundary' | 'manual' | 'capacitor_plugin';
  route: string;
  platform: 'ios' | 'android' | 'web';
  isNative: boolean;
  userAgent: string;
  online: boolean;
  breadcrumbs: Breadcrumb[];
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
  };
}

const STORAGE_KEY = 'shuffle_crash_logs';
const MAX_LOGS = 30;
const MAX_BREADCRUMBS = 20;

const breadcrumbBuffer: Breadcrumb[] = [];
let isInitialized = false;

/**
 * Adds an in-memory breadcrumb to trace user actions preceding an error.
 */
export const logBreadcrumb = (
  category: Breadcrumb['category'],
  message: string,
  data?: Record<string, unknown>
): void => {
  try {
    breadcrumbBuffer.push({
      timestamp: Date.now(),
      category,
      message: message.slice(0, 300),
      data,
    });
    if (breadcrumbBuffer.length > MAX_BREADCRUMBS) {
      breadcrumbBuffer.shift();
    }
  } catch {
    // Fail-safe: breadcrumbs should never throw
  }
};

/**
 * Safely reads stored crash logs from localStorage.
 */
export const getCrashLogs = (): CrashLog[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Clears stored crash logs.
 */
export const clearCrashLogs = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('shuffle:crash-logs-updated', { detail: [] }));
  } catch {
    // ignore
  }
};

/**
 * Records a crash into persistent storage and notifies subscribers.
 */
export const recordCrash = (
  error: unknown,
  options?: {
    source?: CrashLog['source'];
    componentStack?: string;
    extra?: Record<string, unknown>;
  }
): CrashLog => {
  const now = Date.now();
  const source = options?.source || 'manual';
  const route = typeof window !== 'undefined' ? window.location.pathname : 'unknown';

  let message = 'Unknown runtime exception';
  let stack: string | undefined;
  let name: string | undefined;

  if (error instanceof Error) {
    message = error.message || error.name;
    stack = error.stack;
    name = error.name;
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object') {
    try {
      message = JSON.stringify(error);
    } catch {
      message = String(error);
    }
  }

  // Memory info if supported (Chromium / Android WebView)
  const perfMemory = typeof window !== 'undefined' && (performance as any)?.memory;
  const memory = perfMemory
    ? {
        usedJSHeapSize: Math.round(perfMemory.usedJSHeapSize / 1024 / 1024),
        totalJSHeapSize: Math.round(perfMemory.totalJSHeapSize / 1024 / 1024),
      }
    : undefined;

  const crash: CrashLog = {
    id: `crash-${now}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: now,
    message,
    name,
    stack,
    componentStack: options?.componentStack,
    source,
    route,
    platform: getPlatform(),
    isNative: isCapacitorNative(),
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    breadcrumbs: [...breadcrumbBuffer],
    memory,
  };

  // 1. Console notice in dev/testing
  console.error(`[Shuffle CrashReporter] [${source}] ${message}`, { crash, error });

  // 2. Persist to local storage buffer
  if (typeof window !== 'undefined') {
    try {
      const existing = getCrashLogs();
      const updated = [crash, ...existing].slice(0, MAX_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('shuffle:crash-logs-updated', { detail: updated }));
    } catch (storageErr) {
      console.warn('[Shuffle CrashReporter] Failed to persist crash log to storage:', storageErr);
    }

    // 3. Forward to Lovable telemetry if available
    try {
      reportLovableError(error, {
        crashId: crash.id,
        source: crash.source,
        platform: crash.platform,
        isNative: crash.isNative,
      });
    } catch {}
  }

  return crash;
};

/**
 * Exports all crash logs and device diagnostics formatted as readable text.
 */
export const exportCrashLogsAsText = (): string => {
  const diagnostics = getDeviceDiagnostics();
  const logs = getCrashLogs();

  const lines: string[] = [
    '=== SHUFFLE SECURITY CRASH & DIAGNOSTIC REPORT ===',
    `Generated At: ${new Date().toISOString()}`,
    `Platform: ${diagnostics.platform.toUpperCase()} (Native: ${diagnostics.isNative})`,
    `iOS: ${diagnostics.isIos} (WebView: ${diagnostics.isIosWebView})`,
    `Android: ${diagnostics.isAndroid} (WebView: ${diagnostics.isAndroidWebView})`,
    `Screen: ${diagnostics.screenWidth}x${diagnostics.screenHeight} (DPR: ${diagnostics.devicePixelRatio})`,
    `Touch Device: ${diagnostics.isTouchDevice} | Standalone: ${diagnostics.isStandalone}`,
    `Online: ${diagnostics.online}`,
    `User Agent: ${diagnostics.userAgent}`,
    '',
    `=== RECORDED CRASHES (${logs.length}) ===`,
  ];

  if (logs.length === 0) {
    lines.push('No crashes recorded.');
  } else {
    logs.forEach((log, index) => {
      lines.push(
        `\n[#${index + 1}] ${new Date(log.timestamp).toISOString()} [${log.source.toUpperCase()}] on ${log.route}`
      );
      lines.push(`Message: ${log.message}`);
      if (log.stack) {
        lines.push(`Stack: ${log.stack}`);
      }
      if (log.componentStack) {
        lines.push(`Component Stack:\n${log.componentStack}`);
      }
      if (log.breadcrumbs?.length) {
        lines.push('Recent Breadcrumbs:');
        log.breadcrumbs.forEach((b) => {
          lines.push(`  - [${new Date(b.timestamp).toLocaleTimeString()}] [${b.category}] ${b.message}`);
        });
      }
    });
  }

  return lines.join('\n');
};

/**
 * Copies the diagnostic & crash report to clipboard.
 */
export const copyCrashLogsToClipboard = async (): Promise<boolean> => {
  const report = exportCrashLogsAsText();
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(report);
      return true;
    } catch {
      // fallback to textarea copy
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = report;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  }

  return false;
};

/**
 * Initializes global uncaught error and unhandled rejection listeners.
 */
export const initCrashReporting = (): void => {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // Track global window errors
  window.addEventListener('error', (event) => {
    // Ignore benign cross-origin script error noise
    if (event.message === 'Script error.' && !event.filename) return;
    // Benign browser layout notice, not an application error
    if (typeof event.message === 'string' && event.message.includes('ResizeObserver loop')) return;

    recordCrash(event.error || event.message, {
      source: 'window_error',
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  // Track unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    recordCrash(event.reason || 'Unhandled Promise Rejection', {
      source: 'unhandled_rejection',
    });
  });

  // Log startup breadcrumb
  logBreadcrumb('system', `App started on ${getPlatform()} (Native: ${isCapacitorNative()})`, {
    userAgent: window.navigator.userAgent,
  });
};
