import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  getDatastoreByCategory, 
  setDatastoreItem, 
  deleteDatastoreItem, 
  DATASTORE_CATEGORIES 
} from '@/Shuffle-MCPs/datastore';

export interface TemplateTask {
  title: string;
  description?: string;
  category?: string;
  assignee?: string;
  dependsOn?: string;
  dueOffsetHours?: number; // Hours from incident creation
}

export interface CaseTemplate {
  id: string;
  name: string;
  description?: string;
  severity?: string;
  tasks: TemplateTask[];
  usageCount?: number;
  createdAt?: number;
  createdBy?: string;
}

// Default case templates
export const DEFAULT_CASE_TEMPLATES: CaseTemplate[] = [
  {
    id: 'standard-triage',
    name: 'Standard Triage',
    description: 'Basic incident triage workflow',
    severity: 'medium',
    tasks: [
      { title: 'Initial assessment', category: 'triage' },
      { title: 'Collect evidence', category: 'investigation', dependsOn: 'Initial assessment' },
      { title: 'Determine scope', category: 'investigation', dependsOn: 'Collect evidence' },
      { title: 'Document findings', category: 'documentation' },
    ],
  },
  {
    id: 'malware-investigation',
    name: 'Malware Investigation',
    description: 'Comprehensive malware analysis workflow',
    severity: 'high',
    tasks: [
      { title: 'Isolate affected systems', category: 'containment' },
      { title: 'Capture memory dump', category: 'investigation', dependsOn: 'Isolate affected systems' },
      { title: 'Analyze malware sample', category: 'investigation' },
      { title: 'Identify IOCs', category: 'investigation', dependsOn: 'Analyze malware sample' },
      { title: 'Check lateral movement', category: 'investigation', dependsOn: 'Identify IOCs' },
      { title: 'Remediation plan', category: 'recovery' },
    ],
  },
  {
    id: 'phishing-response',
    name: 'Phishing Response',
    description: 'Response procedure for phishing incidents',
    severity: 'medium',
    tasks: [
      { title: 'Identify recipients', category: 'triage' },
      { title: 'Block sender domain', category: 'containment' },
      { title: 'Check for clicks/downloads', category: 'investigation', dependsOn: 'Identify recipients' },
      { title: 'Reset compromised credentials', category: 'containment', dependsOn: 'Check for clicks/downloads' },
      { title: 'User awareness notification', category: 'communication' },
    ],
  },
  {
    id: 'ransomware-response',
    name: 'Ransomware Response',
    description: 'Critical ransomware incident response',
    severity: 'critical',
    tasks: [
      { title: 'Isolate infected systems from network', category: 'containment' },
      { title: 'Preserve evidence and logs', category: 'investigation' },
      { title: 'Identify ransomware variant', category: 'investigation', dependsOn: 'Preserve evidence and logs' },
      { title: 'Determine attack vector', category: 'investigation' },
      { title: 'Check for data exfiltration', category: 'investigation' },
      { title: 'Notify legal/compliance team', category: 'communication' },
      { title: 'Assess backup availability', category: 'recovery' },
      { title: 'Develop recovery plan', category: 'recovery', dependsOn: 'Assess backup availability' },
      { title: 'Restore systems from backup', category: 'recovery', dependsOn: 'Develop recovery plan' },
      { title: 'Post-incident review', category: 'documentation' },
    ],
  },
  {
    id: 'data-breach-response',
    name: 'Data Breach Response',
    description: 'Response procedure for potential data breaches',
    severity: 'critical',
    tasks: [
      { title: 'Confirm breach and scope', category: 'triage' },
      { title: 'Contain the breach', category: 'containment', dependsOn: 'Confirm breach and scope' },
      { title: 'Identify affected data', category: 'investigation' },
      { title: 'Determine legal notification requirements', category: 'communication' },
      { title: 'Notify affected parties', category: 'communication', dependsOn: 'Determine legal notification requirements' },
      { title: 'Remediate vulnerabilities', category: 'recovery' },
      { title: 'Document incident timeline', category: 'documentation' },
    ],
  },
  {
    id: 'unauthorized-access',
    name: 'Unauthorized Access',
    description: 'Investigation for unauthorized access attempts',
    severity: 'high',
    tasks: [
      { title: 'Review access logs', category: 'investigation' },
      { title: 'Identify compromised accounts', category: 'investigation' },
      { title: 'Revoke compromised credentials', category: 'containment', dependsOn: 'Identify compromised accounts' },
      { title: 'Check for persistence mechanisms', category: 'investigation' },
      { title: 'Review privilege escalation', category: 'investigation' },
      { title: 'Implement additional controls', category: 'recovery' },
    ],
  },
];

