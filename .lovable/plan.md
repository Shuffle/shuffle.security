# Lifecycle state overrides (status and severity)

## Goal
Let each tenant customise incident statuses and severities without breaking the built-in defaults, the OCSF mapping, or the automatic status/severity normalisation.

## What the user gets
A new "Lifecycle states" card on /admin/preferences with two tables: Statuses and Severities.

For each built-in entry (New, In Progress, Resolved, On Hold, Escalated, Merged / Critical, High, Medium, Low, Informational):
- Rename the label
- Change the colour
- Hide it from pickers (existing incidents in that state still render normally)
- Reset to default

Custom entries:
- Add a new status or severity with a name, colour and optional synonyms
- Every custom entry must pick a "base" built-in state (e.g. custom "Awaiting Customer" based on On Hold). The base decides the OCSF status_id / severity_id that is saved, so SLA, filters, dashboards, resolution rules and automations keep working exactly as now.
- Delete a custom entry (incidents that used it fall back to showing their base state)

Overrides apply everywhere statuses and severities are shown or picked: incident list, filters, incident page, create dialog, actions menu, stats cards.

## What does NOT change
- Built-in keys, OCSF ids and the existing synonym list stay as the fallback.
- `normalizeStatus` keeps its current behaviour when no overrides exist; overrides only add extra synonyms/labels on top.
- Nothing is written to existing incidents. With no overrides saved, the app behaves byte-for-byte as today.

## Technical details
- Storage: `org_settings` datastore entry, field `lifecycle_overrides` `{ statuses: [...], severities: [...] }`, mirroring the `useSlaConfig` / `useEntityLabel` pattern (localStorage cache, background sync, shared subscribe store). Per tenant; children use their own.
- New hook `src/hooks/useLifecycleConfig.ts` exposing `getStatusConfig()`, `getSeverityOptions()`, `resolveStatus(raw)`, `resolveSeverity(raw)` that merge defaults from `src/config/incidentConfig.ts` with overrides.
- Custom status saved on the incident as `status: <base key>`, `status_id: <base id>`, plus `status_detail: <custom key>` (OCSF field) so the custom label is shown when present. Same for severity via `severity` / `severity_id` plus an `unmapped.custom_severity` value.
- `normalizeStatus` gets an optional extra-synonyms argument; existing call sites remain unchanged and default to built-ins.
- Swap direct `statusConfig` / `severityColors` reads in the listed UI components for the hook. Colours use HSL values.
- Unit tests: no overrides equals current mapping; custom status maps to base id; hidden state still renders; unknown status still falls back to New.
