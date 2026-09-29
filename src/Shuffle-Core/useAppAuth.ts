import { useState, useCallback, useEffect, useRef } from 'react';
import { getApiUrl, getAuthHeader, hasShuffleAuth } from '@/Shuffle-MCPs/api';
import type { AppAuthState, AuthStatus, ApiAuthEntry } from '@/Shuffle-MCPs/components/AppAuthConfig';
import { refreshAllIntegrationStatus } from '@/Shuffle-MCPs/components/IntegrationStatus';
import {
  fetchAuthenticatedApps as fetchSharedAuthenticatedApps,
  invalidateAuthenticatedAppsCache,
} from '@/Shuffle-MCPs/authenticatedApps';

// Helper to process auth data and invalidate entries older than 30 days
const processAuthData = (authData: ApiAuthEntry[]): ApiAuthEntry[] => {
  const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  return authData.map(entry => {
    if (entry.validation?.valid === true && entry.validation?.last_valid) {
      const lastValidMs = entry.validation.last_valid > 1e12 
        ? entry.validation.last_valid 
        : entry.validation.last_valid * 1000;
      
      if (lastValidMs < thirtyDaysAgoMs) {
        return {
          ...entry,
          validation: {
            ...entry.validation,
            valid: false,
            error: 'Validation expired (older than 30 days)',
          },
        };
      }
    }
    return entry;
  });
};

// Human-readable error descriptions for HTTP status codes
const getStatusDescription = (status: number | string): string => {
  const statusDescriptions: Record<number, string> = {
    400: 'Bad Request – The request was malformed or missing required parameters',
    401: 'Unauthorized – Invalid or expired API key/credentials',
    403: 'Forbidden – Access denied. Check your permissions',
    404: 'Not Found – The API endpoint or resource doesn\'t exist',
    429: 'Too Many Requests – Rate limit exceeded. Try again later',
    500: 'Internal Server Error – Something went wrong on the server',
    502: 'Bad Gateway – The server received an invalid response',
    503: 'Service Unavailable – The service is temporarily down',
  };
  const num = Number(status);
  if (statusDescriptions[num]) return statusDescriptions[num];
  if (num >= 400 && num < 500) return 'Client Error – Check your request parameters';
  if (num >= 500 && num < 600) return 'Server Error – The remote service may be unavailable';
  return '';
};

const parseResultData = (data: any) => {
  const rawData = data.result || data.raw_response;
  if (!rawData) return null;
  try {
    return typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
  } catch {
    return null;
  }
};

