/**
 * useAppAuthFlow — Shared hook for the search→authenticate flow.
 * Encapsulates fetching auth entries, saving credentials, and testing connections.
 * Used by AddAppModal, AppSearchDrawer, and anywhere else that needs app auth.
 *
 * Self-contained: lives in Shuffle-MCPs so library consumers can use the same
 * auth flow without host-app wiring.
 */

import { useState, useCallback } from 'react';
import type { AlgoliaSearchApp } from './index';
import type { AppAuthState, ApiAuthEntry } from './components/AppAuthConfig';
import { getApiUrl, getAuthHeader } from './api';
import { refreshAllIntegrationStatus } from './components/IntegrationStatus';
import { fetchAuthenticatedApps, invalidateAuthenticatedAppsCache } from './authenticatedApps';

export function useAppAuthFlow() {
  const [selectedApp, setSelectedApp] = useState<AlgoliaSearchApp | null>(null);
  const [authState, setAuthState] = useState<AppAuthState>({
    systemId: '',
    status: 'pending',
    credentials: {},
  });
  const [authenticatedApps, setAuthenticatedApps] = useState<ApiAuthEntry[]>([]);
  const [authLoading, setAuthLoading] = useState(false);

  const fetchAuthForApp = useCallback(async (appName: string, appImageUrl?: string) => {

    setAuthLoading(true);
    try {
      const authData = await fetchAuthenticatedApps();
      const normalize = (n: string) => n.toLowerCase().replace(/[\s_\-]+/g, '_');
      const appEntries = (authData as ApiAuthEntry[])
        .filter(
          (a: ApiAuthEntry) => normalize(a.app?.name || '') === normalize(appName)
        )
        .map((a: ApiAuthEntry) => ({
          ...a,
          app: {
            ...a.app,
            large_image: a.app?.large_image || appImageUrl || '',
          },
        }));
      setAuthenticatedApps(appEntries);
    } catch (err) {
      console.error('Failed to fetch auth entries:', err);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const selectApp = useCallback((app: AlgoliaSearchApp) => {
    setSelectedApp(app);
    setAuthState({ systemId: app.objectID, status: 'pending', credentials: {} });
    fetchAuthForApp(app.name, app.image_url);
  }, [fetchAuthForApp]);

  const clearSelection = useCallback(() => {
    setSelectedApp(null);
    setAuthState({ systemId: '', status: 'pending', credentials: {} });
    setAuthenticatedApps([]);
  }, []);

  const handleAuthChange = useCallback((_appId: string, credentials: Record<string, string>) => {
    setAuthState(prev => ({ ...prev, credentials }));
  }, []);

  const handleTestConnection = useCallback(async (systemId: string, authenticationId?: string) => {
    if (!selectedApp) return;
    setAuthState(prev => ({ ...prev, status: 'testing' }));

    try {
      const requestBody: Record<string, string | boolean> = {
        action: 'test_api',
        app: selectedApp.name.toLowerCase(),
        skip_workflow: true,
      };
      if (authenticationId) requestBody.authentication_id = authenticationId;

      const response = await fetch(getApiUrl('/api/v1/apps/categories/run'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
          'Accept-Encoding': 'identity',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      const validActions = ['done', 'app_validation'];
      const isValid = response.ok && validActions.includes(result.action) && result.success === true;

      await fetchAuthForApp(selectedApp.name, selectedApp.image_url);
      refreshAllIntegrationStatus();

      setAuthState(prev => ({
        ...prev,
        status: isValid ? 'connected' : 'error',
        workflowId: result.workflow_id || undefined,
        executionId: result.execution_id || undefined,
        successMessage: isValid ? 'Connection verified' : undefined,
        errorMessage: isValid ? undefined : (result.reason || 'Connection failed. Please check your credentials.'),
      }));
    } catch (err) {
      setAuthState(prev => ({
        ...prev,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Connection test failed.',
      }));
    }
  }, [selectedApp, fetchAuthForApp]);

  const handleSaveAuth = useCallback(async (appId: string, credentials: Record<string, string>): Promise<boolean> => {
    if (!selectedApp) return false;

    const fields = Object.entries(credentials)
      .filter(([key, value]) => key?.trim() && value?.trim())
      .map(([key, value]) => ({ key, value }));

    const payload = {
      label: `Auth for ${selectedApp.name.replace(/_/g, ' ')}`,
      app: {
        name: selectedApp.name,
        id: selectedApp.objectID,
        app_version: '1.0.0',
      },
      fields,
      active: true,
    };

    try {
      const response = await fetch(getApiUrl('/api/v1/apps/authentication'), {
        method: 'PUT',
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (response.ok && result.success !== false) {
        invalidateAuthenticatedAppsCache();
        await fetchAuthForApp(selectedApp.name, selectedApp.image_url);
        refreshAllIntegrationStatus();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [selectedApp, fetchAuthForApp]);

  const refreshAuth = useCallback(async () => {
    if (selectedApp) {
      await fetchAuthForApp(selectedApp.name, selectedApp.image_url);
    }
  }, [selectedApp, fetchAuthForApp]);

  return {
    selectedApp,
    authState,
    authenticatedApps,
    authLoading,
    selectApp,
    clearSelection,
    handleAuthChange,
    handleTestConnection,
    handleSaveAuth,
    refreshAuth,
  };
}
