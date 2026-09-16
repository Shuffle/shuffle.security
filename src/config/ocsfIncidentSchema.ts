// OCSF Incident Finding Schema (class_uid: 2005)
// Full specification with custom metadata extensions for Shuffle Security

// ============================================================================
// TLP (Traffic Light Protocol) - Integer-based per OCSF
// ============================================================================
export const TLP_LEVELS = {
  CLEAR: 1,
  GREEN: 2,
  AMBER: 3,
  RED: 4,
} as const;

export const TLP_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'TLP:CLEAR', color: '#ffffff' },
  2: { label: 'TLP:GREEN', color: '#22c55e' },
  3: { label: 'TLP:AMBER', color: '#f59e0b' },
  4: { label: 'TLP:RED', color: '#ef4444' },
};

// Legacy string-to-integer mapping for backward compatibility
export const TLP_STRING_TO_INT: Record<string, number> = {
  'TLP:CLEAR': 1,
  'TLP:GREEN': 2,
  'TLP:AMBER': 3,
  'TLP:AMBER+STRICT': 3,
  'TLP:RED': 4,
};

// ============================================================================
// Observable/IOC Interface
// ============================================================================
export interface Observable {
  type: string;
  value: string;
  archived?: boolean;
  first_seen?: string | number;
  last_seen?: string | number;
}

// ============================================================================
// Comment (replaces legacy ActivityItem for comments only)
// ============================================================================
export interface Comment {
  author: string;
  timestamp: string; // ISO 8601 string
  text: string;
}

// ============================================================================
// Task Interface (custom extension)
// ============================================================================
export interface FileAttachment {
  id: string;
  filename: string;
  filesize: number;
  uploadedAt?: number;
}

export interface IncidentTask {
  id: string;
  title: string;
  description?: string;
  category?: string;
  completed: boolean;
  assignee?: string;
  dueDate?: string;
  dependsOn?: string;
  createdAt: number;
  completedAt?: number;
  createdBy?: string;
  aiWorking?: boolean;
  attachments?: FileAttachment[];
  disabled?: boolean; // Soft-delete flag - hidden in UI but preserved in data
  // Persisted lane key (e.g. 'todo', 'in_progress'). When omitted the task
  // defaults to the first non-`done` lane ("To Do"). Mirrored on disk so
  // status changes survive reloads.
  _lane?: string;
  // Append-only audit log of status transitions. Each entry captures the
  // lane the task moved between and when/who triggered it. Used to power
  // the incident timeline's "task moved" markers.
  statusHistory?: Array<{
    from: string;
    to: string;
    at: number;
    by?: string;
  }>;
  deletedAt?: number;
  deletedBy?: string;
  assignHistory?: Array<{
    assignee: string;
    at: number;
    by?: string;
  }>;
  aiStatus?: 'pending' | 'running' | 'completed' | 'failed';
  aiPrompt?: string;
  aiRunAt?: number;
  aiOutput?: string;
  aiRunId?: string;
}

// Task categories for organization
export const taskCategories = [
  { value: 'triage', label: 'Triage', color: '#22b8cf' },
  { value: 'investigation', label: 'Investigation', color: '#a855f7' },
  { value: 'containment', label: 'Containment', color: '#f59e0b' },
  { value: 'eradication', label: 'Eradication', color: '#ef4444' },
  { value: 'recovery', label: 'Recovery', color: '#22c55e' },
  { value: 'communication', label: 'Communication', color: '#3b82f6' },
  { value: 'documentation', label: 'Documentation', color: '#6b7280' },
];

// ============================================================================
// Severity Mapping
// ============================================================================
export const severityOptions = [
  { id: 1, label: 'Informational', value: 'informational' },
  { id: 2, label: 'Low', value: 'low' },
  { id: 3, label: 'Medium', value: 'medium' },
  { id: 4, label: 'High', value: 'high' },
  { id: 5, label: 'Critical', value: 'critical' },
];

export const mapOCSFSeverity = (severityId: number): string => {
  switch (severityId) {
    case 1: return 'informational';
    case 2: return 'low';
    case 3: return 'medium';
    case 4: return 'high';
    case 5: return 'critical';
    default: return 'medium';
  }
};

