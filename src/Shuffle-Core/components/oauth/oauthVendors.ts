export type OAuthVerificationStatus = 'verified' | 'loopback' | 'mismatch' | 'unverified';

export interface OAuthRawSource {
  client_id?: string;
  raw_client_name?: string;
  raw_redirect_uri?: string;
  raw_redirect_uris?: string[];
  raw_client_uri?: string;
  raw_logo_uri?: string;
  software_id?: string;
  software_version?: string;
  user_agent?: string;
  token_user_agent?: string;
  origin?: string;
  remote_addr?: string;
  token_remote_addr?: string;
  mcp_client_name?: string;
  mcp_client_version?: string;
  mcp_user_agent?: string;
  is_dynamic?: boolean;
  auth_method?: string;
}

export interface OAuthVendorSpec {
  id: string;
  name: string;
  vendorName: string;
  imageId: string;
  logoUrl: string;
  iconBg: string;
  iconColor: string;
  description: string;
  officialDomains: string[];
  officialSchemes: string[];
  claimKeywords: string[];
  cloudOnly: boolean;
}

export interface OAuthVendorEvaluation {
  name: string;
  vendor: string;
  vendorId: string;
  imageId: string;
  logoUrl: string;
  iconBg: string;
  iconColor: string;
  description: string;
  vendorVerified: boolean;
  verificationStatus: OAuthVerificationStatus;
  verificationReason: string;
  verifiedDomain?: string;
  claimedVendorId?: string;
  claimedVendorName?: string;
  vendorSpoofWarning?: string;
}

