/**
 * AddAppDialog — standalone "Add app" modal for Shuffle Security / Shuffle
 * Core hosts.
 *
 * Flow:
 *   1. User types an app name or a documentation URL.
 *   2. If it looks like a name, we search Algolia for existing apps in the
 *      catalog and offer them inline / as an "existing match" step.
 *   3. Otherwise (or if the user opts to generate anyway) we POST the URL to
 *      the doc-to-openapi service, preview the returned spec, and finally
 *      verify it against the host's `/api/v1/verify_openapi` endpoint.
 *
 * Every URL / key that touches the outside world is a prop so downstream
 * hosts can point the component at their own environment.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
} from '@mui/material';
import { Plus, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { useOverlayLayer } from '@/Shuffle-MCPs/drawerLayer';
import { toast } from '@/Shuffle-Core/toast';
import type { ShuffleCoreHostProps } from '@/Shuffle-Core/types/host-props';

const DEFAULT_DOC_TO_OPENAPI_URL =
  'https://doc-to-openapi-stbuwivzoq-nw.a.run.app/api/v1/doc_to_openapi';
const DEFAULT_VERIFY_OPENAPI_PATH = '/api/v1/verify_openapi';
const DEFAULT_ALGOLIA_APP_ID = 'JNSS5CFDZZ';
const DEFAULT_ALGOLIA_API_KEY = '33e4e3564f4f060e96e0531957bed552';
const DEFAULT_ALGOLIA_INDEX = 'appsearch';

type Stage =
  | 'idle'
  | 'checking'
  | 'existing'
  | 'generating'
  | 'preview'
  | 'verifying'
  | 'done'
  | 'error';

interface ExistingMatch {
  objectID: string;
  name: string;
  description?: string;
  image_url?: string;
  categories?: string[];
}

interface OpenApiSpec {
  info?: {
    title?: string;
    description?: string;
    'x-image'?: string;
    [k: string]: unknown;
  };
  paths?: Record<string, Record<string, unknown>>;
  [k: string]: unknown;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const looksLikeUrl = (s: string) =>
  /^https?:\/\//i.test(s) || /\/|\.[a-z]{2,}(\/|$)/i.test(s);
const displayName = (name?: string) => (name ? name.replace(/_/g, ' ') : '');

const isSemiExactMatch = (query: string, hitName: string) => {
  const q = normalize(query);
  const n = normalize(hitName);
  if (!q || !n) return false;
  if (q === n) return true;
  if (q.length >= 4 && (n.includes(q) || q.includes(n))) return true;
  return false;
};

export interface AddAppDialogProps extends ShuffleCoreHostProps {
  /** Controls the dialog open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires with the created / picked app's canonical `objectID`. */
  onCreated?: (
    appId: string,
    app?: { name: string; image_url?: string; categories?: string[] },
  ) => void;
  /** URL of the doc-to-openapi service. Override for self-hosted deployments. */
  docToOpenApiUrl?: string;
  /** Path (relative to the host API) used to verify + persist the OpenAPI spec. */
  verifyOpenapiPath?: string;
  /** Algolia application ID. Defaults to Shuffle's public catalog. */
  algoliaAppId?: string;
  /** Algolia search-only API key. Defaults to Shuffle's public catalog. */
  algoliaApiKey?: string;
  /** Algolia index name. Defaults to `appsearch`. */
  algoliaIndexName?: string;
  /** Maximum characters accepted in the input field. */
  maxLength?: number;
  /** Pre-fill the input field when the dialog opens (e.g. seed with the user's failed search query). */
  initialInput?: string;
}

const GENERATION_TIPS = [
  'Reading the API docs so you do not have to...',
  'Asking the documentation nicely for its schema...',
  'Translating developer-speak into actual endpoints...',
  'Polishing the OpenAPI spec until it stops complaining...',
  'Brewing a fresh cup of JSON for the algorithm...',
  'Summoning the integration from the digital ether...',
  'Negotiating with the API one endpoint at a time...',
  'Teaching the AI that "REST" does not mean nap time...',
  'Parsing examples and hoping nobody used placeholder data...',
  'Reading between the lines of the docs...',
  'Turning a wall of text into something you can actually use...',
  'Building the app with 100% fewer hand-wavy examples...',
];

