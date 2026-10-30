/**
 * RoutingActionFields
 *
 * Single source of truth for the "Then" (action) part of an incident routing
 * rule. Used by BOTH the full routing editor (`IncidentRoutingEditor`) and the
 * inline highlight-to-create popover (`SelectionRuleChip`) so the available
 * action types and their value fields are ALWAYS identical.
 *
 * Only the presentation differs:
 *  - `variant="editor"`  -> inline row, MUI `label` props, wraps
 *  - `variant="compact"` -> stacked full-width controls for the small popover
 */

import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthenticatedApps, AUTHENTICATED_APPS_QUERY_KEY } from '@/Shuffle-Core/useAuthenticatedApps';
import { getApiUrl, getAuthHeader } from '@/Shuffle-Core/api';
import { getShuffleOpenApiAuthState, SHUFFLE_OPENAPI_APP_ID } from './moveActionAuth';
import type { RoutingAction, RoutingActionType } from './IncidentRoutingEditor';

export const ROUTING_ACTION_TYPE_LABELS: Record<RoutingActionType, string> = {
  suggest_move: 'Move to tenant',
  set_severity: 'Set severity',
  set_status: 'Set status',
  set_priority: 'Set priority',
  add_label: 'Add label',
  assign_to: 'Assign to',
  add_comment: 'Add comment',
  run_agent: 'Run AI Agent',
  set_field: 'Set custom field',
};

export const ROUTING_SEVERITY_OPTIONS = ['Informational', 'Low', 'Medium', 'High', 'Critical'];
export const ROUTING_STATUS_OPTIONS = ['New', 'In Progress', 'On Hold', 'Resolved', 'Closed'];
export const ROUTING_PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent'];

export const ROUTING_FIELD_SUGGESTIONS = [
  '*', // whole-object match: scans every string in the incident (auto base64-decoded)
  'title',
  'description',
  'source',
  'severity',
  'labels',
  'observables.email',
  'observables.domain',
  'observables.ip',
  'stakeholders.email',
  'rawOCSF.message',
  'rawOCSF.unmapped_original.from',
  'rawOCSF.unmapped_original.to',
  'rawOCSF.unmapped_original.subject',
  'rawOCSF.unmapped_original.payload.body.data',
];

export const defaultRoutingAction = (type: RoutingActionType): RoutingAction => {
  switch (type) {
    case 'suggest_move': return { type, targetOrgId: '', reason: '' };
    case 'set_severity': return { type, value: 'High' };
    case 'set_status': return { type, value: 'In Progress' };
    case 'set_priority': return { type, value: 'High' };
    case 'add_label': return { type, value: '' };
    case 'assign_to': return { type, value: '' };
    case 'add_comment': return { type, value: '' };
    case 'run_agent': return { type, value: '' };
    case 'set_field': return { type, field: '', value: '' };
  }
};

export const routingActionValuePresets = (type: RoutingActionType): string[] | null =>
  type === 'set_severity' ? ROUTING_SEVERITY_OPTIONS
  : type === 'set_status' ? ROUTING_STATUS_OPTIONS
  : type === 'set_priority' ? ROUTING_PRIORITY_OPTIONS
  : null;

export const routingActionValuePlaceholder = (type: RoutingActionType): string =>
  type === 'add_label' ? 'label name'
  : type === 'assign_to' ? 'user email or AI Agent'
  : type === 'add_comment' ? 'comment text'
  : type === 'run_agent' ? 'What should the AI agent do with this incident?'
  : 'value';

/** Returns an error string when the action is incomplete, otherwise null. */
export const validateRoutingAction = (action: RoutingAction): string | null => {
  if (action.type === 'suggest_move') {
    return action.targetOrgId ? null : 'Select a target tenant for the move action';
  }
  if (action.type === 'set_field' && !action.field) {
    return 'Pick a field for the custom field action';
  }
  if (!String(action.value || '').trim()) {
    return `Enter a value for "${ROUTING_ACTION_TYPE_LABELS[action.type]}"`;
  }
  return null;
};

export interface RoutingActionFieldsProps {
  action: RoutingAction;
  onChange: (patch: Partial<RoutingAction>) => void;
  onTypeChange: (type: RoutingActionType) => void;
  orgOptions?: { id: string; name: string }[];
  variant?: 'editor' | 'compact';
  /** Extra z-index for dropdown menus rendered above high-z popovers. */
  menuZIndex?: number;
}

