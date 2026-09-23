import { Search as SearchIcon, Wand2 as AutoFixHighIcon, RefreshCw as RefreshIcon, Plus as AddIcon, Pencil as EditIcon, Play as PlayArrowIcon, Square as StopIcon, Trash2 as DeleteIcon, Copy as ContentCopyIcon, Rocket as RocketLaunchIcon, AlertTriangle as WarningAmberIcon, Eye as VisibilityIcon, Database as StorageIcon } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select as MuiSelect,
  MenuItem,
  Alert,
} from '@mui/material';
import { toast } from '@/lib/toast';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { getApiUrl, getAuthHeader, API_CONFIG } from '@/Shuffle-MCPs/api';
import { Link } from '@/lib/router-compat';
import { askAI } from '@/services/ai';
import WebhookStatusBanner from '@/components/detection/WebhookStatusBanner';
import { usePageMeta } from '@/hooks/usePageMeta';

interface Environment {
  id: string;
  Name: string;
  Type: string;
  Registered: boolean;
  archived: boolean;
  org_id: string;
  checkin: number;
  auth: string;
  running_ip?: string;
  data_lake?: {
    enabled: boolean;
    pipelines: any;
  };
}

interface Pipeline {
  pipeline: string;
  id?: string;
  name?: string;
  command?: string;
  definition?: string;
  state?: string;
  start_time?: number;
  started_at?: string;
  created?: number;
  last_modified?: number;
  // enriched locally
  _environmentId: string;
  _environmentName: string;
}

type PipelineTemplateCategory = 'ingest' | 'detect' | 'forward';

interface DefaultPipeline {
  label: string;
  description: string;
  command: string;
  hasPlaceholders?: boolean;
  matchKeys: string[]; // keywords to match against deployed pipelines
  category: PipelineTemplateCategory;
  _dynamicWebhook?: boolean; // flag for dynamic webhook URL resolution
  recommended?: boolean;
}

const TEMPLATE_CATEGORY_META: Record<PipelineTemplateCategory, { label: string; description: string }> = {
  ingest: { label: 'Ingest', description: 'Get data into the system' },
  detect: { label: 'Detect', description: 'Match rules against ingested data' },
  forward: { label: 'Forward', description: 'Send matched events to external systems' },
};

const DEFAULT_PIPELINES: DefaultPipeline[] = [
  {
    label: 'TCP Syslog',
    description: 'Ingest syslog events over TCP on port 1514',
    command: 'load_tcp "0.0.0.0:1514" { read_syslog } | import',
    matchKeys: ['load_tcp', 'syslog', 'tcp'],
    category: 'ingest',
    recommended: true,
  },
  {
    label: 'UDP Syslog',
    description: 'Ingest syslog events over UDP on port 1514',
    command: 'load_udp "0.0.0.0:1514", insert_newlines=true | read_syslog | import',
    matchKeys: ['load_udp', 'udp'],
    category: 'ingest',
    recommended: true,
  },
  {
    label: 'Sigma Rule Alerting',
    description: 'Live export with Sigma rule matching, forwarded to the incidents webhook',
    command: '',
    hasPlaceholders: false,
    matchKeys: ['sigma', 'sigma_rules'],
    category: 'detect',
    _dynamicWebhook: true,
    recommended: true,
  },
  {
    label: 'OpenSearch Forwarder',
    description: 'Forward live events to an OpenSearch instance',
    command: 'export live=true | to_opensearch "localhost:9200", action="create", index="shuffle_logs", user="admin", passwd="PASSWORD"',
    hasPlaceholders: true,
    matchKeys: ['to_opensearch', 'opensearch'],
    category: 'forward',
  },
  {
    label: 'Kafka Subscriber',
    description: 'Subscribe to a Kafka topic and ingest events',
    command: 'from_kafka "localhost:9092", topic="security_events" | import',
    hasPlaceholders: true,
    matchKeys: ['from_kafka', 'kafka'],
    category: 'ingest',
  },
  {
    label: 'ZeroMQ Subscriber',
    description: 'Subscribe to a ZeroMQ socket for event ingestion',
    command: 'load_zmq "tcp://localhost:5555" | read_json | import',
    hasPlaceholders: true,
    matchKeys: ['load_zmq', 'zeromq', 'zmq'],
    category: 'ingest',
  },
  {
    label: 'File Watcher',
    description: 'Watch a local JSON log file and ingest new entries',
    command: 'load_file "/var/log/events.json", follow=true | read_json | import',
    hasPlaceholders: true,
    matchKeys: ['load_file', 'follow=true'],
    category: 'ingest',
  },
  {
    label: 'Velociraptor Import',
    description: 'Ingest Velociraptor hunt results from a file',
    command: 'from_file "/tmp/velociraptor_results.json" | read_json | import',
    hasPlaceholders: true,
    matchKeys: ['velociraptor', 'from_file'],
    category: 'ingest',
  },
  {
    label: 'AWS S3 Logs',
    description: 'Read JSON log files from an S3 bucket continuously',
    command: 'from_s3 "s3://my-bucket/logs/**/*.json", watch=true | import',
    hasPlaceholders: true,
    matchKeys: ['from_s3', 's3'],
    category: 'ingest',
  },
  {
    label: 'GCP Pub/Sub',
    description: 'Subscribe to a Google Cloud Pub/Sub topic for log ingestion',
    command: 'from "gcps://my-project/my-subscription" { read_json } | import',
    hasPlaceholders: true,
    matchKeys: ['gcps://', 'google_cloud_pubsub', 'pubsub'],
    category: 'ingest',
  },
  {
    label: 'Azure Event Hub',
    description: 'Consume events from Azure Event Hubs via Kafka endpoint',
    command: 'let $options = { "bootstrap.servers": "<namespace>.servicebus.windows.net:9093", "security.protocol": "SASL_SSL", "sasl.mechanism": "PLAIN", "sasl.username": "$ConnectionString", "sasl.password": "<connection-string>" }\nfrom_kafka "<topic>", options=$options | import',
    hasPlaceholders: true,
    matchKeys: ['azure', 'event_hub', 'servicebus'],
    category: 'ingest',
  },
  {
    label: 'Suricata EVE',
    description: 'Ingest Suricata IDS alerts from eve.json',
    command: 'load_file "/var/log/suricata/eve.json", follow=true | read_json | where #schema == "suricata.alert" | import',
    hasPlaceholders: true,
    matchKeys: ['suricata', 'eve.json'],
    category: 'ingest',
  },
  {
    label: 'Zeek Logs',
    description: 'Ingest Zeek/Bro network monitoring logs',
    command: 'from_file "/opt/zeek/logs/current/*.log" | read_zeek_tsv | import',
    hasPlaceholders: true,
    matchKeys: ['zeek', 'read_zeek_tsv', 'bro'],
    category: 'ingest',
  },
];

