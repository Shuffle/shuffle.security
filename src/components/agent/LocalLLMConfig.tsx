import ModernLocalLLMConfig from '@/Shuffle-MCPs/components/LocalLLMConfig';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import { AppAuthCard } from '@/Shuffle-MCPs/components/AppAuthConfig';
import type { AlgoliaSearchApp } from '@/Shuffle-MCPs';
import { useAppAuth } from '@/Shuffle-MCPs/useAppAuth';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { refreshAllIntegrationStatus } from '@/Shuffle-MCPs/components/IntegrationStatus';
import { UsageBar } from '@/Shuffle-MCPs/components/UsageBar';
import { useSyncHostBaseUrl } from '@/Shuffle-MCPs/useSyncHostBaseUrl';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import { useAuth } from '@/context/AuthContext';
import singulAgentIcon from '@/assets/singul-agent-icon.png';

const OPENAI_APP_NAME = 'OpenAI';
const OPENAI_APP_ID = '5d19dd82517870c68d40cacad9b5ca91';

// Construct a minimal AlgoliaSearchApp for OpenAI
const OPENAI_ALGOLIA_APP: AlgoliaSearchApp = {
  name: OPENAI_APP_NAME,
  description: 'OpenAI-compatible LLM endpoint for agent operations',
  objectID: OPENAI_APP_ID,
  creator: '',
  app_version: '1.0.0',
  image_url: singulAgentIcon,
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

/** Common OpenAI-compatible LLM endpoints. First entry uses Shuffle's hosted
 *  AI (no user auth). Last entry is custom/self-hosted. */
const SHUFFLE_AI_PRESET = 'Shuffle AI';
const ENDPOINT_PRESETS: Array<{ label: string; url: string; apiKeyUrl?: string; apiKeyHint?: string; logoUrl?: string }> = [
  { label: SHUFFLE_AI_PRESET, url: '', logoUrl: singulAgentIcon },
  { label: 'OpenAI', url: 'https://api.openai.com/v1', apiKeyUrl: 'https://platform.openai.com/api-keys', apiKeyHint: 'Create a key under API keys in the OpenAI platform dashboard.', logoUrl: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64' },
  { label: 'Azure OpenAI', url: 'https://<your-resource>.openai.azure.com/openai/v1', apiKeyUrl: 'https://portal.azure.com', apiKeyHint: 'Enter your Azure OpenAI resource URL (e.g. https://my-resource.openai.azure.com/openai/v1) and Azure API key. Under Model, select or type your deployment name.', logoUrl: 'https://www.google.com/s2/favicons?domain=azure.microsoft.com&sz=64' },
  { label: 'Anthropic', url: 'https://api.anthropic.com/v1/', apiKeyUrl: 'https://console.anthropic.com/settings/keys', apiKeyHint: 'Generate a key under Settings → API Keys in the Anthropic Console.', logoUrl: 'https://www.google.com/s2/favicons?domain=anthropic.com&sz=64' },
  { label: 'Amazon Bedrock', url: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1', apiKeyUrl: 'https://console.aws.amazon.com/bedrock', apiKeyHint: 'Enter your regional Bedrock runtime URL and an Amazon Bedrock API key. Under Model, select or type the model ID or ARN.', logoUrl: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=64' },
  { label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKeyUrl: 'https://aistudio.google.com/app/apikey', apiKeyHint: 'Create a key in Google AI Studio under Get API key.', logoUrl: 'https://cdn.simpleicons.org/googlegemini' },
  { label: 'xAI', url: 'https://api.x.ai/v1', apiKeyUrl: 'https://console.x.ai', apiKeyHint: 'Create an API key in the xAI Console.', logoUrl: 'https://www.google.com/s2/favicons?domain=x.ai&sz=64' },
  { label: 'Mistral', url: 'https://api.mistral.ai/v1', apiKeyUrl: 'https://console.mistral.ai/api-keys/', apiKeyHint: 'Create a key under API Keys in the Mistral Console.', logoUrl: 'https://cdn.simpleicons.org/mistralai' },
  { label: 'Groq', url: 'https://api.groq.com/openai/v1', apiKeyUrl: 'https://console.groq.com/keys', apiKeyHint: 'Create a key under API Keys in the Groq Console.', logoUrl: 'https://www.google.com/s2/favicons?domain=groq.com&sz=64' },
  { label: 'DeepSeek', url: 'https://api.deepseek.com/v1', apiKeyUrl: 'https://platform.deepseek.com/api_keys', apiKeyHint: 'Create a key under API Keys in the DeepSeek platform.', logoUrl: 'https://cdn.simpleicons.org/deepseek' },
  { label: 'Moonshot AI (Kimi)', url: 'https://api.moonshot.ai/v1', apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys', apiKeyHint: 'Generate an API key in the Moonshot AI platform dashboard.', logoUrl: 'https://www.google.com/s2/favicons?domain=moonshot.ai&sz=64' },
  { label: 'Together AI', url: 'https://api.together.xyz/v1', apiKeyUrl: 'https://api.together.ai/settings/api-keys', apiKeyHint: 'Create a key under Settings → API Keys in Together AI.', logoUrl: 'https://www.google.com/s2/favicons?domain=together.ai&sz=64' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', apiKeyUrl: 'https://openrouter.ai/keys', apiKeyHint: 'Create a key under Keys in your OpenRouter dashboard.', logoUrl: 'https://www.google.com/s2/favicons?domain=openrouter.ai&sz=64' },
  { label: 'Ollama', url: '', apiKeyUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md', apiKeyHint: 'Point to your Ollama server (e.g. http://your-host:11434/v1). Any non-empty API key works.', logoUrl: 'https://www.google.com/s2/favicons?domain=ollama.com&sz=64' },
  { label: 'LM Studio', url: '', apiKeyUrl: 'https://lmstudio.ai/docs/local-server', apiKeyHint: 'Point to your LM Studio server (e.g. http://your-host:1234/v1). Any non-empty API key works.', logoUrl: 'https://lmstudio.ai/favicon.ico' },
  { label: 'Custom / self-hosted', url: '' },
];

const CUSTOM_PRESET = 'Custom / self-hosted';

/** Legacy exports kept for backward compatibility */
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

/** @deprecated Use app auth system instead */
export const getLocalModel = (): AgentLocalModel => ({ url: '', apikey: '', model: '' });

/** @deprecated Use app auth system instead */
export const saveLocalModelConfig = (_model: AgentLocalModel) => {};

/** @deprecated Use app auth system via AppAuthCard instead */
export const testLocalLLM = async (_config: AgentLocalModel): Promise<LocalLLMTestResult> => ({
  success: false,
  message: 'Use the app auth system test instead',
});

interface LocalLLMConfigProps extends ShuffleHostProps {
  compact?: boolean;
  hasOpenAIAuth?: boolean;
  onSave?: (model: AgentLocalModel) => void;
  onTestResult?: (result: LocalLLMTestResult) => void;
}

const LocalLLMConfig = (props: LocalLLMConfigProps) => {
  return <ModernLocalLLMConfig {...(props as any)} />;
};

const _LegacyLocalLLMConfig = ({ compact, hasOpenAIAuth, globalUrl }: LocalLLMConfigProps) => {
  useSyncHostBaseUrl(globalUrl);
  const {
    authStates,
    authenticatedApps,
    handleAuthChange,
    handleTestConnection,
    handleSaveAuth,
    refreshAuth,
  } = useAppAuth();

  const [expanded, setExpanded] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customUrl, setCustomUrl] = useState<string>('');

  // Find matching auth entries for OpenAI
  const openaiEntries = authenticatedApps.filter(
    (a) => a.app?.name?.toLowerCase() === 'openai' || a.app?.id === OPENAI_APP_ID
  );

  const authState = authStates[OPENAI_APP_ID] || {
    systemId: OPENAI_APP_ID,
    status: 'pending' as const,
    credentials: {},
  };

  const currentUrl = (authState.credentials?.url as string) || '';

  // Auto-delete OpenAI auth entries whose connection test failed and was
  // never fixed. validation.valid === false means a test was actually run
  // and rejected — undefined means "never tested", so we leave those alone.
  // Track which IDs we already attempted to delete to avoid retrying every render.
  const attemptedDeletionRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Don't auto-delete while a test is mid-flight.
    if (authState.status === 'testing') return;

    const failedEntries = openaiEntries.filter(
      (e) => e.validation && e.validation.valid === false && e.id,
    );
    if (failedEntries.length === 0) return;

    let cancelled = false;
    (async () => {
      let deletedAny = false;
      for (const entry of failedEntries) {
        const id = entry.id as string;
        if (attemptedDeletionRef.current.has(id)) continue;
        attemptedDeletionRef.current.add(id);
        try {
          const resp = await fetch(getApiUrl(`/api/v1/apps/authentication/${id}`), {
            method: 'DELETE',
            credentials: 'include',
            headers: { ...getAuthHeader() },
          });
          if (resp.ok) deletedAny = true;
        } catch (err) {
          console.error('[LocalLLMConfig] Failed to auto-delete failed OpenAI auth:', err);
        }
      }
      if (!cancelled && deletedAny) {
        await refreshAuth();
        refreshAllIntegrationStatus();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openaiEntries, authState.status, refreshAuth]);

  // Detect which preset matches the currently entered URL (so the dropdown
  // reflects an existing saved value). Defaults to "Shuffle AI" when no
  // user-configured auth or URL is present.
  const hasOpenAIEntries = openaiEntries.length > 0;
  const effectivePreset = useMemo(() => {
    if (selectedPreset) return selectedPreset;
    if (!currentUrl && !hasOpenAIEntries) return SHUFFLE_AI_PRESET;
    if (!currentUrl) return '';
    const match = ENDPOINT_PRESETS.find((p) => p.url && p.url === currentUrl);
    return match ? match.label : CUSTOM_PRESET;
  }, [selectedPreset, currentUrl, hasOpenAIEntries]);

  const [confirmShuffleAIOpen, setConfirmShuffleAIOpen] = useState(false);

  const applyShuffleAI = async () => {
    // Remove every OpenAI auth entry so Shuffle's hosted AI takes over.
    let deletedAny = false;
    for (const entry of openaiEntries) {
      if (!entry.id) continue;
      try {
        const resp = await fetch(getApiUrl(`/api/v1/apps/authentication/${entry.id}`), {
          method: 'DELETE',
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        if (resp.ok) deletedAny = true;
      } catch (err) {
        console.error('[LocalLLMConfig] Failed to delete OpenAI auth when switching to Shuffle AI:', err);
      }
    }
    handleAuthChange(OPENAI_APP_ID, {});
    setSelectedPreset(SHUFFLE_AI_PRESET);
    setCustomUrl('');
    if (deletedAny) {
      await refreshAuth();
      refreshAllIntegrationStatus();
    }
  };

  const handlePresetChange = (label: string) => {
    if (label === SHUFFLE_AI_PRESET) {
      if (hasOpenAIEntries) {
        setConfirmShuffleAIOpen(true);
        return;
      }
      void applyShuffleAI();
      return;
    }
    setSelectedPreset(label);
    const preset = ENDPOINT_PRESETS.find((p) => p.label === label);
    if (!preset) return;
    if (preset.label === CUSTOM_PRESET) {
      // Clear URL so user can type their own
      handleAuthChange(OPENAI_APP_ID, { ...authState.credentials, url: customUrl });
    } else {
      handleAuthChange(OPENAI_APP_ID, { ...authState.credentials, url: preset.url });
    }
  };

  const handleCustomUrlChange = (value: string) => {
    setCustomUrl(value);
    handleAuthChange(OPENAI_APP_ID, { ...authState.credentials, url: value });
  };

  const isShuffleAI = effectivePreset === SHUFFLE_AI_PRESET;
  const selectedProviderDocs = ENDPOINT_PRESETS.find((p) => p.label === effectivePreset);
  const hasProviderDocs = !!selectedProviderDocs?.apiKeyHint || !!selectedProviderDocs?.apiKeyUrl;
  const { userInfo } = useAuth();
  const orgId = userInfo?.active_org?.id;

  // Fetch fresh org data when the Local LLM panel mounts so usage bars
  // reflect the latest sync_features for the active org.
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

  // The org payload exposes quota counters under sync_features. App runs live
  // in sync_features.app_executions (NOT on the org root — those root-level
  // fields are empty), and tokens under sync_features.agent_tokens.
  const sync = orgData?.sync_features ?? (userInfo as any)?.sync_features ?? {};
  const appExec = sync.app_executions ?? {};
  const appRunLimit = Number(appExec.limit) || 0;
  const appRunUsage = Number(appExec.usage) || 0;
  const agentTokens = sync.agent_tokens ?? {};
  const agentTokenLimit = Number(agentTokens.limit) || 0;
  const agentTokenUsage = Number(agentTokens.usage) || 0;


  const usageBars = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <UsageBar
        label="App runs"
        usage={appRunUsage}
        limit={appRunLimit}
        unit="runs"
        actionLabel="Upgrade"
        actionHref="https://shuffler.io/pricing"
      />
      <UsageBar
        label="Agent tokens"
        usage={agentTokenUsage}
        limit={agentTokenLimit}
        unit="tokens"
        actionLabel="Upgrade"
        actionHref="https://shuffler.io/pricing"
      />
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* Vendor selector — primary control, at the top */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography
          sx={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'hsl(var(--foreground))',
          }}
        >
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
            return (
              <li {...props} key={option}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                  <Box
                    sx={{
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {preset?.logoUrl && (
                      <Box
                        component="img"
                        src={preset.logoUrl}
                        alt=""
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        sx={{ width: 18, height: 18, objectFit: 'contain' }}
                      />
                    )}
                  </Box>
                  <Typography sx={{ fontSize: '0.85rem' }}>{option}</Typography>
                  {preset?.url && (
                    <Typography
                      component="span"
                      sx={{ ml: 'auto', color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}
                    >
                      {preset.url}
                    </Typography>
                  )}
                </Box>
              </li>
            );
          }}
          renderInput={(params) => {
            const selectedLogo = ENDPOINT_PRESETS.find((p) => p.label === effectivePreset)?.logoUrl;
            return (
              <TextField
                {...params}
                placeholder="Search a provider…"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: selectedLogo ? (
                    <Box
                      component="img"
                      src={selectedLogo}
                      alt=""
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      sx={{ width: 18, height: 18, objectFit: 'contain', ml: 0.5, mr: 0.5, flexShrink: 0 }}
                    />
                  ) : params.InputProps.startAdornment,
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'hsl(var(--card))',
                    color: 'hsl(var(--foreground))',
                    '& fieldset': { borderColor: 'hsl(var(--border))' },
                    '&:hover fieldset': { borderColor: 'hsl(var(--muted-foreground) / 0.4)' },
                    '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                  },
                  '& .MuiSvgIcon-root': { color: 'hsl(var(--muted-foreground))' },
                }}
              />
            );
          }}
          ListboxProps={{ sx: { maxHeight: 420 } }}
          componentsProps={{
            paper: {
              sx: {
                bgcolor: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
                border: '1px solid hsl(var(--border))',
              },
            },
          }}
        />
      </Box>

      {/* Provider-specific docs */}
      {!compact && (
        <Box sx={{
          px: 2.5,
          py: 2,
          borderRadius: 2,
          border: '1px solid hsl(var(--border))',
          bgcolor: 'transparent',
        }}>
          <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.5 }}>
            {isShuffleAI ? (
              <>
                Using Shuffle AI. No configuration is required. Pick another provider above to use your own endpoint.{' '}
                <Box component="a" href="https://shuffler.io/docs/AI#using-self-hosted-ai-models" target="_blank" rel="noopener noreferrer" sx={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
                  Read the docs
                </Box>
                .
              </>
            ) : hasProviderDocs ? (
              <>
                {selectedProviderDocs?.apiKeyHint}{' '}
                {selectedProviderDocs?.apiKeyUrl && (
                  <Box component="a" href={selectedProviderDocs.apiKeyUrl} target="_blank" rel="noopener noreferrer" sx={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
                    Get your {selectedProviderDocs.label} API key →
                  </Box>
                )}
              </>
            ) : (
              <>
                Configure a custom OpenAI-compatible endpoint for agent operations.{' '}
                <Box component="a" href="https://shuffler.io/docs/AI#using-self-hosted-ai-models" target="_blank" rel="noopener noreferrer" sx={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
                  Read the docs
                </Box>
                .
              </>
            )}
          </Typography>
        </Box>
      )}

      {isShuffleAI && (
        <Box sx={{ mt: 0.5, width: '100%' }}>{usageBars}</Box>
      )}

      {!isShuffleAI && selectedProviderDocs && !selectedProviderDocs.url && (
        <TextField
          size="small"
          fullWidth
          placeholder={
            effectivePreset === 'Ollama'
              ? 'http://your-ollama-host:11434/v1'
              : effectivePreset === 'LM Studio'
                ? 'http://your-lmstudio-host:1234/v1'
                : 'https://your-self-hosted-endpoint.example.com'
          }
          value={customUrl || currentUrl}
          onChange={(e) => handleCustomUrlChange(e.target.value)}
          helperText="Enter the base URL of your OpenAI-compatible endpoint"
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              '& fieldset': { borderColor: 'hsl(var(--border))' },
              '&:hover fieldset': { borderColor: 'hsl(var(--muted-foreground) / 0.4)' },
              '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
            },
            '& .MuiFormHelperText-root': { color: 'hsl(var(--muted-foreground))' },
          }}
        />
      )}

      {/* Reuse the standard AppAuthCard — URL prefill disabled so OpenAI's
          default URL doesn't get auto-filled when nothing is configured.
          Hidden entirely when Shuffle AI is the active provider. */}
      {!isShuffleAI && (
        <AppAuthCard
          app={OPENAI_ALGOLIA_APP}
          authState={authState}
          isExpanded={expanded}
          onToggle={() => setExpanded((prev) => !prev)}
          onAuthChange={handleAuthChange}
          onTestConnection={(appId, authId) => handleTestConnection(appId, authId)}
          onSaveAuth={(appId, creds) => handleSaveAuth(appId, creds, OPENAI_APP_NAME)}
          apiAuthEntries={openaiEntries}
          onRefreshAuth={refreshAuth}
          disableUrlPrefill
          hideHeader
          hideStatusChips
          hideDocsLink
          hideUrlFields
          borderless
          compactAuthForm

        />
      )}

      <Dialog
        open={confirmShuffleAIOpen}
        onClose={() => setConfirmShuffleAIOpen(false)}
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--popover))',
            color: 'hsl(var(--popover-foreground))',
            border: '1px solid hsl(var(--border))',
          },
        }}
      >
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>
          Switch to Shuffle AI?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>
            Switching to Shuffle AI will remove your existing OpenAI app authentication.
            Any other workflow or app using this OpenAI auth will lose access.
            Do you want to continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmShuffleAIOpen(false)}
            sx={{ color: 'hsl(var(--muted-foreground))', textTransform: 'none', height: 36 }}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setConfirmShuffleAIOpen(false);
              await applyShuffleAI();
            }}
            sx={{
              bgcolor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              textTransform: 'none',
              height: 36,
              '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
            }}
          >
            Remove and use Shuffle AI
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LocalLLMConfig;
