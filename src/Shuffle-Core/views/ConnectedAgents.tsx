import React from 'react';
import {
  AgentsView as BaseAgentsView,
  AgentUI as BaseAgentUI,
  type AgentsViewProps,
  type AgentUIProps,
  type ToolDrawerRenderProps,
  type AppDetailDrawerRenderProps,
} from '@/Shuffle-MCPs';
import AppSearchDrawer from './AppSearchDrawer';
import AppDetailDrawer from './AppDetailDrawer';

export const defaultToolDrawerRenderer = (props: ToolDrawerRenderProps) => (
  <AppSearchDrawer
    open={props.open}
    initialQuery={props.initialQuery}
    onClose={props.onClose}
    title={props.title}
    subtitle={props.subtitle}
    multiSelect={props.multiSelect}
    selectedApps={props.selectedApps}
    globalUrl={props.globalUrl}
    theme={props.theme as any}
    colorMode={props.colorMode}
    onSelectionChange={(next) => props.onSelectionChange(next)}
  />
);

export const defaultAppDetailDrawerRenderer = (props: AppDetailDrawerRenderProps) => (
  <AppDetailDrawer
    open={props.open}
    onClose={props.onClose}
    appName={props.appName || null}
    appId={props.appId || null}
    appImage={props.appImage || null}
    activeOrgId={props.activeOrgId || null}
    globalUrl={props.globalUrl}
    theme={props.theme as any}
    colorMode={props.colorMode}
    onRefresh={props.onRefresh}
  />
);

export const AgentsView: React.FC<AgentsViewProps> = (props) => (
  <BaseAgentsView
    renderToolDrawer={props.renderToolDrawer || defaultToolDrawerRenderer}
    renderAppDetailDrawer={props.renderAppDetailDrawer || defaultAppDetailDrawerRenderer}
    {...props}
  />
);

export const AgentUI: React.FC<AgentUIProps> = (props) => (
  <BaseAgentUI
    renderToolDrawer={props.renderToolDrawer || defaultToolDrawerRenderer}
    renderAppDetailDrawer={props.renderAppDetailDrawer || defaultAppDetailDrawerRenderer}
    {...props}
  />
);
