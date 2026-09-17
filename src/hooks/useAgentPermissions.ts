/**
 * Hook for managing AI Agent permissions
 * Stores permission config in the Shuffle datastore
 */

import { useState, useEffect, useCallback } from 'react';
import { setDatastoreItem, getDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';
import { hasShuffleAuth } from '@/Shuffle-MCPs/api';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface AgentPermission {
  id: string;
  name: string;
  description: string;
  risk: RiskLevel;
  enabled: boolean;
  category: string;
  disabled?: boolean;
  /** Whether this action can be executed on monitored hosts */
  hostActionable?: boolean;
}

export interface AgentPermissionCategory {
  id: string;
  label: string;
  icon: string; // lucide icon name
  permissions: AgentPermission[];
  disabled?: boolean;
}

const DATASTORE_KEY = 'agent_permissions';

export const DEFAULT_AGENT_PERMISSIONS: AgentPermissionCategory[] = [
  {
    id: 'incident_response',
    label: 'Incident Response',
    icon: 'Zap',
    disabled: true,
    permissions: [
      {
        id: 'block_ips',
        name: 'Block IP Addresses',
        description: 'Add IPs to firewall blocklists automatically',
        risk: 'medium',
        enabled: true,
        category: 'incident_response',
        disabled: true,
      },
      {
        id: 'isolate_systems',
        name: 'Isolate Systems',
        description: 'Quarantine compromised systems from the network',
        risk: 'high',
        enabled: false,
        category: 'incident_response',
        hostActionable: true,
      },
      {
        id: 'disable_accounts',
        name: 'Disable User Accounts',
        description: 'Suspend compromised or suspicious user accounts via IAM',
        risk: 'high',
        enabled: false,
        category: 'incident_response',
        hostActionable: true,
      },
      {
        id: 'force_password_reset',
        name: 'Force Password Reset',
        description: 'Trigger password reset for affected accounts',
        risk: 'medium',
        enabled: true,
        category: 'incident_response',
        disabled: true,
      },
      {
        id: 'update_case_status',
        name: 'Update Case Status',
        description: 'Change incident severity, status and assignment based on findings',
        risk: 'medium',
        enabled: true,
        category: 'incident_response',
      },
      {
        id: 'suggest_remediation',
        name: 'Suggest Remediation Steps',
        description: 'Recommend response actions and remediation plans for incidents',
        risk: 'low',
        enabled: true,
        category: 'incident_response',
      },
      {
        id: 'manage_ioc_watchlists',
        name: 'Manage IOC Watchlists',
        description: 'Add, remove and prioritize indicators of compromise in watchlists',
        risk: 'medium',
        enabled: false,
        category: 'incident_response',
      },
      {
        id: 'monitor_network_traffic',
        name: 'Monitor Network Traffic',
        description: 'Capture and analyze network traffic patterns for anomalies',
        risk: 'medium',
        enabled: false,
        category: 'incident_response',
        disabled: true,
      },
    ],
  },
  {
    id: 'threat_detection',
    label: 'Threat Detection',
    icon: 'Radar',
    disabled: true,
    permissions: [
      {
        id: 'scan_vulnerabilities',
        name: 'Scan for Vulnerabilities',
        description: 'Run automated vulnerability scans on systems',
        risk: 'low',
        enabled: true,
        category: 'threat_detection',
      },
      {
        id: 'analyze_logs',
        name: 'Analyze Security Logs',
        description: 'Parse and analyze security event logs from SIEM',
        risk: 'low',
        enabled: true,
        category: 'threat_detection',
        disabled: true,
      },
      {
        id: 'tune_detection_rules',
        name: 'Tune Detection Rules',
        description: 'Adjust thresholds, suppress false positives and refine detection logic',
        risk: 'medium',
        enabled: false,
        category: 'threat_detection',
      },
    ],
  },
  {
    id: 'monitoring_alerts',
    label: 'Monitoring & Alerts',
    icon: 'Bell',
    disabled: true,
    permissions: [
      {
        id: 'send_alerts',
        name: 'Send Security Alerts',
        description: 'Notify security team of detected threats',
        risk: 'low',
        enabled: true,
        category: 'monitoring_alerts',
      },
      {
        id: 'escalate_incidents',
        name: 'Escalate Incidents',
        description: 'Automatically escalate critical security incidents',
        risk: 'medium',
        enabled: true,
        category: 'monitoring_alerts',
      },
      {
        id: 'email_reports',
        name: 'Email Security Reports',
        description: 'Send automated security reports to stakeholders',
        risk: 'low',
        enabled: true,
        category: 'monitoring_alerts',
      },
    ],
  },
  {
    id: 'system_access',
    label: 'System Access',
    icon: 'Server',
    disabled: true,
    permissions: [
      {
        id: 'read_configs',
        name: 'Read System Configs',
        description: 'Access firewall rules and security configurations',
        risk: 'low',
        enabled: true,
        category: 'system_access',
      },
      {
        id: 'modify_firewall',
        name: 'Modify Firewall Rules',
        description: 'Add or update firewall rules and policies',
        risk: 'high',
        enabled: false,
        category: 'system_access',
      },
      {
        id: 'endpoint_control',
        name: 'Endpoint Control',
        description: 'Execute commands on managed endpoints via EDR',
        risk: 'high',
        enabled: false,
        category: 'system_access',
      },
    ],
  },
];

export const getDatastoreKeyForSkill = (skill: string = 'incident-handler'): string => {
  const clean = (skill || 'incident-handler').toLowerCase().trim();
  return `agent_permissions_${clean}`;
};

export const useAgentPermissions = (skill: string = 'incident-handler') => {
  const [categories, setCategories] = useState<AgentPermissionCategory[]>(DEFAULT_AGENT_PERMISSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const datastoreKey = getDatastoreKeyForSkill(skill);

  // Load permissions from datastore
  const loadPermissions = useCallback(async () => {
    if (!hasShuffleAuth()) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      let response = await getDatastoreItem(datastoreKey, DATASTORE_CATEGORIES.CONFIGURATION);
      // For incident-handler, fall back to legacy 'agent_permissions' if skill-specific key has not been populated yet
      if ((!response.success || !response.item?.value) && (skill === 'incident-handler' || skill === 'default')) {
        response = await getDatastoreItem('agent_permissions', DATASTORE_CATEGORIES.CONFIGURATION);
      }

      if (response.success && response.item?.value) {
        const data = typeof response.item.value === 'string'
          ? JSON.parse(response.item.value)
          : response.item.value;
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data);
          return;
        }
      }
      setCategories(DEFAULT_AGENT_PERMISSIONS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions');
    } finally {
      setIsLoading(false);
    }
  }, [datastoreKey, skill]);

  // Save permissions to datastore
  const savePermissions = useCallback(async (updatedCategories: AgentPermissionCategory[]) => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await setDatastoreItem(datastoreKey, updatedCategories, DATASTORE_CATEGORIES.CONFIGURATION);
      if (!response.success) {
        setError(response.error || 'Failed to save permissions');
        return false;
      }
      // If incident-handler, keep legacy 'agent_permissions' key updated for backwards compatibility
      if (skill === 'incident-handler' || skill === 'default') {
        await setDatastoreItem('agent_permissions', updatedCategories, DATASTORE_CATEGORIES.CONFIGURATION);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [datastoreKey, skill]);

  // Toggle a single permission
  const togglePermission = useCallback(async (categoryId: string, permissionId: string) => {
    const updated = categories.map(cat => {
      if (cat.id !== categoryId) return cat;
      return {
        ...cat,
        permissions: cat.permissions.map(p =>
          p.id === permissionId ? { ...p, enabled: !p.enabled } : p
        ),
      };
    });
    setCategories(updated);
    await savePermissions(updated);
  }, [categories, savePermissions]);

  // Toggle all permissions in a category
  const toggleCategory = useCallback(async (categoryId: string, enabled: boolean) => {
    const updated = categories.map(cat => {
      if (cat.id !== categoryId) return cat;
      return {
        ...cat,
        permissions: cat.permissions.map(p => ({ ...p, enabled })),
      };
    });
    setCategories(updated);
    await savePermissions(updated);
  }, [categories, savePermissions]);

  // Reset to defaults
  const resetToDefaults = useCallback(async () => {
    setCategories(DEFAULT_AGENT_PERMISSIONS);
    await savePermissions(DEFAULT_AGENT_PERMISSIONS);
  }, [savePermissions]);

  // Computed stats
  const totalPermissions = categories.reduce((sum, cat) => sum + cat.permissions.length, 0);
  const enabledPermissions = categories.reduce(
    (sum, cat) => sum + cat.permissions.filter(p => p.enabled).length,
    0
  );

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  return {
    categories,
    isLoading,
    isSaving,
    error,
    totalPermissions,
    enabledPermissions,
    togglePermission,
    toggleCategory,
    resetToDefaults,
    loadPermissions,
  };
};
