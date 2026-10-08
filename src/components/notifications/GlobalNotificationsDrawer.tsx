/**
 * GlobalNotificationsDrawer — single app-level instance of the Shuffle-Core
 * notifications drawer, available on every route. Open it from anywhere by
 * dispatching the `notifications:open` window event, optionally with
 * `{ executionId, workflowId }` in `detail` to pre-scope the search.
 */

import { useEffect, useState } from 'react';
import { NotificationsDrawer, NOTIFICATIONS_OPEN_EVENT } from '@/Shuffle-Core';
import { useTheme } from '@/context/ThemeContext';

const GlobalNotificationsDrawer = () => {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<{ executionId?: string; workflowId?: string }>({});
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ executionId?: string; workflowId?: string }>).detail || {};
      setContext({
        executionId: detail.executionId ? String(detail.executionId) : undefined,
        workflowId: detail.workflowId ? String(detail.workflowId) : undefined,
      });
      setOpen(true);
    };
    window.addEventListener(NOTIFICATIONS_OPEN_EVENT, handler as EventListener);
    return () => window.removeEventListener(NOTIFICATIONS_OPEN_EVENT, handler as EventListener);
  }, []);

  return (
    <NotificationsDrawer
      open={open}
      onClose={() => setOpen(false)}
      executionId={context.executionId}
      workflowId={context.workflowId}
      theme={resolvedTheme}
    />
  );
};

export default GlobalNotificationsDrawer;
