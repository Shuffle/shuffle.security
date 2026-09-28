/**
 * ThreatIntelReadinessBanner — the threat intelligence twin of the
 * Automation Readiness banner used on /incidents and /vulnerabilities.
 *
 * Uses the exact same singular `AutomationReadinessCard` component with
 * threat intel specific checks (feed ingestion, realtime extraction,
 * incident enrichment, and default IOC/feed catalogs).
 */
import React, { useState } from 'react';
import { useTheme } from '@mui/material';
import {
  useThreatIntelAutomationStatus,
  ThreatIntelAutomationStatus,
  ThreatIntelCheck,
} from '@/hooks/useThreatIntelAutomationStatus';
import { AutomationReadinessCard, ReadinessItem } from '@/components/common/AutomationReadinessCard';
import { UsecaseDrawer } from '@/Shuffle-Core';
import { API_CONFIG } from '@/Shuffle-MCPs/api';

export interface ThreatIntelReadinessBannerProps {
  status?: ThreatIntelAutomationStatus;
  onOpenUsecase?: (usecaseId: string) => void;
  atTop?: boolean;
}

export const ThreatIntelReadinessBanner: React.FC<ThreatIntelReadinessBannerProps> = ({
  status: external,
  onOpenUsecase,
  atTop,
}) => {
  const internal = useThreatIntelAutomationStatus();
  const status = external ?? internal;
  // Self-contained theme + user resolution (no host AuthContext/ThemeContext),
  // so this banner also renders when Usecases is consumed via the published
  // @shuffleio/shuffle-core package (e.g. shaffuru), where those host providers
  // don't exist. MUI theme comes from ShuffleCoreThemeProvider; user info is
  // read from localStorage the same way CategoryAutomationsDialog does.
  const resolvedTheme = useTheme().palette.mode;
  let userInfo: any = undefined;
  try {
    const raw = localStorage.getItem('shuffle_user_info');
    if (raw) userInfo = JSON.parse(raw);
  } catch {
    userInfo = undefined;
  }
  const [internalDrawerId, setInternalDrawerId] = useState<string | null>(null);

  const handleOpenUsecase = (flowId: string) => {
    if (onOpenUsecase) {
      onOpenUsecase(flowId);
    } else {
      setInternalDrawerId(flowId);
    }
  };

  const items: ReadinessItem[] = status.checks.map((check: ThreatIntelCheck) => ({
    id: check.key,
    label: check.label,
    active: check.active,
    loading: status.isLoading,
    busy: check.busy,
    tooltip: check.tooltip,
    checks: check.parts,
    onEnable: check.enable,
    onDisable: check.disable,
    onOpenUsecase: check.usecaseId ? () => handleOpenUsecase(check.usecaseId!) : undefined,
  }));

  return (
    <>
      <AutomationReadinessCard
        title="Automation Readiness"
        items={items}
        allActive={status.allActive}
        isLoading={status.isLoading}
        isEnablingAll={status.isEnablingAll}
        onEnableAll={status.enableAll}
        enableAllLabel="Enable all"
        atTop={atTop}
      />
      <UsecaseDrawer
        open={!!internalDrawerId}
        onClose={() => setInternalDrawerId(null)}
        flowId={internalDrawerId}
        globalUrl={API_CONFIG.baseUrl}
        userdata={userInfo as any}
        isLoaded={true}
        isLoggedIn={!!userInfo}
        theme={resolvedTheme}
      />
    </>
  );
};

export default ThreatIntelReadinessBanner;