// ============================================================================
// Status Mapping
// ============================================================================
export const mapOCSFStatus = (statusId: number): string => {
  switch (statusId) {
    case 1: return 'new';
    case 2: return 'in_progress';
    case 3: return 'resolved';
    case 4: return 'on_hold';
    case 5: return 'escalated';
    case 6: return 'merged';
    // Legacy: 99 was used by the old destructive smartMerge writer.
    case 99: return 'merged';
    default: return 'new';
  }
};

// ============================================================================
// OCSF Incident Finding Interface (class_uid: 2005)
// Full new format with all fields
// ============================================================================
export interface OCSFIncidentFinding {
  // Required fields
  class_uid: 2005;
  class_name: 'Incident Finding';
  finding_uid: string;
  title: string;
  
  // Optional core fields
  desc?: string;
  severity_id?: number;
  severity?: string;
  status_id?: number;
  status?: string;
  confidence?: number; // 0-100 score
  
  // Timestamps (ISO 8601 strings)
  created_time?: string;
  first_seen_time?: string;
  last_seen_time?: string;
  modified_time?: string;
  
  // Classification
  types?: string[];
  
  // Product info
  product?: {
    name?: string;
    uid?: string;
  };
  
  // Related data
  related_events?: string[];
  references?: string[];
  supporting_data?: string;
  
  // Remediation
  remediation?: {
    desc?: string;
  };
  
  // Metadata with custom extensions
  metadata?: {
    uid?: string;
    activity_id?: string;
    extensions?: {
      custom_attributes?: {
        // Standard OCSF extension
        comments?: Comment[];
        tlp?: number;
        
        // Custom extensions for Shuffle Security
        tasks?: IncidentTask[];
        observables?: Observable[];
        customFields?: Record<string, string | number | boolean>;
        assignee?: string;
        attachments?: FileAttachment[];
      };
    };
  };
}

// ============================================================================
// Legacy ActivityItem (for backward compatibility during migration)
// ============================================================================
export interface LegacyActivityItem {
  id: string;
  type: 'comment' | 'change' | 'status' | 'assignment' | 'created';
  user: string;
  timestamp: number;
  content: string;
  details?: Record<string, unknown>;
  attachments?: FileAttachment[];
}

// ============================================================================
// Legacy OCSF Format (for parsing old data)
// ============================================================================
export interface LegacyOCSFIncidentFinding {
  class_uid: 2005;
  class_name: 'Incident Finding';
  message?: string;
  severity_id: number;
  severity: string;
  type_uid?: number;
  type_name?: string;
  activity_id?: number;
  activity_name?: string;
  status_id: number;
  status: string;
  status_detail?: string;
  time?: number;
  finding_info_list?: Array<{
    title: string;
    uid: string;
    src_url?: string;
    types?: string[];
    references?: string[];
  }>;
  finding_info?: {
    title: string;
    uid: string;
    src_url?: string;
    types?: string[];
    references?: string[];
  };
  observables?: Observable[];
  assignee?: string;
  related_findings?: string[];
  tlp?: string;
  pap?: string;
  tasks?: IncidentTask[];
  activity?: LegacyActivityItem[];
  customFields?: Record<string, string | number | boolean>;
  metadata?: {
    product?: {
      name: string;
      vendor_name?: string;
    };
    version?: string;
    extensions?: {
      custom_attributes?: {
        tlp?: string | number;
        pap?: string;
        tasks?: IncidentTask[];
        activity?: LegacyActivityItem[];
        customFields?: Record<string, string | number | boolean>;
      };
    };
  };
}

// ============================================================================
// Helper: Convert legacy activity to comments
// ============================================================================
export const convertLegacyActivityToComments = (activity: LegacyActivityItem[]): Comment[] => {
  return activity
    .filter(a => a.type === 'comment' || a.type === 'status')
    .map(a => ({
      author: a.user,
      timestamp: new Date(a.timestamp).toISOString(),
      text: a.content,
    }));
};

// ============================================================================
// Helper: Convert legacy TLP string to integer
// ============================================================================
export const convertLegacyTlp = (tlp: string | number | undefined): number => {
  if (typeof tlp === 'number') return tlp;
  if (typeof tlp === 'string') return TLP_STRING_TO_INT[tlp] || 2;
  return 2; // Default to GREEN
};

// ============================================================================
// Helper: Generate unique finding ID
// ============================================================================
export const generateFindingUid = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  for (let i = 0; i < 10; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
};