export const OAUTH_VENDOR_REGISTRY: OAuthVendorSpec[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    vendorName: 'OpenAI',
    imageId: 'OpenAI',
    logoUrl: 'https://www.google.com/s2/favicons?domain=chatgpt.com&sz=128',
    iconBg: '#10A37F',
    iconColor: '#FFFFFF',
    description: 'OpenAI ChatGPT custom assistant & MCP integration',
    officialDomains: ['chatgpt.com', 'openai.com', 'chat.openai.com', 'platform.openai.com'],
    officialSchemes: ['chatgpt', 'openai'],
    claimKeywords: ['chatgpt', 'openai', 'gpt-4', 'gpt4'],
    cloudOnly: true,
  },
  {
    id: 'claude_code',
    name: 'Claude Code',
    vendorName: 'Anthropic',
    imageId: 'Claude',
    logoUrl: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=128',
    iconBg: '#D97706',
    iconColor: '#FFFFFF',
    description: 'Anthropic Claude Code CLI & desktop agent runner',
    officialDomains: ['claude.ai', 'anthropic.com', 'console.anthropic.com'],
    officialSchemes: ['claude-code', 'claude'],
    claimKeywords: ['claude-code', 'claude code', 'claudecode'],
    cloudOnly: false,
  },
  {
    id: 'claude',
    name: 'Claude',
    vendorName: 'Anthropic',
    imageId: 'Claude',
    logoUrl: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=128',
    iconBg: '#D97706',
    iconColor: '#FFFFFF',
    description: 'Anthropic Claude assistant & MCP integration',
    officialDomains: ['claude.ai', 'anthropic.com', 'console.anthropic.com'],
    officialSchemes: ['claude', 'anthropic'],
    claimKeywords: ['claude', 'anthropic'],
    cloudOnly: false,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    vendorName: 'Google',
    imageId: 'Google Gemini',
    logoUrl: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=128',
    iconBg: '#1A73E8',
    iconColor: '#FFFFFF',
    description: 'Google Gemini assistant, AI Studio & Vertex AI integration',
    officialDomains: [
      'gemini.google.com',
      'aistudio.google.com',
      'makersuite.google.com',
      'vertexai.google.com',
      'console.cloud.google.com',
      'developers.google.com',
    ],
    officialSchemes: ['gemini', 'google-gemini'],
    claimKeywords: ['gemini', 'vertexai', 'vertex ai', 'aistudio', 'makersuite', 'google ai'],
    cloudOnly: true,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    vendorName: 'Anysphere',
    imageId: 'Cursor',
    logoUrl: 'https://www.google.com/s2/favicons?domain=cursor.com&sz=128',
    iconBg: '#000000',
    iconColor: '#FFFFFF',
    description: 'Cursor AI IDE & MCP tool runner',
    officialDomains: ['cursor.com', 'cursor.sh'],
    officialSchemes: ['cursor', 'anysphere'],
    claimKeywords: ['cursor', 'anysphere'],
    cloudOnly: false,
  },
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    vendorName: 'Microsoft',
    imageId: 'Visual Studio Code',
    logoUrl: 'https://www.google.com/s2/favicons?domain=code.visualstudio.com&sz=128',
    iconBg: '#007ACC',
    iconColor: '#FFFFFF',
    description: 'Visual Studio Code IDE & MCP extension host',
    officialDomains: ['vscode.dev', 'insiders.vscode.dev', 'code.visualstudio.com', 'vscode-auth.github.com'],
    officialSchemes: ['vscode', 'vscode-insiders', 'code-oss'],
    claimKeywords: ['visual studio code', 'vscode', 'vs code'],
    cloudOnly: false,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    vendorName: 'GitHub',
    imageId: 'GitHub',
    logoUrl: 'https://www.google.com/s2/favicons?domain=github.com&sz=128',
    iconBg: '#24292F',
    iconColor: '#FFFFFF',
    description: 'GitHub Copilot Workspace & agent integration',
    officialDomains: ['github.com', 'githubcopilot.com', 'api.githubcopilot.com'],
    officialSchemes: ['github-copilot', 'github'],
    claimKeywords: ['github copilot', 'copilot', 'github'],
    cloudOnly: false,
  },
  {
    id: 'microsoft_copilot',
    name: 'Microsoft Copilot',
    vendorName: 'Microsoft',
    imageId: 'Microsoft',
    logoUrl: 'https://www.google.com/s2/favicons?domain=copilot.microsoft.com&sz=128',
    iconBg: '#0078D4',
    iconColor: '#FFFFFF',
    description: 'Microsoft Copilot Studio & M365 agent connector',
    officialDomains: [
      'copilot.microsoft.com',
      'copilotstudio.microsoft.com',
      'powerplatform.com',
      'azure.com',
      'office.com',
    ],
    officialSchemes: ['ms-copilot', 'msteams'],
    claimKeywords: ['microsoft copilot', 'copilot studio', 'm365 copilot', 'power platform'],
    cloudOnly: true,
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    vendorName: 'Codeium',
    imageId: 'Windsurf',
    logoUrl: 'https://www.google.com/s2/favicons?domain=windsurf.com&sz=128',
    iconBg: '#09B6A2',
    iconColor: '#FFFFFF',
    description: 'Windsurf AI IDE & Codeium MCP runner',
    officialDomains: ['windsurf.com', 'windsurf.ai', 'codeium.com'],
    officialSchemes: ['windsurf', 'codeium'],
    claimKeywords: ['windsurf', 'codeium'],
    cloudOnly: false,
  },
  {
    id: 'raycast',
    name: 'Raycast',
    vendorName: 'Raycast',
    imageId: 'Raycast',
    logoUrl: 'https://www.google.com/s2/favicons?domain=raycast.com&sz=128',
    iconBg: '#FF6363',
    iconColor: '#FFFFFF',
    description: 'Raycast launcher & AI MCP extension',
    officialDomains: ['raycast.com'],
    officialSchemes: ['raycast'],
    claimKeywords: ['raycast'],
    cloudOnly: false,
  },
  {
    id: 'cline',
    name: 'Cline',
    vendorName: 'Cline',
    imageId: 'Cline',
    logoUrl: 'https://www.google.com/s2/favicons?domain=cline.bot&sz=128',
    iconBg: '#3B82F6',
    iconColor: '#FFFFFF',
    description: 'Cline autonomous coding agent & MCP client',
    officialDomains: ['cline.bot'],
    officialSchemes: ['cline'],
    claimKeywords: ['cline', 'claude-dev', 'saoudrizwan.claude-dev'],
    cloudOnly: false,
  },
  {
    id: 'roocode',
    name: 'Roo Code',
    vendorName: 'Roo Code',
    imageId: 'Roo Code',
    logoUrl: 'https://www.google.com/s2/favicons?domain=roocode.com&sz=128',
    iconBg: '#6366F1',
    iconColor: '#FFFFFF',
    description: 'Roo Code autonomous coding agent & MCP client',
    officialDomains: ['roocode.com'],
    officialSchemes: ['roocode', 'roo-cline'],
    claimKeywords: ['roo code', 'roocode', 'roo-cline', 'rooveterinaryinc'],
    cloudOnly: false,
  },
  {
    id: 'continue',
    name: 'Continue',
    vendorName: 'Continue.dev',
    imageId: 'Continue',
    logoUrl: 'https://www.google.com/s2/favicons?domain=continue.dev&sz=128',
    iconBg: '#1E293B',
    iconColor: '#FFFFFF',
    description: 'Continue open-source AI code assistant',
    officialDomains: ['continue.dev', 'hub.continue.dev'],
    officialSchemes: ['continue'],
    claimKeywords: ['continue.dev', 'continue-dev'],
    cloudOnly: false,
  },
  {
    id: 'zed',
    name: 'Zed',
    vendorName: 'Zed Industries',
    imageId: 'Zed',
    logoUrl: 'https://www.google.com/s2/favicons?domain=zed.dev&sz=128',
    iconBg: '#084CCF',
    iconColor: '#FFFFFF',
    description: 'Zed Editor assistant & MCP context server client',
    officialDomains: ['zed.dev'],
    officialSchemes: ['zed'],
    claimKeywords: ['zed', 'zed.dev', 'zed editor'],
    cloudOnly: false,
  },
  {
    id: 'goose',
    name: 'Goose',
    vendorName: 'Block',
    imageId: 'Goose',
    logoUrl: 'https://www.google.com/s2/favicons?domain=block.github.io&sz=128',
    iconBg: '#111827',
    iconColor: '#FFFFFF',
    description: 'Block Goose open-source AI developer agent',
    officialDomains: ['block.github.io', 'sqprod.co'],
    officialSchemes: ['goose'],
    claimKeywords: ['goose', 'block-goose', 'codename-goose'],
    cloudOnly: false,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    vendorName: 'Perplexity AI',
    imageId: 'Perplexity',
    logoUrl: 'https://www.google.com/s2/favicons?domain=perplexity.ai&sz=128',
    iconBg: '#20808D',
    iconColor: '#FFFFFF',
    description: 'Perplexity AI answer engine & MCP connector',
    officialDomains: ['perplexity.ai', 'labs.perplexity.ai'],
    officialSchemes: ['perplexity'],
    claimKeywords: ['perplexity'],
    cloudOnly: true,
  },
  {
    id: 'mistral',
    name: 'Mistral Le Chat',
    vendorName: 'Mistral AI',
    imageId: 'Mistral',
    logoUrl: 'https://www.google.com/s2/favicons?domain=mistral.ai&sz=128',
    iconBg: '#FA520F',
    iconColor: '#FFFFFF',
    description: 'Mistral AI Le Chat assistant & tool connector',
    officialDomains: ['mistral.ai', 'chat.mistral.ai', 'console.mistral.ai'],
    officialSchemes: ['mistral', 'lechat'],
    claimKeywords: ['mistral', 'le chat', 'lechat'],
    cloudOnly: true,
  },
  {
    id: 'grok',
    name: 'Grok',
    vendorName: 'xAI',
    imageId: 'Grok',
    logoUrl: 'https://www.google.com/s2/favicons?domain=grok.com&sz=128',
    iconBg: '#0F172A',
    iconColor: '#FFFFFF',
    description: 'xAI Grok assistant & MCP integration',
    officialDomains: ['grok.com', 'x.ai', 'console.x.ai'],
    officialSchemes: ['grok', 'xai'],
    claimKeywords: ['grok', 'x.ai', 'xai'],
    cloudOnly: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    vendorName: 'DeepSeek',
    imageId: 'DeepSeek',
    logoUrl: 'https://www.google.com/s2/favicons?domain=deepseek.com&sz=128',
    iconBg: '#4D6BFE',
    iconColor: '#FFFFFF',
    description: 'DeepSeek AI assistant & tool integration',
    officialDomains: ['deepseek.com', 'chat.deepseek.com', 'platform.deepseek.com'],
    officialSchemes: ['deepseek'],
    claimKeywords: ['deepseek'],
    cloudOnly: true,
  },
  {
    id: 'lovable',
    name: 'Lovable',
    vendorName: 'Lovable',
    imageId: 'Lovable',
    logoUrl: 'https://www.google.com/s2/favicons?domain=lovable.dev&sz=128',
    iconBg: '#EC4899',
    iconColor: '#FFFFFF',
    description: 'Lovable full-stack AI app builder & MCP connector',
    officialDomains: ['lovable.dev', 'lovable.app', 'gptengineer.app'],
    officialSchemes: ['lovable'],
    claimKeywords: ['lovable', 'gptengineer'],
    cloudOnly: true,
  },
  {
    id: 'bolt',
    name: 'Bolt.new',
    vendorName: 'StackBlitz',
    imageId: 'StackBlitz',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bolt.new&sz=128',
    iconBg: '#1389FD',
    iconColor: '#FFFFFF',
    description: 'StackBlitz Bolt.new AI web development agent',
    officialDomains: ['bolt.new', 'stackblitz.com'],
    officialSchemes: ['bolt', 'stackblitz'],
    claimKeywords: ['bolt.new', 'stackblitz'],
    cloudOnly: true,
  },
  {
    id: 'v0',
    name: 'Vercel v0',
    vendorName: 'Vercel',
    imageId: 'Vercel',
    logoUrl: 'https://www.google.com/s2/favicons?domain=v0.dev&sz=128',
    iconBg: '#000000',
    iconColor: '#FFFFFF',
    description: 'Vercel v0 generative UI & MCP integration',
    officialDomains: ['v0.dev', 'vercel.com', 'vercel.app'],
    officialSchemes: ['v0', 'vercel'],
    claimKeywords: ['v0.dev', 'vercel v0'],
    cloudOnly: true,
  },
  {
    id: 'replit',
    name: 'Replit Agent',
    vendorName: 'Replit',
    imageId: 'Replit',
    logoUrl: 'https://www.google.com/s2/favicons?domain=replit.com&sz=128',
    iconBg: '#F26207',
    iconColor: '#FFFFFF',
    description: 'Replit AI Agent & cloud IDE connector',
    officialDomains: ['replit.com', 'repl.co'],
    officialSchemes: ['replit'],
    claimKeywords: ['replit'],
    cloudOnly: true,
  },
  {
    id: 'devin',
    name: 'Devin',
    vendorName: 'Cognition',
    imageId: 'Devin',
    logoUrl: 'https://www.google.com/s2/favicons?domain=devin.ai&sz=128',
    iconBg: '#14B8A6',
    iconColor: '#FFFFFF',
    description: 'Cognition Devin autonomous software engineer',
    officialDomains: ['devin.ai', 'cognition.ai', 'preview.devin.ai'],
    officialSchemes: ['devin'],
    claimKeywords: ['devin', 'cognition.ai'],
    cloudOnly: true,
  },
  {
    id: 'amazon_q',
    name: 'Amazon Q',
    vendorName: 'AWS',
    imageId: 'AWS',
    logoUrl: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=128',
    iconBg: '#FF9900',
    iconColor: '#FFFFFF',
    description: 'AWS Amazon Q Developer & Bedrock agent',
    officialDomains: ['aws.amazon.com', ' amazonaws.com', 'awsapps.com'],
    officialSchemes: ['amazon-q', 'kiro', 'aws'],
    claimKeywords: ['amazon q', 'amazon-q', 'codewhisperer', 'kiro', 'bedrock'],
    cloudOnly: false,
  },
  {
    id: 'jetbrains',
    name: 'JetBrains AI',
    vendorName: 'JetBrains',
    imageId: 'JetBrains',
    logoUrl: 'https://www.google.com/s2/favicons?domain=jetbrains.com&sz=128',
    iconBg: '#000000',
    iconColor: '#FFFFFF',
    description: 'JetBrains AI Assistant & Junie IDE agent',
    officialDomains: ['jetbrains.com', 'jetbrains.ai'],
    officialSchemes: ['jetbrains', 'intellij', 'pycharm', 'webstorm', 'goland'],
    claimKeywords: ['jetbrains', 'intellij', 'pycharm', 'webstorm', 'goland', 'junie'],
    cloudOnly: false,
  },
  {
    id: 'sourcegraph',
    name: 'Sourcegraph Amp / Cody',
    vendorName: 'Sourcegraph',
    imageId: 'Sourcegraph',
    logoUrl: 'https://www.google.com/s2/favicons?domain=sourcegraph.com&sz=128',
    iconBg: '#FF5543',
    iconColor: '#FFFFFF',
    description: 'Sourcegraph Cody & Amp coding agent',
    officialDomains: ['sourcegraph.com', 'ampcode.com'],
    officialSchemes: ['sourcegraph', 'cody', 'amp'],
    claimKeywords: ['sourcegraph', 'cody', 'ampcode'],
    cloudOnly: false,
  },
  {
    id: 'warp',
    name: 'Warp',
    vendorName: 'Warp',
    imageId: 'Warp',
    logoUrl: 'https://www.google.com/s2/favicons?domain=warp.dev&sz=128',
    iconBg: '#01A4FF',
    iconColor: '#FFFFFF',
    description: 'Warp intelligent terminal & agent mode',
    officialDomains: ['warp.dev', 'app.warp.dev'],
    officialSchemes: ['warp'],
    claimKeywords: ['warp', 'warp.dev', 'warp terminal'],
    cloudOnly: false,
  },
  {
    id: 'librechat',
    name: 'LibreChat',
    vendorName: 'LibreChat',
    imageId: 'LibreChat',
    logoUrl: 'https://www.google.com/s2/favicons?domain=librechat.ai&sz=128',
    iconBg: '#4F46E5',
    iconColor: '#FFFFFF',
    description: 'LibreChat open-source AI chat & MCP platform',
    officialDomains: ['librechat.ai'],
    officialSchemes: ['librechat'],
    claimKeywords: ['librechat'],
    cloudOnly: false,
  },
  {
    id: 'open_webui',
    name: 'Open WebUI',
    vendorName: 'Open WebUI',
    imageId: 'Open WebUI',
    logoUrl: 'https://www.google.com/s2/favicons?domain=openwebui.com&sz=128',
    iconBg: '#1F2937',
    iconColor: '#FFFFFF',
    description: 'Open WebUI self-hosted AI interface',
    officialDomains: ['openwebui.com'],
    officialSchemes: ['open-webui', 'openwebui'],
    claimKeywords: ['open-webui', 'open webui', 'openwebui'],
    cloudOnly: false,
  },
  {
    id: 'anythingllm',
    name: 'AnythingLLM',
    vendorName: 'Mintplex Labs',
    imageId: 'AnythingLLM',
    logoUrl: 'https://www.google.com/s2/favicons?domain=anythingllm.com&sz=128',
    iconBg: '#2563EB',
    iconColor: '#FFFFFF',
    description: 'AnythingLLM desktop & server MCP workspace',
    officialDomains: ['anythingllm.com', 'useanything.com'],
    officialSchemes: ['anythingllm'],
    claimKeywords: ['anythingllm', 'anything-llm'],
    cloudOnly: false,
  },
  {
    id: 'cherry_studio',
    name: 'Cherry Studio',
    vendorName: 'Cherry Studio',
    imageId: 'Cherry Studio',
    logoUrl: 'https://www.google.com/s2/favicons?domain=cherry-ai.com&sz=128',
    iconBg: '#E11D48',
    iconColor: '#FFFFFF',
    description: 'Cherry Studio desktop multi-model & MCP client',
    officialDomains: ['cherry-ai.com', 'cherrystudio.ai'],
    officialSchemes: ['cherrystudio', 'cherry-studio'],
    claimKeywords: ['cherry studio', 'cherrystudio', 'cherry-studio'],
    cloudOnly: false,
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    vendorName: 'LM Studio',
    imageId: 'LM Studio',
    logoUrl: 'https://www.google.com/s2/favicons?domain=lmstudio.ai&sz=128',
    iconBg: '#4338CA',
    iconColor: '#FFFFFF',
    description: 'LM Studio local LLM runner & MCP host',
    officialDomains: ['lmstudio.ai'],
    officialSchemes: ['lmstudio', 'lm-studio'],
    claimKeywords: ['lm studio', 'lmstudio', 'lm-studio'],
    cloudOnly: false,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    vendorName: 'Ollama',
    imageId: 'Ollama',
    logoUrl: 'https://www.google.com/s2/favicons?domain=ollama.com&sz=128',
    iconBg: '#111827',
    iconColor: '#FFFFFF',
    description: 'Ollama local model runner & tool client',
    officialDomains: ['ollama.com', 'ollama.ai'],
    officialSchemes: ['ollama'],
    claimKeywords: ['ollama'],
    cloudOnly: false,
  },
  {
    id: 'jan',
    name: 'Jan',
    vendorName: 'Jan.ai',
    imageId: 'Jan',
    logoUrl: 'https://www.google.com/s2/favicons?domain=jan.ai&sz=128',
    iconBg: '#312E81',
    iconColor: '#FFFFFF',
    description: 'Jan open-source desktop AI & MCP client',
    officialDomains: ['jan.ai'],
    officialSchemes: ['jan'],
    claimKeywords: ['jan.ai', 'jan-ai'],
    cloudOnly: false,
  },
  {
    id: 'msty',
    name: 'Msty',
    vendorName: 'Msty',
    imageId: 'Msty',
    logoUrl: 'https://www.google.com/s2/favicons?domain=msty.app&sz=128',
    iconBg: '#6D28D9',
    iconColor: '#FFFFFF',
    description: 'Msty local & online AI model studio',
    officialDomains: ['msty.app'],
    officialSchemes: ['msty'],
    claimKeywords: ['msty', 'msty.app'],
    cloudOnly: false,
  },
  {
    id: 'highlight',
    name: 'Highlight AI',
    vendorName: 'Highlight',
    imageId: 'Highlight AI',
    logoUrl: 'https://www.google.com/s2/favicons?domain=highlightai.com&sz=128',
    iconBg: '#7C3AED',
    iconColor: '#FFFFFF',
    description: 'Highlight desktop AI assistant & MCP client',
    officialDomains: ['highlightai.com', 'highlight.ing'],
    officialSchemes: ['highlight'],
    claimKeywords: ['highlight ai', 'highlightai', 'highlight.ing'],
    cloudOnly: false,
  },
  {
    id: 'dust',
    name: 'Dust',
    vendorName: 'Dust.tt',
    imageId: 'Dust',
    logoUrl: 'https://www.google.com/s2/favicons?domain=dust.tt&sz=128',
    iconBg: '#0EA5E9',
    iconColor: '#FFFFFF',
    description: 'Dust enterprise AI agent platform & MCP client',
    officialDomains: ['dust.tt'],
    officialSchemes: ['dust'],
    claimKeywords: ['dust.tt', 'dust'],
    cloudOnly: true,
  },
  {
    id: 'glean',
    name: 'Glean',
    vendorName: 'Glean',
    imageId: 'Glean',
    logoUrl: 'https://www.google.com/s2/favicons?domain=glean.com&sz=128',
    iconBg: '#3B82F6',
    iconColor: '#FFFFFF',
    description: 'Glean enterprise work AI & agent connector',
    officialDomains: ['glean.com', 'app.glean.com'],
    officialSchemes: ['glean'],
    claimKeywords: ['glean'],
    cloudOnly: true,
  },
  {
    id: 'cohere',
    name: 'Cohere Coral',
    vendorName: 'Cohere',
    imageId: 'Cohere',
    logoUrl: 'https://www.google.com/s2/favicons?domain=cohere.com&sz=128',
    iconBg: '#39594D',
    iconColor: '#FFFFFF',
    description: 'Cohere Coral enterprise assistant & tool runner',
    officialDomains: ['cohere.com', 'coral.cohere.com', 'dashboard.cohere.com'],
    officialSchemes: ['cohere'],
    claimKeywords: ['cohere'],
    cloudOnly: true,
  },
  {
    id: 'huggingface',
    name: 'HuggingChat',
    vendorName: 'Hugging Face',
    imageId: 'Hugging Face',
    logoUrl: 'https://www.google.com/s2/favicons?domain=huggingface.co&sz=128',
    iconBg: '#F59E0B',
    iconColor: '#FFFFFF',
    description: 'Hugging Face Chat & Spaces MCP integration',
    officialDomains: ['huggingface.co', 'hf.co', 'hf.space'],
    officialSchemes: ['huggingface'],
    claimKeywords: ['huggingface', 'hugging face', 'huggingchat', 'smolagents'],
    cloudOnly: false,
  },
  {
    id: 'langchain',
    name: 'LangChain / LangGraph',
    vendorName: 'LangChain',
    imageId: 'LangChain',
    logoUrl: 'https://www.google.com/s2/favicons?domain=langchain.com&sz=128',
    iconBg: '#1C3C3C',
    iconColor: '#FFFFFF',
    description: 'LangChain, LangGraph & LangSmith agent runtime',
    officialDomains: ['langchain.com', 'smith.langchain.com'],
    officialSchemes: ['langchain', 'langsmith'],
    claimKeywords: ['langchain', 'langgraph', 'langsmith'],
    cloudOnly: false,
  },
  {
    id: 'n8n',
    name: 'n8n',
    vendorName: 'n8n',
    imageId: 'n8n',
    logoUrl: 'https://www.google.com/s2/favicons?domain=n8n.io&sz=128',
    iconBg: '#EA4B71',
    iconColor: '#FFFFFF',
    description: 'n8n workflow automation & MCP AI agent node',
    officialDomains: ['n8n.io', 'n8n.cloud'],
    officialSchemes: ['n8n'],
    claimKeywords: ['n8n'],
    cloudOnly: false,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    vendorName: 'Zapier',
    imageId: 'Zapier',
    logoUrl: 'https://www.google.com/s2/favicons?domain=zapier.com&sz=128',
    iconBg: '#FF4F00',
    iconColor: '#FFFFFF',
    description: 'Zapier Central & MCP action integration',
    officialDomains: ['zapier.com', 'mcp.zapier.com'],
    officialSchemes: ['zapier'],
    claimKeywords: ['zapier'],
    cloudOnly: true,
  },
  {
    id: 'make',
    name: 'Make',
    vendorName: 'Make',
    imageId: 'Make',
    logoUrl: 'https://www.google.com/s2/favicons?domain=make.com&sz=128',
    iconBg: '#6D00CC',
    iconColor: '#FFFFFF',
    description: 'Make scenario automation & MCP connector',
    officialDomains: ['make.com', 'integromat.com'],
    officialSchemes: ['make'],
    claimKeywords: ['make.com', 'integromat'],
    cloudOnly: true,
  },
  {
    id: 'postman',
    name: 'Postman',
    vendorName: 'Postman',
    imageId: 'Postman',
    logoUrl: 'https://www.google.com/s2/favicons?domain=postman.com&sz=128',
    iconBg: '#FF6C37',
    iconColor: '#FFFFFF',
    description: 'Postman API & MCP client inspector',
    officialDomains: ['postman.com', 'getpostman.com', 'oauth.pstmn.io'],
    officialSchemes: ['postman'],
    claimKeywords: ['postman', 'pstmn'],
    cloudOnly: false,
  },
  {
    id: 'insomnia',
    name: 'Insomnia',
    vendorName: 'Kong',
    imageId: 'Insomnia',
    logoUrl: 'https://www.google.com/s2/favicons?domain=insomnia.rest&sz=128',
    iconBg: '#4000BF',
    iconColor: '#FFFFFF',
    description: 'Insomnia REST & MCP client',
    officialDomains: ['insomnia.rest'],
    officialSchemes: ['insomnia'],
    claimKeywords: ['insomnia'],
    cloudOnly: false,
  },
  {
    id: 'mcp_inspector',
    name: 'MCP Inspector',
    vendorName: 'Model Context Protocol',
    imageId: 'Model Context Protocol',
    logoUrl: 'https://www.google.com/s2/favicons?domain=modelcontextprotocol.io&sz=128',
    iconBg: '#0F172A',
    iconColor: '#FFFFFF',
    description: 'Official Model Context Protocol Inspector & SDK debugger',
    officialDomains: ['modelcontextprotocol.io'],
    officialSchemes: ['mcp-inspector', 'mcp'],
    claimKeywords: ['mcp-inspector', 'mcp inspector', 'modelcontextprotocol'],
    cloudOnly: false,
  },
  {
    id: 'slack',
    name: 'Slack',
    vendorName: 'Salesforce / Slack',
    imageId: 'Slack',
    logoUrl: 'https://www.google.com/s2/favicons?domain=slack.com&sz=128',
    iconBg: '#4A154B',
    iconColor: '#FFFFFF',
    description: 'Slack assistant & workspace agent connector',
    officialDomains: ['slack.com'],
    officialSchemes: ['slack'],
    claimKeywords: ['slack'],
    cloudOnly: true,
  },
  {
    id: 'notion',
    name: 'Notion AI',
    vendorName: 'Notion',
    imageId: 'Notion',
    logoUrl: 'https://www.google.com/s2/favicons?domain=notion.so&sz=128',
    iconBg: '#000000',
    iconColor: '#FFFFFF',
    description: 'Notion AI workspace & MCP integration',
    officialDomains: ['notion.so', 'notion.com'],
    officialSchemes: ['notion'],
    claimKeywords: ['notion'],
    cloudOnly: true,
  },
  {
    id: 'linear',
    name: 'Linear',
    vendorName: 'Linear',
    imageId: 'Linear',
    logoUrl: 'https://www.google.com/s2/favicons?domain=linear.app&sz=128',
    iconBg: '#5E6AD2',
    iconColor: '#FFFFFF',
    description: 'Linear agent & issue automation connector',
    officialDomains: ['linear.app'],
    officialSchemes: ['linear'],
    claimKeywords: ['linear.app', 'linear'],
    cloudOnly: true,
  },
  {
    id: 'shuffle_agent',
    name: 'Shuffle Agent',
    vendorName: 'Shuffle',
    imageId: 'Shuffle',
    logoUrl: 'https://shuffler.io/images/logos/orange_logo.png',
    iconBg: '#f85f38',
    iconColor: '#FFFFFF',
    description: 'Shuffle Agent runner requesting access to execute tools and actions on your behalf.',
    officialDomains: ['shuffler.io', 'shuffle.security'],
    officialSchemes: ['shuffle'],
    claimKeywords: ['shuffle agent', 'shuffle_agent', 'shuffler'],
    cloudOnly: false,
  },
];