export const RoutingActionFields = ({
  action,
  onChange,
  onTypeChange,
  orgOptions = [],
  variant = 'editor',
  menuZIndex,
}: RoutingActionFieldsProps) => {
  const compact = variant === 'compact';
  const valuePresets = routingActionValuePresets(action.type);
  const multiline = action.type === 'add_comment' || action.type === 'run_agent';

  const menuProps = menuZIndex
    ? {
        sx: { zIndex: `${menuZIndex} !important` },
        style: { zIndex: menuZIndex },
        PaperProps: { sx: { zIndex: menuZIndex } },
      }
    : undefined;

  const selectProps = menuProps ? { MenuProps: menuProps } : undefined;
  const fullWidth = compact;

  return (
    <Stack
      direction={compact ? 'column' : 'row'}
      spacing={1}
      flexWrap={compact ? 'nowrap' : 'wrap'}
      useFlexGap
      alignItems={compact ? 'stretch' : 'center'}
      sx={compact ? { width: '100%' } : undefined}
    >
      <TextField
        size="small"
        select
        value={action.type}
        onChange={(e) => onTypeChange(e.target.value as RoutingActionType)}
        sx={compact ? undefined : { minWidth: 200 }}
        fullWidth={fullWidth}
        label={compact ? undefined : 'Action'}
        SelectProps={selectProps}
      >
        {(Object.keys(ROUTING_ACTION_TYPE_LABELS) as RoutingActionType[]).map((t) => (
          <MenuItem key={t} value={t} sx={{ fontSize: '0.8rem' }}>
            {ROUTING_ACTION_TYPE_LABELS[t]}
          </MenuItem>
        ))}
      </TextField>

      {action.type === 'suggest_move' && (
        <TextField
          size="small"
          select
          value={action.targetOrgId || ''}
          onChange={(e) => onChange({ targetOrgId: e.target.value })}
          sx={compact ? undefined : { minWidth: 240 }}
          fullWidth={fullWidth}
          label={compact ? undefined : 'Target tenant'}
          SelectProps={selectProps}
        >
          {orgOptions.length === 0 && (
            <MenuItem value="" disabled>No tenants available</MenuItem>
          )}
          {orgOptions.map((o) => (
            <MenuItem key={o.id} value={o.id} sx={{ fontSize: '0.8rem' }}>{o.name}</MenuItem>
          ))}
        </TextField>
      )}

      {action.type === 'suggest_move' && <MoveActionAuthNotice />}

      {action.type === 'set_field' && (
        <TextField
          size="small"
          select
          value={action.field || ''}
          onChange={(e) => onChange({ field: e.target.value })}
          SelectProps={{ ...(selectProps || {}), renderValue: (v) => (v as string) || 'Pick field…' }}
          sx={compact ? undefined : { minWidth: 220 }}
          fullWidth={fullWidth}
          label={compact ? undefined : 'Field'}
        >
          {ROUTING_FIELD_SUGGESTIONS.map((f) => (
            <MenuItem key={f} value={f} sx={{ fontSize: '0.8rem' }}>{f}</MenuItem>
          ))}
          {action.field && !ROUTING_FIELD_SUGGESTIONS.includes(action.field) && (
            <MenuItem value={action.field}>{action.field}</MenuItem>
          )}
        </TextField>
      )}

      {action.type !== 'suggest_move' && (
        valuePresets ? (
          <TextField
            size="small"
            select
            value={action.value || ''}
            onChange={(e) => onChange({ value: e.target.value })}
            sx={compact ? undefined : { minWidth: 180 }}
            fullWidth={fullWidth}
            label={compact ? undefined : 'Value'}
            SelectProps={selectProps}
          >
            {valuePresets.map((v) => (
              <MenuItem key={v} value={v} sx={{ fontSize: '0.8rem' }}>{v}</MenuItem>
            ))}
          </TextField>
        ) : (
          <TextField
            size="small"
            value={action.value || ''}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={routingActionValuePlaceholder(action.type)}
            sx={compact ? undefined : { flex: 1, minWidth: 200 }}
            fullWidth={fullWidth}
            multiline={multiline}
            maxRows={multiline ? 6 : 1}
            label={compact ? undefined : (action.type === 'run_agent' ? 'Agent prompt' : 'Value')}
          />
        )
      )}
    </Stack>
  );
};

const MoveActionAuthNotice = () => {
  const { data, isLoading } = useAuthenticatedApps();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (isLoading) return null;
  const state = getShuffleOpenApiAuthState(data || []);
  if (state === 'valid') return null;
  const text = state === 'missing'
    ? 'Moving to a tenant requires authentication for the Shuffle OpenAPI app, with permission to access the target tenant. No authentication was found.'
    : 'The Shuffle OpenAPI authentication has not been validated. Moving to a tenant needs a working authentication with permission to access the target tenant.';

  const handleUseApiKey = async () => {
    setSaving(true);
    setError(null);
    try {
      const settingsRes = await fetch(getApiUrl('/api/v1/getsettings'), {
        credentials: 'include',
        headers: { ...getAuthHeader() },
      });
      const settings = settingsRes.ok ? await settingsRes.json() : null;
      const apikey: string | undefined = settings?.apikey || settings?.api_key;
      if (!apikey) throw new Error('Could not find your API key.');
      const res = await fetch(getApiUrl('/api/v1/apps/authentication'), {
        method: 'PUT',
        credentials: 'include',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Auth for Shuffle OpenAPI',
          app: { name: 'Shuffle OpenAPI', id: SHUFFLE_OPENAPI_APP_ID, app_version: '1.0.0' },
          fields: [
            { key: 'apikey', value: apikey },
            { key: 'url', value: getApiUrl('') },
          ],
          active: true,
        }),
      });
      if (!res.ok) throw new Error('Could not save the authentication.');
      await queryClient.invalidateQueries({ queryKey: AUTHENTICATED_APPS_QUERY_KEY });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the authentication.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography variant="caption" sx={{ color: 'hsl(var(--destructive))', lineHeight: 1.4, flex: 1, minWidth: 180 }}>
        {error || text}
      </Typography>
      <Button
        size="small"
        variant="contained"
        color="primary"
        disabled={saving}
        onClick={handleUseApiKey}
        sx={{ textTransform: 'none', fontSize: '0.75rem', height: 28, flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        {saving ? 'Saving...' : 'Use my API-key'}
      </Button>
    </Box>
  );
};

export default RoutingActionFields;
