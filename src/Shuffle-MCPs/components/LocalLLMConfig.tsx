import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  Autocomplete,
  Box,
  Button,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { AppAuthCard } from '@/Shuffle-MCPs/components/AppAuthConfig';
import type { AlgoliaSearchApp } from '@/Shuffle-MCPs/shuffle-mcp.helpers';
import { useAppAuth } from '@/Shuffle-MCPs/useAppAuth';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { refreshAllIntegrationStatus } from '@/Shuffle-MCPs/components/IntegrationStatus';
import {
  fetchAuthenticatedApps as fetchSharedAuthenticatedApps,
  invalidateAuthenticatedAppsCache,
} from '@/Shuffle-MCPs/authenticatedApps';
import { UsageBar } from '@/Shuffle-MCPs/components/UsageBar';
import { useSyncHostBaseUrl } from '@/Shuffle-MCPs/useSyncHostBaseUrl';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import { AuthStatusChip } from '@/Shuffle-MCPs/components/AuthStatusChip';
import { getValidatedAuthIds, rememberValidatedAuth } from '@/Shuffle-MCPs/validatedAuthMemory';

import {
  ENDPOINT_PRESETS,
  PROVIDER_DOMAINS,
  SHUFFLE_AI_PRESET,
  CUSTOM_PRESET,
  detectLLMProvider,
  providerLabelOfAuthEntry,
} from '@/Shuffle-MCPs/llmProviderDetect';
import {
  switchActiveLLM,
  maskSecretFields,
} from '@/Shuffle-MCPs/llmActiveProvider';

const OPENAI_APP_NAME = 'OpenAI';
const OPENAI_APP_ID = '5d19dd82517870c68d40cacad9b5ca91';

const OPENAI_ALGOLIA_APP: AlgoliaSearchApp = {
  name: OPENAI_APP_NAME,
  description: 'OpenAI-compatible LLM endpoint for agent operations',
  objectID: OPENAI_APP_ID,
  creator: '',
  app_version: '1.0.0',
  image_url: '',
  time_edited: 0,
  generated: false,
  invalid: false,
  priority: 0,
  actions: 0,
  tags: [],
  accessible_by: [],
  categories: [],
  action_labels: [],
  triggers: [],
  verified: true,
};

/** The OpenAI-compatible auth schema is fixed (url + apikey), so we render the
 *  fields immediately instead of waiting on an app-config request. */
const OPENAI_AUTH_SCHEMA = {
  type: 'authentication',
  required: true,
  parameters: [
    {
      id: 'url',
      name: 'url',
      description: 'Base URL of the OpenAI-compatible endpoint',
      example: 'https://api.openai.com/v1',
      required: true,
      schema: { type: 'string' },
    },
    {
      id: 'apikey',
      name: 'apikey',
      description: 'API key for the provider',
      example: '',
      required: true,
      schema: { type: 'string' },
    },
  ],
};


const CUSTOM_MODEL = 'Custom…';

