/**
 * UsecasesPage — host wrapper around the standalone Shuffle-Core
 * implementation. Injects host-owned slots (currently: the same Webhook
 * ingestion button used on /incidents) into the usecase detail view so
 * /usecases/siem_alerts and /usecases/edr_alerts expose the exact same
 * enable/disable control next to "Source".
 */
import { Usecases, API_CONFIG } from '@/Shuffle-Core';
import { WebhookIngestionButton, type WebhookIngestionInfo } from '@/components/incidents/WebhookIngestionButton';
import { useWebhookStatus } from '@/hooks/useWebhookStatus';
import { useVulnerabilityAutomationStatus, VULNERABILITY_WORKFLOW_LABELS } from '@/hooks/useVulnerabilityAutomationStatus';
import { VulnerabilityReadinessBanner } from '@/components/vulnerabilities/VulnerabilityReadinessBanner';
import { useWorkflows } from '@/hooks/useWorkflows';
import { IncidentRoutingEditor } from '@/components/settings/IncidentRoutingEditor';
import MonitorsView from '@/Shuffle-Core/views/monitors/MonitorsView';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from '@/lib/router-compat';
import { PhoneNotificationSetupWizard } from '@/components/usecases/PhoneNotificationSetupWizard';
import { HostMonitoringDetailSlot } from '@/components/usecases/HostMonitoringDetailSlot';
import React, { useState, useCallback, useEffect } from 'react';
import { setCachedWorkflows } from '@/Shuffle-Core/views/appsFetchCache';

const WEBHOOK_FLOW_IDS = new Set(['siem_case_management_1', 'edr_case_management_1', 'email_case_management_1']);

/** Vulnerability usecases — they all read from the exact same status hook
 *  (`useVulnerabilityAutomationStatus`) as /vulnerabilities. */
const VULNERABILITY_FLOW_IDS = new Set([
  'asset_management_case_management_vuln_1',
  'vulnerability_ingestion_1',
]);

interface UsecasesPageProps {
  isLoaded?: boolean;
  isLoggedIn?: boolean;
  userdata?: any;
  globalUrl?: string;
}

const UsecasesPage = (props: UsecasesPageProps = {}) => {
  const webhook = useWebhookStatus();
  const vulnAutomation = useVulnerabilityAutomationStatus();
  const { data: workflows = [], refetch } = useWorkflows();
  const themeContext = useTheme();
  const { userInfo, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [directAddHost, setDirectAddHost] = useState(false);

  useEffect(() => {
    if (workflows && workflows.length > 0) {
      setCachedWorkflows(workflows);
    }
  }, [workflows]);

  const handleToggled = useCallback(() => {
    vulnAutomation.refresh();
    refetch();
  }, [vulnAutomation, refetch]);

  const renderEndpointSlot = useCallback(({ flowId, side }: { flowId: string; flowLabel: string; side: 'source' | 'destination' }) => {
    if (side !== 'source') return null;
    if (VULNERABILITY_FLOW_IDS.has(flowId)) {
      const vulnInfo: WebhookIngestionInfo = {
        url: vulnAutomation.webhook.url ?? null,
        exists: vulnAutomation.webhook.exists,
        enabled: vulnAutomation.webhook.active,
        workflowId: null,
      };
      return {
        node: (
          <WebhookIngestionButton
            webhook={vulnInfo}
            workflowLabel={VULNERABILITY_WORKFLOW_LABELS.webhook}
            onToggled={() => vulnAutomation.refresh()}
          />
        ),
        enabled: vulnAutomation.webhook.active,
      } as any;
    }
    if (!WEBHOOK_FLOW_IDS.has(flowId)) return null;
    const info: WebhookIngestionInfo = {
      url: webhook.url ?? null,
      exists: webhook.exists,
      enabled: webhook.enabled,
      workflowId: null,
    };
    return {
      node: <WebhookIngestionButton webhook={info} onToggled={() => refetch()} />,
      enabled: !!webhook.enabled,
    } as any;
  }, [vulnAutomation, webhook, refetch]);

  const renderUsecaseDetailSlot = useCallback(({ flowId, onOpenModal }: any) => {
    if (VULNERABILITY_FLOW_IDS.has(flowId)) {
      // Exact same readiness checker as /vulnerabilities.
      return <VulnerabilityReadinessBanner status={vulnAutomation} />;
    }
    if (flowId === 'case_management_incident_routing_1') {
      // Same component used on /preferences — single source of truth so
      // changes apply in both places.
      return <IncidentRoutingEditor forceShow />;
    }
    if (flowId === 'case_management_schedules_notifications_1') {
      return (
        <PhoneNotificationSetupWizard
          onWorkflowNavigate={(wfId) => navigate(`/workflows/${wfId}`)}
        />
      );
    }
    if (flowId === 'case_management_asset_management_monitors_1') {
      return (
        <HostMonitoringDetailSlot
          onDeployClick={() => {
            if (onOpenModal) onOpenModal('add-host');
            else setDirectAddHost(true);
          }}
          onManageClick={() => navigate('/monitors')}
        />
      );
    }
    return null;
  }, [vulnAutomation, navigate]);

  const renderUsecaseActionModal = useCallback(({ modal, open, onClose }: {
    modal: string;
    flowId: string;
    flowLabel: string;
    open: boolean;
    onClose: () => void;
  }) => {
    // Embed the same Add Host dialog from /monitors directly in the
    // usecase sidebar so users can deploy a monitor without navigating.
    if (modal !== 'add-host' || !open) return null;
    return <MonitorsView mode="add-host-dialog" onClose={onClose} />;
  }, []);

  return (
    <>
      <Usecases
        theme={themeContext.theme}
        globalUrl={API_CONFIG.baseUrl}
        userdata={userInfo}
        isLoggedIn={isAuthenticated}
        isLoaded={!isLoading}
        workflows={workflows}
        onToggled={handleToggled}
        {...props}
        renderEndpointSlot={renderEndpointSlot}
        renderUsecaseDetailSlot={renderUsecaseDetailSlot}
        renderUsecaseActionModal={renderUsecaseActionModal}
      />
      {directAddHost && (
        <MonitorsView mode="add-host-dialog" onClose={() => setDirectAddHost(false)} />
      )}
    </>
  );
};

export default UsecasesPage;