const CATEGORY = DATASTORE_CATEGORIES.TEMPLATES;
const QUERY_KEY = ['caseTemplates'];

/**
 * Fetch templates from datastore and parse them
 */
const fetchTemplates = async (): Promise<CaseTemplate[]> => {
  const response = await getDatastoreByCategory(CATEGORY);
  if (!response.success || !response.data || response.data.length === 0) {
    // Return defaults when no custom templates exist
    return DEFAULT_CASE_TEMPLATES;
  }

  const parsed: CaseTemplate[] = response.data
    .filter(item => !item.category || item.category === CATEGORY)
    .map(item => {
      try {
        const val = JSON.parse(item.value);
        if (!val || typeof val !== 'object' || typeof val.name !== 'string' || !val.name.trim()) {
          return null;
        }
        return {
          id: val.id || item.key,
          name: val.name,
          description: typeof val.description === 'string' ? val.description : '',
          severity: val.severity || 'medium',
          tlp: val.tlp || 'amber',
          tasks: Array.isArray(val.tasks) ? val.tasks : [],
          labels: Array.isArray(val.labels) ? val.labels : [],
          recommendedFor: Array.isArray(val.recommendedFor) ? val.recommendedFor : [],
          isCustom: val.isCustom ?? true,
          created: typeof val.created === 'number' ? val.created : undefined,
          usageCount: typeof val.usageCount === 'number' ? val.usageCount : 0,
        } as CaseTemplate;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as CaseTemplate[];

  return parsed.length > 0 ? parsed : DEFAULT_CASE_TEMPLATES;
};

/**
 * Helper to get org ID for datastore writes
 */
const getOrgId = (): string | null => {
  try {
    const userInfo = localStorage.getItem('shuffle_user_info');
    if (userInfo) {
      const parsed = JSON.parse(userInfo);
      return parsed.active_org?.id || null;
    }
  } catch {
    // Ignore
  }
  return null;
};

export const useCaseTemplates = () => {
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchTemplates,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  // Get template by ID
  const getTemplate = useCallback((id: string): CaseTemplate | undefined => {
    return templates.find(t => t.id === id);
  }, [templates]);

  // Add a new template
  const createTemplate = useCallback(async (template: Omit<CaseTemplate, 'id' | 'createdAt'>) => {
    const newTemplate: CaseTemplate = {
      ...template,
      id: `template-${Date.now()}`,
      createdAt: Date.now(),
    };
    await setDatastoreItem(newTemplate.id, JSON.stringify(newTemplate), CATEGORY);
    invalidate();
    return newTemplate;
  }, [invalidate]);

  // Update an existing template
  const updateTemplate = useCallback(async (id: string, updates: Partial<CaseTemplate>) => {
    const existing = templates.find(t => t.id === id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    await setDatastoreItem(id, JSON.stringify(updated), CATEGORY);
    invalidate();
  }, [templates, invalidate]);

  // Delete a template
  const deleteTemplate = useCallback(async (id: string) => {
    await deleteDatastoreItem(id, CATEGORY);
    invalidate();
  }, [invalidate]);

  // Initialize defaults in datastore
  const initializeDefaults = useCallback(async () => {
    for (const template of DEFAULT_CASE_TEMPLATES) {
      await setDatastoreItem(template.id, JSON.stringify(template), CATEGORY);
    }
    invalidate();
  }, [invalidate]);

  // Track template usage (silent update, no need to invalidate aggressively)
  const trackUsage = useCallback(async (id: string) => {
    const template = templates.find(t => t.id === id);
    if (template) {
      await setDatastoreItem(id, JSON.stringify({ 
        ...template, 
        usageCount: (template.usageCount || 0) + 1 
      }), CATEGORY);
    }
  }, [templates]);

  return {
    templates,
    isLoading,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    initializeDefaults,
    trackUsage,
  };
};

export default useCaseTemplates;
