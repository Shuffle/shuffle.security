# Shuffle Branding & Styling Rules

## Logo & Branding Guidelines

### 1. Main Company Brand & Mobile App Logo
- **Entities & Products**: "Shuffle", "Shuffle LLC", "Shuffle AS", "Shuffle AI", and the **Shuffle Mobile App** (App icon, splash screens, Android/iOS native packaging).
- **Logo**: The main **Shuffle Automation** brand logo (the primary icon representing the company and platform).

### 2. Shuffle Security Logo
- **Entities & Products**: **Shuffle Security** specifically.
- **Usage**: Used on the Shuffle Security web application, web navigation header, web landing pages, footer, and sidebar product switcher to clearly distinguish Shuffle Security from other Shuffle products.
- **Logo Component**: [`ShuffleLogo`](src/components/common/ShuffleLogo.tsx) / [`ShuffleSecurityLogo`](src/components/common/ShuffleLogo.tsx) rendering the geometric vector "S" badge.

### 3. Agent & AI Logo
- **Entities & Products**: "Agents", "Shuffle AI", "Shuffle Agents", agent executions, and subagent views.
- **Logo**: The dedicated **Agent** logo / icon.

---

## Documentation Rules
See `docs/AGENTS.md` for documentation rules.
- `/docs` uses a grouped discovery page; article routes retain DocsPage to avoid loading an article at the index.

---

## Strict Visual & Typography Rules

### ABSOLUTE PROHIBITION ON ICONS AND EMOJIS
- **NEVER, EVER USE ICONS OR EMOJIS. UNDER ANY CIRCUMSTANCES.**
- **No Emojis Anywhere**:
  - Never use emojis in documentation (`.md`), comments, code, UI text, or component properties.
  - No Unicode pictorial characters of any kind.
  - Instead of checkmark emojis, write plain text: `Passed`, `Verified`, or `Done`.
- **No Decorative Icons in Components or Documentation**:
  - Do not use emoji characters or decorative icons in UI components, cards, lists, badges, or buttons (e.g., never do `icon: "..."`).
  - Do not create "Icon" or "Icon / Key" columns in documentation tables.
  - Rely exclusively on clean, plain-text engineering typography, crisp borders, and structured data tables.

---

## UI Component Sizing, Control Harmony & Action Bar Standards

### 1. Action Bar & Modal Header Control Consistency
- **Uniformity of Control Types**: Never mix full-text buttons (`<Button>`) into compact icon toolbars or modal header action bars.
- When a modal header, card header, or toolbar uses compact icon buttons (e.g., `<IconButton size="small">` with 18px icons for settings, close, route toggles), **all adjacent utility actions MUST also be identical compact `<IconButton size="small">` components** with matching dimensions (`size="small"`, `p: 0.75`, `borderRadius: 1.5`, `border: '1px solid hsl(var(--border))'`) and paired with an informative `<Tooltip>`.
- **Never insert full-text buttons into compact header toolbars**: Do not place buttons like `<Button>Routing rules</Button>` inside a row of icon buttons. It causes size mismatches and line-wrapping.

### 2. Strict Sizing & Proportions ("Match Your Neighbors")
- **Control Sizing Harmony**: Never introduce a control that is disproportionately larger or taller than neighboring controls. A button or input must match the exact height scale of adjacent elements (typically 28px - 32px for compact headers, 36px for standard forms).
- **No Multi-Line Text Wrapping in Buttons**: Multi-word actions or buttons must never be squeezed into narrow containers where the text wraps into multiple vertical lines. If space is tight or the action is a toolbar utility, use a dedicated icon button with a tooltip.
- **Icon Sizing Standards**: Functional icons within icon buttons must use consistent sizing (typically `size={18}` for small icon buttons, `size={20}` for default icon buttons). Header title leading icons should be `size={26}`.

### 3. Clean Action Bars & No Badge Clutter
- **No Redundant Badges or Chips in Action Groups**: Do not place `<Chip>` badges (such as "Support only", "Beta", or status pills) next to icon buttons in compact header action rows.
- If an action is restricted, preview, or support-only, state this clearly inside the action's `<Tooltip>` title (e.g., `Routing rules are a support-only preview and are not visible to regular users yet.`), and display the status chip in the title area or view body when that view is active.

- /api/v* on this site is a 307 redirect to the tenant's regional backend (src/routes/api.$version.$.ts, region from subdomain, then the shuffle-region cookie, then OpenID state) — the app has no API of its own.
- Sidebar region flags use RegionFlagImage with hosted image assets and the shared resolved region code, so rendering never depends on emoji fonts.
- MonitorsView owns deployment sign-in gating for both embedded dialogs and `add_host=true` links, preserving the deployment destination through the existing login `view` parameter so shared-library callers cannot silently bypass the redirect.
- Read src/Shuffle-Core/AGENTS.md first. Some subdirectories (e.g. src/pages/dashboard) have their own AGENTS.md; read it before changing files there.


<!-- LOVABLE:BEGIN -->
- Shared overlay layers track opening order on owned portal roots; accessibility hiding is not closing, papers are not surfaces, and app theme markers keep embedded hosts untouched.
<!-- LOVABLE:END -->