// Curated 2026-era model lists per provider. The FIRST entry is the default
// selected for that provider, and is the best general-purpose model for
// security analysis work (strong reasoning, sane cost/latency).
// Custom value can always be typed in.
const PROVIDER_MODELS: Record<string, string[]> = {
  OpenAI: ['gpt-6', 'gpt-6-astra', 'gpt-6-mini', 'gpt-6-nano', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.4-mini', 'o4-mini', 'o3', 'o3-mini'],
  'Azure OpenAI': ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'gpt-4-turbo'],
  Anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-fable-5', 'claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'],
  'Amazon Bedrock': [
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'anthropic.claude-3-7-sonnet-20250219-v1:0',
    'anthropic.claude-3-5-haiku-20241022-v1:0',
    'meta.llama3-3-70b-instruct-v1:0',
    'amazon.nova-pro-v1:0',
    'amazon.nova-lite-v1:0',
    'deepseek.r1-v1:0',
  ],
  'Google Gemini': ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro', 'gemini-3-flash', 'gemini-3-pro', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  xAI: ['grok-4', 'grok-3', 'grok-3-mini', 'grok-2-1212', 'grok-2-vision-1212'],
  Mistral: ['mistral-large-3', 'mistral-medium-3.5', 'mistral-small-4', 'codestral-2026', 'pixtral-large', 'magistral-medium-2026', 'ministral-3-14b', 'ministral-3-8b'],
  Groq: ['llama-4-maverick-17b-128e', 'llama-4-scout-17b-16e', 'qwen-3.6-27b', 'qwen-qwq-32b', 'deepseek-v4-flash', 'llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b', 'llama-guard-4-12b', 'kimi-k2-instruct'],
  DeepSeek: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-r1', 'deepseek-v3', 'deepseek-coder-v3'],
  'Moonshot AI (Kimi)': ['kimi-k2.5', 'kimi-k2-instruct', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
  'Together AI': ['meta-llama/Llama-4-Maverick-17B-128E-Instruct', 'meta-llama/Llama-4-Scout-17B-16E-Instruct', 'meta-llama/Llama-4-Behemoth-Instruct', 'deepseek-ai/DeepSeek-V4-Pro', 'deepseek-ai/DeepSeek-V4-Flash', 'Qwen/Qwen3.6-72B-Instruct', 'deepseek-ai/DeepSeek-R1', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-235B-A22B'],
  OpenRouter: ['openai/gpt-6-astra', 'openai/gpt-6', 'anthropic/claude-sonnet-5', 'anthropic/claude-opus-5', 'anthropic/claude-fable-5-1', 'google/gemini-3.8-flash', 'google/gemini-3.7-flash', 'deepseek/deepseek-v4', 'meta-llama/llama-4-maverick', 'anthropic/claude-sonnet-4.5', 'openai/gpt-5.5', 'x-ai/grok-4'],
  'Ollama (localhost)': ['llama4', 'llama4:16x17b', 'qwen3.6:27b', 'qwen3.6', 'qwen3-coder', 'deepseek-v4-flash', 'llama3.3', 'qwen3', 'deepseek-r1', 'mistral-small4', 'phi4', 'gemma3'],
  'LM Studio (localhost)': ['qwen-3.6-27b', 'llama-4-16x17b-instruct', 'deepseek-v4-flash', 'qwen3-32b', 'llama-3.3-70b-instruct', 'deepseek-r1-distill-qwen-32b', 'mistral-small-4', 'phi-4', 'gemma-3-27b'],
};


export interface AgentLocalModel {
  url: string;
  apikey: string;
  model: string;
}

export interface LocalLLMTestResult {
  success: boolean;
  message: string;
  models?: string[];
  latencyMs?: number;
}





const ProviderLogo = ({ label, url }: { label: string; url?: string }) => {
  const [errored, setErrored] = useState(false);
  let domain = PROVIDER_DOMAINS[label];
  if (!domain && url) {
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* noop */ }
  }
  const src = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <Box sx={{ width: 18, height: 18, borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'hsl(var(--muted))', overflow: 'hidden', flexShrink: 0 }}>
      {src && !errored ? (
        <img src={src} alt="" width={18} height={18} style={{ display: 'block' }} onError={() => setErrored(true)} />
      ) : (
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', lineHeight: 1 }}>{initial}</Typography>
      )}
    </Box>
  );
};


/** Remembers the last selected AI provider across reloads. */
const LLM_PRESET_STORAGE_KEY = 'shuffle-llm-provider';

export const getLocalModel = (): AgentLocalModel => ({ url: '', apikey: '', model: '' });
export const saveLocalModelConfig = (_model: AgentLocalModel) => {};
export const testLocalLLM = async (_config: AgentLocalModel): Promise<LocalLLMTestResult> => ({
  success: false,
  message: 'Use the app authentication system test instead',
});

export interface LocalLLMConfigProps extends ShuffleHostProps {
  compact?: boolean;
  hasOpenAIAuth?: boolean;
  onSave?: (model: AgentLocalModel) => void;
  onTestResult?: (result: LocalLLMTestResult) => void;
  /** When the panel is rendered inside a drawer, pass the drawer open state
   *  so the provider selector can reset to the currently active provider each
   *  time the drawer opens. */
  open?: boolean;
}

