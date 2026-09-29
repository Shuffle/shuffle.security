/**
 * Shared LLM-provider detection. Given a base URL (typically the `url`
 * credential on a saved OpenAI-compatible authentication), figure out which
 * provider preset it belongs to so the UI can show the right logo and
 * auto-select the right entry in selectors.
 *
 * Used by:
 *  - `LocalLLMConfig` sidebar (auto-select the provider matching the saved
 *    OpenAI auth URL)
 *  - `AgentUI` "Choose LLM" chip (show provider logo next to the label)
 */

export interface LLMProviderPreset {
  label: string;
  url: string;
  apiKeyUrl?: string;
  apiKeyHint?: string;
}

export const SHUFFLE_AI_PRESET = 'Shuffle AI';
export const CUSTOM_PRESET = 'Custom / self-hosted';

export const ENDPOINT_PRESETS: LLMProviderPreset[] = [
  { label: SHUFFLE_AI_PRESET, url: '' },
  { label: 'OpenAI', url: 'https://api.openai.com/v1', apiKeyUrl: 'https://platform.openai.com/api-keys', apiKeyHint: 'Create a key under API keys in the OpenAI platform dashboard.' },
  { label: 'Azure OpenAI', url: 'https://<your-resource>.openai.azure.com/openai/v1', apiKeyUrl: 'https://portal.azure.com', apiKeyHint: 'Enter your Azure OpenAI resource URL (e.g. https://my-resource.openai.azure.com/openai/v1) and Azure API key. Under Model, select or type your deployment name.' },
  { label: 'Anthropic', url: 'https://api.anthropic.com/v1/', apiKeyUrl: 'https://console.anthropic.com/settings/keys', apiKeyHint: 'Generate a key under Settings → API Keys in the Anthropic Console.' },
  { label: 'Amazon Bedrock', url: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1', apiKeyUrl: 'https://console.aws.amazon.com/bedrock', apiKeyHint: 'Enter your regional Bedrock runtime URL and an Amazon Bedrock API key. Under Model, select or type the model ID or ARN.' },
  { label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKeyUrl: 'https://aistudio.google.com/app/apikey', apiKeyHint: 'Create a key in Google AI Studio under Get API key.' },
  { label: 'xAI', url: 'https://api.x.ai/v1', apiKeyUrl: 'https://console.x.ai', apiKeyHint: 'Create an API key in the xAI Console.' },
  { label: 'Mistral', url: 'https://api.mistral.ai/v1', apiKeyUrl: 'https://console.mistral.ai/api-keys/', apiKeyHint: 'Create a key under API Keys in the Mistral Console.' },
  { label: 'Groq', url: 'https://api.groq.com/openai/v1', apiKeyUrl: 'https://console.groq.com/keys', apiKeyHint: 'Create a key under API Keys in the Groq Console.' },
  { label: 'DeepSeek', url: 'https://api.deepseek.com/v1', apiKeyUrl: 'https://platform.deepseek.com/api_keys', apiKeyHint: 'Create a key under API Keys in the DeepSeek platform.' },
  { label: 'Moonshot AI (Kimi)', url: 'https://api.moonshot.ai/v1', apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys', apiKeyHint: 'Generate an API key in the Moonshot AI platform dashboard.' },
  { label: 'Together AI', url: 'https://api.together.xyz/v1', apiKeyUrl: 'https://api.together.ai/settings/api-keys', apiKeyHint: 'Create a key under Settings → API Keys in Together AI.' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', apiKeyUrl: 'https://openrouter.ai/keys', apiKeyHint: 'Create a key under Keys in your OpenRouter dashboard.' },
  { label: 'Ollama (localhost)', url: 'http://localhost:11434/v1', apiKeyHint: 'Local Ollama does not require an API key — any non-empty value works.' },
  { label: 'LM Studio (localhost)', url: 'http://localhost:1234/v1', apiKeyHint: 'Local LM Studio does not require an API key — any non-empty value works.' },
  { label: CUSTOM_PRESET, url: '' },
];

export const PROVIDER_DOMAINS: Record<string, string> = {
  'Shuffle AI': 'shuffler.io',
  OpenAI: 'openai.com',
  'Azure OpenAI': 'azure.microsoft.com',
  Anthropic: 'anthropic.com',
  'Amazon Bedrock': 'aws.amazon.com',
  'Google Gemini': 'gemini.google.com',
  xAI: 'x.ai',
  Mistral: 'mistral.ai',
  Groq: 'groq.com',
  DeepSeek: 'deepseek.com',
  'Moonshot AI (Kimi)': 'moonshot.ai',
  'Together AI': 'together.ai',
  OpenRouter: 'openrouter.ai',
  'Ollama (localhost)': 'ollama.com',
  'LM Studio (localhost)': 'lmstudio.ai',
};

const hostnameOf = (url: string): string | null => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
};

/**
 * Detect which preset a saved endpoint URL belongs to. Returns the matched
 * preset, or null when the URL is empty / unrecognisable. Falls back to
 * `Custom / self-hosted` for non-empty URLs that don't match any known
 * provider so callers can render a sensible label.
 */
export const detectLLMProvider = (url: string | undefined | null): LLMProviderPreset | null => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // 1) Exact match (cheap, handles canonical presets).
  const exact = ENDPOINT_PRESETS.find((p) => p.url && p.url === trimmed);
  if (exact) return exact;

  // 2) Hostname match — tolerates trailing slashes, path differences,
  //    `/v1` vs `/openai/v1`, custom ports on localhost, etc.
  const host = hostnameOf(trimmed);
  if (host) {
    if (host.includes('.openai.azure.com') || host.includes('.services.ai.azure.com') || host.endsWith('azure.com')) {
      const azurePreset = ENDPOINT_PRESETS.find((p) => p.label === 'Azure OpenAI');
      if (azurePreset) return azurePreset;
    }
    if (host.includes('bedrock-runtime') || (host.includes('bedrock') && host.endsWith('amazonaws.com'))) {
      const bedrockPreset = ENDPOINT_PRESETS.find((p) => p.label === 'Amazon Bedrock');
      if (bedrockPreset) return bedrockPreset;
    }
    if (host === 'api.moonshot.cn' || host.includes('moonshot.cn') || host.includes('moonshot.ai')) {
      const moonshotPreset = ENDPOINT_PRESETS.find((p) => p.label === 'Moonshot AI (Kimi)');
      if (moonshotPreset) return moonshotPreset;
    }
    if (host.includes('x.ai')) {
      const xaiPreset = ENDPOINT_PRESETS.find((p) => p.label === 'xAI');
      if (xaiPreset) return xaiPreset;
    }

    const byHost = ENDPOINT_PRESETS.find((p) => {
      const presetHost = hostnameOf(p.url);
      return presetHost && presetHost === host;
    });
    if (byHost) return byHost;

    // localhost ports we recognise.
    if (host === 'localhost' || host === '127.0.0.1') {
      if (trimmed.includes(':11434')) return ENDPOINT_PRESETS.find((p) => p.label === 'Ollama (localhost)') || null;
      if (trimmed.includes(':1234')) return ENDPOINT_PRESETS.find((p) => p.label === 'LM Studio (localhost)') || null;
    }
  }

  return ENDPOINT_PRESETS.find((p) => p.label === CUSTOM_PRESET) || null;
};

/**
 * Resolve a logo URL for a provider preset. Uses Google's favicon service
 * against the known domain (or the URL hostname) so we don't have to bundle
 * brand assets.
 */
export const getProviderLogoUrl = (label: string | undefined, url?: string): string => {
  if (!label && !url) return '';
  let domain = label ? PROVIDER_DOMAINS[label] : undefined;
  if (!domain && url) {
    const host = hostnameOf(url);
    if (host) domain = host;
  }
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';
};

/**
 * Single source of truth for "which LLM provider is currently active".
 *
 * Both the AgentUI "Choose LLM" chip and the LocalLLMConfig sidebar must
 * agree, so they both call this with the raw `/api/v1/apps/authentication`
 * entries. Rules:
 *  - only the entry flagged `active: true` counts (validation state is
 *    irrelevant — an active-but-failing provider is still the active one)
 *  - the `url` field wins, then the entry label (legacy labels look like
 *    "OpenAI - Anthropic", so the app-name prefix is stripped)
 *  - no active OpenAI-compatible entry => Shuffle AI
 */
const OPENAI_AUTH_APP_ID = '5d19dd82517870c68d40cacad9b5ca91';

export const isOpenAICompatibleAuthEntry = (entry: any): boolean => {
  const app = entry?.app || entry;
  const name = String(app?.name || '').toLowerCase();
  return name === 'openai' || app?.id === OPENAI_AUTH_APP_ID;
};

export const providerLabelOfAuthEntry = (entry: any): string => {
  const url = ((entry?.fields as Array<{ key?: string; value?: string }> | undefined) || [])
    .find((f) => (f?.key || '').toLowerCase() === 'url')?.value || '';
  if (url.trim()) return detectLLMProvider(url)?.label || CUSTOM_PRESET;

  const label = String(entry?.label || '')
    .replace(/^\s*openai\s*-\s*/i, '')
    .trim();
  if (label) {
    const match = ENDPOINT_PRESETS.find(
      (p) => p.label !== SHUFFLE_AI_PRESET && label.toLowerCase() === p.label.toLowerCase(),
    ) || ENDPOINT_PRESETS.find(
      (p) => p.label !== SHUFFLE_AI_PRESET && label.toLowerCase().includes(p.label.toLowerCase()),
    );
    if (match) return match.label;
  }
  return CUSTOM_PRESET;
};

export const findActiveLLMAuthEntry = (entries: any[] | undefined | null): any | null =>
  (entries || []).find((e) => isOpenAICompatibleAuthEntry(e) && e?.active === true) || null;

export const resolveActiveLLMProvider = (
  entries: any[] | undefined | null,
): { label: string; url: string; logo: string } => {
  const active = findActiveLLMAuthEntry(entries);
  if (!active) {
    return { label: SHUFFLE_AI_PRESET, url: '', logo: getProviderLogoUrl(SHUFFLE_AI_PRESET) };
  }
  const url = (((active?.fields as Array<{ key?: string; value?: string }> | undefined) || [])
    .find((f) => (f?.key || '').toLowerCase() === 'url')?.value || '').trim();
  const label = providerLabelOfAuthEntry(active);
  return { label, url, logo: getProviderLogoUrl(label, url) };
};
