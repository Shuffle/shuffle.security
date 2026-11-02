import { useEffect, useRef, useState } from 'react';
import { API_CONFIG, getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { fetchEnvironmentsCached } from '@/Shuffle-Core/views/appsFetchCache';
import { useAuth } from '@/context/AuthContext';

export type OrborusPlatform = 'linux' | 'macos' | 'windows';

export interface OrborusDeployOptions {
  baseUrl?: string;
  queue?: string;
  orgId?: string;
  auth?: string;
  softwareListEnabled?: boolean;
  hdEncryptedCheck?: boolean;
  screenlockCheck?: boolean;
  codeScannerEnabled?: boolean;
  responseActions?: string;
  logForwarding?: string;
  runAsAdmin?: boolean;
}

export interface OrborusDeployConfig extends OrborusDeployOptions {
  groupName: string;
  hasRealCredentials: boolean;
  loading: boolean;
}

/**
 * Builds the complete Orborus sensor installation command including base_url,
 * queue (Runtime Location), org_id, posture check flags, and the Auth header.
 */
export function buildOrborusDeployCommand(
  platform: OrborusPlatform,
  options?: OrborusDeployOptions,
): string {
  const baseUrl = (options?.baseUrl || API_CONFIG.baseUrl || 'https://shuffler.io').replace(/\/+$/, '');
  const queue = (options?.queue || 'default_monitors').trim() || 'default_monitors';
  const orgId = (options?.orgId || '').trim() || '<ORG_ID>';
  const auth = (options?.auth || '').trim() || '<AUTH_KEY>';
  const softwareListEnabled = options?.softwareListEnabled ?? true;
  const hdEncryptedCheck = options?.hdEncryptedCheck ?? true;
  const screenlockCheck = options?.screenlockCheck ?? true;
  const codeScannerEnabled = options?.codeScannerEnabled ?? true;
  const responseActions = options?.responseActions ?? 'full';
  const logForwarding = options?.logForwarding ?? 'false';
  const runAsAdmin = options?.runAsAdmin ?? true;

  const parts: string[] = [
    `base_url=${baseUrl}`,
    'sensor_mode=true',
    `queue=${queue}`,
    `org_id=${orgId}`,
    `software_list_enabled=${softwareListEnabled}`,
    `hd_encrypted_check=${hdEncryptedCheck}`,
    `screenlock_check=${screenlockCheck}`,
    `code_scanner_enabled=${codeScannerEnabled}`,
    `response_actions=${responseActions}`,
    `log_forwarding=${logForwarding}`,
  ];

  const downloadUrl = 'https://shuffler.io/api/v1/orborus';

  if (platform === 'windows') {
    parts.push('os=windows');
    if (!runAsAdmin) parts.push('admin=false');
    const winAuthHeader = ` -Headers @{'Auth'='${auth}'}`;
    return `powershell -ExecutionPolicy Bypass -Command "& {iex (irm '${downloadUrl}?${parts.join('&')}'${winAuthHeader})}"`.replace(/  +/g, ' ');
  }

  const authHeader = `-H 'Auth: ${auth}'`;
  return `curl '${downloadUrl}?${parts.join('&')}' ${authHeader} | sh`.replace(/  +/g, ' ');
}

/**
 * Rewrites bare `/api/v1/orborus?sensor_mode=true` installation snippets in
 * documentation markdown so they always include the required `base_url`,
 * `queue`, `org_id`, check flags, and `Auth` header.
 */
export function enrichOrborusDeployMarkdown(
  markdown: string,
  options?: OrborusDeployOptions,
): string {
  if (!markdown || !markdown.includes('/api/v1/orborus')) return markdown;

  // 1. Replace bare PowerShell Orborus sensor install commands missing org_id/queue
  let updated = markdown.replace(
    /powershell\s+-ExecutionPolicy\s+Bypass\s+-Command\s+"&\s*\{iex\s*\(irm\s+'https?:\/\/[^']+\/api\/v1\/orborus\?([^']*)'\)\}"/gi,
    (fullMatch, query: string) => {
      if (query.includes('org_id=') && query.includes('queue=')) return fullMatch;
      return buildOrborusDeployCommand('windows', options);
    },
  );

  // 2. Replace bare curl Orborus sensor install commands missing org_id/queue
  updated = updated.replace(
    /curl\s+(?:-[a-zA-Z]+\s+)*['"]https?:\/\/[^'"]+\/api\/v1\/orborus\?([^'"]*)['"](?:\s+-H\s+['"][^'"]*['"])?(?:\s*\|\s*(?:sudo\s+)?(?:ba)?sh\b)?/gi,
    (fullMatch, query: string) => {
      if (query.includes('org_id=') && query.includes('queue=')) return fullMatch;
      const isMac = /os=darwin/i.test(query);
      return buildOrborusDeployCommand(isMac ? 'macos' : 'linux', options);
    },
  );

  return updated;
}

interface RawEnvironment {
  id?: string;
  Name?: string;
  name?: string;
  queue?: string;
  auth?: string;
  org_id?: string;
  sensor_group?: boolean;
  archived?: boolean;
  sensor_hosts?: Array<{ checkin?: number }>;
  [key: string]: unknown;
}

const selectPreferredSensorGroup = (envs: RawEnvironment[]) => {
  const sensorGroups = envs.filter((e) => e?.sensor_group === true && !e?.archived);
  if (sensorGroups.length === 0) return null;

  const now = Date.now() / 1000;
  const recent = sensorGroups.find((g) => {
    const hosts = Array.isArray(g.sensor_hosts) ? g.sensor_hosts : [];
    if (hosts.length === 0) return false;
    const latest = Math.max(...hosts.map((h) => Number(h?.checkin || 0)));
    return now - latest < 600;
  });

  return recent || sensorGroups[0];
};

let _autoCreatePromise: Promise<RawEnvironment[] | null> | null = null;

/**
 * Resolves the active organization's sensor group (`queue`, `org_id`, `auth`)
 * for constructing valid Orborus sensor deployment commands in documentation
 * and quick-deploy views.
 */
export function useOrborusDeployConfig(): OrborusDeployConfig {
  const { isAuthenticated, userInfo } = useAuth();
  const fallbackOrgId = userInfo?.active_org?.id || '';
  const baseUrl = (API_CONFIG.baseUrl || 'https://shuffler.io').replace(/\/+$/, '');

  const [groupState, setGroupState] = useState<{
    groupName: string;
    queue: string;
    orgId: string;
    auth: string;
    loading: boolean;
  }>({
    groupName: 'default_monitors',
    queue: 'default_monitors',
    orgId: fallbackOrgId,
    auth: '',
    loading: Boolean(isAuthenticated),
  });

  const autoCreatedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setGroupState({
        groupName: 'default_monitors',
        queue: 'default_monitors',
        orgId: '',
        auth: '',
        loading: false,
      });
      return;
    }

    let cancelled = false;
    setGroupState((prev) => ({
      ...prev,
      orgId: prev.orgId || fallbackOrgId,
      loading: true,
    }));

    (async () => {
      try {
        const data = await fetchEnvironmentsCached(getApiUrl('/api/v1/getenvironments'), {
          credentials: 'include',
          headers: { ...getAuthHeader() },
        });
        let envs: RawEnvironment[] = Array.isArray(data)
          ? data
          : Array.isArray((data as any)?.environments)
            ? (data as any).environments
            : [];

        let chosen = selectPreferredSensorGroup(envs);

        // If authenticated and no sensor_group exists yet, provision default_monitors
        // once so the user gets a working queue + auth token immediately.
        if (!chosen && !autoCreatedRef.current) {
          autoCreatedRef.current = true;
          if (!_autoCreatePromise) {
            _autoCreatePromise = (async () => {
              try {
                const nonArchived = envs.filter((e) => !e?.archived);
                const updatedEnvs = [
                  ...nonArchived,
                  { Name: 'default_monitors', Type: 'onprem', sensor_group: true },
                ];
                const putRes = await fetch(getApiUrl('/api/v1/setenvironments'), {
                  method: 'PUT',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeader(),
                  },
                  body: JSON.stringify(updatedEnvs),
                });
                if (!putRes.ok) return null;
                const freshData = await fetchEnvironmentsCached(
                  getApiUrl('/api/v1/getenvironments'),
                  {
                    credentials: 'include',
                    headers: { ...getAuthHeader() },
                  },
                  true,
                );
                return Array.isArray(freshData) ? freshData : null;
              } catch {
                return null;
              } finally {
                _autoCreatePromise = null;
              }
            })();
          }
          const createdEnvs = await _autoCreatePromise;
          if (createdEnvs) {
            envs = createdEnvs;
            chosen = selectPreferredSensorGroup(envs);
          }
        }

        if (cancelled) return;

        if (chosen) {
          const name = String(chosen.Name || chosen.name || 'default_monitors');
          const queue = String(chosen.queue || name.replace(/ +/g, '-') || 'default_monitors');
          const orgId = String(chosen.org_id || fallbackOrgId || '');
          const auth = String(chosen.auth || '');
          setGroupState({
            groupName: name,
            queue,
            orgId,
            auth,
            loading: false,
          });
        } else {
          // Fallback to any environment's org_id if available
          const anyOrgId = String(envs.find((e) => e?.org_id)?.org_id || fallbackOrgId || '');
          setGroupState({
            groupName: 'default_monitors',
            queue: 'default_monitors',
            orgId: anyOrgId,
            auth: '',
            loading: false,
          });
        }
      } catch {
        if (!cancelled) {
          setGroupState((prev) => ({
            ...prev,
            orgId: prev.orgId || fallbackOrgId,
            loading: false,
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, fallbackOrgId]);

  const effectiveOrgId = groupState.orgId || fallbackOrgId;
  const hasRealCredentials = Boolean(isAuthenticated && effectiveOrgId && groupState.auth);

  return {
    baseUrl,
    groupName: groupState.groupName,
    queue: groupState.queue,
    orgId: effectiveOrgId || undefined,
    auth: groupState.auth || undefined,
    hasRealCredentials,
    loading: groupState.loading,
  };
}