const normKey = (s?: string): string =>
  (s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, '_');

/**
 * Look up a known vendor specification by vendorId, imageId, or display name.
 */
export const findOAuthVendorSpec = (query?: string): OAuthVendorSpec | null => {
  if (!query) return null;
  const qNorm = normKey(query);
  const qLower = query.trim().toLowerCase();
  if (!qNorm) return null;

  for (const spec of OAUTH_VENDOR_REGISTRY) {
    if (
      normKey(spec.id) === qNorm ||
      normKey(spec.name) === qNorm ||
      normKey(spec.imageId) === qNorm ||
      normKey(spec.vendorName) === qNorm
    ) {
      return spec;
    }
  }

  for (const spec of OAUTH_VENDOR_REGISTRY) {
    for (const kw of spec.claimKeywords) {
      if (qLower.includes(kw.toLowerCase())) {
        return spec;
      }
    }
  }

  return null;
};

/**
 * Resolve a vendor logo URL synchronously for AppFallbackIcon and Settings lists.
 */
export const getOAuthVendorLogo = (nameOrId?: string): string => {
  const spec = findOAuthVendorSpec(nameOrId);
  return spec?.logoUrl || '';
};

const isUuidOrGenericClientId = (val?: string): boolean => {
  if (!val) return false;
  const cleaned = val.replace(/^shuffle[_-]client[_-]/i, '').trim();
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned) ||
    /^[0-9a-f]{32}$/i.test(cleaned) ||
    /^[0-9a-f]{8,}$/i.test(cleaned) ||
    /^application\s+[0-9a-f]+/i.test(cleaned)
  );
};

