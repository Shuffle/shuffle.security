/** Shared access decision for embedded and page-based monitor deployment. */
export function isHostDeploymentRequested(value: string | null): boolean {
  // TanStack's default search serializer can JSON-quote strings from Link.
  return value === 'true' || value === '"true"';
}

export function deploymentLoginRedirect({
  authenticated,
  loading,
  dialog,
  requested,
}: {
  authenticated: boolean;
  loading: boolean;
  dialog: boolean;
  requested: boolean;
}): string | null {
  if (loading || authenticated || (!dialog && !requested)) return null;
  return `/login?view=${encodeURIComponent('/monitors?add_host=true')}`;
}