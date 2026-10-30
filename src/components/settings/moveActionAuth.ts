/** The "Move to tenant" routing action runs through the Shuffle OpenAPI app. */
export const SHUFFLE_OPENAPI_APP_ID = 'fc92c1d806df0c96f0c152a7b43b2878';

type AuthLike = {
  app_id?: unknown;
  app?: { id?: unknown; name?: unknown } | null;
  active?: unknown;
  validation?: { valid?: unknown } | null;
};

/** 'valid' | 'unvalidated' | 'missing' for the Shuffle OpenAPI app. */
export const getShuffleOpenApiAuthState = (auths: AuthLike[]): 'valid' | 'unvalidated' | 'missing' => {
  const matches = (auths || []).filter((a) => {
    const id = String(a?.app?.id || a?.app_id || '');
    return id === SHUFFLE_OPENAPI_APP_ID && a?.active !== false;
  });
  if (matches.length === 0) return 'missing';
  return matches.some((a) => a?.validation?.valid === true) ? 'valid' : 'unvalidated';
};
