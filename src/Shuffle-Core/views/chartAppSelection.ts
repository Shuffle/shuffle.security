import { normalizeAppName } from '../ingestionDetection';

interface ChartApp {
  id: string;
  name: string;
  icon: string;
  hasValidAuth: boolean;
  isActiveOnly: boolean;
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