const PipelinesPage = () => {

  usePageMeta({
    title: 'Pipelines',
    description: 'Configure Tenzir detection pipelines and data ingestion.',
    url: '/detection/pipelines',
  });
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [envFilter, setEnvFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newCommand, setNewCommand] = useState('');
  const [newEnvId, setNewEnvId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
  const [showAiSection, setShowAiSection] = useState(false);
  const [preAiCommand, setPreAiCommand] = useState<string | null>(null);

  // Detail dialog
  const [detailPipeline, setDetailPipeline] = useState<Pipeline | null>(null);

  // Editing: tracks the pipeline being edited (delete old + create new)
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);

  // Action loading
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Optimistic pipelines (pending creation)
  const [pendingPipelines, setPendingPipelines] = useState<Pipeline[]>([]);

  // Dynamic webhook URL for Sigma template
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  // Auto-select best environment when create dialog opens
  useEffect(() => {
    if (createOpen && !newEnvId && environments.length > 0) {
      const nonCloud = environments.filter(e => e.Type !== 'cloud');
      const now = Math.floor(Date.now() / 1000);
      const running = nonCloud.find(e => e.checkin > 0 && (now - e.checkin) < 300);
      const first = nonCloud[0];
      setNewEnvId(running?.id || first?.id || '');
    }
  }, [createOpen, environments]);

  const fetchEnvironments = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch environments, triggers (pipelines), and workflows in parallel
      const [envResponse, triggersResponse, workflowsResponse] = await Promise.all([
        fetch(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        }),
        fetch(getApiUrl('/api/v1/triggers'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        }),
        fetch(getApiUrl('/api/v1/workflows'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        }),
      ]);

      if (!envResponse.ok) throw new Error('Failed to fetch environments');

      const envData: Environment[] = await envResponse.json();
      const active = envData.filter(e => !e.archived);
      setEnvironments(active);

      // Build environment lookup for enrichment
      const envMap = new Map(active.map(e => [e.id, e]));

      // Extract pipelines from /api/v1/triggers response
      const allPipelines: Pipeline[] = [];

      if (triggersResponse.ok) {
        const triggersData = await triggersResponse.json();
        const rawPipelines = triggersData?.pipelines || triggersData?.Pipelines || [];
        const pList = Array.isArray(rawPipelines) ? rawPipelines : (typeof rawPipelines === 'object' ? Object.values(rawPipelines) : []);

        console.log('[PipelinesPage] Triggers API returned', pList.length, 'pipelines');

        for (const p of pList) {
          if (p && typeof p === 'object') {
            const envId = p.environment_id || p._environmentId || '';
            const env = envMap.get(envId);
            allPipelines.push({
              ...p,
              pipeline: p.pipeline || p.id || p.name || '',
              _environmentId: envId,
              _environmentName: env?.Name || p.environment || p._environmentName || 'Unknown',
            });
          } else if (typeof p === 'string') {
            allPipelines.push({
              pipeline: p,
              definition: p,
              _environmentId: '',
              _environmentName: 'Unknown',
            });
          }
        }
      } else {
        console.warn('[PipelinesPage] Triggers API failed, falling back to getenvironments data_lake');
        // Fallback: extract from data_lake.pipelines in environments
        for (const env of active) {
          const raw = env.data_lake?.pipelines;
          if (!raw) continue;
          const pList = Array.isArray(raw) ? raw : (typeof raw === 'object' ? Object.values(raw) : []);
          for (const p of pList) {
            if (typeof p === 'string') {
              allPipelines.push({ pipeline: p, definition: p, _environmentId: env.id, _environmentName: env.Name });
            } else if (p && typeof p === 'object') {
              allPipelines.push({ ...p, pipeline: p.pipeline || p.id || p.name || '', _environmentId: env.id, _environmentName: env.Name });
            }
          }
        }
      }

      console.log('[PipelinesPage] Total pipelines found:', allPipelines.length);
      setPipelines(allPipelines);

      // Extract webhook URL from "Ingestion Webhook" workflow
      if (workflowsResponse.ok) {
        try {
          const workflows = await workflowsResponse.json();
          const workflowList = Array.isArray(workflows) ? workflows : (workflows.workflows || []);
          const webhookWorkflow = workflowList.find((w: any) => w.name === 'Ingestion Webhook');
          if (webhookWorkflow) {
            const webhookTrigger = (webhookWorkflow.triggers || []).find(
              (t: any) => t.trigger_type === 'WEBHOOK' || t.app_name === 'Webhook'
            );
            if (webhookTrigger) {
              const webhookId = webhookTrigger.id || webhookTrigger.trigger_id;
              if (webhookId) {
                setWebhookUrl(getApiUrl(`/api/v1/hooks/webhook_${webhookId}`));
              }
            }
          }
        } catch { /* ignore workflow parse errors */ }
      }
    } catch (error) {
      console.error('Failed to fetch pipelines:', error);
      toast.error('Failed to load pipelines');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  // Check if at least one valid (non-cloud, running) sensor exists
  const now = Math.floor(Date.now() / 1000);
  const hasValidSensor = environments.some(e => e.Type !== 'cloud' && e.checkin > 0 && (now - e.checkin) < 300);

  const getStateColor = (state?: string): 'success' | 'error' | 'warning' | 'default' => {
    if (!state) return 'default';
    const s = state.toLowerCase();
    if (s === 'running' || s === 'active' || s === 'started') return 'success';
    if (s === 'stopped' || s === 'failed' || s === 'error') return 'error';
    if (s === 'paused' || s === 'stopping') return 'warning';
    return 'default';
  };

  const getStateLabel = (p: Pipeline): string => {
    if (p.state) return p.state;
    // Infer from start_time or started_at
    if (p.started_at || (p.start_time && p.start_time > 0)) return 'running';
    return 'unknown';
  };

  const getPipelineLabel = (p: Pipeline): string => {
    // Return full name/definition — CSS handles truncation
    if (p.name) return p.name;
    return p.definition || p.command || p.pipeline || 'Unnamed Pipeline';
  };

  const handleAction = async (pipeline: Pipeline, action: 'start' | 'stop' | 'delete') => {
    const id = pipeline.id || pipeline.pipeline || '';
    setActionLoading(prev => ({ ...prev, [id]: true }));

    // Capture original timestamps to detect changes
    const originalStartedAt = pipeline.started_at || '';
    const originalLastModified = pipeline.last_modified || 0;

    try {
      const env = environments.find(e => e.id === pipeline._environmentId);
      const apiType = action === 'delete' ? 'stop' : action;
      const response = await fetch(getApiUrl('/api/v1/triggers/pipeline'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: id,
          name: pipeline.name || pipeline.definition || '',
          type: apiType,
          command: pipeline.definition || pipeline.command || '',
          environment: env?.Name || pipeline._environmentName,
        }),
      });

      if (response.ok) {
        if (action === 'start') {
          // Poll until started_at or last_modified changes, timeout after 60s
          toast.success('Starting pipeline...');
          const maxAttempts = 30;
          let attempt = 0;
          const definition = (pipeline.definition || pipeline.command || '').toLowerCase().substring(0, 40);
          const poll = async () => {
            while (attempt < maxAttempts) {
              await new Promise(r => setTimeout(r, 2000));
              attempt++;
              try {
                const res = await fetch(getApiUrl('/api/v1/triggers'), {
                  credentials: 'include',
                  headers: { ...getAuthHeader() },
                });
                if (res.ok) {
                  const data = await res.json();
                  const rawPipelines = data?.pipelines || data?.Pipelines || [];
                  const pList = Array.isArray(rawPipelines) ? rawPipelines : Object.values(rawPipelines);
                  const match = (pList as any[]).find((p: any) => {
                    const cmd = (p.definition || p.command || p.name || '').toLowerCase();
                    return cmd.includes(definition) && (p.pipeline || p.id) === id;
                  });
                  if (match) {
                    const stateStr = (match.state || '').toLowerCase();
                    const newStartedAt = match.started_at || '';
                    const newLastModified = match.last_modified || 0;
                    if (newStartedAt !== originalStartedAt || newLastModified !== originalLastModified ||
                        stateStr === 'running' || stateStr === 'active' || stateStr === 'started') {
                      await fetchEnvironments();
                      toast.success('Pipeline started');
                      setActionLoading(prev => ({ ...prev, [id]: false }));
                      return;
                    }
                    if (stateStr === 'failed' || stateStr === 'error') {
                      await fetchEnvironments();
                      toast.error('Pipeline failed to start');
                      setActionLoading(prev => ({ ...prev, [id]: false }));
                      return;
                    }
                  }
                }
              } catch { /* continue polling */ }
            }
            await fetchEnvironments();
            toast.error('Pipeline start timed out — check status manually');
            setActionLoading(prev => ({ ...prev, [id]: false }));
          };
          poll();
          return;
        } else if (action === 'delete') {
          // Poll until pipeline disappears from list, timeout after 60s
          toast.success('Deleting pipeline...');
          const maxAttempts = 30;
          let attempt = 0;
          const pollDelete = async () => {
            while (attempt < maxAttempts) {
              await new Promise(r => setTimeout(r, 2000));
              attempt++;
              try {
                const res = await fetch(getApiUrl('/api/v1/triggers'), {
                  credentials: 'include',
                  headers: { ...getAuthHeader() },
                });
                if (res.ok) {
                  const data = await res.json();
                  const rawPipelines = data?.pipelines || data?.Pipelines || [];
                  const pList = Array.isArray(rawPipelines) ? rawPipelines : Object.values(rawPipelines);
                  const stillExists = (pList as any[]).some((p: any) => (p.pipeline || p.id) === id);
                  if (!stillExists) {
                    await fetchEnvironments();
                    toast.success('Pipeline deleted');
                    setActionLoading(prev => ({ ...prev, [id]: false }));
                    return;
                  }
                }
              } catch { /* continue polling */ }
            }
            await fetchEnvironments();
            toast.error('Pipeline delete timed out — check status manually');
            setActionLoading(prev => ({ ...prev, [id]: false }));
          };
          pollDelete();
          return;
        } else {
          toast.success('Pipeline stopped');
          setTimeout(() => fetchEnvironments(), 2000);
        }
      } else {
        const text = await response.text();
        toast.error(`Failed to ${action} pipeline: ${text.substring(0, 80)}`);
      }
    } catch (error) {
      console.error(`Error ${action}ing pipeline:`, error);
      toast.error(`Error ${action}ing pipeline`);
    }
    setActionLoading(prev => ({ ...prev, [id]: false }));
  };

  const handleCreate = async () => {
    if (!newCommand.trim()) {
      toast.error('Enter a pipeline command');
      return;
    }
    if (!newEnvId) {
      toast.error('Select an environment');
      return;
    }

    setIsCreating(true);
    const isEdit = !!editingPipeline;

    try {
      const env = environments.find(e => e.id === newEnvId);
      const envName = env?.Name || '';

      // If editing, delete the old pipeline first
      if (isEdit && editingPipeline) {
        const oldEnv = environments.find(e => e.id === editingPipeline._environmentId);
        await fetch(getApiUrl('/api/v1/triggers/pipeline'), {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
           body: JSON.stringify({
             id: editingPipeline.id || editingPipeline.pipeline || '',
             name: editingPipeline.name || editingPipeline.definition || '',
             type: 'stop',
             command: editingPipeline.definition || editingPipeline.command || '',
             environment: oldEnv?.Name || editingPipeline._environmentName,
           }),
        });
      }

      // Add optimistic pipeline
      const optimisticId = `pending-${Date.now()}`;
      const optimisticPipeline: Pipeline = {
        pipeline: optimisticId,
        name: newCommand.length > 60 ? newCommand.substring(0, 57) + '...' : newCommand,
        definition: newCommand,
        command: newCommand,
        state: 'creating',
        _environmentId: newEnvId,
        _environmentName: envName,
      };

      // If editing, remove the old pipeline from the list immediately
      if (isEdit && editingPipeline) {
        const oldId = editingPipeline.pipeline || editingPipeline.id || '';
        setPipelines(prev => prev.filter(p => (p.pipeline || p.id || '') !== oldId));
      }

      setPendingPipelines(prev => [...prev, optimisticPipeline]);
      setCreateOpen(false);
      setNewCommand('');
      setNewEnvId('');
      setEditingPipeline(null);

      const response = await fetch(getApiUrl('/api/v1/triggers/pipeline'), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: newCommand,
          name: newCommand,
          type: 'create',
          environment: envName,
          workflow_id: '',
          trigger_id: '',
          start_node: '',
        }),
      });

      if (response.ok) {
        toast.success(isEdit ? 'Pipeline updated — verifying startup...' : 'Pipeline created — verifying startup...');

        // Poll to verify the pipeline actually started
        const verifyStartup = async () => {
          const startedAt = Date.now();
          const TIMEOUT_MS = 60_000;
          const POLL_INTERVAL = 5_000;

          while (Date.now() - startedAt < TIMEOUT_MS) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL));

            try {
              const checkRes = await fetch(getApiUrl('/api/v1/triggers'), {
                credentials: 'include',
                headers: { ...getAuthHeader() },
              });

              if (checkRes.ok) {
                const checkData = await checkRes.json();
                const pList = checkData?.pipelines || checkData?.Pipelines || [];
                const pArr = Array.isArray(pList) ? pList : Object.values(pList);

                // Look for a pipeline matching our command in the target environment
                const match = (pArr as any[]).find((p: any) => {
                  const cmd = (p.definition || p.command || p.name || '').toLowerCase();
                  return cmd.includes(newCommand.substring(0, 40).toLowerCase());
                });

                if (match) {
                  const state = (match.state || '').toLowerCase();
                  if (state === 'running' || state === 'active' || state === 'started') {
                    // Success — pipeline is running
                    setPendingPipelines(prev => prev.filter(p => p.pipeline !== optimisticId));
                    fetchEnvironments();
                    return;
                  }
                  if (state === 'failed' || state === 'error' || state === 'stopped') {
                    // Explicit failure
                    toast.error('Pipeline failed to start. The command may be invalid or use unsupported syntax.');
                    setPendingPipelines(prev => prev.filter(p => p.pipeline !== optimisticId));
                    fetchEnvironments();
                    return;
                  }
                }
              }
            } catch {
              // Ignore poll errors, keep trying
            }
          }

          // Timeout reached — pipeline never confirmed running
          toast.error(
            'Pipeline did not start within 60 seconds. It may contain invalid syntax or use unsupported operators. Check your Tenzir command and try again.',
            { duration: 10000 }
          );
          setPendingPipelines(prev => prev.filter(p => p.pipeline !== optimisticId));
          fetchEnvironments();
        };

        verifyStartup();
      } else {
        const text = await response.text();
        toast.error(`Failed to ${isEdit ? 'update' : 'create'}: ${text.substring(0, 80)}`);
        setPendingPipelines(prev => prev.filter(p => p.pipeline !== optimisticId));
        // On edit failure, refresh to restore old state
        if (isEdit) fetchEnvironments();
      }
    } catch (error) {
      console.error('Error creating pipeline:', error);
      toast.error(`Error ${isEdit ? 'updating' : 'creating'} pipeline`);
      setPendingPipelines([]);
      if (isEdit) fetchEnvironments();
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateFromAI = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Describe what you want the pipeline to do');
      return;
    }
    setIsGenerating(true);
    try {
      const { success, result, error } = await askAI({
        query: `Generate a Tenzir pipeline command for the following use case. Only output the pipeline command, no explanation or markdown formatting. Use Tenzir pipeline syntax (operators separated by |). Here are some examples of valid commands:
- load_tcp "0.0.0.0:1514" { read_syslog } | import
- load_udp "0.0.0.0:1514", insert_newlines=true | read_syslog | import
- export live=true | sigma "/tmp/sigma_rules" | set uid = uuid() | set source = "Tenzir" | to "http://example.com/webhook"
- export live=true | to_opensearch "localhost:9200", action="create", index="shuffle_logs", user="admin", passwd="PASSWORD"

Use case: ${aiPrompt}`,
      });
      if (success && result) {
        const cleaned = result.replace(/^```[^\n]*\n?/i, '').replace(/\n?```$/i, '').trim();
        setPreAiCommand(newCommand);
        setNewCommand(cleaned);
        setJustGenerated(true);
        setTimeout(() => setJustGenerated(false), 3000);
        toast.success('Pipeline command generated');
      } else {
        toast.error(error || 'Failed to generate pipeline command');
      }
    } catch (e) {
      console.error('AI generation error:', e);
      toast.error('Failed to generate pipeline command');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
    } catch {}
    toast.success('Copied to clipboard');
  };

  const openEditDialog = (pipeline: Pipeline) => {
    setEditingPipeline(pipeline);
    setNewCommand(pipeline.definition || pipeline.command || pipeline.pipeline || '');
    setNewEnvId(pipeline._environmentId);
    setDetailPipeline(null);
    setCreateOpen(true);
  };

  const formatTime = (ts?: number | string) => {
    if (!ts) return '—';
    // Handle ISO string (e.g. "2026-03-05T09:38:37.484868410Z")
    if (typeof ts === 'string') {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    }
    // Handle numeric timestamps
    let ms: number;
    if (ts > 1e15) {
      ms = ts / 1e6;
    } else if (ts > 1e12) {
      ms = ts / 1e3;
    } else if (ts > 1e10) {
      ms = ts;
    } else {
      ms = ts * 1000;
    }
    const date = new Date(ms);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  // Resolve dynamic webhook URLs in templates
  const availableTemplates = DEFAULT_PIPELINES.map(t => {
    if (t._dynamicWebhook && webhookUrl) {
      return { ...t, command: `export live=true | sigma "/tmp/sigma_rules" | set uid = uuid() | set source = "Tenzir" | to "${webhookUrl}"`, hasPlaceholders: false };
    }
    if (t._dynamicWebhook && !webhookUrl) {
      return { ...t, command: 'export live=true | sigma "/tmp/sigma_rules" | set uid = uuid() | set source = "Tenzir" | to "<enable webhook on Incidents page>"', hasPlaceholders: true };
    }
    return t;
  });

  // Filtering
  const uniqueStates = [...new Set(pipelines.map(p => getStateLabel(p)))].sort();
  const uniqueEnvs = [...new Set(pipelines.map(p => p._environmentName))].sort();

  const filtered = [...pendingPipelines, ...pipelines].filter(p => {
    const label = getPipelineLabel(p).toLowerCase();
    const def = (p.definition || p.command || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || label.includes(q) || def.includes(q);
    const matchEnv = envFilter === 'all' || p._environmentName === envFilter;
    const matchState = stateFilter === 'all' || getStateLabel(p) === stateFilter;
    return matchSearch && matchEnv && matchState;
  });

  const isSensorRunning = (envId: string): boolean => {
    const env = environments.find(e => e.id === envId);
    if (!env) return false;
    if (env.Type === 'cloud') return true;
    const now = Math.floor(Date.now() / 1000);
    return env.checkin > 0 && (now - env.checkin) < 300;
  };

  return (
    <Box sx={{ p: 4, maxWidth: 1400, width: '100%', mx: 'auto' }}>
      {/* Webhook status */}
      <Box sx={{ mb: 3 }}>
        <WebhookStatusBanner />
      </Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <StorageIcon size={28} style={{ color: '#FF6600' }} />
            <Typography variant="h4" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>
              Tenzir Pipelines
            </Typography>
            
          </Box>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Lightweight detection infrastructure — ingest, match, and forward security events without heavy tooling
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Tooltip title="Refresh">
            <IconButton
              onClick={() => { setIsLoading(true); fetchEnvironments(); }}
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1,
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))',
                '&:hover': {
                  backgroundColor: 'hsl(var(--muted))',
                },
              }}
            >
              <RefreshIcon size={20} />
            </IconButton>
          </Tooltip>
          <Tooltip title={hasValidSensor ? '' : 'A running sensor is required. Set one up on the Detection page first.'}>
            <span>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateOpen(true)}
                disabled={!hasValidSensor}
                sx={{
                  height: 36,
                  backgroundColor: 'hsl(var(--primary))',
                  textTransform: 'none',
                  fontWeight: 600,
                  '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)' },
                  '&.Mui-disabled': { bgcolor: 'hsla(var(--muted-foreground) / 0.2)', color: 'hsl(var(--muted-foreground))' },
                }}
              >
                New Pipeline
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* No sensor warning */}
      {!isLoading && !hasValidSensor && (
        <Box sx={{
          mb: 3,
          p: 2,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          backgroundColor: 'hsla(var(--primary) / 0.08)',
          border: '1px solid hsla(var(--primary) / 0.2)',
        }}>
          <WarningAmberIcon size={20} style={{ color: 'hsl(var(--primary))' }} />
          <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', flex: 1 }}>
            No Log Ingestion is running. Set one up first to create detection pipelines.
          </Typography>
          <Button
            component={Link}
            to="/detection"
            size="small"
            sx={{ textTransform: 'none', fontWeight: 600, color: 'hsl(var(--primary))' }}
          >
            Go to Detection Setup →
          </Button>
        </Box>
      )}

      {/* Filters — only show when there are pipelines */}
      {pipelines.length > 0 && <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="Search pipelines..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{
            minWidth: 260,
            '& .MuiOutlinedInput-root': {
              height: 36,
              backgroundColor: 'hsl(var(--muted))',
              '& fieldset': { borderColor: 'hsl(var(--border))' },
              '&:hover fieldset': { borderColor: 'hsl(var(--border))' },
              '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
            },
            '& .MuiOutlinedInput-input': {
              color: 'hsl(var(--foreground))',
              '&::placeholder': { color: 'hsl(var(--muted-foreground))', opacity: 1 },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </InputAdornment>
            ),
          }}
        />

        <Chip
          label={`${filtered.length} pipeline${filtered.length !== 1 ? 's' : ''}`}
          size="small"
          sx={{
            height: 24,
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: 'hsl(var(--muted))',
            color: 'hsl(var(--muted-foreground))',
            border: '1px solid hsl(var(--border))',
          }}
        />

        {uniqueEnvs.length > 1 && (
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel sx={{ color: 'hsl(var(--muted-foreground))' }}>Environment</InputLabel>
            <MuiSelect
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              label="Environment"
              sx={{
                height: 36,
                color: 'hsl(var(--foreground))',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
              }}
            >
              <MenuItem value="all">All Environments</MenuItem>
              {uniqueEnvs.map(e => (
                <MenuItem key={e} value={e}>{e}</MenuItem>
              ))}
            </MuiSelect>
          </FormControl>
        )}

        {uniqueStates.length > 1 && (
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel sx={{ color: 'hsl(var(--muted-foreground))' }}>Status</InputLabel>
            <MuiSelect
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              label="Status"
              sx={{
                height: 36,
                color: 'hsl(var(--foreground))',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
              }}
            >
              <MenuItem value="all">All</MenuItem>
              {uniqueStates.map(s => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </MuiSelect>
          </FormControl>
        )}
      </Box>}

      {/* Syslog endpoint info — shown when TCP/UDP pipelines are running and env has running_ip */}
      {!isLoading && (() => {
        // Find running syslog pipelines
        const runningSyslog: { protocol: string; port: string; ip: string; envName: string }[] = [];
        for (const p of pipelines) {
          const state = getStateLabel(p).toLowerCase();
          if (state !== 'running' && state !== 'active' && state !== 'started') continue;
          const def = (p.definition || p.command || '').toLowerCase();
          const env = environments.find(e => e.id === p._environmentId);
          if (!env?.running_ip) continue;

          // Match TCP syslog: load_tcp with port
          const tcpMatch = def.match(/load_tcp\s+"[^"]*:(\d+)"/);
          if (tcpMatch) {
            runningSyslog.push({ protocol: 'TCP', port: tcpMatch[1], ip: env.running_ip, envName: env.Name });
          }
          // Match UDP syslog: load_udp with port
          const udpMatch = def.match(/load_udp\s+"[^"]*:(\d+)"/);
          if (udpMatch) {
            runningSyslog.push({ protocol: 'UDP', port: udpMatch[1], ip: env.running_ip, envName: env.Name });
          }
        }
        if (runningSyslog.length === 0) return null;
        return (
          <Box sx={{
            mb: 3,
            p: 2.5,
            borderRadius: 2,
            bgcolor: 'hsla(var(--severity-low) / 0.08)',
            border: '1px solid hsla(var(--severity-low) / 0.25)',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box sx={{
                width: 8, height: 8, borderRadius: '50%',
                bgcolor: 'hsl(var(--severity-low))',
                boxShadow: '0 0 6px hsl(var(--severity-low))',
              }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                Syslog ingestion is active — send logs to:
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {runningSyslog.map((s, i) => (
                <Box
                  key={i}
                  onClick={() => {
                    copyToClipboard(`${s.ip}:${s.port}`);
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1,
                    borderRadius: 1.5,
                    bgcolor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      borderColor: 'hsl(var(--severity-low))',
                      bgcolor: 'hsla(var(--severity-low) / 0.05)',
                    },
                  }}
                >
                  <Chip
                    label={s.protocol}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      bgcolor: s.protocol === 'TCP' ? 'hsla(var(--primary) / 0.12)' : 'hsla(var(--severity-medium) / 0.12)',
                      color: s.protocol === 'TCP' ? 'hsl(var(--primary))' : 'hsl(var(--severity-medium))',
                      border: `1px solid ${s.protocol === 'TCP' ? 'hsla(var(--primary) / 0.3)' : 'hsla(var(--severity-medium) / 0.3)'}`,
                    }}
                  />
                  <Typography sx={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    color: 'hsl(var(--foreground))',
                    letterSpacing: '0.02em',
                  }}>
                    {s.ip}:{s.port}
                  </Typography>
                  <Tooltip title="Click to copy" placement="top">
                    <ContentCopyIcon size={14} style={{ color: 'hsl(var(--muted-foreground))', opacity: 0.6 }} />
                  </Tooltip>
                  <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                    {s.envName}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        );
      })()}

      {/* Table */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
          <CircularProgress sx={{ color: '#FF6600' }} />
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.9rem' }}>
            No pipelines found
          </Typography>
        </Box>
      ) : (
        <Box sx={{
          border: '1px solid hsl(var(--border))',
          borderRadius: 1.5,
          overflow: 'hidden',
        }}>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium text-xs" style={{ width: '45%', maxWidth: 0 }}>Pipeline</TableHead>
                <TableHead className="text-muted-foreground font-medium text-xs w-[20%]">Environment</TableHead>
                <TableHead className="text-muted-foreground font-medium text-xs w-[10%]">Status</TableHead>
                <TableHead className="text-muted-foreground font-medium text-xs w-[25%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p, idx) => {
                const id = p.pipeline || p.id || `p-${idx}`;
                const state = getStateLabel(p);
                const isPending = state === 'creating';
                const isRunning = state === 'running' || state === 'active' || state === 'started';
                const loading = actionLoading[id];
                const definition = p.definition || p.command || p.pipeline || '';

                return (
                  <TableRow
                    key={`${p._environmentId}-${id}-${idx}`}
                    className="border-b border-border cursor-pointer hover:bg-muted/50"
                    onClick={() => !isPending && setDetailPipeline(p)}
                    style={isPending ? { opacity: 0.6 } : undefined}
                  >
                    <TableCell className="py-3" style={{ maxWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {isPending && <CircularProgress size={14} sx={{ color: '#FF6600', flexShrink: 0 }} />}
                        <Box sx={{ overflow: 'hidden', minWidth: 0 }}>
                          <Typography sx={{
                            color: 'hsl(var(--foreground))',
                            fontSize: '0.8rem',
                            fontFamily: 'monospace',
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%',
                          }}>
                            {definition}
                          </Typography>
                          {isPending ? (
                            <Typography sx={{ color: '#FF6600', fontSize: '0.75rem', mt: 0.25 }}>
                              Deploying...
                            </Typography>
                          ) : (p.started_at || p.start_time) ? (
                            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', mt: 0.25 }}>
                              Started {formatTime(p.started_at || p.start_time)}
                            </Typography>
                          ) : null}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{
                          width: 6, height: 6, borderRadius: '50%',
                          backgroundColor: isPending
                            ? '#FF6600'
                            : isSensorRunning(p._environmentId)
                              ? 'hsl(var(--success, 142 76% 36%))'
                              : 'hsl(var(--muted-foreground))',
                        }} />
                        <Typography sx={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem' }}>
                          {p._environmentName}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {isPending ? (
                        <Chip
                          label="creating"
                          size="small"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, borderColor: 'rgba(255, 102, 0, 0.4)', color: '#FF6600' }}
                        />
                      ) : (
                        <Chip
                          label={state}
                          size="small"
                          color={getStateColor(state)}
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, textTransform: 'capitalize' }}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isPending ? (
                        <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem', fontStyle: 'italic' }}>
                          Validating...
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                          {loading ? (
                            <CircularProgress size={18} sx={{ color: 'hsl(var(--muted-foreground))' }} />
                          ) : (
                            <>
                              {isRunning ? (
                                <Tooltip title="Stop">
                                  <IconButton size="small" onClick={() => handleAction(p, 'stop')} sx={{ color: 'hsl(var(--destructive, 0 84% 60%))' }}>
                                    <StopIcon size={20} />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Tooltip title="Start">
                                  <IconButton size="small" onClick={() => handleAction(p, 'start')} sx={{ color: 'hsl(142 76% 36%)' }}>
                                    <PlayArrowIcon size={20} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Tooltip title="Edit">
                                <IconButton size="small" onClick={() => openEditDialog(p)} sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: '#FF6600' } }}>
                                  <EditIcon size={14} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Copy command">
                                <IconButton size="small" onClick={() => copyToClipboard(definition)} sx={{ color: 'hsl(var(--muted-foreground))' }}>
                                  <ContentCopyIcon size={14} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton size="small" onClick={() => handleAction(p, 'delete')} sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--destructive, 0 84% 60%))' } }}>
                                  <DeleteIcon size={16} />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Templates — grouped by category */}
      {!isLoading && availableTemplates.length > 0 && (
        <Box sx={{ mt: pipelines.length > 0 ? 6 : 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(['ingest', 'detect', 'forward'] as PipelineTemplateCategory[]).map((cat) => {
            const templates = availableTemplates.filter(t => t.category === cat);
            if (templates.length === 0) return null;
            const meta = TEMPLATE_CATEGORY_META[cat];
            return (
              <Box key={cat}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                  <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {meta.label}
                  </Typography>
                  <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem', opacity: 0.7 }}>
                    — {meta.description}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {templates.map((dp) => {
                    // Check if a deployed pipeline closely matches this template
                    const isDeployed = pipelines.some(p => {
                      const cmd = (p.definition || p.command || p.name || '').toLowerCase();
                      return dp.matchKeys.some(k => cmd.includes(k.toLowerCase()));
                    });
                    const deployedAndRunning = isDeployed && pipelines.some(p => {
                      const cmd = (p.definition || p.command || p.name || '').toLowerCase();
                      const matches = dp.matchKeys.some(k => cmd.includes(k.toLowerCase()));
                      if (!matches) return false;
                      const state = (p.state || getStateLabel(p)).toLowerCase();
                      return state === 'running' || state === 'active' || state === 'started';
                    });

                    return (
                      <Box
                        key={dp.label}
                        onClick={() => {
                          setNewCommand(dp.command);
                          setCreateOpen(true);
                        }}
                        sx={{
                          border: deployedAndRunning
                            ? '1px solid hsl(var(--severity-low))'
                            : dp.recommended
                              ? '1px solid hsl(var(--primary) / 0.6)'
                              : '1px solid hsl(var(--border))',
                          borderRadius: 1.5,
                          px: 1.5,
                          py: 1.25,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          bgcolor: deployedAndRunning
                            ? 'hsl(var(--severity-low) / 0.08)'
                            : 'transparent',
                          '&:hover': {
                            borderColor: deployedAndRunning ? 'hsl(var(--severity-low))' : 'hsl(var(--primary))',
                            backgroundColor: deployedAndRunning ? 'hsl(var(--severity-low) / 0.14)' : 'hsl(var(--primary) / 0.08)',
                          },
                        }}
                      >
                        <RocketLaunchIcon size={14} style={{ color: deployedAndRunning ? 'hsl(var(--severity-low))' : dp.recommended ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                        <Typography sx={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontWeight: (dp.recommended || deployedAndRunning) ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {dp.label}
                        </Typography>
                        {deployedAndRunning && (
                          <Chip
                            label="Running"
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              bgcolor: 'hsl(var(--severity-low) / 0.14)',
                              color: 'hsl(var(--severity-low))',
                              border: '1px solid hsl(var(--severity-low) / 0.4)',
                              '& .MuiChip-label': { px: 0.75 },
                            }}
                          />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Create Pipeline Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); setEditingPipeline(null); setPreAiCommand(null); setJustGenerated(false); }}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, fontSize: '1.1rem' }}>
          {editingPipeline ? 'Edit Pipeline' : 'Create Pipeline'}
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <FormControl fullWidth size="small" sx={{ mb: 3 }}>
            <InputLabel sx={{ color: 'hsl(var(--muted-foreground))' }}>Environment</InputLabel>
            <MuiSelect
              value={newEnvId}
              onChange={(e) => setNewEnvId(e.target.value)}
              label="Environment"
              sx={{
                color: 'hsl(var(--foreground))',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
              }}
            >
              {environments.filter(e => e.Type !== 'cloud').map(e => (
                <MenuItem key={e.id} value={e.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{
                      width: 6, height: 6, borderRadius: '50%',
                      backgroundColor: isSensorRunning(e.id)
                        ? 'hsl(142 76% 36%)'
                        : 'hsl(var(--muted-foreground))',
                    }} />
                    {e.Name}
                  </Box>
                </MenuItem>
              ))}
            </MuiSelect>
          </FormControl>

          {/* Pipeline Command with AI button top-right */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', fontWeight: 500 }}>
              Pipeline Command
            </Typography>
            <Button
              size="small"
              startIcon={<AutoFixHighIcon style={{ fontSize: '14px !important' }} />}
              onClick={() => setShowAiSection(s => !s)}
              sx={{
                textTransform: 'none',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: showAiSection ? 'hsl(var(--muted-foreground))' : '#FF6600',
                py: 0.25,
                px: 1,
                minHeight: 0,
              }}
            >
              {showAiSection ? 'Close AI' : 'Generate with AI'}
            </Button>
          </Box>

          {showAiSection && (
            <Box sx={{
              border: '1px solid hsl(var(--border))',
              borderRadius: 1.5,
              p: 1.5,
              mb: 1.5,
              backgroundColor: 'rgba(255, 102, 0, 0.03)',
            }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  placeholder="e.g. Ingest Windows event logs over TCP and forward matches to OpenSearch"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  fullWidth
                  size="small"
                  autoFocus
                  disabled={isGenerating}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerateFromAI(); } }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      height: 36,
                      backgroundColor: 'hsl(var(--muted))',
                      fontSize: '0.8rem',
                      '& fieldset': { borderColor: 'hsl(var(--border))' },
                    },
                    '& .MuiOutlinedInput-input': {
                      color: 'hsl(var(--foreground))',
                      '&::placeholder': { color: 'hsl(var(--muted-foreground))', opacity: 1 },
                    },
                  }}
                />
                <Button
                  onClick={handleGenerateFromAI}
                  disabled={isGenerating || !aiPrompt.trim()}
                  variant="outlined"
                  size="small"
                  sx={{
                    minWidth: 90,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    borderColor: 'rgba(255, 102, 0, 0.3)',
                    color: '#FF6600',
                    '&:hover': { borderColor: '#FF6600', backgroundColor: 'rgba(255, 102, 0, 0.06)' },
                  }}
                >
                  {isGenerating ? <CircularProgress size={16} sx={{ color: '#FF6600' }} /> : 'Generate'}
                </Button>
              </Box>
            </Box>
          )}

          <TextField
            placeholder='e.g. load_tcp "0.0.0.0:1514" { read_syslog } | import'
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            fullWidth
            multiline
            minRows={4}
            maxRows={20}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'hsl(var(--muted))',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                '& fieldset': { borderColor: justGenerated ? 'rgba(255, 102, 0, 0.6)' : 'hsl(var(--border))' },
                transition: 'border-color 0.3s',
              },
              '& .MuiOutlinedInput-input': { color: 'hsl(var(--foreground))' },
            }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            {justGenerated && (
              <Chip
                label="✓ AI Generated"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(255, 102, 0, 0.12)',
                  color: '#FF6600',
                  border: '1px solid rgba(255, 102, 0, 0.3)',
                }}
              />
            )}
            {preAiCommand !== null && (
              <Chip
                label="↩ Undo AI changes"
                size="small"
                onClick={() => {
                  setNewCommand(preAiCommand);
                  setPreAiCommand(null);
                  setJustGenerated(false);
                }}
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: 'hsl(var(--muted))',
                  color: 'hsl(var(--muted-foreground))',
                  border: '1px solid hsl(var(--border))',
                  '&:hover': { borderColor: '#FF6600', color: '#FF6600' },
                }}
              />
            )}
          </Box>

          {newEnvId && !isSensorRunning(newEnvId) && (
            <Alert severity="warning" sx={{ mt: 2, bgcolor: 'transparent', border: '1px solid rgba(255,152,0,0.3)', color: 'hsl(var(--foreground))' }}>
              Selected sensor is not running. Pipeline may not start.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setCreateOpen(false); setEditingPipeline(null); setPreAiCommand(null); setJustGenerated(false); }} sx={{ color: 'hsl(var(--muted-foreground))', textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !newCommand.trim() || !newEnvId}
            variant="contained"
            sx={{ bgcolor: '#FF6600', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#e55b00' } }}
          >
            {isCreating ? <CircularProgress size={18} color="inherit" /> : editingPipeline ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog
        open={!!detailPipeline}
        onClose={() => setDetailPipeline(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
          },
        }}
      >
        {detailPipeline && (() => {
          const state = getStateLabel(detailPipeline);
          const definition = detailPipeline.definition || detailPipeline.command || detailPipeline.pipeline || '';
          return (
            <>
              <DialogTitle sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <StorageIcon style={{ color: '#FF6600' }} />
                Pipeline Details
                <Chip
                  label={state}
                  size="small"
                  color={getStateColor(state)}
                  variant="outlined"
                  sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, textTransform: 'capitalize', ml: 'auto' }}
                />
              </DialogTitle>
              <DialogContent>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mb: 3 }}>
                  <Box>
                    <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', fontWeight: 600, mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Name
                    </Typography>
                    <Typography sx={{ color: 'hsl(var(--foreground))', fontSize: '0.875rem' }}>
                      {detailPipeline.name || getPipelineLabel(detailPipeline)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', fontWeight: 600, mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Environment
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{
                        width: 6, height: 6, borderRadius: '50%',
                        backgroundColor: isSensorRunning(detailPipeline._environmentId)
                          ? 'hsl(142 76% 36%)'
                          : 'hsl(var(--muted-foreground))',
                      }} />
                      <Typography sx={{ color: 'hsl(var(--foreground))', fontSize: '0.875rem' }}>
                        {detailPipeline._environmentName}
                      </Typography>
                    </Box>
                  </Box>
                  <Box>
                    <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', fontWeight: 600, mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Pipeline ID
                    </Typography>
                    <Typography sx={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                      {detailPipeline.pipeline || '—'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', fontWeight: 600, mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Started
                    </Typography>
                    <Typography sx={{ color: 'hsl(var(--foreground))', fontSize: '0.875rem' }}>
                      {formatTime(detailPipeline.started_at || detailPipeline.start_time)}
                    </Typography>
                  </Box>
                </Box>

                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Command / Definition
                    </Typography>
                    <Tooltip title="Copy">
                      <IconButton size="small" onClick={() => copyToClipboard(definition)} sx={{ color: 'hsl(var(--muted-foreground))' }}>
                        <ContentCopyIcon size={14} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box sx={{
                    backgroundColor: 'hsl(var(--muted))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 1,
                    p: 2,
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: 'hsl(var(--foreground))',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: 200,
                    overflow: 'auto',
                  }}>
                    {definition}
                  </Box>
                </Box>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    onClick={() => { handleAction(detailPipeline, 'delete'); setDetailPipeline(null); }}
                    startIcon={<DeleteIcon />}
                    sx={{ color: 'hsl(var(--destructive, 0 84% 60%))', textTransform: 'none' }}
                  >
                    Delete
                  </Button>
                  <Button
                    onClick={() => openEditDialog(detailPipeline)}
                    startIcon={<EditIcon />}
                    sx={{ color: '#FF6600', textTransform: 'none' }}
                  >
                    Edit
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button onClick={() => setDetailPipeline(null)} sx={{ color: 'hsl(var(--muted-foreground))', textTransform: 'none' }}>
                    Close
                  </Button>
                  {state === 'running' || state === 'active' || state === 'started' ? (
                    <Button
                      onClick={() => { handleAction(detailPipeline, 'stop'); setDetailPipeline(null); }}
                      variant="contained"
                      startIcon={<StopIcon />}
                      sx={{ bgcolor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: 'hsl(var(--destructive) / 0.9)' } }}
                    >
                      Stop
                    </Button>
                  ) : (
                    <Button
                      onClick={() => { handleAction(detailPipeline, 'start'); setDetailPipeline(null); }}
                      variant="contained"
                      startIcon={<PlayArrowIcon />}
                      sx={{ bgcolor: '#FF6600', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#e55b00' } }}
                    >
                      Start
                    </Button>
                  )}
                </Box>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>
    </Box>
  );
};

export default PipelinesPage;
