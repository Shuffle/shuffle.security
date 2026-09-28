import { CheckCircle2 as CheckCircleIcon, Circle as RadioButtonUncheckedIcon, Radio as SensorsIcon, Gavel as RuleIcon, Play as PlayArrowIcon, Database as StorageIcon, ChevronDown as ExpandMoreIcon, ChevronUp as ExpandLessIcon, ArrowRight as ArrowForwardIcon, Plus as AddIcon, Rocket as RocketLaunchIcon } from 'lucide-react';
import { useState, useEffect, forwardRef, useMemo } from 'react';
import { Link } from '@/lib/router-compat';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Chip,
  Collapse,
  Alert,
  TextField,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { API_CONFIG, getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { safeRandomUUID } from '@/utils/uuid';
import { trackPredefinedEvent, GA_EVENTS } from '@/lib/analytics';
import { DeploymentInstructions } from '@/components/detection/DeploymentInstructions';
import WebhookStatusBanner from '@/components/detection/WebhookStatusBanner';
import ProductionPipelineStatus from '@/components/detection/ProductionPipelineStatus';
import azureLogo from '@/assets/azure-logo.png';
import gcpLogo from '@/assets/gcp-logo.png';
import awsLogo from '@/assets/aws-logo.png';
import { usePageMeta } from '@/hooks/usePageMeta';

// Cloud provider icons with forwardRef for MUI compatibility
const GCPIcon = forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>((props, ref) => (
  <img ref={ref} src={gcpLogo} alt="GCP" width="20" height="20" style={{ objectFit: 'contain' }} {...props} />
));
GCPIcon.displayName = 'GCPIcon';

const AWSIcon = forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>((props, ref) => (
  <img ref={ref} src={awsLogo} alt="AWS" width="20" height="20" style={{ objectFit: 'contain' }} {...props} />
));
AWSIcon.displayName = 'AWSIcon';

// Azure icon using the uploaded logo
const AzureIcon = forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>((props, ref) => (
  <img ref={ref} src={azureLogo} alt="Azure" width="20" height="20" style={{ objectFit: 'contain' }} {...props} />
));
AzureIcon.displayName = 'AzureIcon';

type DeploymentProvider = 'self-hosted' | 'gcp' | 'aws' | 'azure';

interface StepStatus {
  loading: boolean;
  checked: boolean;
  success: boolean;
  message?: string;
}

interface Environment {
  id: string;
  Name: string;
  Type: string;
  Registered: boolean;
  default: boolean;
  archived: boolean;
  org_id: string;
  created: number;
  edited: number;
  checkin: number;
  auth: string;
  queue: number;
  run_type: string;
  data_lake?: {
    enabled: boolean;
    pipelines: any;
  };
}

const LAST_SENSOR_KEY = 'shuffle_last_sensor_id';

const DetectionOnboardingPage = () => {

  usePageMeta({
    title: 'Detection',
    description: 'Configure detection rules, pipelines, and threat detection sources.',
    url: '/detection',
  });
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string>('');
  const [newEnvName, setNewEnvName] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogName, setCreateDialogName] = useState('');
  const [creatingEnv, setCreatingEnv] = useState(false);
  const [loadingEnvs, setLoadingEnvs] = useState(true);
  const [loadingDefaultRules, setLoadingDefaultRules] = useState(false);
  
  const [sensorStatus, setSensorStatus] = useState<StepStatus>({
    loading: false,
    checked: false,
    success: false,
  });
  const [rulesStatus, setRulesStatus] = useState<StepStatus>({
    loading: false,
    checked: false,
    success: false,
  });
  const [testStatus, setTestStatus] = useState<StepStatus>({
    loading: false,
    checked: false,
    success: false,
  });
  const [pipelinesStatus, setPipelinesStatus] = useState<{
    loading: boolean;
    checked: boolean;
    syslogTcp: { ready: boolean; message?: string };
    syslogUdp: { ready: boolean; message?: string };
    sigmaForwarder: { ready: boolean; hookId?: string; message?: string; isLocalhost?: boolean };
  }>({
    loading: false,
    checked: false,
    syslogTcp: { ready: false },
    syslogUdp: { ready: false },
    sigmaForwarder: { ready: false },
  });
  const [webhookStatus, setWebhookStatus] = useState<{
    loading: boolean;
    checked: boolean;
    ready: boolean;
    workflowName?: string;
    workflowId?: string;
    message?: string;
  }>({ loading: false, checked: false, ready: false });
  const [deployingPipeline, setDeployingPipeline] = useState<{
    syslogTcp: boolean;
    syslogUdp: boolean;
    sigmaForwarder: boolean;
    webhook: boolean;
    sigmaForwarderProgress?: number;
    sigmaForwarderError?: string;
  }>({ syslogTcp: false, syslogUdp: false, sigmaForwarder: false, webhook: false });
  const [testRuleStatus, setTestRuleStatus] = useState<{
    loading: boolean;
    checked: boolean;
    ready: boolean;
    message?: string;
    ruleId?: string;
  }>({ loading: false, checked: false, ready: false });
  const [testSteps, setTestSteps] = useState<{
    visible: boolean;
    pipelineRequest: 'pending' | 'running' | 'success' | 'failed';
    pipelineStarted: 'pending' | 'running' | 'success' | 'failed';
    workflowTriggered: 'pending' | 'running' | 'success' | 'failed';
    elapsedSeconds: number;
  }>({
    visible: false,
    pipelineRequest: 'pending',
    pipelineStarted: 'pending',
    workflowTriggered: 'pending',
    elapsedSeconds: 0,
  });
  const [expandedStep, setExpandedStep] = useState<number | null>(1);
  const [userToggledStep, setUserToggledStep] = useState(false);
  const [deploymentDialog, setDeploymentDialog] = useState<{
    open: boolean;
    provider: DeploymentProvider;
  }>({ open: false, provider: 'self-hosted' });

  // Fetch environments function (extracted for reuse)
  const fetchEnvironments = async (isInitialLoad = false) => {

    try {
      const response = await fetch(getApiUrl('/api/v1/getenvironments'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });

      if (response.ok) {
        const data: Environment[] = await response.json();
        // Filter out archived environments
        const activeEnvs = data.filter(env => !env.archived);
        setEnvironments(activeEnvs);

        // On initial load, select the best available sensor
        if (isInitialLoad && activeEnvs.length > 0) {
          const now = Math.floor(Date.now() / 1000);
          const lastSensorId = localStorage.getItem(LAST_SENSOR_KEY);
          
          // Helper to check if a sensor is running
          const isRunning = (env: Environment) => 
            env.Type !== 'cloud' && env.checkin > 0 && (now - env.checkin) < 300;
          
          // Priority: Detection Ready > Running > Last used (if valid) > non-cloud > any
          const detectionReadyEnv = activeEnvs.find(e => e.data_lake?.enabled === true && e.Type !== 'cloud' && isRunning(e));
          const runningEnv = activeEnvs.find(e => isRunning(e));
          const lastUsedEnv = lastSensorId ? activeEnvs.find(e => e.id === lastSensorId && e.Type !== 'cloud') : null;
          const nonCloudEnv = activeEnvs.find(e => e.Type !== 'cloud');
          
          setSelectedEnvId(
            detectionReadyEnv?.id || 
            runningEnv?.id || 
            lastUsedEnv?.id ||
            nonCloudEnv?.id || 
            activeEnvs[0].id
          );
        }
      }
    } catch (error) {
      console.error('Failed to fetch environments:', error);
    } finally {
      if (isInitialLoad) setLoadingEnvs(false);
    }
  };

  // Fetch environments on mount
  useEffect(() => {
    fetchEnvironments(true);
  }, []);

  // Poll environments every 10 seconds only when the selected sensor is not detection-ready
  useEffect(() => {
    // Check if current sensor is valid and detection-ready
    const currentEnv = environments.find(e => e.id === selectedEnvId);
    const isValidAndReady = currentEnv && 
      currentEnv.Type !== 'cloud' && 
      currentEnv.data_lake?.enabled === true &&
      currentEnv.checkin > 0 && 
      (Math.floor(Date.now() / 1000) - currentEnv.checkin) < 300;

    // Don't poll if we have a valid, running, detection-ready sensor
    if (isValidAndReady) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchEnvironments(false);
    }, 10000);

    return () => clearInterval(intervalId);
  }, [selectedEnvId, environments]);

  // Persist selected environment
  useEffect(() => {
    if (selectedEnvId) {
      localStorage.setItem(LAST_SENSOR_KEY, selectedEnvId);
    }
  }, [selectedEnvId]);

  // Auto-check sensor and rules status on load, auto-expand to appropriate step
  useEffect(() => {
    const autoCheckStatus = async () => {
      if (!selectedEnvId || environments.length === 0) return;
      
      const env = environments.find(e => e.id === selectedEnvId);
      if (!env) return;

      // Never auto-swap tabs for cloud environments — keep user on step 1
      if (env.Type === 'cloud') return;

      const sensorRunning = isSensorRunning(env);
      const pipelineReady = isPipelineReady(env);

      // Update sensor status
      if (sensorRunning && pipelineReady) {
        setSensorStatus({
          loading: false,
          checked: true,
          success: true,
          message: `Detection pipeline is enabled and ready`,
        });
      } else if (sensorRunning) {
        setSensorStatus({
          loading: false,
          checked: true,
          success: false,
          message: 'Log ingestion is running but detection pipeline is not yet configured',
        });
      }

      // If sensor is ready, also check rules
      if (sensorRunning && pipelineReady) {
        try {
          const response = await fetch(getApiUrl('/api/v1/detections/Sigma'), {
            credentials: 'include',
            headers: { ...getAuthHeader() },
          });
          
          if (response.ok) {
            const data = await response.json();
            const rules = data.detection_info || [];
            const enabledRules = rules.filter((r: any) => r.is_enabled === true);
            
            if (enabledRules.length > 0) {
              // Rules are enabled, mark step 2 complete and expand step 3
              setRulesStatus({
                loading: false,
                checked: true,
                success: true,
                message: `${enabledRules.length} rules enabled`,
              });
              if (!userToggledStep) setExpandedStep(3);
            } else {
              // No rules enabled, expand step 2
              setRulesStatus({
                loading: false,
                checked: true,
                success: false,
                message: 'No rules enabled yet',
              });
              if (!userToggledStep) setExpandedStep(2);
            }
          } else {
            if (!userToggledStep) setExpandedStep(2);
          }
        } catch (error) {
          console.error('Failed to auto-check rules:', error);
          if (!userToggledStep) setExpandedStep(2);
        }
      } else if (sensorRunning) {
        // Sensor running but detection not ready — stay on step 1
        if (!userToggledStep) setExpandedStep(1);
      }
    };

    autoCheckStatus();
  }, [selectedEnvId, environments]);

  // Auto-check pipeline and webhook status when step 3 is expanded
  useEffect(() => {
    if (expandedStep === 3 && rulesStatus.success && !pipelinesStatus.checked) {
      checkManualTestReadiness();
    }
  }, [expandedStep, rulesStatus.success]);

  const selectedEnvironment = environments.find(e => e.id === selectedEnvId);
  const currentEnvName = isCreatingNew ? newEnvName : (selectedEnvironment?.Name || '');

  // Helper to check if sensor is running (checkin within last 300 seconds, or cloud type)
  const isSensorRunning = (env: Environment): boolean => {
    if (env.Type === 'cloud') return true;
    const now = Math.floor(Date.now() / 1000);
    return env.checkin > 0 && (now - env.checkin) < 300;
  };

  // Create a new environment via PUT /api/v1/setenvironments
  const handleCreateEnvironment = async () => {
    const name = createDialogName.trim();
    if (!name) return;
    setCreatingEnv(true);
    trackPredefinedEvent(GA_EVENTS.DETECTION_ENV_CREATE, name);
    try {
      const allEnvs = [
        ...environments,
        { Name: name, Type: 'onprem' },
      ];
      const res = await fetch(getApiUrl('/api/v1/setenvironments'), {
        method: 'PUT',
        credentials: 'include',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(allEnvs),
      });
      if (res.ok) {
        const envRes = await fetch(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        if (envRes.ok) {
          const envData: Environment[] = await envRes.json();
          const nonArchived = envData.filter(e => !e.archived);
          setEnvironments(nonArchived);
          const newEnv = nonArchived.find(e => e.Name === name && e.Type !== 'cloud');
          if (newEnv) {
            setSelectedEnvId(newEnv.id);
            localStorage.setItem(LAST_SENSOR_KEY, newEnv.id);
          }
        }
        setCreateDialogOpen(false);
      } else {
        console.error('Failed to create environment:', res.status);
      }
    } catch (err) {
      console.error('Error creating environment:', err);
    } finally {
      setCreatingEnv(false);
    }
  };

  // Helper to check if sensor is valid (not cloud type)
  const isSensorValid = (env: Environment): boolean => {
    return env.Type !== 'cloud';
  };

  // Helper to get pipeline count
  const getPipelineCount = (env: Environment): number => {
    if (!env.data_lake?.pipelines) return 0;
    const p = env.data_lake.pipelines;
    if (Array.isArray(p)) return p.length;
    if (typeof p === 'object') return Object.keys(p).length;
    return 0;
  };

  // Helper to check if detection pipeline is ready (data_lake.enabled = true)
  const isPipelineReady = (env: Environment): boolean => {
    return env.data_lake?.enabled === true;
  };

  // Get sensor status label and color
  const getSensorStatus = (env: Environment): { label: string; color: 'low' | 'medium' | 'info' } => {
    const running = isSensorRunning(env);
    const pipelineReady = isPipelineReady(env);
    const pipelineCount = getPipelineCount(env);

    if (!running) {
      return { label: 'Not Running', color: 'medium' };
    }
    
    if (pipelineReady) {
      return { 
        label: pipelineCount > 0 ? `${pipelineCount} Pipeline${pipelineCount !== 1 ? 's' : ''}` : 'Detection Ready', 
        color: 'low' 
      };
    }
    
    return { label: 'Running', color: 'info' };
  };

  const openDeploymentDialog = (provider: DeploymentProvider) => {
    trackPredefinedEvent(GA_EVENTS.DETECTION_DEPLOY_CLICK, provider);
    setDeploymentDialog({ open: true, provider });
  };

  // Check if selected sensor is connected (uses already-fetched environment data)
  const checkSensors = async () => {
    trackPredefinedEvent(GA_EVENTS.DETECTION_SENSOR_CHECK, selectedEnvId);
    setSensorStatus({ loading: true, checked: false, success: false });
    
    // Re-fetch to get latest checkin status and get fresh data directly
    try {
      const response = await fetch(getApiUrl('/api/v1/getenvironments'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });

      if (!response.ok) {
        setSensorStatus({
          loading: false,
          checked: true,
          success: false,
          message: 'Failed to check log ingestion status',
        });
        return;
      }

      const data: Environment[] = await response.json();
      const activeEnvs = data.filter(env => !env.archived);
      setEnvironments(activeEnvs);
      
      // Use fresh data directly instead of stale state
      const currentEnv = activeEnvs.find(e => e.id === selectedEnvId);
      
      if (!currentEnv) {
        setSensorStatus({
          loading: false,
          checked: true,
          success: false,
          message: 'No log ingestion source selected',
        });
        return;
      }
      
      const isRunning = isSensorRunning(currentEnv);
      const pipelineReady = isPipelineReady(currentEnv);
      const pipelineCount = getPipelineCount(currentEnv);
      
      let message = '';
      if (!isRunning) {
        message = 'Log ingestion not running. Deploy it using the options above.';
      } else if (pipelineReady) {
        message = pipelineCount > 0 
          ? `Detection ready with ${pipelineCount} pipeline${pipelineCount !== 1 ? 's' : ''} active`
          : 'Detection pipeline is enabled and ready';
      } else {
        message = 'Log ingestion is running but detection pipeline is not yet configured';
      }
      
      setSensorStatus({
        loading: false,
        checked: true,
        success: isRunning && pipelineReady,
        message,
      });
      
      // Auto-expand next step only if detection is fully ready
      if (isRunning && pipelineReady) {
        setExpandedStep(2);
      }
    } catch (error) {
      setSensorStatus({
        loading: false,
        checked: true,
        success: false,
        message: 'Error checking log ingestion status',
      });
    }
  };

  // Load default Sigma rules from GitHub repo
  const loadDefaultRules = async () => {
    setLoadingDefaultRules(true);
    trackPredefinedEvent(GA_EVENTS.DETECTION_RULES_LOAD);
    
    try {
      const response = await fetch(getApiUrl('/api/v1/files/download_remote'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: 'https://github.com/shuffle/security-rules',
          path: 'sigma',
          field_3: 'main',
        }),
      });
      
      if (response.ok) {
        // After loading, re-check rules status
        await checkRules();
      } else {
        console.error('Failed to load default rules');
        setRulesStatus({
          loading: false,
          checked: true,
          success: false,
          message: 'Failed to load default rules',
        });
      }
    } catch (error) {
      console.error('Error loading default rules:', error);
      setRulesStatus({
        loading: false,
        checked: true,
        success: false,
        message: 'Error loading default rules',
      });
    } finally {
      setLoadingDefaultRules(false);
    }
  };

  const checkRules = async () => {
    setRulesStatus({ loading: true, checked: false, success: false });
    
    try {
      const response = await fetch(getApiUrl('/api/v1/detections/Sigma'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      
      if (response.ok) {
        const data = await response.json();
        const rules = data.detection_info || [];
        const enabledRules = rules.filter((r: any) => r.is_enabled === true);
        
        setRulesStatus({
          loading: false,
          checked: true,
          success: enabledRules.length > 0,
          message: enabledRules.length > 0
            ? `${enabledRules.length} rules enabled`
            : 'No rules enabled yet',
        });
      } else {
        setRulesStatus({
          loading: false,
          checked: true,
          success: false,
          message: 'Failed to check rules status',
        });
      }
    } catch (error) {
      setRulesStatus({
        loading: false,
        checked: true,
        success: false,
        message: 'Error checking rules',
      });
    }
    
    setExpandedStep(3);
  };

  // Check pipeline status for all three pipelines
  const checkPipelineStatus = async () => {
    setPipelinesStatus(prev => ({ ...prev, loading: true, checked: false }));
    
    try {
      // Check the selected environment's pipelines
      const env = environments.find(e => e.id === selectedEnvId);
      const pipelines = env?.data_lake?.pipelines || [];
      const pipelineList = Array.isArray(pipelines) ? pipelines : [];

      // Initialize statuses
      let syslogTcp = { ready: false, message: 'Not configured' };
      let syslogUdp = { ready: false, message: 'Not configured' };
      let sigmaForwarder: { ready: boolean; hookId?: string; message?: string; isLocalhost?: boolean } = { 
        ready: false, 
        message: 'Not configured' 
      };

      for (const p of pipelineList) {
        const pipelineStr = typeof p === 'string' ? p : (p?.name || p?.command || JSON.stringify(p));
        const pipelineLower = pipelineStr.toLowerCase();

        // Check for Syslog TCP
        if (pipelineLower.includes('syslog') && pipelineLower.includes('tcp')) {
          syslogTcp = { ready: true, message: 'Running' };
        }

        // Check for Syslog UDP
        if (pipelineLower.includes('syslog') && pipelineLower.includes('udp')) {
          syslogUdp = { ready: true, message: 'Running' };
        }

        // Check for Sigma forwarder
        if (pipelineLower.includes('sigma') && pipelineStr.includes('/api/v1/hooks/')) {
          const hookMatch = pipelineStr.match(/\/api\/v1\/hooks\/([a-zA-Z0-9_-]+)/);
          const hookId = hookMatch ? hookMatch[1] : undefined;
          const isLocalhost = pipelineStr.includes('localhost') || pipelineStr.includes('127.0.0.1');

          if (isLocalhost) {
            sigmaForwarder = {
              ready: false,
              hookId,
              isLocalhost: true,
              message: '⚠️ Points to localhost - will not work. Redeploy required.',
            };
          } else {
            sigmaForwarder = {
              ready: true,
              hookId,
              isLocalhost: false,
              message: hookId ? `Hook: ${hookId.substring(0, 12)}...` : 'Running',
            };
          }
        }
      }

      setPipelinesStatus({
        loading: false,
        checked: true,
        syslogTcp,
        syslogUdp,
        sigmaForwarder,
      });

      return sigmaForwarder.hookId;
    } catch (error) {
      console.error('Failed to check pipeline status:', error);
      setPipelinesStatus({
        loading: false,
        checked: true,
        syslogTcp: { ready: false, message: 'Error checking' },
        syslogUdp: { ready: false, message: 'Error checking' },
        sigmaForwarder: { ready: false, message: 'Error checking' },
      });
      return null;
    }
  };

  // Check workflow status for webhook - look for 'Ingestion Webhook' with background_processing
  const checkWebhookWorkflow = async (hookId?: string) => {
    setWebhookStatus({ loading: true, checked: false, ready: false });
    
    try {
      const response = await fetch(getApiUrl('/api/v1/workflows'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });

      if (!response.ok) {
        setWebhookStatus({
          loading: false,
          checked: true,
          ready: false,
          message: 'Failed to fetch workflows',
        });
        return;
      }

      const workflows = await response.json();
      
      // Find the 'Ingestion Webhook' workflow with background_processing: true
      let matchingWorkflow = null;
      
      for (const workflow of workflows) {
        // Check for 'Ingestion Webhook' name and background_processing
        if (workflow.name === 'Ingestion Webhook' && workflow.background_processing === true) {
          matchingWorkflow = workflow;
          break;
        }
        
        // Fallback: Check if workflow has triggers/actions that match hook ID
        if (!matchingWorkflow && workflow.triggers && hookId) {
          for (const trigger of workflow.triggers) {
            if (trigger.app_name?.toLowerCase().includes('webhook') || 
                trigger.trigger_type === 'WEBHOOK') {
              const triggerStr = JSON.stringify(trigger);
              if (triggerStr.includes(hookId)) {
                matchingWorkflow = workflow;
                break;
              }
            }
          }
        }
      }

      if (matchingWorkflow) {
        setWebhookStatus({
          loading: false,
          checked: true,
          ready: true,
          workflowName: matchingWorkflow.name,
          workflowId: matchingWorkflow.id,
          message: `Workflow: ${matchingWorkflow.name}`,
        });
      } else {
        setWebhookStatus({
          loading: false,
          checked: true,
          ready: false,
          message: 'No Ingestion Webhook workflow found',
        });
      }
    } catch (error) {
      console.error('Failed to check webhook workflow:', error);
      setWebhookStatus({
        loading: false,
        checked: true,
        ready: false,
        message: 'Error checking workflows',
      });
    }
  };

  // Deploy a pipeline via POST /api/v1/triggers/pipeline
  const deployPipeline = async (type: 'syslogTcp' | 'syslogUdp' | 'sigmaForwarder', webhookId?: string) => {
    trackPredefinedEvent(GA_EVENTS.DETECTION_DEPLOY_CLICK, type);
    setDeployingPipeline(prev => ({ 
      ...prev, 
      [type]: true, 
      sigmaForwarderProgress: type === 'sigmaForwarder' ? 0 : prev.sigmaForwarderProgress,
      sigmaForwarderError: type === 'sigmaForwarder' ? undefined : prev.sigmaForwarderError,
    }));
    
    try {
      let command = '';
      
      if (type === 'syslogTcp') {
        command = 'listen syslog tcp://0.0.0.0:1514';
      } else if (type === 'syslogUdp') {
        command = 'listen syslog udp://0.0.0.0:1514';
      } else if (type === 'sigmaForwarder') {
        // Need a webhook ID for sigma forwarder
        const hookId = webhookId || webhookStatus.workflowId;
        if (!hookId) {
          console.error('No webhook ID available for sigma forwarder');
          setDeployingPipeline(prev => ({ ...prev, [type]: false, sigmaForwarderError: 'No webhook ID available' }));
          return;
        }
        const baseUrl = API_CONFIG.baseUrl;
        command = `export live=true | sigma "/tmp/sigma_rules" | set uid = uuid() | set source = "Tenzir" | to "${baseUrl}/api/v1/hooks/webhook_${hookId}"`;
      }
      
      const response = await fetch(getApiUrl('/api/v1/triggers/pipeline'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          name: command,
          type: 'create',
          environment: currentEnvName,
          workflow_id: '',
          trigger_id: '',
          start_node: '',
        }),
      });
      
      if (response.ok) {
        // Poll for pipeline deployment completion (up to 30 seconds)
        const maxAttempts = 15;
        const pollInterval = 2000;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // Update progress for sigmaForwarder
          if (type === 'sigmaForwarder') {
            setDeployingPipeline(prev => ({ 
              ...prev, 
              sigmaForwarderProgress: Math.round(((attempt + 1) / maxAttempts) * 100),
            }));
          }
          
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          
          // Fetch fresh environment data
          const envResponse = await fetch(getApiUrl('/api/v1/getenvironments'), {
            credentials: 'include',
            headers: { ...getAuthHeader() },
          });
          
          if (envResponse.ok) {
            const freshEnvs: Environment[] = await envResponse.json();
            const freshEnv = freshEnvs.find(e => e.id === selectedEnvId);
            const pipelines = freshEnv?.data_lake?.pipelines || [];
            const pipelineList = Array.isArray(pipelines) ? pipelines : [];
            
            // Check if our pipeline now exists
            let found = false;
            for (const p of pipelineList) {
              const pipelineStr = typeof p === 'string' ? p : (p?.name || p?.command || JSON.stringify(p));
              
              if (type === 'syslogTcp' && pipelineStr.toLowerCase().includes('syslog') && pipelineStr.toLowerCase().includes('tcp')) {
                found = true;
                break;
              }
              if (type === 'syslogUdp' && pipelineStr.toLowerCase().includes('syslog') && pipelineStr.toLowerCase().includes('udp')) {
                found = true;
                break;
              }
              if (type === 'sigmaForwarder' && pipelineStr.toLowerCase().includes('sigma') && pipelineStr.includes('/api/v1/hooks/')) {
                // Make sure it's not pointing to localhost
                const isLocalhost = pipelineStr.includes('localhost') || pipelineStr.includes('127.0.0.1');
                if (!isLocalhost) {
                  found = true;
                  break;
                }
              }
            }
            
            if (found) {
              // Update environments state and pipeline status
              setEnvironments(freshEnvs.filter(env => !env.archived));
              await checkPipelineStatus();
              setDeployingPipeline(prev => ({ ...prev, [type]: false, sigmaForwarderProgress: undefined }));
              return;
            }
          }
        }
        
        // Timeout - show error
        if (type === 'sigmaForwarder') {
          setDeployingPipeline(prev => ({ 
            ...prev, 
            sigmaForwarder: false,
            sigmaForwarderProgress: undefined,
            sigmaForwarderError: 'Deployment timed out after 30 seconds. Please try again or contact support.',
          }));
        } else {
          setDeployingPipeline(prev => ({ ...prev, [type]: false }));
        }
        await fetchEnvironments(false);
        await checkPipelineStatus();
      } else {
        const errorText = await response.text();
        console.error('Failed to deploy pipeline:', errorText);
        if (type === 'sigmaForwarder') {
          setDeployingPipeline(prev => ({ 
            ...prev, 
            sigmaForwarder: false,
            sigmaForwarderError: `Deployment failed: ${errorText}`,
          }));
        } else {
          setDeployingPipeline(prev => ({ ...prev, [type]: false }));
        }
      }
    } catch (error) {
      console.error('Error deploying pipeline:', error);
      if (type === 'sigmaForwarder') {
        setDeployingPipeline(prev => ({ 
          ...prev, 
          sigmaForwarder: false,
          sigmaForwarderError: 'Network error during deployment. Please try again.',
        }));
      } else {
        setDeployingPipeline(prev => ({ ...prev, [type]: false }));
      }
    }
  };

  // Deploy webhook workflow via POST /api/v2/workflows/generate
  const deployWebhookWorkflow = async () => {
    trackPredefinedEvent(GA_EVENTS.DETECTION_DEPLOY_CLICK, 'webhook');
    setDeployingPipeline(prev => ({ ...prev, webhook: true }));
    
    try {
      const response = await fetch(getApiUrl('/api/v2/workflows/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: 'Ingest Tickets_webhook',
          category: 'cases',
        }),
      });
      
      if (response.ok) {
        // Refresh webhook status after deployment
        await checkWebhookWorkflow();
      } else {
        console.error('Failed to deploy webhook workflow:', await response.text());
      }
    } catch (error) {
      console.error('Error deploying webhook workflow:', error);
    } finally {
      setDeployingPipeline(prev => ({ ...prev, webhook: false }));
    }
  };

  // Check for "Test Notepad Event" detection rule
  const checkTestDetectionRule = async () => {
    setTestRuleStatus({ loading: true, checked: false, ready: false });
    
    try {
      const response = await fetch(getApiUrl('/api/v1/detections/Sigma'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });

      if (!response.ok) {
        setTestRuleStatus({
          loading: false,
          checked: true,
          ready: false,
          message: 'Failed to fetch detection rules',
        });
        return;
      }

      const data = await response.json();
      const rules = data.detection_info || [];
      
      // Look for "Test Notepad Event" rule
      const testRule = rules.find((r: any) => 
        r.title?.toLowerCase().includes('test notepad event') || 
        r.name?.toLowerCase().includes('test notepad event')
      );

      if (testRule && testRule.is_enabled) {
        setTestRuleStatus({
          loading: false,
          checked: true,
          ready: true,
          ruleId: testRule.file_id || testRule.id,
          message: 'Test Notepad Event rule enabled',
        });
      } else if (testRule) {
        setTestRuleStatus({
          loading: false,
          checked: true,
          ready: false,
          ruleId: testRule.file_id || testRule.id,
          message: 'Test Notepad Event rule exists but not enabled',
        });
      } else {
        setTestRuleStatus({
          loading: false,
          checked: true,
          ready: false,
          message: 'Test Notepad Event rule not found',
        });
      }
    } catch (error) {
      console.error('Failed to check test detection rule:', error);
      setTestRuleStatus({
        loading: false,
        checked: true,
        ready: false,
        message: 'Error checking detection rules',
      });
    }
  };

  // Check both pipeline and webhook status
  const checkManualTestReadiness = async () => {
    const hookId = await checkPipelineStatus();
    await Promise.all([
      checkWebhookWorkflow(hookId || undefined),
      checkTestDetectionRule(),
    ]);
  };

  // Test detection rules
  const testRules = async (type: 'manual' | 'realworld') => {
    trackPredefinedEvent(GA_EVENTS.DETECTION_TEST_RUN, type);
    if (type === 'realworld') {
      setTestStatus({
        loading: false,
        checked: true,
        success: true,
        message: 'Real-world test queued - monitoring live events',
      });
      return;
    }

    // Reset and show test steps
    setTestSteps({
      visible: true,
      pipelineRequest: 'running',
      pipelineStarted: 'pending',
      workflowTriggered: 'pending',
      elapsedSeconds: 0,
    });
    setTestStatus({ loading: true, checked: false, success: false, message: 'Starting test...' });
    
    const workflowId = webhookStatus.workflowId;
    if (!workflowId) {
      setTestSteps(prev => ({ ...prev, pipelineRequest: 'failed' }));
      setTestStatus({
        loading: false,
        checked: true,
        success: false,
        message: 'No webhook workflow found',
      });
      return;
    }

    try {
      // Define test command and pipeline name upfront
      const testCommand = `from {message: "<165>1 2025-10-06T12:34:56.789Z myhost.example.com myapp 1234 ID47 [huh eventSource=\\"App\\" EventID=\\"4688\\" NewProcessName=\\"notepad.exe\\" Context=\\"Testing\\"] This is a test log message"} | this = message.parse_syslog() | import`;
      const pipelineName = testCommand.replace(/ /g, '-').substring(0, 100);

      // Step 0: Stop ALL existing test pipelines with matching command (not just one)
      try {
        // Fetch FRESH environment data to get current pipelines (don't rely on stale state)
        const freshEnvResponse = await fetch(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        
        let pipelineList: any[] = [];
        if (freshEnvResponse.ok) {
          const freshEnvs: Environment[] = await freshEnvResponse.json();
          const freshEnv = freshEnvs.find(e => e.id === selectedEnvId);
          const pipelines = freshEnv?.data_lake?.pipelines || [];
          pipelineList = Array.isArray(pipelines) ? pipelines : [];
        }
        
        // Filter to find ALL matching pipelines by definition field
        const matchingPipelines = pipelineList.filter((p: any) => {
          const definition = p?.definition || '';
          return definition.includes('notepad.exe') && definition.includes('parse_syslog');
        });
        
        console.log(`Found ${matchingPipelines.length} existing test pipelines to stop`, matchingPipelines);
        
        // Stop each matching pipeline
        for (const existingPipeline of matchingPipelines) {
          if (existingPipeline && typeof existingPipeline === 'object') {
            const pipelineId = existingPipeline.id || existingPipeline.pipeline;
            console.log(`Stopping pipeline: ${pipelineId}`);
            await fetch(getApiUrl('/api/v1/triggers/pipeline'), {
              method: 'POST',
              credentials: 'include',
              headers: {
                ...getAuthHeader(),
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: pipelineName,
                id: pipelineId,
                type: 'stop',
                command: testCommand,
                environment: selectedEnvironment?.Name || '',
              }),
            });
          }
        }
        
        // Wait 4 seconds for all stops to take effect before starting new pipeline
        if (matchingPipelines.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      } catch (stopError) {
        console.warn('Failed to stop existing test pipeline (may not exist):', stopError);
      }

      // Step 1: Get current execution count to compare later
      const initialExecsResponse = await fetch(getApiUrl(`/api/v2/workflows/${workflowId}/executions`), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      
      let initialExecIds: string[] = [];
      if (initialExecsResponse.ok) {
        const initialData = await initialExecsResponse.json();
        const executions = initialData.executions || initialData || [];
        initialExecIds = Array.isArray(executions) ? executions.map((e: any) => e.execution_id || e.id) : [];
      }

      // Step 2: Send test event via pipeline trigger
      const triggerResponse = await fetch(getApiUrl('/api/v1/triggers/pipeline'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: pipelineName,
          id: safeRandomUUID(),
          type: 'start',
          command: testCommand,
          environment: selectedEnvironment?.Name || '',
        }),
      });

      if (!triggerResponse.ok) {
        const errorText = await triggerResponse.text();
        console.error('Failed to trigger test event:', errorText);
        setTestSteps(prev => ({ ...prev, pipelineRequest: 'failed' }));
        setTestStatus({
          loading: false,
          checked: true,
          success: false,
          message: `Failed to send test event: ${errorText.substring(0, 50)}`,
        });
        return;
      }

      // Pipeline request succeeded - capture the time we triggered it
      const testTriggeredAt = new Date();
      setTestSteps(prev => ({ 
        ...prev, 
        pipelineRequest: 'success',
        pipelineStarted: 'running',
      }));

      // Step 3: Poll for new execution (max 60 seconds, poll every 2 seconds)
      const maxAttempts = 30;
      let attempt = 0;
      let foundNewExecution = false;
      let pipelineStartConfirmed = false;

      while (attempt < maxAttempts && !foundNewExecution) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempt++;
        const elapsedSeconds = attempt * 2;
        
        setTestSteps(prev => ({ ...prev, elapsedSeconds }));
        setTestStatus({ loading: true, checked: false, success: false, message: `Waiting... ${elapsedSeconds}s / 60s` });

        // Refresh environment to check pipeline status (always check, even if previously confirmed - it might have failed since)
        try {
          const envResponse = await fetch(getApiUrl('/api/v1/getenvironments'), {
            credentials: 'include',
            headers: { ...getAuthHeader() },
          });
          if (envResponse.ok) {
            const envData: Environment[] = await envResponse.json();
            const currentEnv = envData.find(e => e.id === selectedEnvId);
            const currentPipelines = currentEnv?.data_lake?.pipelines || [];
            const pipelineList = Array.isArray(currentPipelines) ? currentPipelines : [];
            
            // Check if our test pipeline exists and its status
            const testPipeline = pipelineList.find((p: any) => {
              const pipelineStr = typeof p === 'string' ? p : (p?.definition || p?.command || p?.name || JSON.stringify(p));
              return pipelineStr.includes('notepad.exe') && pipelineStr.includes('parse_syslog');
            });
            
            if (testPipeline && typeof testPipeline === 'object') {
              // Check pipeline state and start_time (must be after we triggered the test)
              const pipelineState = (testPipeline.state || '').toLowerCase();
              const startTimeStr = testPipeline.start_time;
              const isPipelineFailed = pipelineState === 'failed' || pipelineState === 'error' || pipelineState === 'stopped';
              
              console.log('Pipeline check:', { pipelineState, startTimeStr, isPipelineFailed, testTriggeredAt: testTriggeredAt.toISOString() });
              
              // Check for failure FIRST - if failed, stop immediately
              if (isPipelineFailed) {
                setTestSteps(prev => ({ 
                  ...prev, 
                  pipelineStarted: 'failed',
                }));
                setTestStatus({
                  loading: false,
                  checked: true,
                  success: false,
                  message: `✗ Pipeline failed. State: ${pipelineState}. Please try again or contact support.`,
                });
                return; // Stop polling immediately
              }
              
              // Parse start_time and check if it's after we triggered the test
              if (!pipelineStartConfirmed && startTimeStr) {
                try {
                  const pipelineStartTime = new Date(startTimeStr);
                  // Pipeline is running if start_time is after we triggered it (with 5s buffer for clock skew)
                  if (pipelineStartTime.getTime() >= testTriggeredAt.getTime() - 5000) {
                    pipelineStartConfirmed = true;
                    setTestSteps(prev => ({ 
                      ...prev, 
                      pipelineStarted: 'success',
                      workflowTriggered: 'running',
                    }));
                  }
                } catch {
                  // If we can't parse the time, assume it's running
                  pipelineStartConfirmed = true;
                  setTestSteps(prev => ({ 
                    ...prev, 
                    pipelineStarted: 'success',
                    workflowTriggered: 'running',
                  }));
                }
              }
            }
          }
        } catch (envError) {
          console.warn('Failed to check pipeline status:', envError);
        }

        try {
          const pollResponse = await fetch(getApiUrl(`/api/v2/workflows/${workflowId}/executions`), {
            credentials: 'include',
            headers: { ...getAuthHeader() },
          });

          if (pollResponse.ok) {
            const pollData = await pollResponse.json();
            const executions = pollData.executions || pollData || [];
            
            if (Array.isArray(executions)) {
              // Check for any new execution that wasn't in our initial list
              const newExecution = executions.find((e: any) => {
                const execId = e.execution_id || e.id;
                return !initialExecIds.includes(execId);
              });

              if (newExecution) {
                foundNewExecution = true;
                const execId = newExecution.execution_id || newExecution.id || '';
                const execStatus = newExecution.status?.toLowerCase() || '';
                
                // Check execution status
                const isSuccess = execStatus === 'finished' || execStatus === 'success' || execStatus === 'completed';
                const isFailed = execStatus === 'failed' || execStatus === 'aborted' || execStatus === 'error';
                const isPending = execStatus === 'executing' || execStatus === 'running' || execStatus === 'pending' || execStatus === '';
                
                if (isPending) {
                  // Still running, keep polling a bit more
                  foundNewExecution = false;
                  setTestStatus({ 
                    loading: true, 
                    checked: false, 
                    success: false, 
                    message: `Execution started, waiting for result...` 
                  });
                } else if (isFailed) {
                  setTestSteps(prev => ({ ...prev, workflowTriggered: 'failed' }));
                  setTestStatus({
                    loading: false,
                    checked: true,
                    success: false,
                    message: `✗ Detection failed. Execution: ${execId.substring(0, 8)}... Status: ${execStatus}`,
                  });
                  return;
                } else {
                  setTestSteps(prev => ({ ...prev, workflowTriggered: 'success' }));
                  setTestStatus({
                    loading: false,
                    checked: true,
                    success: true,
                    message: `✓ Detection triggered! Execution: ${execId.substring(0, 8)}...`,
                  });
                  return;
                }
              }
            }
          }
        } catch (pollError) {
          console.error('Error polling executions:', pollError);
        }

        setTestStatus({ 
          loading: true, 
          checked: false, 
          success: false, 
          message: `Waiting... ${elapsedSeconds}s / 60s` 
        });
      }

      // Timeout - no execution found
      setTestSteps(prev => ({ 
        ...prev, 
        pipelineStarted: prev.pipelineStarted === 'running' ? 'failed' : prev.pipelineStarted,
        workflowTriggered: 'failed',
      }));
      setTestStatus({
        loading: false,
        checked: true,
        success: false,
        message: '✗ Test failed: No detection received within 60 seconds. Check that the Sigma Forwarder pipeline is correctly configured and pointing to the right webhook.',
      });

    } catch (error) {
      console.error('Error running manual test:', error);
      setTestSteps(prev => ({ ...prev, pipelineRequest: 'failed' }));
      setTestStatus({
        loading: false,
        checked: true,
        success: false,
        message: 'Error running test',
      });
    }
  };

  const getStepIcon = (step: number, status: StepStatus) => {
    if (status.loading) {
      return <CircularProgress size={24} sx={{ color: 'hsl(var(--primary))' }} />;
    }
    if (status.checked && status.success) {
      return <CheckCircleIcon size={28} style={{ color: 'hsl(var(--severity-low))' }} />;
    }
    if (status.checked && !status.success) {
      return <RadioButtonUncheckedIcon size={28} style={{ color: 'hsl(var(--severity-medium))' }} />;
    }
    return (
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid hsl(var(--border))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'hsl(var(--muted-foreground))',
          fontWeight: 600,
          fontSize: '0.875rem',
        }}
      >
        {step}
      </Box>
    );
  };

  return (
    <Box sx={{ p: 4, maxWidth: 1400, width: '100%', mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              color: 'hsl(var(--foreground))',
            }}
          >
            Detection Setup
          </Typography>
          
        </Box>
        <Typography sx={{ color: 'hsl(var(--muted-foreground))' }}>
          Get your detection pipelines running in three simple steps.{' '}
          <Box
            component="a"
            href="https://shuffler.io/blog/shuffle_pipelines"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: 'hsl(var(--primary))',
              textDecoration: 'none',
              fontWeight: 500,
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            Learn more about Shuffle Pipelines →
          </Box>
        </Typography>
      </Box>

      {/* Webhook status */}
      <Box sx={{ mb: 3 }}>
        <WebhookStatusBanner />
      </Box>


      {/* Step 1: Check Sensors */}
      <Paper
        sx={{
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          mb: 2,
          overflow: 'hidden',
        }}
      >
        <Box
          onClick={() => { setUserToggledStep(true); setExpandedStep(expandedStep === 1 ? null : 1); }}
          sx={{
            p: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            '&:hover': { backgroundColor: 'hsl(var(--muted) / 0.3)' },
          }}
        >
          {getStepIcon(1, sensorStatus)}
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <SensorsIcon size={20} style={{ color: 'hsl(var(--primary))' }} />
              <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                Set up Log Ingestion
              </Typography>
              {/* Status chips for selected environment */}
              {selectedEnvironment && (() => {
                const running = isSensorRunning(selectedEnvironment);
                const pipelineReady = isPipelineReady(selectedEnvironment);
                const pipelineCount = getPipelineCount(selectedEnvironment);
                
                return (
                  <>
                    {/* Running status */}
                    <Chip
                      size="small"
                      label={running ? 'Running' : 'Not Running'}
                      sx={{
                        backgroundColor: running && pipelineReady
                          ? 'hsl(var(--severity-low) / 0.15)'
                          : running
                          ? 'hsl(var(--primary) / 0.15)'
                          : 'hsl(var(--severity-medium) / 0.15)',
                        color: running && pipelineReady
                          ? 'hsl(var(--severity-low))'
                          : running
                          ? 'hsl(var(--primary))'
                          : 'hsl(var(--severity-medium))',
                        fontWeight: 500,
                        fontSize: '0.75rem',
                      }}
                    />
                    
                    {/* Detection Ready status - only show if running */}
                    {running && (
                      <Chip
                        size="small"
                        label={pipelineReady ? 'Detection Ready' : 'Detection Not Ready'}
                        sx={{
                          backgroundColor: pipelineReady
                            ? 'hsl(var(--severity-info) / 0.15)'
                            : 'hsl(var(--severity-medium) / 0.15)',
                          color: pipelineReady
                            ? 'hsl(var(--severity-info))'
                            : 'hsl(var(--severity-medium))',
                          fontWeight: 500,
                          fontSize: '0.75rem',
                        }}
                      />
                    )}
                    
                    {/* Pipeline count - only show if has pipelines */}
                    {pipelineCount > 0 && (
                      <Chip
                        size="small"
                        label={`${pipelineCount} Pipeline${pipelineCount !== 1 ? 's' : ''}`}
                        sx={{
                          backgroundColor: 'hsl(var(--primary) / 0.15)',
                          color: 'hsl(var(--primary))',
                          fontWeight: 500,
                          fontSize: '0.75rem',
                        }}
                      />
                    )}
                  </>
                );
              })()}
            </Box>
            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mt: 0.5 }}>
              Deploy a detection pipeline to collect and analyze security events
            </Typography>
          </Box>
          {expandedStep === 1 ? (
            <ExpandLessIcon style={{ color: 'hsl(var(--muted-foreground))' }} />
          ) : (
            <ExpandMoreIcon style={{ color: 'hsl(var(--muted-foreground))' }} />
          )}
        </Box>

        <Collapse in={expandedStep === 1}>
          <Box sx={{ px: 3, pb: 3, pt: 1 }}>
            {/* Sensor Selection */}
            <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, fontSize: '0.9rem', mb: 2 }}>
              1. Select or Create a Log Ingestion source
            </Typography>
            
            {loadingEnvs ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <CircularProgress size={20} sx={{ color: 'hsl(var(--primary))' }} />
                <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
                  Loading log ingestion sources...
                </Typography>
              </Box>
            ) : (
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  {!isCreatingNew ? (
                    <FormControl size="small" sx={{ minWidth: 280 }}>
                      <InputLabel 
                        sx={{ 
                          color: 'hsl(var(--muted-foreground))',
                          '&.Mui-focused': { color: 'hsl(var(--primary))' },
                        }}
                      >
                         Select Log Ingestion
                      </InputLabel>
                      <Select
                        value={selectedEnvId}
                        onChange={(e) => setSelectedEnvId(e.target.value)}
                        label="Select Log Ingestion"
                        sx={{
                          backgroundColor: 'hsl(var(--muted))',
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
                          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--primary))' },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--primary))' },
                          '& .MuiSelect-select': { color: 'hsl(var(--foreground))' },
                        }}
                      >
                        {environments.map((env) => {
                          const running = isSensorRunning(env);
                          const pipelineReady = isPipelineReady(env);
                          const pipelineCount = getPipelineCount(env);
                          
                          return (
                            <MenuItem key={env.id} value={env.id}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                {/* Running status dot */}
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    backgroundColor: running && pipelineReady
                                      ? 'hsl(var(--severity-low))'
                                      : running 
                                      ? 'hsl(var(--primary))' 
                                      : 'hsl(var(--severity-medium))',
                                    flexShrink: 0,
                                  }}
                                  title={running ? 'Running' : 'Not Running'}
                                />
                                {/* Detection Ready status dot */}
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    backgroundColor: pipelineReady 
                                      ? 'hsl(var(--severity-info))' 
                                      : 'hsl(var(--muted-foreground) / 0.3)',
                                    flexShrink: 0,
                                  }}
                                  title={pipelineReady ? 'Detection Ready' : 'Detection Not Ready'}
                                />
                                <span style={{ flex: 1 }}>{env.Name}</span>
                                {pipelineCount > 0 && (
                                  <Typography 
                                    component="span" 
                                    sx={{ 
                                      color: 'hsl(var(--primary))', 
                                      fontSize: '0.7rem',
                                    }}
                                  >
                                    {pipelineCount} pipeline{pipelineCount !== 1 ? 's' : ''}
                                  </Typography>
                                )}
                              </Box>
                            </MenuItem>
                          );
                        })}
                      </Select>
                    </FormControl>
                  ) : (
                    <TextField
                      value={newEnvName}
                      onChange={(e) => setNewEnvName(e.target.value)}
                      placeholder="Enter log ingestion name..."
                      size="small"
                      autoFocus
                      sx={{
                        minWidth: 280,
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: 'hsl(var(--muted))',
                          '& fieldset': { borderColor: 'hsl(var(--border))' },
                          '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                          '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                        },
                        '& .MuiInputBase-input': {
                          color: 'hsl(var(--foreground))',
                        },
                      }}
                    />
                  )}
                  
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => {
                      setCreateDialogName('');
                      setCreateDialogOpen(true);
                    }}
                    sx={{
                      borderColor: selectedEnvironment && !isSensorValid(selectedEnvironment)
                        ? 'hsl(var(--primary))'
                        : 'hsl(var(--border))',
                      color: selectedEnvironment && !isSensorValid(selectedEnvironment)
                        ? 'hsl(var(--primary))'
                        : 'hsl(var(--foreground))',
                      textTransform: 'none',
                      height: 40,
                      fontWeight: selectedEnvironment && !isSensorValid(selectedEnvironment) ? 600 : 500,
                      '&:hover': {
                        borderColor: 'hsl(var(--primary))',
                        backgroundColor: 'hsl(var(--primary) / 0.08)',
                        color: 'hsl(var(--primary))',
                      },
                    }}
                  >
                    Create New
                  </Button>
                </Box>

                {selectedEnvironment && !isCreatingNew && (
                  <Box sx={{ mt: 2 }}>
                    {/* Cloud warning */}
                    {!isSensorValid(selectedEnvironment) && (
                      <Alert 
                        severity="warning" 
                        sx={{ 
                          mb: 2,
                          backgroundColor: 'hsl(var(--severity-medium) / 0.1)',
                          border: '1px solid hsl(var(--severity-medium) / 0.3)',
                          color: 'hsl(var(--foreground))',
                          '& .MuiAlert-icon': { color: 'hsl(var(--severity-medium))' },
                        }}
                      >
                        <Typography sx={{ fontSize: '0.875rem', mb: 1 }}>
                          Cloud environments cannot be used for detection. Please select or create a self-hosted sensor.
                        </Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
                          Need us to host a sensor for you?{' '}
                          <a 
                            href="mailto:support@shuffler.io" 
                            style={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}
                          >
                            Email support@shuffler.io
                          </a>
                          {' '}or{' '}
                          <a 
                            href="https://shuffler.io/contact?category=cloud_enterprise_plan" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}
                          >
                            contact us about enterprise hosting
                          </a>.
                        </Typography>
                      </Alert>
                    )}
                  </Box>
                )}
              </Box>
            )}

            {/* Deployment Options - Hidden for running sensors, but shown for cloud sensors (to display warning) */}
            {(isCreatingNew || (selectedEnvironment && !isSensorRunning(selectedEnvironment))) && (
              <>
                {/* Show cloud warning if cloud sensor selected */}
                {selectedEnvironment && !isSensorValid(selectedEnvironment) ? (
                  <Alert 
                    severity="warning" 
                    sx={{ 
                      backgroundColor: 'rgba(255, 152, 0, 0.08)',
                      border: '1px solid rgba(255, 152, 0, 0.3)',
                      '& .MuiAlert-message': { color: 'hsl(var(--foreground))' },
                      mb: 2,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.875rem', mb: 1 }}>
                      Cloud environments cannot be used for detection. Please select or create a self-hosted sensor.
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
                      Need help? Contact us at{' '}
                      <a href="https://shuffler.io/contact" target="_blank" rel="noopener noreferrer" style={{ color: '#FF6600' }}>
                        shuffler.io/contact
                      </a>{' '}
                      or on{' '}
                      <a href="https://discord.gg/B2CBzUm" target="_blank" rel="noopener noreferrer" style={{ color: '#FF6600' }}>
                        Discord
                      </a>
                    </Typography>
                  </Alert>
                ) : (
                <>
                <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, fontSize: '0.9rem', mb: 2 }}>
                  2. Choose Deployment Method
                </Typography>
                <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mb: 2 }}>
                  {isCreatingNew 
                    ? `Deploy a new sensor named "${newEnvName || 'unnamed'}":`
                    : `Deploy or reconnect "${currentEnvName}":`
                  }
                </Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, mb: 3 }}>
                  {/* Self-hosted option */}
                  <Paper
                    onClick={() => openDeploymentDialog('self-hosted')}
                    sx={{
                      p: 2.5,
                      backgroundColor: 'hsl(var(--muted) / 0.3)',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 1.5,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: 'hsl(var(--primary))',
                        backgroundColor: 'hsl(var(--muted) / 0.5)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <StorageIcon style={{ color: 'hsl(var(--primary))' }} />
                      <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                        Self-Hosted
                      </Typography>
                    </Box>
                    <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>
                      Deploy on your own infrastructure
                    </Typography>
                  </Paper>

                  {/* Google Cloud option */}
                  <Paper
                    onClick={() => openDeploymentDialog('gcp')}
                    sx={{
                      p: 2.5,
                      backgroundColor: 'hsl(var(--muted) / 0.3)',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 1.5,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: 'hsl(var(--primary))',
                        backgroundColor: 'hsl(var(--muted) / 0.5)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <GCPIcon />
                      <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                        Google Cloud
                      </Typography>
                    </Box>
                    <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>
                      Deploy on GCP Compute Engine
                    </Typography>
                  </Paper>

                  {/* AWS option */}
                  <Paper
                    onClick={() => openDeploymentDialog('aws')}
                    sx={{
                      p: 2.5,
                      backgroundColor: 'hsl(var(--muted) / 0.3)',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 1.5,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: 'hsl(var(--primary))',
                        backgroundColor: 'hsl(var(--muted) / 0.5)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <AWSIcon />
                      <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                        Amazon Web Services
                      </Typography>
                    </Box>
                    <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>
                      Deploy on AWS EC2
                    </Typography>
                  </Paper>

                  {/* Azure option */}
                  <Paper
                    onClick={() => openDeploymentDialog('azure')}
                    sx={{
                      p: 2.5,
                      backgroundColor: 'hsl(var(--muted) / 0.3)',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 1.5,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: 'hsl(var(--primary))',
                        backgroundColor: 'hsl(var(--muted) / 0.5)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <AzureIcon />
                      <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                        Microsoft Azure
                      </Typography>
                    </Box>
                    <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem' }}>
                      Deploy on Azure Virtual Machines
                    </Typography>
                  </Paper>
                </Box>

                <Button
                  onClick={checkSensors}
                  disabled={sensorStatus.loading}
                  variant="outlined"
                  sx={{
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    textTransform: 'none',
                    '&:hover': {
                      borderColor: 'hsl(var(--primary))',
                      backgroundColor: 'hsl(var(--primary) / 0.1)',
                    },
                  }}
                >
                  {sensorStatus.loading ? 'Checking...' : 'Check Connection'}
                </Button>

                {sensorStatus.checked && !sensorStatus.success && (
                  <Alert 
                    severity="info" 
                    sx={{ 
                      mt: 2, 
                      backgroundColor: 'hsl(var(--muted))',
                      border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--foreground))',
                      '& .MuiAlert-icon': { color: 'hsl(var(--primary))' },
                    }}
                  >
                    No sensors detected yet. Deploy one using the options above, then check again.
                  </Alert>
                )}
                </>
                )}
              </>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Step 2: Enable Rules */}
      <Paper
        sx={{
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          mb: 2,
          overflow: 'hidden',
          opacity: sensorStatus.success ? 1 : 0.6,
        }}
      >
        <Box
          onClick={() => { setUserToggledStep(true); setExpandedStep(expandedStep === 2 ? null : 2); }}
          sx={{
            p: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            '&:hover': { backgroundColor: 'hsl(var(--muted) / 0.3)' },
          }}
        >
          {getStepIcon(2, rulesStatus)}
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <RuleIcon size={20} style={{ color: 'hsl(var(--primary))' }} />
              <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                Enable Detection Rules
              </Typography>
              {rulesStatus.checked && (
                <Chip
                  size="small"
                  label={rulesStatus.message}
                  sx={{
                    backgroundColor: rulesStatus.success
                      ? 'hsl(var(--severity-low) / 0.15)'
                      : 'hsl(var(--severity-medium) / 0.15)',
                    color: rulesStatus.success
                      ? 'hsl(var(--severity-low))'
                      : 'hsl(var(--severity-medium))',
                    fontWeight: 500,
                    fontSize: '0.75rem',
                  }}
                />
              )}
            </Box>
            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mt: 0.5 }}>
              Configure Sigma rules to detect threats in your environment
            </Typography>
          </Box>
          {expandedStep === 2 ? (
            <ExpandLessIcon style={{ color: 'hsl(var(--muted-foreground))' }} />
          ) : (
            <ExpandMoreIcon style={{ color: 'hsl(var(--muted-foreground))' }} />
          )}
        </Box>

        <Collapse in={expandedStep === 2}>
          <Box sx={{ px: 3, pb: 3, pt: 1 }}>
            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mb: 3 }}>
              Load our default detection rules or browse and enable rules from our Sigma rule library.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                onClick={loadDefaultRules}
                disabled={loadingDefaultRules || rulesStatus.success}
                variant={rulesStatus.success ? 'outlined' : 'contained'}
                sx={{
                  backgroundColor: rulesStatus.success ? 'transparent' : 'hsl(var(--primary))',
                  color: rulesStatus.success ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary-foreground))',
                  borderColor: rulesStatus.success ? 'hsl(var(--border))' : undefined,
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: 'hsl(var(--primary) / 0.9)',
                  },
                  '&.Mui-disabled': {
                    backgroundColor: 'transparent',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--muted-foreground))',
                  },
                }}
              >
                {loadingDefaultRules ? (
                  <>
                    <CircularProgress size={16} sx={{ mr: 1, color: 'inherit' }} />
                    Loading Rules...
                  </>
                ) : rulesStatus.success ? (
                  '✓ Rules Loaded'
                ) : (
                  'Load Default Rules'
                )}
              </Button>
              <Button
                component={Link}
                to="/detection/sigma"
                variant="outlined"
                endIcon={<ArrowForwardIcon />}
                sx={{
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: 'hsl(var(--primary))',
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                  },
                }}
              >
                Browse Rules
              </Button>
            </Box>
          </Box>
        </Collapse>
      </Paper>

      {/* Step 3: Test Rules */}
      <Paper
        sx={{
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          overflow: 'hidden',
          opacity: rulesStatus.success ? 1 : 0.6,
        }}
      >
        <Box
          onClick={() => { setUserToggledStep(true); setExpandedStep(expandedStep === 3 ? null : 3); }}
          sx={{
            p: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            '&:hover': { backgroundColor: 'hsl(var(--muted) / 0.3)' },
          }}
        >
          {getStepIcon(3, testStatus)}
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <PlayArrowIcon size={20} style={{ color: 'hsl(var(--primary))' }} />
              <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                Test Your Rules
              </Typography>
              {testStatus.checked && (
                <Chip
                  size="small"
                  label={testStatus.success ? 'Tested' : 'Not Tested'}
                  sx={{
                    backgroundColor: testStatus.success
                      ? 'hsl(var(--severity-low) / 0.15)'
                      : 'hsl(var(--severity-medium) / 0.15)',
                    color: testStatus.success
                      ? 'hsl(var(--severity-low))'
                      : 'hsl(var(--severity-medium))',
                    fontWeight: 500,
                    fontSize: '0.75rem',
                  }}
                />
              )}
            </Box>
            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mt: 0.5 }}>
              Verify your detection rules are working correctly
            </Typography>
          </Box>
          {expandedStep === 3 ? (
            <ExpandLessIcon style={{ color: 'hsl(var(--muted-foreground))' }} />
          ) : (
            <ExpandMoreIcon style={{ color: 'hsl(var(--muted-foreground))' }} />
          )}
        </Box>

        <Collapse in={expandedStep === 3}>
          <Box sx={{ px: 3, pb: 3, pt: 1 }}>
            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mb: 3 }}>
              Choose how you want to test your detection rules:
            </Typography>

            <Box sx={{ display: 'flex', gap: 2 }}>
              {/* Manual test */}
              <Paper
                sx={{
                  flex: 1,
                  p: 2.5,
                  backgroundColor: 'hsl(var(--muted) / 0.3)',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 1.5,
                }}
              >
                <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', mb: 2 }}>
                  Manual Test
                </Typography>
                
                {/* 1. Test Notepad Event Detection Rule Status */}
                <Box sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
                    <Tooltip title="A simple Sigma rule that detects 'notepad.exe' process events. Used to verify the detection pipeline is working end-to-end." arrow placement="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'help' }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: testRuleStatus.loading 
                              ? 'hsl(var(--muted-foreground))'
                              : testRuleStatus.ready 
                                ? 'hsl(var(--severity-low))' 
                                : 'hsl(var(--severity-medium))',
                          }}
                        />
                        <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--foreground))', fontWeight: 500 }}>
                          Test Notepad Event Rule
                        </Typography>
                        {testRuleStatus.loading && (
                          <CircularProgress size={12} sx={{ color: 'hsl(var(--muted-foreground))' }} />
                        )}
                      </Box>
                    </Tooltip>
                  </Box>
                  <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', pl: 2 }}>
                    {testRuleStatus.loading 
                      ? 'Checking...' 
                      : testRuleStatus.checked 
                        ? testRuleStatus.message 
                        : 'Required detection for testing'}
                  </Typography>
                </Box>

                {/* 2. Sigma Forwarder Status */}
                <Box sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
                    <Tooltip title="A pipeline that evaluates incoming syslog events against your enabled Sigma rules and forwards matches to the webhook workflow." arrow placement="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'help' }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: pipelinesStatus.loading 
                              ? 'hsl(var(--muted-foreground))'
                              : pipelinesStatus.sigmaForwarder.ready 
                                ? 'hsl(var(--severity-low))' 
                                : pipelinesStatus.sigmaForwarder.isLocalhost
                                  ? 'hsl(var(--severity-high, var(--severity-medium)))'
                                  : 'hsl(var(--severity-medium))',
                          }}
                        />
                        <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--foreground))', fontWeight: 500 }}>
                          Sigma Detection Forwarder
                        </Typography>
                      </Box>
                    </Tooltip>
                    {((!pipelinesStatus.sigmaForwarder.ready || pipelinesStatus.sigmaForwarder.isLocalhost) && pipelinesStatus.checked && webhookStatus.ready) || deployingPipeline.sigmaForwarder ? (
                      <Button
                        onClick={() => deployPipeline('sigmaForwarder')}
                        disabled={deployingPipeline.sigmaForwarder}
                        size="small"
                        variant="text"
                        sx={{
                          fontSize: '0.7rem',
                          color: deployingPipeline.sigmaForwarder
                            ? 'hsl(var(--primary))'
                            : pipelinesStatus.sigmaForwarder.isLocalhost 
                              ? 'hsl(var(--severity-high, var(--severity-medium)))' 
                              : 'hsl(var(--primary))',
                          textTransform: 'none',
                          minWidth: 'auto',
                          py: 0,
                          '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.1)' },
                        }}
                      >
                        {deployingPipeline.sigmaForwarder 
                          ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <CircularProgress size={10} sx={{ color: 'hsl(var(--primary))' }} />
                              <span>Deploying... {deployingPipeline.sigmaForwarderProgress || 0}%</span>
                            </Box>
                          )
                          : pipelinesStatus.sigmaForwarder.isLocalhost 
                            ? 'Redeploy' 
                            : 'Deploy'}
                      </Button>
                    ) : null}
                  </Box>
                  <Typography 
                    sx={{ 
                      fontSize: '0.7rem', 
                      color: deployingPipeline.sigmaForwarderError
                        ? 'hsl(var(--severity-high, var(--destructive)))'
                        : pipelinesStatus.sigmaForwarder.isLocalhost 
                          ? 'hsl(var(--severity-high, var(--severity-medium)))' 
                          : 'hsl(var(--muted-foreground))', 
                      pl: 2,
                      fontWeight: (pipelinesStatus.sigmaForwarder.isLocalhost || deployingPipeline.sigmaForwarderError) ? 500 : 400,
                    }}
                  >
                    {deployingPipeline.sigmaForwarder
                      ? 'Waiting for pipeline to start...'
                      : deployingPipeline.sigmaForwarderError
                        ? deployingPipeline.sigmaForwarderError
                        : pipelinesStatus.loading 
                          ? 'Checking...' 
                          : !webhookStatus.ready && !pipelinesStatus.sigmaForwarder.ready
                            ? 'Requires webhook workflow first'
                            : pipelinesStatus.sigmaForwarder.message}
                  </Typography>
                </Box>

                {/* 3. Webhook Workflow Status */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
                    <Tooltip title="A workflow triggered by webhook that receives detected events from the Sigma Forwarder and creates alerts or incidents." arrow placement="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'help' }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: webhookStatus.loading 
                              ? 'hsl(var(--muted-foreground))'
                              : webhookStatus.ready 
                                ? 'hsl(var(--severity-low))' 
                                : 'hsl(var(--severity-medium))',
                          }}
                        />
                        <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--foreground))', fontWeight: 500 }}>
                          Ingestion Webhook
                        </Typography>
                        {webhookStatus.loading && (
                          <CircularProgress size={12} sx={{ color: 'hsl(var(--muted-foreground))' }} />
                        )}
                      </Box>
                    </Tooltip>
                    {!webhookStatus.ready && webhookStatus.checked && (
                      <Button
                        onClick={deployWebhookWorkflow}
                        disabled={deployingPipeline.webhook}
                        size="small"
                        variant="text"
                        sx={{
                          fontSize: '0.7rem',
                          color: 'hsl(var(--primary))',
                          textTransform: 'none',
                          minWidth: 'auto',
                          py: 0,
                          '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.1)' },
                        }}
                      >
                        {deployingPipeline.webhook ? 'Deploying...' : 'Deploy'}
                      </Button>
                    )}
                  </Box>
                  <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', pl: 2 }}>
                    {webhookStatus.loading 
                      ? 'Checking...' 
                      : webhookStatus.checked 
                        ? webhookStatus.message 
                        : 'Requires: Ingestion Webhook workflow'}
                  </Typography>
                </Box>

                {pipelinesStatus.loading && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <CircularProgress size={14} sx={{ color: 'hsl(var(--muted-foreground))' }} />
                    <Typography sx={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                      Checking pipeline status...
                    </Typography>
                  </Box>
                )}

                {/* Test Progress Visualization */}
                {testSteps.visible && (
                  <Box 
                    sx={{ 
                      mb: 2, 
                      p: 2, 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 1,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--foreground))', mb: 1.5 }}>
                      Test Progress {testSteps.elapsedSeconds > 0 && `(${testSteps.elapsedSeconds}s)`}
                    </Typography>
                    
                    {/* Step 1: Pipeline Request */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 
                            testSteps.pipelineRequest === 'success' ? 'hsl(var(--severity-low))' :
                            testSteps.pipelineRequest === 'failed' ? 'hsl(var(--severity-high, var(--destructive)))' :
                            testSteps.pipelineRequest === 'running' ? 'hsl(var(--primary))' :
                            'hsl(var(--muted))',
                        }}
                      >
                        {testSteps.pipelineRequest === 'running' && (
                          <CircularProgress size={10} sx={{ color: 'hsl(var(--primary-foreground))' }} />
                        )}
                        {testSteps.pipelineRequest === 'success' && (
                          <Typography sx={{ fontSize: '0.6rem', color: 'hsl(var(--primary-foreground))' }}>✓</Typography>
                        )}
                        {testSteps.pipelineRequest === 'failed' && (
                          <Typography sx={{ fontSize: '0.6rem', color: 'hsl(var(--primary-foreground))' }}>✗</Typography>
                        )}
                      </Box>
                      <Typography sx={{ 
                        fontSize: '0.75rem', 
                        color: testSteps.pipelineRequest === 'failed' 
                          ? 'hsl(var(--severity-high, var(--destructive)))' 
                          : 'hsl(var(--foreground))',
                      }}>
                        1. Pipeline request sent
                      </Typography>
                    </Box>

                    {/* Step 2: Pipeline Started */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 
                            testSteps.pipelineStarted === 'success' ? 'hsl(var(--severity-low))' :
                            testSteps.pipelineStarted === 'failed' ? 'hsl(var(--severity-high, var(--destructive)))' :
                            testSteps.pipelineStarted === 'running' ? 'hsl(var(--primary))' :
                            'hsl(var(--muted))',
                        }}
                      >
                        {testSteps.pipelineStarted === 'running' && (
                          <CircularProgress size={10} sx={{ color: 'hsl(var(--primary-foreground))' }} />
                        )}
                        {testSteps.pipelineStarted === 'success' && (
                          <Typography sx={{ fontSize: '0.6rem', color: 'hsl(var(--primary-foreground))' }}>✓</Typography>
                        )}
                        {testSteps.pipelineStarted === 'failed' && (
                          <Typography sx={{ fontSize: '0.6rem', color: 'hsl(var(--primary-foreground))' }}>✗</Typography>
                        )}
                      </Box>
                      <Typography sx={{ 
                        fontSize: '0.75rem', 
                        color: testSteps.pipelineStarted === 'failed' 
                          ? 'hsl(var(--severity-high, var(--destructive)))' 
                          : 'hsl(var(--foreground))',
                        fontWeight: testSteps.pipelineStarted === 'failed' ? 600 : 400,
                      }}>
                        2. Test pipeline started {testSteps.pipelineStarted === 'failed' && '— FAILED'}
                      </Typography>
                    </Box>

                    {/* Step 3: Workflow Triggered */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 
                            testSteps.workflowTriggered === 'success' ? 'hsl(var(--severity-low))' :
                            testSteps.workflowTriggered === 'failed' ? 'hsl(var(--severity-high, var(--destructive)))' :
                            testSteps.workflowTriggered === 'running' ? 'hsl(var(--primary))' :
                            'hsl(var(--muted))',
                        }}
                      >
                        {testSteps.workflowTriggered === 'running' && (
                          <CircularProgress size={10} sx={{ color: 'hsl(var(--primary-foreground))' }} />
                        )}
                        {testSteps.workflowTriggered === 'success' && (
                          <Typography sx={{ fontSize: '0.6rem', color: 'hsl(var(--primary-foreground))' }}>✓</Typography>
                        )}
                        {testSteps.workflowTriggered === 'failed' && (
                          <Typography sx={{ fontSize: '0.6rem', color: 'hsl(var(--primary-foreground))' }}>✗</Typography>
                        )}
                      </Box>
                      <Typography sx={{ 
                        fontSize: '0.75rem', 
                        color: testSteps.workflowTriggered === 'failed' 
                          ? 'hsl(var(--severity-high, var(--destructive)))' 
                          : 'hsl(var(--foreground))',
                        fontWeight: testSteps.workflowTriggered === 'failed' ? 600 : 400,
                      }}>
                        3. Workflow triggered {testSteps.workflowTriggered === 'failed' && '— FAILED'}
                      </Typography>
                    </Box>
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    onClick={checkManualTestReadiness}
                    disabled={pipelinesStatus.loading || webhookStatus.loading}
                    variant="outlined"
                    size="small"
                    sx={{
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))',
                      textTransform: 'none',
                      '&:hover': {
                        borderColor: 'hsl(var(--primary))',
                        backgroundColor: 'hsl(var(--primary) / 0.1)',
                      },
                    }}
                  >
                    {pipelinesStatus.loading || webhookStatus.loading ? 'Checking...' : 'Refresh Status'}
                  </Button>
                  <Button
                    onClick={() => testRules('manual')}
                    disabled={testStatus.loading || !pipelinesStatus.sigmaForwarder.ready || !webhookStatus.ready || !testRuleStatus.ready}
                    variant="contained"
                    size="small"
                    sx={{
                      backgroundColor: testStatus.loading 
                        ? 'hsl(var(--primary))' 
                        : 'hsl(var(--primary))',
                      color: 'hsl(var(--primary-foreground))',
                      textTransform: 'none',
                      minWidth: 120,
                      '&:hover': {
                        backgroundColor: 'hsl(var(--primary) / 0.9)',
                      },
                      '&.Mui-disabled': {
                        backgroundColor: testStatus.loading 
                          ? 'hsl(var(--primary))' 
                          : 'hsl(var(--muted))',
                        color: testStatus.loading 
                          ? 'hsl(var(--primary-foreground))' 
                          : 'hsl(var(--muted-foreground))',
                      },
                    }}
                  >
                    {testStatus.loading ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={14} sx={{ color: 'inherit' }} />
                        <span>{testStatus.message || 'Testing...'}</span>
                      </Box>
                    ) : (
                      'Run Test'
                    )}
                  </Button>
                </Box>
              </Paper>

              {/* Real-world test */}
              <Paper
                sx={{
                  flex: 1,
                  p: 2.5,
                  backgroundColor: 'hsl(var(--muted) / 0.3)',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 1.5,
                  position: 'relative',
                  opacity: 0.6,
                }}
              >
                {/* Coming Soon overlay */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    backgroundColor: 'hsl(var(--primary) / 0.15)',
                    border: '1px solid hsl(var(--primary) / 0.3)',
                    borderRadius: 1,
                    px: 1.5,
                    py: 0.5,
                  }}
                >
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>
                    Coming Soon
                  </Typography>
                </Box>
                
                <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', mb: 2 }}>
                  Real-World Test
                </Typography>
                <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.8rem', mb: 2 }}>
                  Configure log forwarding and validate end-to-end detection
                </Typography>

                {/* Syslog TCP Status */}
                <Box sx={{ mb: 1.5, pointerEvents: 'none' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: pipelinesStatus.loading 
                            ? 'hsl(var(--muted-foreground))'
                            : pipelinesStatus.syslogTcp.ready 
                              ? 'hsl(var(--severity-low))' 
                              : 'hsl(var(--severity-medium))',
                        }}
                      />
                      <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--foreground))', fontWeight: 500 }}>
                        Syslog Ingest (TCP)
                      </Typography>
                    </Box>
                    {!pipelinesStatus.syslogTcp.ready && pipelinesStatus.checked && (
                      <Button
                        onClick={() => deployPipeline('syslogTcp')}
                        disabled={deployingPipeline.syslogTcp}
                        size="small"
                        variant="text"
                        sx={{
                          fontSize: '0.7rem',
                          color: 'hsl(var(--primary))',
                          textTransform: 'none',
                          minWidth: 'auto',
                          py: 0,
                          '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.1)' },
                        }}
                      >
                        {deployingPipeline.syslogTcp ? 'Deploying...' : 'Deploy'}
                      </Button>
                    )}
                  </Box>
                  <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', pl: 2 }}>
                    {pipelinesStatus.loading ? 'Checking...' : pipelinesStatus.syslogTcp.message}
                  </Typography>
                </Box>

                {/* Syslog UDP Status */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: pipelinesStatus.loading 
                            ? 'hsl(var(--muted-foreground))'
                            : pipelinesStatus.syslogUdp.ready 
                              ? 'hsl(var(--severity-low))' 
                              : 'hsl(var(--severity-medium))',
                        }}
                      />
                      <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--foreground))', fontWeight: 500 }}>
                        Syslog Ingest (UDP)
                      </Typography>
                    </Box>
                    {!pipelinesStatus.syslogUdp.ready && pipelinesStatus.checked && (
                      <Button
                        onClick={() => deployPipeline('syslogUdp')}
                        disabled={deployingPipeline.syslogUdp}
                        size="small"
                        variant="text"
                        sx={{
                          fontSize: '0.7rem',
                          color: 'hsl(var(--primary))',
                          textTransform: 'none',
                          minWidth: 'auto',
                          py: 0,
                          '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.1)' },
                        }}
                      >
                        {deployingPipeline.syslogUdp ? 'Deploying...' : 'Deploy'}
                      </Button>
                    )}
                  </Box>
                  <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', pl: 2 }}>
                    {pipelinesStatus.loading ? 'Checking...' : pipelinesStatus.syslogUdp.message}
                  </Typography>
                </Box>

                <Button
                  onClick={() => testRules('realworld')}
                  disabled={testStatus.loading || (!pipelinesStatus.syslogTcp.ready && !pipelinesStatus.syslogUdp.ready)}
                  variant="outlined"
                  size="small"
                  sx={{
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    textTransform: 'none',
                    '&:hover': {
                      borderColor: 'hsl(var(--primary))',
                      backgroundColor: 'hsl(var(--primary) / 0.1)',
                    },
                  }}
                >
                  Start Monitoring
                </Button>
              </Paper>
            </Box>

            {testStatus.checked && testStatus.success && (
              <Alert 
                severity="success" 
                sx={{ 
                  mt: 3, 
                  backgroundColor: 'hsl(var(--severity-low) / 0.1)',
                  border: '1px solid hsl(var(--severity-low) / 0.3)',
                  color: 'hsl(var(--foreground))',
                  '& .MuiAlert-icon': { color: 'hsl(var(--severity-low))' },
                }}
              >
                {testStatus.message}
              </Alert>
            )}

            {testStatus.checked && !testStatus.success && testStatus.message && (
              <Alert 
                severity="error" 
                sx={{ 
                  mt: 3, 
                  backgroundColor: 'hsl(var(--severity-high, var(--destructive)) / 0.1)',
                  border: '1px solid hsl(var(--severity-high, var(--destructive)) / 0.5)',
                  color: 'hsl(var(--foreground))',
                  '& .MuiAlert-icon': { color: 'hsl(var(--severity-high, var(--destructive)))' },
                }}
              >
                {testStatus.message}
              </Alert>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Step 4: Production */}
      <Paper
        sx={{
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          mt: 2,
          mb: 2,
          overflow: 'hidden',
          opacity: testStatus.success ? 1 : 0.6,
        }}
      >
        <Box
          onClick={() => { setUserToggledStep(true); setExpandedStep(expandedStep === 4 ? null : 4); }}
          sx={{
            p: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            '&:hover': { backgroundColor: 'hsl(var(--muted) / 0.3)' },
          }}
        >
          {(() => {
            const env = selectedEnvironment;
            const running = env ? isSensorRunning(env) : false;
            const ready = env ? isPipelineReady(env) : false;
            const allGood = running && ready && webhookStatus.ready;
            return allGood
              ? <CheckCircleIcon size={28} style={{ color: 'hsl(var(--severity-low))' }} />
              : <Box sx={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: '2px solid hsl(var(--border))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'hsl(var(--muted-foreground))', fontWeight: 600, fontSize: '0.85rem',
                }}>4</Box>;
          })()}
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <RocketLaunchIcon size={20} style={{ color: 'hsl(var(--primary))' }} />
              <Typography sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                Production
              </Typography>
            </Box>
            <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mt: 0.5 }}>
              Visualize the end-to-end data flow and identify where the pipeline may be interrupted
            </Typography>
          </Box>
          {expandedStep === 4 ? (
            <ExpandLessIcon style={{ color: 'hsl(var(--muted-foreground))' }} />
          ) : (
            <ExpandMoreIcon style={{ color: 'hsl(var(--muted-foreground))' }} />
          )}
        </Box>

        <Collapse in={expandedStep === 4}>
          <Box sx={{ px: 3, pb: 3, pt: 1 }}>
            <ProductionPipelineStatus
              environment={selectedEnvironment}
              sensorRunning={selectedEnvironment ? isSensorRunning(selectedEnvironment) : false}
              pipelineReady={selectedEnvironment ? isPipelineReady(selectedEnvironment) : false}
            />
          </Box>
        </Collapse>
      </Paper>

      {/* Quick Links */}
      <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid hsl(var(--border))' }}>
        <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mb: 2 }}>
          Quick Links
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            component={Link}
            to="/detection/sigma"
            variant="text"
            size="small"
            sx={{ color: 'hsl(var(--primary))', textTransform: 'none' }}
          >
            Sigma Rules →
          </Button>
          <Button
            component={Link}
            to="/detection/mitre"
            variant="text"
            size="small"
            sx={{ color: 'hsl(var(--primary))', textTransform: 'none' }}
          >
          MITRE ATT&CK →
          </Button>
          <Button
            component={Link}
            to="/detection/pipelines"
            variant="text"
            size="small"
            sx={{ color: 'hsl(var(--primary))', textTransform: 'none' }}
          >
            Pipelines →
          </Button>
        </Box>
      </Box>

      {/* Deployment Instructions Dialog */}
      <DeploymentInstructions
        open={deploymentDialog.open}
        onClose={() => setDeploymentDialog({ ...deploymentDialog, open: false })}
        initialProvider={deploymentDialog.provider}
        environmentName={currentEnvName}
        environmentId={isCreatingNew ? '' : selectedEnvId}
        environmentAuth={isCreatingNew ? '' : (selectedEnvironment?.auth || '')}
      />

      {/* Create New Sensor Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => !creatingEnv && setCreateDialogOpen(false)}
        PaperProps={{
          sx: {
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            minWidth: 400,
          },
        }}
      >
        <DialogTitle sx={{ color: 'hsl(var(--foreground))', fontSize: '1rem' }}>
          Create New Sensor
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', mb: 2 }}>
            Enter a name for your new on-prem sensor environment.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            value={createDialogName}
            onChange={(e) => setCreateDialogName(e.target.value)}
            placeholder="e.g. Production Log Ingestion"
            onKeyDown={(e) => e.key === 'Enter' && createDialogName.trim() && handleCreateEnvironment()}
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'hsl(var(--muted))',
                '& fieldset': { borderColor: 'hsl(var(--border))' },
                '&:hover fieldset': { borderColor: 'hsl(var(--primary))' },
                '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
              },
              '& .MuiInputBase-input': { color: 'hsl(var(--foreground))' },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setCreateDialogOpen(false)}
            disabled={creatingEnv}
            sx={{ color: 'hsl(var(--muted-foreground))', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateEnvironment}
            disabled={!createDialogName.trim() || creatingEnv}
            variant="contained"
            sx={{
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              textTransform: 'none',
              '&:hover': { backgroundColor: 'hsl(var(--primary) / 0.9)' },
            }}
          >
            {creatingEnv ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DetectionOnboardingPage;