const isLoopbackHost = (host?: string): boolean => {
  const h = (host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
};

const hostMatchesOfficialDomain = (host: string, domain: string): boolean => {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  const d = domain.trim().toLowerCase().replace(/^\./, '').replace(/\.$/, '');
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
};

/**
 * Cross-reference a client's claimed identity (client_name, software_id, user_agent, mcp_client_name)
 * against its cryptographic redirect URI (domain or custom URI scheme) to verify whether a request
 * genuinely comes from that vendor or is an unverified/spoofed client.
 */
export const evaluateOAuthVendorIdentity = (params: {
  clientId?: string;
  rawClientName?: string;
  redirectUri?: string;
  clientUri?: string;
  logoUri?: string;
  softwareId?: string;
  userAgent?: string;
  mcpClientName?: string;
}): OAuthVendorEvaluation => {
  const rawId = (params.clientId || '').trim();
  const idLower = rawId.toLowerCase();
  const idWithoutPrefix = idLower.replace(/^shuffle[_-]client[_-]/i, '');
  const cleanName =
    params.rawClientName && !isUuidOrGenericClientId(params.rawClientName)
      ? params.rawClientName.trim()
      : '';
  const nameLower = cleanName.toLowerCase();

  let redirectScheme = '';
  let redirectHost = '';
  let isLoopback = false;

  if (params.redirectUri) {
    try {
      const parsed = new URL(params.redirectUri.trim());
      redirectScheme = parsed.protocol.replace(/:$/, '').toLowerCase();
      redirectHost = (parsed.hostname || '').toLowerCase();
      isLoopback = isLoopbackHost(redirectHost);
    } catch {
      const rawLower = params.redirectUri.trim().toLowerCase();
      if (rawLower.includes('127.0.0.1') || rawLower.includes('localhost') || rawLower.includes('[::1]')) {
        isLoopback = true;
        redirectHost = 'localhost';
      }
    }
  }

  // 1. Check if the redirect URI cryptographically matches an official vendor domain or native scheme
  let uriVendor: OAuthVendorSpec | null = null;
  let verifiedDomain = '';

  if (redirectHost && !isLoopback) {
    for (const v of OAUTH_VENDOR_REGISTRY) {
      for (const dom of v.officialDomains) {
        if (hostMatchesOfficialDomain(redirectHost, dom)) {
          uriVendor = v;
          verifiedDomain = redirectHost;
          break;
        }
      }
      if (uriVendor) break;
    }
  }

  if (!uriVendor && redirectScheme && redirectScheme !== 'http' && redirectScheme !== 'https') {
    for (const v of OAUTH_VENDOR_REGISTRY) {
      for (const sch of v.officialSchemes) {
        if (redirectScheme === sch.toLowerCase()) {
          uriVendor = v;
          verifiedDomain = `${redirectScheme}://`;
          break;
        }
      }
      if (uriVendor) break;
    }
  }

  // 2. Check what vendor the client claims to be via name, software_id, MCP clientInfo, or User-Agent
  const claimSignals = [
    cleanName,
    params.softwareId || '',
    params.mcpClientName || '',
    params.clientUri || '',
    idWithoutPrefix !== idLower ? '' : rawId,
  ]
    .join(' ')
    .toLowerCase();

  const uaLower = (params.userAgent || '').toLowerCase();
  const isBrowserUA = uaLower.includes('mozilla/') && !uaLower.includes('claude-user') && !uaLower.includes('chatgpt');

  let claimedVendor: OAuthVendorSpec | null = null;
  for (const v of OAUTH_VENDOR_REGISTRY) {
    for (const kw of v.claimKeywords) {
      const kwLower = kw.toLowerCase();
      if (claimSignals.includes(kwLower) || (!isBrowserUA && uaLower.includes(kwLower))) {
        claimedVendor = v;
        break;
      }
    }
    if (claimedVendor) break;
  }

  const sameVendorFamily = (a: OAuthVendorSpec, b: OAuthVendorSpec): boolean => {
    if (a.id === b.id) return true;
    if ((a.id === 'claude' || a.id === 'claude_code') && (b.id === 'claude' || b.id === 'claude_code')) {
      return true;
    }
    return false;
  };

  // CASE A: Redirect URI matches an official vendor domain or scheme
  if (uriVendor) {
    let displayVendor = uriVendor;
    if (claimedVendor && sameVendorFamily(uriVendor, claimedVendor)) {
      displayVendor = claimedVendor;
    }
    const evalResult: OAuthVendorEvaluation = {
      name: displayVendor.name,
      vendor: displayVendor.vendorName,
      vendorId: displayVendor.id,
      imageId: displayVendor.imageId,
      logoUrl: params.logoUri || displayVendor.logoUrl,
      iconBg: displayVendor.iconBg,
      iconColor: displayVendor.iconColor,
      description: displayVendor.description,
      vendorVerified: true,
      verificationStatus: 'verified',
      verificationReason: `Verified via official redirect target (${verifiedDomain})`,
      verifiedDomain,
    };

    if (claimedVendor && !sameVendorFamily(uriVendor, claimedVendor)) {
      evalResult.claimedVendorId = claimedVendor.id;
      evalResult.claimedVendorName = claimedVendor.name;
      evalResult.verificationStatus = 'mismatch';
      evalResult.vendorVerified = false;
      evalResult.vendorSpoofWarning = `Client claimed to be "${claimedVendor.name}", but redirects to ${verifiedDomain} (${uriVendor.name}).`;
      evalResult.verificationReason = evalResult.vendorSpoofWarning;
    }
    return evalResult;
  }

  // CASE B: Client claims to be a known vendor, but redirect URI does NOT match official domains/schemes
  if (claimedVendor) {
    if (isLoopback) {
      if (claimedVendor.cloudOnly) {
        const warning = `Client claims to be "${claimedVendor.name}" (${claimedVendor.vendorName}), which is a cloud service, but redirects to local loopback (${redirectHost}). Official ${claimedVendor.name} connections redirect to ${claimedVendor.officialDomains.join(' or ')}.`;
        return {
          name: cleanName || claimedVendor.name,
          vendor: claimedVendor.vendorName,
          vendorId: claimedVendor.id,
          imageId: claimedVendor.imageId,
          logoUrl: params.logoUri || claimedVendor.logoUrl,
          iconBg: claimedVendor.iconBg,
          iconColor: claimedVendor.iconColor,
          description: claimedVendor.description,
          vendorVerified: false,
          verificationStatus: 'mismatch',
          verificationReason: warning,
          verifiedDomain: redirectHost,
          claimedVendorId: claimedVendor.id,
          claimedVendorName: claimedVendor.name,
          vendorSpoofWarning: warning,
        };
      }
      return {
        name: claimedVendor.name,
        vendor: claimedVendor.vendorName,
        vendorId: claimedVendor.id,
        imageId: claimedVendor.imageId,
        logoUrl: params.logoUri || claimedVendor.logoUrl,
        iconBg: claimedVendor.iconBg,
        iconColor: claimedVendor.iconColor,
        description: claimedVendor.description,
        vendorVerified: false,
        verificationStatus: 'loopback',
        verificationReason: `Local loopback callback (${redirectHost}). Self-reported as ${claimedVendor.name}; local loopback clients cannot be domain-verified.`,
        verifiedDomain: redirectHost,
        claimedVendorId: claimedVendor.id,
        claimedVendorName: claimedVendor.name,
      };
    }

    if (redirectHost) {
      const warning = `Client claims to be "${claimedVendor.name}" (${claimedVendor.vendorName}), but redirects to an unverified external domain (${redirectHost}) instead of ${claimedVendor.officialDomains.join(' or ')}.`;
      return {
        name: cleanName || claimedVendor.name,
        vendor: claimedVendor.vendorName,
        vendorId: claimedVendor.id,
        imageId: claimedVendor.imageId,
        logoUrl: params.logoUri || claimedVendor.logoUrl,
        iconBg: claimedVendor.iconBg,
        iconColor: claimedVendor.iconColor,
        description: claimedVendor.description,
        vendorVerified: false,
        verificationStatus: 'mismatch',
        verificationReason: warning,
        verifiedDomain: redirectHost,
        claimedVendorId: claimedVendor.id,
        claimedVendorName: claimedVendor.name,
        vendorSpoofWarning: warning,
      };
    }

    return {
      name: claimedVendor.name,
      vendor: claimedVendor.vendorName,
      vendorId: claimedVendor.id,
      imageId: claimedVendor.imageId,
      logoUrl: params.logoUri || claimedVendor.logoUrl,
      iconBg: claimedVendor.iconBg,
      iconColor: claimedVendor.iconColor,
      description: claimedVendor.description,
      vendorVerified: false,
      verificationStatus: 'unverified',
      verificationReason: `Self-reported as ${claimedVendor.name} (no redirect domain provided to verify).`,
      claimedVendorId: claimedVendor.id,
      claimedVendorName: claimedVendor.name,
    };
  }

  // CASE C: No known vendor claimed or matched
  if (isLoopback) {
    const displayName =
      cleanName && nameLower !== 'shuffle agent' && nameLower !== 'mcp client'
        ? cleanName
        : 'Local MCP Client';
    return {
      name: displayName,
      vendor: cleanName ? 'Local MCP Integration' : 'Local Developer Tool',
      vendorId: 'local_mcp',
      imageId: displayName,
      logoUrl: params.logoUri || '',
      iconBg: '#3B82F6',
      iconColor: '#FFFFFF',
      description: 'Local Model Context Protocol (MCP) client requesting access to execute tools on your behalf.',
      vendorVerified: false,
      verificationStatus: 'loopback',
      verificationReason: `Local loopback callback (${redirectHost}).`,
      verifiedDomain: redirectHost,
    };
  }

  if (cleanName && nameLower !== 'shuffle agent' && nameLower !== 'mcp client' && nameLower !== 'application') {
    const domainLogo = redirectHost
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(redirectHost)}&sz=128`
      : '';
    return {
      name: cleanName,
      vendor: redirectHost || 'Connected Application',
      vendorId: 'custom',
      imageId: cleanName,
      logoUrl: params.logoUri || domainLogo,
      iconBg: '#3B82F6',
      iconColor: '#FFFFFF',
      description: `${cleanName} is requesting permission to access your Shuffle tenant.`,
      vendorVerified: false,
      verificationStatus: 'unverified',
      verificationReason: redirectHost
        ? `Unverified third-party application redirecting to ${redirectHost}.`
        : 'Unverified third-party application.',
      verifiedDomain: redirectHost || undefined,
    };
  }

  if (redirectHost) {
    return {
      name: `MCP Client (${redirectHost})`,
      vendor: redirectHost,
      vendorId: 'custom',
      imageId: redirectHost,
      logoUrl: params.logoUri || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(redirectHost)}&sz=128`,
      iconBg: '#3B82F6',
      iconColor: '#FFFFFF',
      description: `External application on ${redirectHost} requesting permission to access your Shuffle tenant.`,
      vendorVerified: false,
      verificationStatus: 'unverified',
      verificationReason: `Unverified external application redirecting to ${redirectHost}.`,
      verifiedDomain: redirectHost,
    };
  }

  return {
    name: 'MCP Client',
    vendor: 'Third-Party Developer',
    vendorId: 'unknown',
    imageId: 'Model Context Protocol',
    logoUrl: params.logoUri || '',
    iconBg: '#3B82F6',
    iconColor: '#FFFFFF',
    description: 'External application requesting permission to access your Shuffle tenant.',
    vendorVerified: false,
    verificationStatus: 'unverified',
    verificationReason: 'Unverified OAuth / MCP client.',
  };
};

export const getVerificationStatusMeta = (
  status?: OAuthVerificationStatus | string,
  verifiedDomain?: string,
): {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
} => {
  switch (status) {
    case 'verified':
      return {
        label: verifiedDomain ? `Verified (${verifiedDomain})` : 'Verified Domain',
        color: '#22C55E',
        bgColor: 'rgba(34, 197, 94, 0.12)',
        borderColor: 'rgba(34, 197, 94, 0.3)',
      };
    case 'mismatch':
      return {
        label: 'Identity Mismatch',
        color: '#EF4444',
        bgColor: 'rgba(239, 68, 68, 0.12)',
        borderColor: 'rgba(239, 68, 68, 0.35)',
      };
    case 'loopback':
      return {
        label: 'Local Loopback (Unverified)',
        color: '#F59E0B',
        bgColor: 'rgba(245, 158, 11, 0.12)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
      };
    default:
      return {
        label: 'Unverified Source',
        color: '#94A3B8',
        bgColor: 'rgba(148, 163, 184, 0.12)',
        borderColor: 'rgba(148, 163, 184, 0.3)',
      };
  }
};