const DotsLoader = ({ message, tips }: { message: string; tips?: string[] }) => {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!tips || tips.length === 0) return;
    const interval = setInterval(() => {
      setTipIndex((i) => (i + 1) % tips.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [tips]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4, textAlign: 'center' }}>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'hsl(var(--primary))',
              animation: 'shuffle-addapp-bounce 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </Box>
      <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))', fontWeight: 500 }}>
        {message}
      </Typography>
      {tips && tips.length > 0 && (
        <Typography
          key={tipIndex}
          variant="caption"
          sx={{
            maxWidth: 420,
            minHeight: 36,
            color: 'hsl(var(--muted-foreground))',
            animation: 'shuffle-addapp-tip-fade 0.5s ease',
          }}
        >
          {tips[tipIndex]}
        </Typography>
      )}
      <style>{`
        @keyframes shuffle-addapp-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes shuffle-addapp-tip-fade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Box>
  );
};

export const AddAppDialog = ({
  open,
  onOpenChange,
  onCreated,
  docToOpenApiUrl = DEFAULT_DOC_TO_OPENAPI_URL,
  verifyOpenapiPath = DEFAULT_VERIFY_OPENAPI_PATH,
  algoliaAppId = DEFAULT_ALGOLIA_APP_ID,
  algoliaApiKey = DEFAULT_ALGOLIA_API_KEY,
  algoliaIndexName = DEFAULT_ALGOLIA_INDEX,
  maxLength = 1024,
  initialInput = '',
}: AddAppDialogProps) => {
  const dialogZIndex = useOverlayLayer(open);
  const [input, setInput] = useState(initialInput);
  const [stage, setStage] = useState<Stage>('idle');
  const [spec, setSpec] = useState<OpenApiSpec | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [createdAppId, setCreatedAppId] = useState<string>('');
  const [existing, setExisting] = useState<ExistingMatch | null>(null);
  const [liveHits, setLiveHits] = useState<ExistingMatch[]>([]);
  const [liveSearching, setLiveSearching] = useState(false);

  // Seed the input with the initial value each time the dialog opens.
  useEffect(() => {
    if (open) setInput(initialInput);
  }, [open, initialInput]);



  const title = spec?.info?.title || '';

  // Live Algolia search while the user types (idle stage only).
  useEffect(() => {
    if (stage !== 'idle') return;
    const q = input.trim();
    if (!q || looksLikeUrl(q)) {
      setLiveHits([]);
      setLiveSearching(false);
      return;
    }
    setLiveSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { algoliasearch } = await import('algoliasearch');
        const client = algoliasearch(algoliaAppId, algoliaApiKey);
        const res = await client.searchSingleIndex({
          indexName: algoliaIndexName,
          searchParams: { query: q, hitsPerPage: 3 },
        });
        if (cancelled) return;
        setLiveHits(((res.hits as unknown[]) || []).slice(0, 3) as ExistingMatch[]);
      } catch {
        if (!cancelled) setLiveHits([]);
      } finally {
        if (!cancelled) setLiveSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input, stage, algoliaAppId, algoliaApiKey, algoliaIndexName]);

  const reset = useCallback(() => {
    setInput('');
    setStage('idle');
    setSpec(null);
    setErrorMsg('');
    setCreatedAppId('');
    setExisting(null);
  }, []);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(reset, 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, reset]);

  const verifyAndCreate = useCallback(
    async (openapiSpec: OpenApiSpec) => {
      setStage('verifying');
      setErrorMsg('');
      try {
        const res = await fetch(getApiUrl(verifyOpenapiPath), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify(openapiSpec),
        });
        if (!res.ok) throw new Error(`Verification failed (${res.status})`);
        const data = await res.json();
        if (!data?.success) throw new Error(data?.reason || 'Verification failed');
        setCreatedAppId(data.id || '');
        setStage('done');
        toast.success('App created');
        if (data.id) {
          const image = (openapiSpec?.info as any)?.['x-image'] as string | undefined;
          onCreated?.(data.id, {
            name: openapiSpec?.info?.title || '',
            image_url: image,
            categories: [],
          });
          // Close automatically so the caller's onSelect flow can take over.
          setTimeout(() => onOpenChange(false), 600);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setErrorMsg(msg);
        setStage('error');
      }
    },
    [verifyOpenapiPath, onCreated, onOpenChange],
  );

  const runGeneration = useCallback(
    async (value: string) => {
      setStage('generating');
      setErrorMsg('');
      try {
        const res = await fetch(docToOpenApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: value }),
        });
        if (!res.ok) throw new Error(`Failed to generate spec (${res.status})`);
        const data = await res.json();
        const openapiSpec: OpenApiSpec =
          data && typeof data === 'object' && 'info' in data
            ? (data as OpenApiSpec)
            : (data?.openapi ?? data?.spec ?? data);
        if (!openapiSpec || typeof openapiSpec !== 'object') {
          throw new Error('No OpenAPI spec returned');
        }
        setSpec(openapiSpec);
        // Auto-create instead of stopping at a preview step — the caller
        // handles selection via onCreated.
        await verifyAndCreate(openapiSpec);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setErrorMsg(msg);
        setStage('error');
      }
    },
    [docToOpenApiUrl, verifyAndCreate],
  );

  const handleGenerate = async () => {
    const value = input.trim();
    if (!value) {
      toast.error('Enter an app name or documentation URL');
      return;
    }
    if (!looksLikeUrl(value) && value.length < 3) {
      toast.error('App name must be at least 3 characters');
      return;
    }

    if (looksLikeUrl(value)) {
      await runGeneration(value);
      return;
    }

    setStage('checking');
    setErrorMsg('');
    try {
      const { algoliasearch } = await import('algoliasearch');
      const client = algoliasearch(algoliaAppId, algoliaApiKey);
      const res = await client.searchSingleIndex({
        indexName: algoliaIndexName,
        searchParams: { query: value, hitsPerPage: 3 },
      });
      const hits = (((res.hits as unknown[]) || []).slice(0, 3)) as ExistingMatch[];
      const match = hits.find((h) => isSemiExactMatch(value, h?.name || ''));
      if (match) {
        setExisting(match);
        setStage('existing');
        return;
      }
    } catch {
      // Algolia unavailable — fall through and generate anyway.
    }
    await runGeneration(value);
  };

  const handleCreate = async () => {
    if (!spec) return;
    await verifyAndCreate(spec);
  };


  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      fullWidth
      maxWidth="sm"
      sx={{
        zIndex: dialogZIndex,
        '& .MuiBackdrop-root': {
          zIndex: dialogZIndex,
        },
      }}
      PaperProps={{
        sx: {
          maxWidth: 640,
          width: 'calc(100vw - 32px)',
          background: 'hsl(var(--card))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          boxSizing: 'border-box',
          zIndex: dialogZIndex,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.75,
          pt: 4,
          pb: 1,
        }}
      >
        <Box sx={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'hsla(var(--primary) / 0.1)',
          border: '1px solid hsla(var(--primary) / 0.3)',
          mb: 0.5,
        }}>
          <Plus size={24} style={{ color: 'hsl(var(--primary))' }} />
        </Box>
        <Typography sx={{ fontSize: 20, fontWeight: 700 }}>
          Can't find the app you are looking for?
        </Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 400, color: 'hsl(var(--muted-foreground))', textAlign: 'center', maxWidth: 460 }}>
          Type any app name (minimum 3 characters) and we will hunt down its public API,
          or paste a link to the API docs and we will build the integration for you.
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 4, py: 2, minWidth: 0, boxSizing: 'border-box' }}>
        {stage === 'idle' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 1, minWidth: 0 }}>
            <TextField
              autoFocus
              fullWidth
              placeholder="e.g. Jira, or https://api.example.com/docs"
              value={input}
              inputProps={{ maxLength, style: { textAlign: 'center', fontSize: 15 } }}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGenerate();
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  background: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                  minHeight: 52,
                  '& fieldset': { borderColor: 'hsl(var(--border))' },
                },
              }}
            />

            {input.trim() && !looksLikeUrl(input.trim()) && (
              <Box sx={{ minHeight: 40, minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
                {liveHits.length > 0 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      sx={{ px: 0.5, color: 'hsl(var(--muted-foreground))' }}
                    >
                      Existing matches
                    </Typography>
                    <Box
                      sx={{
                        width: '100%',
                        maxHeight: 240,
                        overflowY: 'auto',
                        borderRadius: 1,
                        boxSizing: 'border-box',
                      }}
                    >
                      {liveHits.map((hit) => (
                        <Box
                          key={hit.objectID}
                          component="button"
                          type="button"
                          onClick={() => {
                            onCreated?.(hit.objectID, {
                              name: hit.name,
                              image_url: hit.image_url,
                              categories: hit.categories,
                            });
                            onOpenChange(false);
                          }}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            width: '100%',
                            minWidth: 0,
                            px: 1.5,
                            py: 1,
                            mb: 0.5,
                            background: 'transparent',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: 1,
                            cursor: 'pointer',
                            textAlign: 'left',
                            color: 'inherit',
                            transition: 'border-color 0.15s',
                            '&:hover': { borderColor: 'hsl(var(--primary))' },
                            '&:last-child': { mb: 0 },
                          }}
                        >
                          {hit.image_url ? (
                            <img
                              src={hit.image_url}
                              alt=""
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 4,
                                objectFit: 'contain',
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <Box
                              sx={{
                                width: 24,
                                height: 24,
                                borderRadius: 0.5,
                                background: 'hsl(var(--muted))',
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              noWrap
                              sx={{ color: 'hsl(var(--foreground))' }}
                            >
                              {displayName(hit.name)}
                            </Typography>
                            {hit.description && (
                              <Typography
                                variant="caption"
                                noWrap
                                sx={{
                                  display: 'block',
                                  color: 'hsl(var(--muted-foreground))',
                                }}
                              >
                                {hit.description}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ) : (
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                      textAlign: 'center',
                      color: 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {liveSearching
                      ? 'Searching existing apps…'
                      : 'No existing matches — a new app will be generated.'}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        )}

        {stage === 'checking' && <DotsLoader message="Checking existing apps…" />}
        {stage === 'generating' && <DotsLoader message={`Building app for ${input.trim() || 'this tool'}…`} tips={GENERATION_TIPS} />}
        {stage === 'verifying' && <DotsLoader message={`Finishing ${title || input.trim() || 'app'}…`} />}


        {stage === 'existing' && existing && (
          <Box sx={{ textAlign: 'center', py: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              <span style={{ color: 'hsl(var(--foreground))' }}>{displayName(existing.name)}</span>{' '}
              already exists.
            </Typography>
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Use it or generate a new version.
            </Typography>
          </Box>
        )}

        {stage === 'preview' && spec && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              {title || 'Untitled app'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: 'hsl(var(--muted-foreground))' }}>
              Ready to create.
            </Typography>
          </Box>
        )}

        {stage === 'done' && (() => {
          const image = (spec?.info as any)?.['x-image'] as string | undefined;
          return (
            <Box
              sx={{
                py: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1.5,
                textAlign: 'center',
              }}
            >
              {image ? (
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: 1.5,
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    p: 1,
                  }}
                >
                  <img
                    src={image}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </Box>
              ) : (
                <CheckCircle2 size={44} style={{ color: 'hsl(var(--primary))' }} />
              )}
              <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                {title || 'App'} created
              </Typography>
              {createdAppId && (
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'monospace', color: 'hsl(var(--muted-foreground))' }}
                >
                  ID: {createdAppId}
                </Typography>
              )}
            </Box>
          );
        })()}


        {stage === 'error' && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
              p: 1.5,
              borderRadius: 1,
              border: '1px solid hsl(var(--destructive) / 0.4)',
              background: 'hsl(var(--destructive) / 0.08)',
            }}
          >
            <AlertTriangle size={18} style={{ color: 'hsl(var(--destructive))', flexShrink: 0 }} />
            <Typography variant="body2" sx={{ color: 'hsl(var(--foreground))' }}>
              {errorMsg || 'Something went wrong.'}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'center', pb: 3, px: 4, gap: 1 }}>
        {stage === 'idle' && (
          <>
            <Button variant="text" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleGenerate}
              disabled={
                !input.trim() ||
                (!looksLikeUrl(input.trim()) && input.trim().length < 3)
              }
              sx={{ minWidth: 140 }}
            >
              {looksLikeUrl(input.trim()) ? 'Generate from URL' : 'Find API'}
            </Button>
          </>
        )}
        {(stage === 'checking' || stage === 'generating' || stage === 'verifying') && (
          <Button variant="text" disabled>
            Working — this can take up to 5 minutes…
          </Button>
        )}
        {stage === 'existing' && existing && (
          <>
            <Button variant="text" onClick={reset}>
              Cancel
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                setExisting(null);
                runGeneration(input.trim());
              }}
            >
              Generate anyway
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (existing.objectID) {
                  onCreated?.(existing.objectID, {
                    name: existing.name,
                    image_url: existing.image_url,
                    categories: existing.categories,
                  });
                }
                onOpenChange(false);
              }}
            >
              Use existing
            </Button>
          </>
        )}
        {stage === 'preview' && (
          <>
            <Button variant="text" onClick={reset}>
              Try another
            </Button>
            <Button variant="contained" onClick={handleCreate}>
              Create app
            </Button>
          </>
        )}
        {stage === 'error' && (
          <>
            <Button variant="text" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button variant="contained" onClick={spec ? handleCreate : handleGenerate}>
              Retry
            </Button>
          </>
        )}
        {stage === 'done' && (
          <Button variant="contained" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export interface AddAppButtonProps
  extends Omit<AddAppDialogProps, 'open' | 'onOpenChange'> {
  variant?: 'text' | 'outlined' | 'contained';
  size?: 'small' | 'medium' | 'large';
  label?: string;
}

export const AddAppButton = ({
  onCreated,
  variant = 'outlined',
  size = 'small',
  label = 'New app',
  ...dialogProps
}: AddAppButtonProps) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        startIcon={<Plus size={14} />}
      >
        {label}
      </Button>
      <AddAppDialog
        {...dialogProps}
        open={open}
        onOpenChange={setOpen}
        onCreated={onCreated}
      />
    </>
  );
};

export default AddAppDialog;
