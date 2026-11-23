/**
 * GlobalNotificationsDrawer — single app-level instance of the Shuffle-Core
 * notifications drawer, available on every route. Open it from anywhere by
 * dispatching the `notifications:open` window event. `detail` may carry
 * `{ executionId, workflowId }` to pre-scope the search, or
 * `{ scope: 'personal', notificationId }` to open personal notifications with
 * one highlighted (used when a notification without a URL is clicked).
 */

import { useEffect, useState } from 'react';
import { NotificationsDrawer, NOTIFICATIONS_OPEN_EVENT } from '@/Shuffle-Core';
import { useTheme } from '@/context/ThemeContext';

type Scope = 'workflows' | 'agents' | 'personal';
interface OpenContext { executionId?: string; workflowId?: string; scope?: Scope; notificationId?: string }

const GlobalNotificationsDrawer = () => {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<OpenContext>({});
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const show = (detail: OpenContext) => {
      setContext({
        executionId: detail.executionId ? String(detail.executionId) : undefined,
        workflowId: detail.workflowId ? String(detail.workflowId) : undefined,
        scope: detail.scope,
        notificationId: detail.notificationId ? String(detail.notificationId) : undefined,
      });
      setOpen(true);
    };
    const handler = (e: Event) => show((e as CustomEvent<OpenContext>).detail || {});
    window.addEventListener(NOTIFICATIONS_OPEN_EVENT, handler as EventListener);

    // Clicked web push with no URL: the service worker messages an open tab...
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'shuffle-open-notification') {
        show({ scope: 'personal', notificationId: e.data.notificationId || undefined });
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    // ...or opens a new one with ?open_notification=<id>.
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('open_notification');
    if (fromUrl) {
      show({ scope: 'personal', notificationId: fromUrl === 'personal' ? undefined : fromUrl });
      params.delete('open_notification');
      const qs = params.toString();
      window.history.replaceState(window.history.state, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    }

    return () => {
      window.removeEventListener(NOTIFICATIONS_OPEN_EVENT, handler as EventListener);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, []);

  return (
    <NotificationsDrawer
      open={open}
      onClose={() => setOpen(false)}
      executionId={context.executionId}
      workflowId={context.workflowId}
      initialScope={context.scope}
      highlightId={context.notificationId}
      theme={resolvedTheme}
    />
  );
};

export default GlobalNotificationsDrawer;