const LocalLLMConfig = ({ compact, globalUrl, userdata, isLoaded, isLoggedIn, serverside, theme, colorMode, open }: LocalLLMConfigProps) => {
  useSyncHostBaseUrl(globalUrl);
  const { authStates, authenticatedApps, handleAuthChange, handleSaveAuth, refreshAuth, loading: authLoading } = useAppAuth();
  const [expanded, setExpanded] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(LLM_PRESET_STORAGE_KEY) || '';
      return ENDPOINT_PRESETS.some((p) => p.label === stored) ? stored : '';
    } catch {
      return '';
    }
  });


  const [customUrl, setCustomUrl] = useState<string>('');
  const activeSwitchSeqRef = useRef<number>(0);
  /** Local override for the LLM chat test so the shared app-auth test (which
   *  refetches the whole auth list mid-test and makes the card flicker) is
   *  never used for LLM providers. */
  const [llmTest, setLlmTest] = useState<{
    status: 'testing' | 'connected' | 'error';
    successMessage?: string;
    errorMessage?: string;
  } | null>(null);

  const openaiEntries = authenticatedApps.filter(
    (a) => a.app?.name?.toLowerCase() === 'openai' || a.app?.id === OPENAI_APP_ID,
  );

  const baseAuthState = authStates[OPENAI_APP_ID] || {
    systemId: OPENAI_APP_ID,
    status: 'pending' as const,
    credentials: {},
  };
  const authState = llmTest
    ? {
        ...baseAuthState,
        status: llmTest.status,
        successMessage: llmTest.successMessage,
        errorMessage: llmTest.errorMessage,
      }
    : baseAuthState;


  // Prefer the in-memory edit (authState.credentials), but fall back to the
  // persisted URL on the saved auth entry so we can auto-detect the vendor
  // even when the user has not opened/edited the form yet.
  const savedUrlFromEntry = (((openaiEntries[0] as any)?.fields) as Array<{ key?: string; value?: string }> | undefined || [])
    .find((f) => (f?.key || '').toLowerCase() === 'url')?.value || '';
  const currentUrl = ((authState.credentials?.url as string) || savedUrlFromEntry || '').trim();
  // Model is now persisted inside the AppAuthCard credentials (read via extraFieldsSlot).
  const [customModel, setCustomModel] = useState<string>('');
  const [customMode, setCustomMode] = useState<boolean>(false);

  // NOTE: Previously this component auto-deleted any failed OpenAI auth
  // entry as soon as its validation came back false. That fought against the
  // "Save anyway" CTA in AppAuthCard — the user would click it, but the
  // failed entry had already been wiped from the server. The user now owns
  // the lifecycle: keep it (Save anyway), retry it, or delete it manually
  // from the auth selector.

  const hasOpenAIEntries = openaiEntries.length > 0;

  /** Which provider a saved OpenAI auth entry belongs to.
   *  URL wins (it is authoritative), then the label — legacy labels look like
   *  "OpenAI - Anthropic", so the app-name prefix is stripped before matching
   *  to avoid classifying every entry as OpenAI. */
  const providerOfEntry = (entry: any): string => providerLabelOfAuthEntry(entry);

  /** Display label without the redundant "OpenAI - " app-name prefix. */
  const displayLabelOfEntry = (entry: any): string => {
    const raw = String(entry?.label || '');
    const stripped = raw.replace(new RegExp(`^\\s*${OPENAI_APP_NAME}\\s*-\\s*`, 'i'), '').trim();
    return stripped || raw;
  };


  const [optimisticActiveProvider, setOptimisticActiveProvider] = useState<string | null>(null);

  /** The currently active (primary) OpenAI-compatible authentication.
   *  Separate from the fallback so we know whether `active: true` is set. */
  const activeEntryRaw = useMemo(
    () => openaiEntries.find((e: any) => e?.active === true),
    [openaiEntries],
  );
  // Only consider an entry active if it is actually flagged active
  const activeEntry = activeEntryRaw || null;

  /** The label of the provider that is currently active (active: true). This
   *  is the single source of truth for what should appear in the "Choose LLM"
   *  area, regardless of what the user last looked at in the drawer. */
  const activeProviderLabel = useMemo(() => {
    if (optimisticActiveProvider !== null) {
      return optimisticActiveProvider === SHUFFLE_AI_PRESET ? null : optimisticActiveProvider;
    }
    if (!activeEntryRaw) return null;
    return providerOfEntry(activeEntryRaw);
  }, [optimisticActiveProvider, activeEntryRaw, providerOfEntry]);


  const effectivePreset = useMemo(() => {
    if (selectedPreset) return selectedPreset;
    if (optimisticActiveProvider !== null) return optimisticActiveProvider;
    if (activeEntryRaw) return providerOfEntry(activeEntryRaw);
    if (!currentUrl && !hasOpenAIEntries) return SHUFFLE_AI_PRESET;
    if (currentUrl) return detectLLMProvider(currentUrl)?.label || CUSTOM_PRESET;
    return SHUFFLE_AI_PRESET;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPreset, optimisticActiveProvider, currentUrl, hasOpenAIEntries, activeEntryRaw]);

  /** Saved authentications for the currently selected provider only.
   *  All providers share the OpenAI app auth (that is just the request FORMAT),
   *  but the selector must only ever list credentials belonging to the provider
   *  on screen, so picking Anthropic auto-selects the Anthropic credential. */
  const providerEntries = useMemo(
    () => openaiEntries
      .filter((e: any) => providerOfEntry(e) === effectivePreset)
      .map((e: any) => ({ ...e, label: displayLabelOfEntry(e) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openaiEntries, effectivePreset],
  );

  /** Providers that have at least one saved, validated authentication.
   *  The backend clears `validation.valid` when an entry is written back with
   *  masked secrets (every provider switch does this), so a local memory of
   *  previously validated auth ids is unioned in. */
  const validatedProviderLabels = useMemo(() => {
    const set = new Set<string>();
    const remembered = getValidatedAuthIds();
    for (const entry of openaiEntries) {
      const isValid = entry?.validation?.valid === true || (entry?.id && remembered.has(entry.id));
      if (isValid) {
        const label = providerOfEntry(entry);
        if (label) set.add(label);
      }
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openaiEntries, llmTest]);





  /**
   * Make one saved LLM authentication `active: true` and all others
   * `active: false`. The backend uses `active: true` to pick which custom
   * provider receives agent LLM queries.
   *
   * Fields are preserved during this call by sending placeholder values so the
   * stored credentials survive the update (same pattern as auth renaming).
   */
  const setActiveAuthEntry = async (activeId: string | null, preloadedEntries?: any[]) => {
    const seq = ++activeSwitchSeqRef.current;
    const placeholder = 'Secret. Replaced during app execution!';
    let entries: any[] = [];
    if (activeId !== null && preloadedEntries && preloadedEntries.length > 0) {
      // Caller already fetched a fresh list for an active ID switch
      entries = preloadedEntries;
    } else {
      try {
        invalidateAuthenticatedAppsCache();
        entries = (await fetchSharedAuthenticatedApps()) as any[];
      } catch {
        entries = openaiEntries as any[];
      }
    }
    if (seq !== activeSwitchSeqRef.current) return;

    const llmEntries = entries.filter(
      (a: any) => a?.app?.name?.toLowerCase() === 'openai' || a?.app?.id === OPENAI_APP_ID,
    );

    let changed = false;
    for (const entry of llmEntries) {
      if (!entry?.id) continue;
      if (seq !== activeSwitchSeqRef.current) return;

      const shouldBeActive = entry.id === activeId;
      if (entry.active === shouldBeActive) continue;

      const body: Record<string, any> = {
        ...entry,
        active: shouldBeActive,
        fields: maskSecretFields(entry.fields),
      };

      try {
        const resp = await fetch(getApiUrl('/api/v1/apps/authentication'), {
          method: 'PUT',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) changed = true;
      } catch (err) {
        console.error('[LocalLLMConfig] Failed to update active state on LLM auth:', err);
      }
    }

    if (seq !== activeSwitchSeqRef.current) return;

    if (changed || activeId === null) {
      invalidateAuthenticatedAppsCache();
      await refreshAuth();
      // Broadcast change so listeners (e.g. the AgentUI chip) refresh immediately.
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('integrations-changed', { detail: { source: 'llm-active-change' } }));
        } catch {
          /* noop */
        }
      }
    }
  };


  /**
   * Save with the provider baked into the label, then mark the saved provider
   * as the primary (active) one. Other providers are kept, just deactivated.
   */
  const handleSaveProviderAuth = async (appId: string, creds: Record<string, string>): Promise<boolean> => {
    const provider = effectivePreset || detectLLMProvider(creds.url || '')?.label || CUSTOM_PRESET;
    const ok = await handleSaveAuth(appId, creds, OPENAI_APP_NAME, provider);
    if (!ok) return false;

    // Find the freshly saved entry for this provider and make it the primary.
    // handleSaveAuth already invalidated + refetched, so this hits the shared
    // cache instead of firing another GET.
    try {
      const entries = (await fetchSharedAuthenticatedApps()) as any[];
      const match = entries
        .filter((a: any) => a?.app?.name?.toLowerCase() === 'openai' || a?.app?.id === OPENAI_APP_ID)
        .filter((a: any) => providerOfEntry(a) === provider)
        .sort((a: any, b: any) => (Number(b?.edited || b?.created || 0) - Number(a?.edited || a?.created || 0)))[0];
      if (match?.id) await setActiveAuthEntry(match.id, entries);
    } catch (err) {
      console.error('[LocalLLMConfig] Failed to set primary LLM provider:', err);
    }
    return true;
  };


  /**
   * LLM-specific connection test: sends a minimal OpenAI ChatCompletion
   * request through the saved authentication.
   * POST /api/v1/chat/completions?authentication_id=<id>
   */
  const handleTestLLMConnection = async (_appId: string, authenticationId?: string) => {
    let authId = authenticationId || (providerEntries[0] as any)?.id || (activeEntry as any)?.id;
    if (!authId) {
      try {
        const fresh = (await fetchSharedAuthenticatedApps()) as any[];
        const latest = fresh
          .filter((a: any) => a?.app?.name?.toLowerCase() === 'openai' || a?.app?.id === OPENAI_APP_ID)
          .sort((a: any, b: any) => (Number(b?.edited || b?.created || 0) - Number(a?.edited || a?.created || 0)))[0];
        if (latest?.id) authId = latest.id;
      } catch {
        /* noop */
      }
    }

    if (!authId) {
      setLlmTest({
        status: 'error',
        errorMessage: 'Save the authentication first, then run the test.',
      });
      return;
    }

    const model =
      ((authState.credentials?.model as string) || '').trim() ||
      PROVIDER_MODELS[effectivePreset]?.[0] ||
      '';

    setLlmTest({ status: 'testing' });
    try {
      const response = await fetch(
        getApiUrl(`/api/v1/chat/completions?authentication_id=${encodeURIComponent(authId)}`),
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...(model ? { model } : {}),
            messages: [
              { role: 'system', content: 'You are a connection test. Answer with one word.' },
              { role: 'user', content: 'Reply with the single word: OK' },
            ],
            max_tokens: 16,
            temperature: 0,
            stream: false,
          }),
        },
      );

      const raw = await response.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      const apiError =
        (typeof data?.error === 'string' && data.error) ||
        data?.error?.message ||
        (data?.success === false ? data?.reason || 'The provider rejected the request.' : '');

      const content =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        data?.result ??
        data?.answer ??
        '';

      if (!response.ok || apiError) {
        setLlmTest({
          status: 'error',
          errorMessage:
            apiError ||
            `Connection failed (HTTP ${response.status}). Check the endpoint URL, API key and model.`,
        });
      } else if (!content || !String(content).trim()) {
        setLlmTest({
          status: 'error',
          errorMessage: 'The provider responded, but returned no message content.',
        });
      } else {
        rememberValidatedAuth(authId);
        setLlmTest({
          status: 'connected',
          successMessage: `Connection verified${model ? ` • ${model}` : ''} • Reply: ${String(content).trim().slice(0, 60)}`,
        });
      }

    } catch (error) {
      setLlmTest({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Connection test failed.',
      });
    }

    // Refresh once the test has settled so provider checkmarks update. This is
    // intentionally after the result is set, so the card does not flicker
    // while the test is running.
    try {
      await refreshAuth();
      refreshAllIntegrationStatus();
    } catch {
      /* noop */
    }
  };


  /** Persist the provider choice so /agents restores it on the next load. */
  const rememberPreset = (label: string) => {
    try {
      localStorage.setItem(LLM_PRESET_STORAGE_KEY, label);
    } catch {
      /* noop */
    }
  };

  const prevOpenRef = useRef(open);
  const hasInitializedPresetRef = useRef(false);

  /** Keep the provider selector aligned with the currently active provider.
   *  When the drawer opens, reset the UI so it shows the active one instead
   *  of the last one the user merely looked at. */
  useEffect(() => {
    const justOpened = Boolean(open && !prevOpenRef.current);
    prevOpenRef.current = open;

    if (authLoading) return;
    if (optimisticActiveProvider !== null) return;

    const target = activeProviderLabel || SHUFFLE_AI_PRESET;

    if (justOpened) {
      setSelectedPreset(target);
      rememberPreset(target);
      return;
    }

    if (!hasInitializedPresetRef.current) {
      hasInitializedPresetRef.current = true;
      setSelectedPreset(target);
      rememberPreset(target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeProviderLabel, authLoading, optimisticActiveProvider]);

  const applyShuffleAI = async () => {
    // Flip the UI to Shuffle AI immediately and deactivate the
    // saved LLM authentications. Nothing is deleted.
    const previousActive = activeProviderLabel;
    const previousPreset = selectedPreset;
    setOptimisticActiveProvider(SHUFFLE_AI_PRESET);
    setSelectedPreset(SHUFFLE_AI_PRESET);
    rememberPreset(SHUFFLE_AI_PRESET);
    setCustomUrl('');
    handleAuthChange(OPENAI_APP_ID, {});
    try {
      const res = await switchActiveLLM(SHUFFLE_AI_PRESET);
      if (!res.success) {
        // Only a failed "active" write rolls the selection back.
        setOptimisticActiveProvider(null);
        if (previousPreset) setSelectedPreset(previousPreset);
        else if (previousActive) setSelectedPreset(previousActive);
        return;
      }
      await refreshAuth();
    } catch (err) {
      console.error('[LocalLLMConfig] Failed to deactivate provider auths:', err);
      setOptimisticActiveProvider(null);
      if (previousPreset) setSelectedPreset(previousPreset);
      else if (previousActive) setSelectedPreset(previousActive);
    }
  };

  const handlePresetChange = (label: string) => {
    setLlmTest(null);
    if (label === SHUFFLE_AI_PRESET) {
      void applyShuffleAI();
      return;
    }

    const previousActive = activeProviderLabel;
    const previousPreset = selectedPreset;

    setSelectedPreset(label);
    rememberPreset(label);

    // If this provider already has a saved authentication, make it the
    // primary one (active: true) and deactivate the others.
    const existing = openaiEntries.find((e: any) => e?.id && providerOfEntry(e) === label);
    const existingId = existing?.id;
    if (existingId) {
      setOptimisticActiveProvider(label);
      void (async () => {
        try {
          const res = await switchActiveLLM(existingId);
          if (!res.success) {
            setOptimisticActiveProvider(null);
            if (previousPreset) setSelectedPreset(previousPreset);
            else if (previousActive) setSelectedPreset(previousActive);
            return;
          }
          await refreshAuth();
        } catch (err) {
          console.error('[LocalLLMConfig] Failed to switch active LLM provider:', err);
          setOptimisticActiveProvider(null);
          if (previousPreset) setSelectedPreset(previousPreset);
          else if (previousActive) setSelectedPreset(previousActive);
        }
      })();
    }

    const preset = ENDPOINT_PRESETS.find((p) => p.label === label);
    if (!preset) return;

    // Auto-select the top model for this provider so the user does not have
    // to manually pick one. Custom-typed values are preserved if already set.
    const topModel = PROVIDER_MODELS[label]?.[0] || '';
    const existingModel = (authState.credentials?.model as string) || '';
    const nextModel = topModel || existingModel;
    setCustomMode(false);
    setCustomModel('');
    handleAuthChange(OPENAI_APP_ID, {
      ...authState.credentials,
      url: preset.label === CUSTOM_PRESET ? customUrl : preset.url,
      ...(nextModel ? { model: nextModel } : {}),
    });
  };

  const handleCustomUrlChange = (value: string) => {
    setCustomUrl(value);
    handleAuthChange(OPENAI_APP_ID, { ...authState.credentials, url: value });
  };

  // Model dropdown lives inside the AppAuthCard via extraFieldsSlot so its
  // value is persisted as a credential field on Save.

  // The URL field is hidden in this panel (it comes from the provider preset),
  // but it is still a mandatory credential. Keep it seeded at all times so the
  // form is valid as soon as the API key is typed.
  useEffect(() => {
    const preset = ENDPOINT_PRESETS.find((p) => p.label === effectivePreset);
    const presetUrl = effectivePreset === CUSTOM_PRESET ? customUrl : preset?.url || '';
    if (!presetUrl) return;
    if (((authState.credentials?.url as string) || '').trim()) return;
    handleAuthChange(OPENAI_APP_ID, { ...authState.credentials, url: presetUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePreset, customUrl, authState.credentials?.url]);

  // Always keep a default model selected for the active provider.
  useEffect(() => {
    const models = PROVIDER_MODELS[effectivePreset];
    if (!models?.length) return;
    if ((authState.credentials?.model || '').trim()) return;
    handleAuthChange(OPENAI_APP_ID, { ...authState.credentials, model: models[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePreset, authState.credentials?.model]);


  const isShuffleAI = effectivePreset === SHUFFLE_AI_PRESET;
  /** The URL field is only hidden when the provider is a real hosted endpoint
   *  that we prefill. Self-hosted / localhost / local-IP endpoints (Ollama,
   *  LM Studio, Custom) must remain editable inside the configure form. */
  const urlIsEditable = (() => {
    if (isShuffleAI) return false;
    if (effectivePreset === 'Azure OpenAI' || effectivePreset === 'Amazon Bedrock') return true;
    const preset = ENDPOINT_PRESETS.find((p) => p.label === effectivePreset);
    const presetUrl = (preset?.url || '').trim();
    if (!presetUrl) return true;
    let host = '';
    try {
      host = new URL(presetUrl).hostname.toLowerCase();
    } catch {
      return true;
    }
    const isLocal =
      host === 'localhost' ||
      host === '::1' ||
      host.endsWith('.local') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    return isLocal;
  })();

  const orgId = userdata?.active_org?.id;
  const [orgData, setOrgData] = useState<{
    sync_features?: Record<string, { usage?: number; limit?: number }>;
  } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(getApiUrl(`/api/v1/orgs/${orgId}`), {
          method: 'GET',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setOrgData(data);
      } catch (err) {
        console.error('[LocalLLMConfig] Failed to fetch org info:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // Quotas live under sync_features in the org payload. App runs are at
  // sync_features.app_executions, tokens at sync_features.agent_tokens.
  // The root-level app_execution_* fields are unreliable / empty.
  const sync = orgData?.sync_features ?? (userdata as any)?.sync_features ?? {};
  const appExec = sync.app_executions ?? {};
  const appRunLimit = Number(appExec.limit) || 0;
  const appRunUsage = Number(appExec.usage) || 0;
  const agentTokens = sync.agent_tokens ?? {};
  const agentTokenLimit = Number(agentTokens.limit) || 0;
  const agentTokenUsage = Number(agentTokens.usage) || 0;


  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {!isLoggedIn && (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1.5,
            border: '1px solid hsl(var(--border))',
            bgcolor: 'hsl(var(--muted) / 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
            Log in to configure AI providers and run AI agents.
          </Typography>
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              if (typeof window !== 'undefined') {
                const returnUrl = window.location.pathname + window.location.search;
                window.location.href = `/login?view=${encodeURIComponent(returnUrl)}`;
              }
            }}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              py: 0.3,
              px: 1,
              minHeight: 0,
              borderRadius: 1,
              flexShrink: 0,
            }}
          >
            Log In
          </Button>
        </Box>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          AI Provider
        </Typography>
        <Autocomplete
          size="small"
          fullWidth
          disableClearable
          options={ENDPOINT_PRESETS.map((p) => p.label)}
          value={effectivePreset || undefined}
          onChange={(_e, val) => val && handlePresetChange(val)}
          isOptionEqualToValue={(opt, val) => opt === val}
          renderOption={(props, option) => {
            const preset = ENDPOINT_PRESETS.find((p) => p.label === option);
            const activeProvider = optimisticActiveProvider ?? (activeEntryRaw ? providerOfEntry(activeEntryRaw) : SHUFFLE_AI_PRESET);
            const isSelected = option === activeProvider;
            const isValidated = option !== SHUFFLE_AI_PRESET && validatedProviderLabels.has(option);
            return (
              <li {...props} key={option}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', minWidth: 0 }}>
                  <ProviderLogo label={option} url={preset?.url} />
                  <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--popover-foreground))', flexShrink: 0 }}>{option}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }} />
                  {preset?.url && (
                    <Typography component="span" sx={{ minWidth: 0, flex: '0 1 auto', color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {preset.url}
                    </Typography>
                  )}
                  {isValidated && (
                    <Box sx={{ display: 'inline-flex', flexShrink: 0 }}>
                      <AuthStatusChip dense status="validated" />
                    </Box>
                  )}

                  {isSelected && (
                    <Tooltip
                      title="Selected provider"
                      placement="right"
                      arrow
                    >
                      <Box component="span" sx={{ display: 'inline-flex', flexShrink: 0 }}>
                        <Check
                          size={14}
                          strokeWidth={3}
                          style={{ flexShrink: 0, color: 'hsl(var(--severity-low))' }}
                          aria-label="Selected provider"
                        />
                      </Box>
                    </Tooltip>
                  )}
                </Box>
              </li>
            );
          }}
          renderInput={(params) => {
            const preset = ENDPOINT_PRESETS.find((p) => p.label === effectivePreset);
            return (
              <TextField
                {...params}
                placeholder="Search a provider…"
                slotProps={{
                  input: {
                    ...(params as any).InputProps,
                    startAdornment: effectivePreset ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', pl: 0.5, mr: 0.5 }}>
                        <ProviderLogo label={effectivePreset} url={preset?.url} />
                      </Box>
                    ) : undefined,
                  },
                }}
              />
            );
          }}
          slotProps={{
            paper: { sx: { bgcolor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))', border: '1px solid hsl(var(--border))', maxWidth: '100vw', overflow: 'hidden' } },
            listbox: { sx: { maxWidth: '100%', '& li': { minWidth: 0 } } },
            popper: { sx: { zIndex: 9999, maxWidth: '100vw' } },
          }}
        />
      </Box>

      {!compact && (() => {
        const preset = ENDPOINT_PRESETS.find((p) => p.label === effectivePreset);
        const hasProviderDocs = !!preset && (!!preset.apiKeyUrl || !!preset.apiKeyHint);
        return (
          <Box sx={{ px: 2.5, py: 2, borderRadius: 2, border: '1px solid hsl(var(--border))', bgcolor: 'transparent' }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.5 }}>
              {isShuffleAI ? (
                <>
                  Using Shuffle AI. No configuration is required. Pick another provider above to use your own endpoint. Our models are hosted on GCP, and your data stays within your tenant's region.{' '}
                  <Box component="a" href="https://shuffler.io/docs/AI#using-self-hosted-ai-models" target="_blank" rel="noopener noreferrer" sx={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
                    Read the docs
                  </Box>
                  .
                </>
              ) : hasProviderDocs ? (
                <>
                  {preset!.apiKeyHint}{' '}
                  {preset!.apiKeyUrl && (
                    <Box component="a" href={preset!.apiKeyUrl} target="_blank" rel="noopener noreferrer" sx={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
                      Get your {preset!.label} API key →
                    </Box>
                  )}
                </>
              ) : (
                <>
                  Configure an OpenAI-compatible endpoint for agent operations. Credentials are saved through the app authentication system.{' '}
                  <Box component="a" href="https://shuffler.io/docs/AI#using-self-hosted-ai-models" target="_blank" rel="noopener noreferrer" sx={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
                    Read the docs
                  </Box>
                  .
                </>
              )}
            </Typography>
          </Box>
        );
      })()}

      {isShuffleAI && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5, width: '100%' }}>
          <UsageBar label="App runs" usage={appRunUsage} limit={appRunLimit} unit="runs" actionLabel="Upgrade" actionHref="https://shuffler.io/pricing" />
          <UsageBar label="Agent tokens" usage={agentTokenUsage} limit={agentTokenLimit} unit="tokens" actionLabel="Upgrade" actionHref="https://shuffler.io/pricing" />
        </Box>
      )}

      {!isShuffleAI && (
        <AppAuthCard
          app={OPENAI_ALGOLIA_APP}
          authState={authState}
          isExpanded={expanded}
          onToggle={() => setExpanded((prev) => !prev)}
          onAuthChange={handleAuthChange}
          onTestConnection={(appId, authId) => handleTestLLMConnection(appId, authId)}
          onSaveAuth={(appId, creds) => handleSaveProviderAuth(appId, creds)}
          apiAuthEntries={providerEntries}
          onRefreshAuth={refreshAuth}
          disableUrlPrefill
          hideHeader
          hideStatusChips
          hideDocsLink
          hideUrlFields={!urlIsEditable}

          initialAuthConfig={OPENAI_AUTH_SCHEMA}
          borderless
          compactAuthForm={false}
          alwaysShowAuthSelector

          suppressSaveToast

          extraFieldsSlot={
            (PROVIDER_MODELS[effectivePreset]?.length ?? 0) > 0
              ? ({ credentials, setField }) => {
                  const liveModel = credentials.model || '';
                  const presetModels = PROVIDER_MODELS[effectivePreset] || [];
                  const liveIsCustom = liveModel !== '' && !presetModels.includes(liveModel);
                  const showCustom = customMode || liveIsCustom;
                  const liveSelectValue = showCustom ? CUSTOM_MODEL : (liveModel || null);
                  return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                        Model
                      </Typography>
                      <Autocomplete
                        size="small"
                        fullWidth
                        disableClearable
                        options={[...presetModels, CUSTOM_MODEL]}
                        value={liveSelectValue ?? undefined}
                        onChange={(_e, val) => {
                          if (!val) return;
                          if (val === CUSTOM_MODEL) {
                            setCustomMode(true);
                            // Seed credential with whatever the user already
                            // typed (may be empty). The visible TextField will
                            // let them edit it from here.
                            setField('model', customModel);
                          } else {
                            setCustomMode(false);
                            setCustomModel('');
                            setField('model', val);
                          }
                        }}
                        isOptionEqualToValue={(opt, val) => opt === val}
                        slotProps={{
                          paper: { sx: { bgcolor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))', border: '1px solid hsl(var(--border))' } },
                          popper: { sx: { zIndex: 9999 } },
                        }}
                        renderInput={(params) => (
                          <TextField {...params} placeholder="Select a model…" />
                        )}
                      />
                      {showCustom && (
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Enter a custom model identifier"
                          value={customModel || (liveIsCustom ? liveModel : '')}
                          onChange={(e) => {
                            setCustomModel(e.target.value);
                            setField('model', e.target.value);
                          }}
                          helperText="Exact model name as expected by the provider's API"
                          sx={{ '& .MuiFormHelperText-root': { color: 'hsl(var(--muted-foreground))' } }}
                        />
                      )}
                    </Box>
                  );

                }
              : undefined
          }
          globalUrl={globalUrl}
          userdata={userdata}
          isLoaded={isLoaded}
          isLoggedIn={isLoggedIn}
          serverside={serverside}
          theme={theme}
          colorMode={colorMode}
        />
      )}
    </Box>

  );
};

export default LocalLLMConfig;