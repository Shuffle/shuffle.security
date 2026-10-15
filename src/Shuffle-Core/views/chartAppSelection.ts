import { normalizeAppName } from '../ingestionDetection';

interface ChartApp {
  id: string;
  name: string;
  icon: string;
  hasValidAuth: boolean;
  isActiveOnly: boolean;
}

export function canRemoveChartApp(app: { id: string; name: string }): boolean {
  return app.id !== 'webhook-ingestion' && app.name.toLowerCase() !== 'webhook';
}

/** Keep guest removals across URL-driven chart remounts, including sample nodes. */
export function removeGuestChartApp(params: URLSearchParams, appName: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if (!canRemoveChartApp({ id: '', name: appName })) return next;
  const key = appName.toLowerCase();
  for (const side of ['source', 'dest']) {
    const names = (next.get(side) || '').split(',').filter(name => name && name.toLowerCase() !== key);
    if (names.length) next.set(side, names.join(','));
    else next.delete(side);
  }
  const hidden = new Set((next.get('hidden_apps') || '').split(',').filter(Boolean).map(name => name.toLowerCase()));
  hidden.add(key);
  next.set('hidden_apps', [...hidden].join(','));
  return next;
}

/** Selection adds a node, never a credential or an authentication claim. */
export function addSelectedChartApp<T extends ChartApp>(
  apps: T[],
  selected: { id: string | null; name: string; icon: string },
): Array<T | ChartApp> {
  const key = normalizeAppName(selected.name);
  if (apps.some(app => normalizeAppName(app.name) === key)) {
    return apps.map(app => normalizeAppName(app.name) === key
      ? { ...app, icon: selected.icon || app.icon }
      : app);
  }
  return [...apps, {
    id: selected.id || '', name: selected.name, icon: selected.icon,
    hasValidAuth: false, isActiveOnly: false,
  }];
}