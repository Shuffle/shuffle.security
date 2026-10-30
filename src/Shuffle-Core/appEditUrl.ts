/**
 * Where the "Edit" action on a generated app should send the user in Shuffle Core.
 * Owners and contributors edit the app directly; everyone else forks it.
 */
export function canUserEditApp(app: { owner?: string; contributors?: string[] } | null | undefined, user: any): boolean {
  if (!app || !user) return false;
  const ids = [user.id, user.username].filter(Boolean);
  if (app.owner && ids.includes(app.owner)) return true;
  if (Array.isArray(app.contributors) && app.contributors.some((c) => ids.includes(c))) return true;
  return false;
}

export function getAppEditUrl(
  app: { owner?: string; contributors?: string[] } | null | undefined,
  appId: string,
  user: any,
  coreUrl: (path: string) => string,
): { url: string; canEdit: boolean } {
  const canEdit = canUserEditApp(app, user);
  const id = encodeURIComponent(appId);
  return {
    canEdit,
    url: canEdit ? coreUrl(`/apps/edit/${id}`) : coreUrl(`/apps/new?id=${id}&fork=true`),
  };
}
