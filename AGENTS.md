# Shuffle Branding & Styling Rules

## Logo & Branding Guidelines

### 1. Main Company Brand & Mobile App Logo
- **Entities & Products**: "Shuffle", "Shuffle LLC", "Shuffle AS", "Shuffle AI", and the **Shuffle Mobile App** (App icon, splash screens, Android/iOS native packaging).
- **Logo**: The main **Shuffle Automation** brand logo (the primary icon representing the company and platform).

### 2. Shuffle Security Logo
- **Entities & Products**: **Shuffle Security** specifically.
- **Usage**: Used on the Shuffle Security web application, web navigation header, web landing pages, footer, and sidebar product switcher to clearly distinguish Shuffle Security from other Shuffle products.
- **Logo Component**: [`ShuffleLogo`](src/components/common/ShuffleLogo.tsx) / [`ShuffleSecurityLogo`](src/components/common/ShuffleLogo.tsx) rendering the geometric vector "S" badge (`d="M14 14h28v6H20v16h16v-10h-8v-6h14v22H14V14z"`).

### 3. Agent & AI Logo
- **Entities & Products**: "Agents", "Shuffle AI", "Shuffle Agents", agent executions, and subagent views.
- **Logo**: The dedicated **Agent** logo / icon.

---

## Documentation Rules & Voice

### 1. GitHub-First & Graceful Degradation
- All documentation files (`.md`) must be 100% complete, readable, and functional when viewed in raw Markdown or rendered directly on GitHub/GitLab.
- Dynamic component injections (`<!-- component:<name> <props> -->`) are treated as pure HTML comments by standard Markdown engines and will not render on GitHub.
- **Never rely on a dynamic component to deliver essential information or steps.**
  - Always provide the manual UI navigation path, REST API endpoint, or `curl` example right next to the component.
  - Never write dangling calls-to-action like *"Click the button below to do X"*. Instead write: *"Use the interactive panel below, or navigate to `/incidents` -> **Webhook** in the header bar."*
  - Include static tables, screenshots, or ASCII flow diagrams so readers on GitHub get full visual context without live widgets.

### 2. Dynamic & Actionable in the Web App
- When rendered inside the Shuffle Security / Shuffle Core web application, documentation should not be passive text—it should be an operational console.
- Injected components must perform real work (triggering ingestion sync, toggling webhooks, testing payloads, querying live queues, or executing inline AI tasks) so users can understand and verify system status directly from the doc.

### 3. Shuffle Voice & Tone ("Sound Like Us")
- **Engineer-to-engineer**: Written for real analysts, detection engineers, and SecOps practitioners. Talk about real problems (alert fatigue, schema changes, SIEM noise, API rate limits).
- **No corporate jargon**: No marketing fluff, no buzzword soup. Direct, concise, and technically accurate.
- **Honest and pragmatic**: Explain the design rationale plainly. Be transparent about open source, licensing, and architecture.
- **Action-oriented**: Give analysts the command, the endpoint, or the button to solve their problem immediately.

---

## Strict Visual & Typography Rules

### ABSOLUTE PROHIBITION ON ICONS AND EMOJIS
- **NEVER, EVER USE ICONS OR EMOJIS. UNDER ANY CIRCUMSTANCES.**
- **No Emojis Anywhere**:
  - Never use emojis in documentation (`.md`), comments, code, UI text, or component properties.
  - No camera emojis, checkmarks, warning/alert emojis, tools, packages, locks, shields, or any Unicode pictorial characters.
  - Instead of checkmark emojis, write plain text: `Passed`, `Verified`, or `Done`.
- **No Decorative Icons in Components or Documentation**:
  - Do not use emoji characters or decorative icons in UI components, cards, lists, badges, or buttons (e.g., never do `icon: "..."`).
  - Do not create "Icon" or "Icon / Key" columns in documentation tables.
  - Rely exclusively on clean, plain-text engineering typography, crisp borders, and structured data tables.

### Hidden Internal Comments & Editorial Placeholders
- **Never render visible placeholder callouts in docs** (e.g., never do `> **Screenshot Needed: ...**` or `> **Note: need more info**`).
- **Always use standard HTML comments** (`<!-- TODO: ... -->` or `<!-- NOTE: ... -->`) for internal editorial notes, missing screenshots, or areas to revisit:
  ```markdown
  <!-- TODO: Screenshot Needed: Ingestion Webhook Dialog
  - Location: /incidents -> Webhook button in header
  - What to capture: Modal with webhook URL, toggle switch, and curl command
  - Target path: assets/incidents-webhook-modal.png -->
  ```
- Standard HTML comments are completely hidden and never rendered on GitHub or on the documentation website, keeping published documentation production-ready while preserving full context for contributors in the source code.

---

## UI Component Sizing, Control Harmony & Action Bar Standards

### 1. Action Bar & Modal Header Control Consistency
- **Uniformity of Control Types**: Never mix full-text buttons (`<Button>`) into compact icon toolbars or modal header action bars.
- When a modal header, card header, or toolbar uses compact icon buttons (e.g., `<IconButton size="small">` with 18px icons for settings, close, route toggles), **all adjacent utility actions MUST also be identical compact `<IconButton size="small">` components** with matching dimensions (`size="small"`, `p: 0.75`, `borderRadius: 1.5`, `border: '1px solid hsl(var(--border))'`) and paired with an informative `<Tooltip>`.
- **Never insert full-text buttons into compact header toolbars**: Do not place buttons like `<Button>Routing rules</Button>` inside a row of icon buttons. This causes jarring size discrepancies, awkward line-wrapping (e.g. "Routing \n rules"), and bloats header height.

### 2. Strict Sizing & Proportions ("Match Your Neighbors")
- **Control Sizing Harmony**: Never introduce a control that is disproportionately larger or taller than neighboring controls. A button or input must match the exact height scale of adjacent elements (typically 28px - 32px for compact headers, 36px for standard forms).
- **No Multi-Line Text Wrapping in Buttons**: Multi-word actions or buttons must never be squeezed into narrow containers where the text wraps into multiple vertical lines. If space is tight or the action is a toolbar utility, use a dedicated icon button with a tooltip.
- **Icon Sizing Standards**: Functional icons within icon buttons must use consistent sizing (typically `size={18}` for small icon buttons, `size={20}` for default icon buttons). Header title leading icons should be `size={26}`.

### 3. Clean Action Bars & No Badge Clutter
- **No Redundant Badges or Chips in Action Groups**: Do not place `<Chip>` badges (such as "Support only", "Beta", or status pills) next to icon buttons in compact header action rows.
- If an action is restricted, preview, or support-only, state this clearly inside the action's `<Tooltip>` title (e.g., `Routing rules are a support-only preview and are not visible to regular users yet.`), and display the status chip in the title area or view body when that view is active.

