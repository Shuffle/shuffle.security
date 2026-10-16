<div align="center">

<img src="https://shuffle.security/mcp/agent-icon.png" alt="Shuffle MCPs" width="96" />

# Shuffle MCPs

Turn 3,000+ SaaS tools into MCP servers your agents can use. One search, one click, authenticated.

[![npm](https://img.shields.io/npm/v/@shuffleio/shuffle-mcps.svg)](https://www.npmjs.com/package/@shuffleio/shuffle-mcps)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](https://www.npmjs.com/package/@shuffleio/shuffle-mcps)

</div>

---

<table align="center">
  <tr>
      <td align="center" width="50%">
        <img src="https://github.com/user-attachments/assets/930d7e2b-61b4-4b1c-b90b-37a55cb6a98d" alt="Easy MCP debugger" width="380" style="border-radius: 12px;" />
        <br/><sub><b>1. Easy to try out</b></sub>
      </td> 
      <td align="center" width="50%">
        <img src="https://github.com/user-attachments/assets/ce7f650c-61f7-4b68-bc40-724283e684f4" alt="Easy MCP debugger" width="380" style="border-radius: 12px;" />
        <br/><sub><b>2. Debugger with timeline</b></sub>
      </td> 
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="https://shuffle.security/mcp/search-preview.png" alt="Search 3,000+ integrations" width="380" style="border-radius: 12px;" />
      <br/><sub><b>3. Search any of 3,000+ tools</b></sub>
    </td>
    <td align="center" width="50%">
      <img src="https://shuffle.security/mcp/app-detail-preview.png" alt="Authenticate and use as MCP" width="380" style="border-radius: 12px;" />
      <br/><sub><b>4. Authenticate — your agent uses it instantly</b></sub>
    </td>
  </tr>
</table>

&nbsp;

> **See it live:** [shuffle.security/shuffle-mcp-demo](https://shuffle.security/shuffle-mcp-demo) — a fully working demo of every component in this package (inline search, search drawer, app detail drawer, auth, Try MCP, and Try individual actions). No login required.

> **No SDK required.** Once a tool is authenticated in Shuffle, it is live as an MCP server immediately — call it from any agent over plain HTTP. This npm package is the optional UI layer for embedding the search-and-connect flow inside your own product.

## Try it in 30 seconds

Authenticate any tool at [shuffler.io](https://shuffler.io), grab your API key, and call it:

```bash
curl https://shuffler.io/api/v1/apps/YOUR_APP/mcp \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "tools/call",
    "params": {
      "tool_name": "YOUR_APP",
      "input": { "text": "send a hi message to #general on slack" }
    }
  }'
```

That is the MCP. Any agent, any language, no install. Full API reference: [shuffler.io/docs/API](https://shuffler.io/docs/API).

## When to use this package

Install `shuffle-mcps` when you want to **embed** the search, authenticate, and manage flow inside your own React/Vue/Next.js app — onboarding wizards, integration drawers, app pickers. If your agent is just calling MCPs, you do not need this; use the HTTP API directly.

## Install

```bash
npm install shuffle-mcps
```

Peer deps: `react >= 18`, `react-dom >= 18`, `algoliasearch >= 5`.

## Quick start

```tsx
import { ShuffleMCP } from 'shuffle-mcps';

export default function App() {
  return (
    <ShuffleMCP
      apiKey="YOUR_SHUFFLE_API_KEY"
      inline
      layout="grid"
      gridColumns={3}
      onAppSelected={(d) => console.log('picked', d.app.name)}
    />
  );
}
```

## The components

The library exports six React components — use one or all of them. They share state, so you can mix-and-match.

| Component | What it does | Live demo |
|---|---|---|
| [`<ShuffleMCP />`](#1-shufflemcp--inline-search) | Inline search box that merges Algolia's 3,000+ public app catalog with the current user's private apps | [/shuffle-mcp-demo §1](https://shuffle.security/shuffle-mcp-demo) |
| [`<AppSearchDrawer />`](#2-appsearchdrawer--full-search-drawer) | Right-side drawer wrapping `<ShuffleMCP />` plus a "Your apps" status row. This is the exact "Add Ingestion Source" drawer used in production | [/shuffle-mcp-demo §2](https://shuffle.security/shuffle-mcp-demo) |
| [`<AppDetailDrawer />`](#3-appdetaildrawer--single-app-config) | Right-side drawer for a single app: list/edit/test authentications and try the MCP `tools/call` endpoint inline | [/shuffle-mcp-demo §3](https://shuffle.security/shuffle-mcp-demo) |
| [`<AgentUI />`](#4-agentui--start--debug-agents) | Standalone "What do you want to do?" hero prompt + live decision-by-decision debugger for `/api/v1/agent` runs. Drop-in replacement for the legacy Shuffle Core agent page | [/agents](https://shuffle.security/agents) |
| [`<AgentRunDrawer />`](#5-agentrundrawer--run-agent-side-panel) | Right-side drawer that hosts `<AgentUI />` in compact mode plus optional caller-provided **Permissions** and **Local LLM** tabs (slot-driven, no host context required) | [/shuffle-mcp-demo §1b](https://shuffle.security/shuffle-mcp-demo) |
| [`<AgentActivityList />`](#6-agentactivitylist--past-executions) | Searchable, status-filterable list of past `/api/v1/agent` runs. Pair with `<AgentExecutionDrawer />` to inspect any row in the canonical Simple/Detailed view | [/shuffle-mcp-demo §8](https://shuffle.security/shuffle-mcp-demo) |
| [`<AgentExecutionDrawer />`](#7-agentexecutiondrawer--inspect-one-run) | Right-side drawer that pre-loads a single `AgentRun` into `<AgentUI />` (no `authorization` token required) for read-only inspection | [/agents](https://shuffle.security/agents) |

### 1. `<ShuffleMCP />` — inline search

Drop-in search component. By default, clicking a result opens `<AppDetailDrawer />` automatically.

```tsx
import { ShuffleMCP } from 'shuffle-mcps';

<ShuffleMCP
  apiKey={user.apiKey}
  inline
  layout="grid"
  gridColumns={3}
/>
```

Take over selection yourself (open your own modal, route to a detail page, kick off a custom auth flow):

```tsx
<ShuffleMCP
  apiKey={user.apiKey}
  inline
  preventDefault
  onAppSelected={({ app, authUrl }) => {
    navigate(`/integrations/${app.objectID}`);
  }}
/>
```

### 2. `<AppSearchDrawer />` — full search drawer

The complete "Add Ingestion Source" experience: header, your authenticated apps strip, search, and the Shuffle Pipelines banner. Clicking an app opens `<AppDetailDrawer />` for auth + MCP testing.

```tsx
import { useState } from 'react';
import { AppSearchDrawer } from 'shuffle-mcps';

const [open, setOpen] = useState(false);

<>
  <button onClick={() => setOpen(true)}>Add integration</button>

  <AppSearchDrawer
    open={open}
    onClose={() => setOpen(false)}
    title="Add Ingestion Source"
    subtitle="Search and authenticate a tool to ingest incidents from"
  />
</>
```

Useful props:

| Prop | Type | Description |
|---|---|---|
| `open` | `boolean` | Controlled open state |
| `onClose` | `() => void` | Called on close |
| `title` / `subtitle` | `string` | Header copy |
| `anchor` | `'left' \| 'right'` | Default `'right'` |
| `width` | `number` | Drawer width in px. Default `560` |
| `pinnedApps` | `Array<{ name, image_url, ... }>` | Apps pinned to the top of search results |
| `onQuickSelect` | `(app) => void` | Skip the detail drawer and call this directly |
| `onSelectOverride` | `(app) => boolean` | Intercept selection — return `true` to prevent default |
| `priorityCategory` | `string` | Sort matching apps to the top of the "Your apps" strip |
| `showPipelinesBanner` | `boolean` | Show the Shuffle Pipelines CTA |

### 3. `<AppDetailDrawer />` — single-app config

The right-side drawer that shows everything about one app: existing auth entries (with Configured / Tested / Inactive chips), an inline form to add or edit credentials, a **Test connection** button, an **Activate / Deactivate** toggle, and a built-in MCP `tools/call` chat to try it without leaving the page.

```tsx
import { useState } from 'react';
import { AppDetailDrawer } from 'shuffle-mcps';

const [appName, setAppName] = useState<string | null>(null);

<>
  <button onClick={() => setAppName('Gmail')}>Configure Gmail</button>

  <AppDetailDrawer
    open={appName !== null}
    onClose={() => setAppName(null)}
    appName={appName}
  />
</>
```

Useful props:

| Prop | Type | Description |
|---|---|---|
| `open` | `boolean` | Controlled open state |
| `onClose` | `() => void` | Called on close |
| `appName` | `string \| null` | The app to load. Resolved against Algolia by name |
| `anchor` | `'left' \| 'right'` | Default `'right'` |
| `width` | `number` | Drawer width in px. Default `520` |
| `onRefresh` | `() => void` | Called after a successful save/test, so the parent can re-fetch |
| `onAddToCanvas` | `(info) => void` | Replaces the **Activate** CTA with **+ Add** — used by the workflow editor |
| `isAuthenticated` | `boolean` | Whether the current user is signed in. Default `true` |

Reference implementation in production: [`src/Shuffle-MCPs/AppSearchDrawer.tsx`](./AppSearchDrawer.tsx) and [`AppDetailDrawer.tsx`](./AppDetailDrawer.tsx).

### 4. `<AgentUI />` — start + debug agents

A standalone "What do you want to do?" surface for the Shuffle agent. Its tabs are:

1. **Start** — large hero prompt with attached MCP/app chips. Submits to `/api/v1/agent`.
2. **Simple / Detailed** — compact header + live decision timeline driven by `/api/v1/streams/results`, with question/continuation forms, per-decision raw-JSON inspection, approvals, retries, and reruns.
3. **Chat** — the same run as a conversation: the user's messages, the steps the agent took (collapsed once done), its questions with one-click replies, credentials to connect, and its answers. The composer starts a run, answers the agent, or continues a finished run.

It switches modes automatically when an execution starts, or when `?execution_id=...&authorization=...` is present in the URL.

```tsx
import { AgentUI } from 'shuffle-mcps';

<AgentUI
  apiKey={user.apiKey}                    // optional — falls back to session
  apiBaseUrl="https://shuffler.io"        // optional — falls back to default
  orgId={user.orgId}                      // optional — sent as Org-Id header
  defaultApps={[{ name: 'http' }, { name: 'shuffle_tools' }]}
  onRun={({ input, success, executionId }) => {
    console.log('agent run', { input, success, executionId });
  }}
/>
```

Like `<ShuffleMCP />`, all three of `apiKey`, `apiBaseUrl`, and `orgId` are **optional**. When omitted, the component uses the shared browser session (cookie + `localStorage.shuffle_api_key`) — the same behavior as the rest of this library.

Useful props:

| Prop | Type | Description |
|---|---|---|
| `apiKey` | `string` | Bearer token used for every `/api/v1/*` call this instance makes |
| `apiBaseUrl` | `string` | Shuffle backend base URL (e.g. `https://shuffler.io`) |
| `orgId` | `string` | Sent as the `Org-Id` header on every call |
| `apps` | `AgentUIApp[]` | Controlled chip set. Disables auto-load |
| `defaultApps` | `AgentUIApp[]` | Initial chip set when `apps` is not provided |
| `autoLoadApps` | `boolean` | Auto-fetch the user's authenticated apps via `/api/v1/apps/authentication`. Default `true` |
| `executionId` / `authorization` | `string` | Attach to a known execution on mount and skip the starter |
| `readUrlParams` | `boolean` | Read `?execution_id` + `?authorization` from the URL. Default `true` |
| `title` / `subtitle` / `placeholder` | `string` | Hero copy |
| `defaultInput` / `autoSubmit` | `string` / `boolean` | Pre-fill and optionally submit on mount |
| `compact` / `hideHeroIcon` / `hideAppPicker` / `hideAttach` | `boolean` | Layout switches for embedding |
| `maxWidth` | `number` | Max width of the centered card. Default `900` |
| `onRun` | `(info) => void` | Fires whenever a run finishes (success or failure) |
| `initialView` | `'start' \| 'simple' \| 'detailed' \| 'chat'` | View to open on mount. `'chat'` opens the Chat tab, without the Start form, and keeps the tabs visible before the first run |
| `workflowId` | `string` | Workflow the agent works on (edit-workflow skill). In Chat it also enables "Revert" and the workflow events below |
| `className` / `sx` / `contentSx` | `string` / `SxProps` | Style overrides for the root container and inner content column |

Reference page in production: [`src/pages/dashboard/AgentsPage.tsx`](../pages/dashboard/AgentsPage.tsx) (mounted at [`/agents`](https://shuffle.security/agents)).

When the Chat tab changes a workflow it sends window events, so a page showing that workflow can keep its canvas in sync. Without a listener the chat still works.

| Event | `detail` | Sent when |
|---|---|---|
| `AGENT_WORKFLOW_CHANGED_EVENT` | `{ workflowId, nodeIds, reverted? }` | An agent edit to the workflow finished, or the user reverted the chat's changes |
| `AGENT_FOCUS_NODE_EVENT` | `{ workflowId, nodeId }` | The user clicked a changed node in the chat |

```tsx
import { AGENT_WORKFLOW_CHANGED_EVENT } from 'shuffle-mcps';

window.addEventListener(AGENT_WORKFLOW_CHANGED_EVENT, (e) => {
  if (e.detail.workflowId === workflow.id) reloadWorkflow();
});
```

### 5. `<AgentRunDrawer />` — Run Agent side panel

Right-side drawer that embeds `<AgentUI />` in compact mode, with optional **Permissions** and **Local LLM** tabs you fill via slots. Zero host-app context required — pass `apiKey` / `apiBaseUrl` / `orgId` through `agentUIProps` to authenticate.

```tsx
import { useState } from 'react';
import { AgentRunDrawer } from 'shuffle-mcps';

const [open, setOpen] = useState(false);

<AgentRunDrawer
  open={open}
  onClose={() => setOpen(false)}
  agentUIProps={{ apiKey: user.apiKey, orgId: user.orgId }}
  permissionsSlot={<MyPermissionsPanel />}   // optional — tab is hidden when omitted
  localLLMSlot={<MyLocalLLMConfig />}        // optional — tab is hidden when omitted
/>
```

Useful props:

| Prop | Type | Description |
|---|---|---|
| `open` / `onClose` | `boolean` / `() => void` | Controlled open state |
| `initialTab` | `'run' \| 'permissions' \| 'localLLM'` | Tab focused on open. Default `'run'` |
| `permissionsSlot` / `localLLMSlot` | `ReactNode` | Render content for the optional tabs. Tab is hidden when omitted |
| `agentUIProps` | `Partial<AgentUIProps>` | Forwarded to the embedded `<AgentUI />` |
| `width` | `number` | Drawer width in px. Default `520` |
| `title` / `subtitle` | `string` | Header copy |
| `className` / `paperSx` / `headerSx` / `tabsSx` / `bodySx` | `string` / `SxProps` | Style overrides for the Drawer Paper, header bar, tab strip, and body container |

### 6. `<AgentActivityList />` — past executions

Searchable, status-filterable list of past `/api/v1/agent` runs. The component owns its own fetch + pagination loop. `onRunClick` lets the caller decide what happens on row click — typically opening `<AgentExecutionDrawer />`.

```tsx
import { useState } from 'react';
import { AgentActivityList, AgentExecutionDrawer, type AgentRun } from 'shuffle-mcps';

const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);

<>
  <AgentActivityList
    apiKey={user.apiKey}
    orgId={user.orgId}
    onRunClick={setSelectedRun}
  />

  <AgentExecutionDrawer
    open={!!selectedRun}
    onClose={() => setSelectedRun(null)}
    run={selectedRun}
    apiKey={user.apiKey}
    orgId={user.orgId}
  />
</>
```

Useful props:

| Prop | Type | Description |
|---|---|---|
| `apiKey` / `apiBaseUrl` / `orgId` | `string` | Auth — same fallback semantics as `<AgentUI />` |
| `onRunClick` | `(run: AgentRun) => void` | Row click handler |
| `showSearchBar` / `showStatusChips` | `boolean` | Toggle the toolbar pieces. Default `true` |
| `limit` | `number` | Page size. Default `50` |
| `emptyTitle` / `emptySubtitle` | `string` | Empty-state copy |
| `className` / `sx` / `toolbarSx` / `rowSx` | `string` / `SxProps` | Style overrides for the root container, toolbar, and each run row |

### 7. `<AgentExecutionDrawer />` — inspect one run

Right-side drawer that pre-loads a single `AgentRun` into `<AgentUI />` so you can inspect the Simple/Detailed view of any past execution without an `authorization` token.

```tsx
<AgentExecutionDrawer
  open={!!selectedRun}
  onClose={() => setSelectedRun(null)}
  run={selectedRun}
  apiKey={user.apiKey}
  orgId={user.orgId}
/>
```

Useful props:

| Prop | Type | Description |
|---|---|---|
| `open` / `onClose` | `boolean` / `() => void` | Controlled open state |
| `run` | `AgentRun \| null` | The run to display. When `null` and `open=true`, the drawer renders empty |
| `width` | `number` | Drawer width in px. Default `720` |
| `apiKey` / `apiBaseUrl` / `orgId` | `string` | Forwarded to the embedded `<AgentUI />` |
| `className` / `paperSx` / `headerSx` / `bodySx` | `string` / `SxProps` | Style overrides for the Drawer Paper, header bar, and body container |

### Predefined search

```tsx
<ShuffleMCP
  apiKey="..."
  inline
  initialFilterQuery="siem"
  placeholder="Search SIEM tools..."
/>
```

### Multi-select

```tsx
const [picked, setPicked] = useState<AlgoliaSearchApp[]>([]);

<ShuffleMCP
  apiKey="..."
  inline
  multiSelect
  showCheckbox
  selectedApps={picked}
  onSelectionChange={setPicked}
/>
```

### Your own backend

```tsx
<ShuffleMCP
  apiKey={user.apiKey}
  apiBaseUrl="https://your-backend.example.com"
  algoliaAppId="YOUR_APP_ID"
  algoliaApiKey="YOUR_SEARCH_KEY"
/>
```

> **About `apiKey`:** this is the **current user's personal Shuffle API key**, not an org-level or service token. Your backend should look up the signed-in user's API key (wherever you store it — DB, session, etc.) and pass it through to this component. The component sends it as `Authorization: Bearer` on every API request and forwards it into the auth handoff URL as `&auth=`, so all reads and authentications happen as that user.

When `apiKey` is set, the component also fetches the user's **private apps** from `/api/v1/apps` and merges them into the search results, with an **All / Public / Private** filter shown above the list. Status dots appear too: validated, configured, selected, inactive.

## Common props

| Prop | Type | Description |
|---|---|---|
| `apiKey` | `string` | The **current user's** Shuffle API key. Your backend should fetch it from wherever you store the user's credentials and pass it in. Used as `Authorization: Bearer` on every request and forwarded into the auth handoff URL as `&auth=`. This is the canonical credential. |
| `~~authToken~~` | `string` | **Deprecated.** Use `apiKey`. Kept for back-compat — only used as the auth-URL token if `apiKey` is not set. |
| `orgId` | `string` | Optional Shuffle organization ID. When set, every API call (`/api/v1/apps/authentication`, `/api/v1/apps`) is sent with an `Org-Id: <orgId>` header, and the auth URL gets `&org_id=<orgId>` appended. Default: not sent. |
| `inline` | `boolean` | Inline results vs floating dropdown. |
| `layout` | `'list' \| 'grid'` | Result layout. Default `'list'`. |
| `initialFilterQuery` | `string` | Pre-filter without filling the input. |
| `preventDefault` | `boolean` | Skip the default click behavior (built-in drawer or `window.open(authUrl)`) so you can handle selection yourself. |
| `onAppSelected` | `(detail) => void` | Fires on single-select pick. If provided, the built-in drawer is **not** opened — you take over. |
| `multiSelect` | `boolean` | Allow selecting multiple apps. |
| `showSourceFilter` | `boolean` | Toggle the All / Public / Private filter. Default `true`. |
| `customStyles` | `CustomStyles` | Per-slot style overrides. |

### Default click behavior

When you do **not** pass `onAppSelected`, clicking an app opens a built-in right-side drawer that shows the app, its existing authentication entries (with Configured / Tested / Inactive chips), and a CTA that opens the Shuffle auth flow in a new tab. Pass `onAppSelected` to take over, or `preventDefault` to disable both.

### Org scoping

```tsx
<ShuffleMCP
  apiKey={user.apiKey}     // current user's Shuffle API key, fetched by your backend
  orgId={currentOrg.id}    // every request now scoped to this org
/>
```


## Theming (light + dark)

There is no `theme` prop — every component reads from your app's CSS variables and inherits whatever palette is active. Define these tokens once in your global stylesheet (e.g. `:root` for light, `.dark` for dark) and the components flip automatically:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --border: 220 13% 91%;
  --muted: 220 14% 96%;
  --muted-foreground: 220 9% 46%;
  --primary: 24 100% 50%;          /* Shuffle orange */
  --primary-foreground: 0 0% 100%;
}

.dark {
  --background: 222 47% 6%;
  --foreground: 0 0% 98%;
  --card: 222 47% 9%;
  --border: 217 19% 18%;
  --muted: 217 19% 14%;
  --muted-foreground: 220 9% 65%;
  --primary: 24 100% 55%;
  --primary-foreground: 0 0% 100%;
}
```

Values are raw HSL channels (no `hsl(...)` wrapper) because internally we use `hsl(var(--card))`, `hsl(var(--border) / 0.5)`, etc. Toggle dark mode by adding/removing the `.dark` class on `<html>` or `<body>` — same pattern as Tailwind / shadcn.

For finer-grained overrides on `<ShuffleMCP />`, pass `customStyles` — every slot (container, input, dropdown, gridItem, appName, appDescription, appCategory, appTags, emptyState, errorState, …) accepts a `React.CSSProperties` object. See [LIBRARY.md](./LIBRARY.md#styling) for the full slot list.

```tsx
<ShuffleMCP
  apiKey="..."
  inline
  customStyles={{
    container: { borderRadius: 16 },
    input: { fontFamily: 'Inter, sans-serif' },
    gridItem: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' },
  }}
/>
```

For the agent components (`<AgentUI />`, `<AgentRunDrawer />`, `<AgentExecutionDrawer />`, `<AgentActivityList />`), every entity in the layout is overridable via MUI `sx` props plus a `className` on the root. The slots are listed per-component in the tables above — typically `sx` (root), `paperSx` (drawer surface), `headerSx`, `tabsSx` / `toolbarSx`, `bodySx`, and `rowSx`. Each one accepts the standard `SxProps<Theme>` shape and is **merged on top of** the defaults, so you only specify what you want to change:

```tsx
<AgentRunDrawer
  open={open}
  onClose={() => setOpen(false)}
  paperSx={{ background: 'hsl(var(--background))', boxShadow: 'none' }}
  headerSx={{ py: 1.5 }}
  tabsSx={{ '& .MuiTabs-indicator': { display: 'none' } }}
/>
```

Full prop reference, framework setup (Next.js, Vue), styling slots, custom rendering, and publishing: [**LIBRARY.md**](./LIBRARY.md).

## Imperative handle

```tsx
const ref = useRef<ShuffleMCPHandle>(null);
<ShuffleMCP ref={ref} apiKey="..." inline />

ref.current?.search('slack');
ref.current?.clear();
```

## Next.js

The component touches `window`, so render it client-side with `'use client'` or `next/dynamic({ ssr: false })`. See [LIBRARY.md](./LIBRARY.md#nextjs) for details.