export function useAppAuth() {
  const [authStates, setAuthStates] = useState<Record<string, AppAuthState>>({});
  const [authenticatedApps, setAuthenticatedApps] = useState<ApiAuthEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedAuthRef = useRef(false);

  // Load authenticated apps on mount
  const fetchAuthenticatedApps = useCallback(async () => {
    if (!hasShuffleAuth()) {
      setLoading(false);
      return;
    }
    if (!hasLoadedAuthRef.current) setLoading(true);
    try {
      const authData = await fetchSharedAuthenticatedApps();
      setAuthenticatedApps(processAuthData(authData as ApiAuthEntry[]));
    } catch (error) {
      console.error('Failed to fetch auth data:', error);
    } finally {
      hasLoadedAuthRef.current = true;
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    fetchAuthenticatedApps();
  }, [fetchAuthenticatedApps]);

  const handleAuthChange = useCallback((systemId: string, credentials: Record<string, string>) => {
    setAuthStates((prev) => ({
      ...prev,
      [systemId]: {
        systemId,
        status: 'pending' as AuthStatus,
        credentials,
      },
    }));
  }, []);

  const handleTestConnection = useCallback(async (systemId: string, authenticationId?: string) => {
    setAuthStates((prev) => ({
      ...prev,
      [systemId]: {
        ...prev[systemId],
        systemId,
        status: 'testing' as AuthStatus,
        credentials: prev[systemId]?.credentials || {},
      },
    }));

    try {
      const requestBody: Record<string, string | boolean> = {
        action: 'test_api',
        app: systemId,
        skip_workflow: true,
      };
      
      if (authenticationId) {
        requestBody.authentication_id = authenticationId;
      }

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
      
      let isValid = false;
      let errorMessage = 'Failed to connect. Please check your credentials.';
      let successMessage = '';
      let warningMessage = '';
      let errorCode: number | undefined;
      let workflowId = result.workflow_id || '';
      let executionId = result.execution_id || '';

      const validActions = ['done', 'app_validation'];
      if (response.ok && validActions.includes(result.action) && result.success === true) {
        try {
          const resultData = parseResultData(result);
          
          const hasErrorInBody = resultData && (
            resultData.error !== undefined || 
            resultData.ok === false
          );
          
          if (hasErrorInBody) {
            const errorDetail = resultData.error || resultData.reason || 'unknown error';
            isValid = true;
            successMessage = `Connection likely working, but API returned: ${typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail)}`;
            warningMessage = 'The API responded but included an error field.';
          } else if (resultData && resultData.status) {
            const parsedStatus = resultData.status;
            const statusLower = String(parsedStatus).toLowerCase();
            const statusNum = Number(parsedStatus);

            const isErrorStatus = (statusNum >= 400 && statusNum < 600) ||
              statusLower === 'error' || statusLower === 'failed' ||
              statusLower === 'unauthorized' || statusLower === 'forbidden';
            
            if (statusNum === 401 || statusNum === 403 || statusLower === 'unauthorized' || statusLower === 'forbidden') {
              errorCode = statusNum || 401;
            }
            
            const isGoodStatus = !isErrorStatus && (
              statusLower === 'ok' || statusLower === 'success' || statusLower === 'healthy' ||
              statusLower === 'connected' || statusLower === '200' || statusNum === 200
            );
            
            if (isErrorStatus) {
              const statusDesc = getStatusDescription(parsedStatus);
              const reason = resultData.reason ? ` • ${resultData.reason}` : '';
              errorMessage = statusDesc ? `${statusDesc}${reason}` : `Connection failed • Status: ${parsedStatus}${reason}`;
            } else if (isGoodStatus) {
              isValid = true;
              successMessage = `Connection verified • Status: ${parsedStatus}`;
            } else {
              const statusDesc = getStatusDescription(parsedStatus);
              errorMessage = statusDesc || `Connection failed • Unexpected status: ${parsedStatus}`;
            }
          } else if (resultData?.success !== undefined) {
            if (resultData.success === true) {
              isValid = true;
              successMessage = 'Connection verified';
            } else {
              errorMessage = resultData.reason || 'Connection failed';
            }
          }
        } catch {
          errorMessage = 'Connection failed – Unable to parse response.';
        }
      } else if (result.status !== undefined) {
        const statusDesc = getStatusDescription(result.status);
        errorMessage = statusDesc || `Connection failed • Status: ${result.status}`;
        const sn = Number(result.status);
        if (sn === 401 || sn === 403) errorCode = sn;
      }

      // Refresh auth list & notify all IntegrationStatus instances
      await fetchAuthenticatedApps();
      refreshAllIntegrationStatus();

      setAuthStates((prev) => ({
        ...prev,
        [systemId]: {
          ...prev[systemId],
          systemId,
          credentials: prev[systemId]?.credentials || {},
          status: isValid ? 'connected' : 'error',
          errorMessage: isValid ? undefined : errorMessage,
          successMessage: isValid ? (successMessage || 'Connection verified') : undefined,
          warningMessage: isValid ? warningMessage : undefined,
          // Keep execution references on success too, so the run can always be inspected
          workflowId: workflowId || undefined,
          executionId: executionId || undefined,
          errorCode: isValid ? undefined : errorCode,
        },
      }));
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await fetchAuthenticatedApps();
      refreshAllIntegrationStatus();

      setAuthStates((prev) => ({
        ...prev,
        [systemId]: {
          ...prev[systemId],
          systemId,
          credentials: prev[systemId]?.credentials || {},
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Connection test failed.',
        },
      }));
    }
  }, [fetchAuthenticatedApps]);

  const handleSaveAuth = useCallback(async (appId: string, credentials: Record<string, string>, appName?: string, label?: string): Promise<boolean> => {
    const fields = Object.entries(credentials)
      .filter(([key, value]) => key?.trim() && value?.trim())
      .map(([key, value]) => ({ key, value }));

    const payload = {
      label: label?.trim() || `Auth for ${(appName || appId).replace(/_/g, ' ')}`,
      app: {
        name: appName || appId,
        id: appId,
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

      if (response.ok) {
        invalidateAuthenticatedAppsCache();
        await fetchAuthenticatedApps();
        refreshAllIntegrationStatus();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to save authentication:', error);
      return false;
    }
  }, [fetchAuthenticatedApps]);

  return {
    authStates,
    authenticatedApps,
    loading,
    handleAuthChange,
    handleTestConnection,
    handleSaveAuth,
    refreshAuth: fetchAuthenticatedApps,
  };
}
