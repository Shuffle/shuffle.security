/**
 * SelectionRuleChip
 *
 * Highlight-to-create-rule interaction for the incident detail page.
 *
 * Behaviour
 * ---------
 * - Listens for `selectionchange` inside any ancestor tagged with
 *   `data-incident-content`.
 * - When the user selects >= 3 characters of visible text, a small floating
 *   chip appears just below the selection: "＋ Create rule from '<snippet>'".
 * - Clicking the chip opens a compact popover that pre-fills a routing-rule
 *   draft (field guessed from the DOM context, op = `contains`, value =
 *   selected text). The user picks an action (Auto-close, Set severity,
 *   etc.) and clicks Save.
 * - On save the rule is written straight into the existing
 *   `shuffle-security_routing` datastore on the parent org — same schema
 *   the full routing editor writes, so the rule shows up there too.
 *
 * Non-invasiveness rules
 * ---------------------
 * - Chip only renders on real user selections, never on programmatic ones.
 * - Selections inside inputs / textareas / contenteditables are ignored so
 *   the chip never fights the analyst while they are typing.
 * - Chip auto-dismisses on click-away or Escape.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Box,
  Paper,
  Typography,
  MenuItem,
  Select,
  TextField,
  Button,
  Stack,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { Plus, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSubOrgs } from '@/hooks/useSubOrgs';
import { useDatastore } from '@/hooks/useDatastore';
import {
  ROUTING_DATASTORE_CATEGORY,
  type RoutingRule,
  type RoutingCondition,
  type RoutingConditionOp,
  type RoutingAction,
  type RoutingActionType,
} from '@/components/settings/IncidentRoutingEditor';
import {
  RoutingActionFields,
  defaultRoutingAction,
  validateRoutingAction,
} from '@/components/settings/RoutingActionFields';

import { getDatastoreByCategory, DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';
import { evaluateRoutingRules, type IncidentEvaluationContext } from '@/utils/routingRuleEvaluator';
import { applyRoutingActionsToRaw } from '@/lib/applyRoutingActionsToRaw';
import { writeIncidentSafe } from '@/lib/incidentRelations';
import { decodeIfBase64, htmlToPlainText } from '@/lib/utils';
import { repairCorruptedOcsfFields } from '@/lib/translationFallback';

/**
 * Normalize a raw datastore incident payload into the same shape the incident
 * detail page uses when evaluating routing rules. This mirrors the detail
 * view's read pipeline so the retroactive scan finds the same matches the
 * analyst would see when opening the incident:
 *   1. Repair corrupted OCSF translation fields (e.g. header arrays leaked
 *      into title/assignee) in place.
 *   2. Fall back to nested `rawOCSF.*` values when top-level fields are
 *      missing or clearly wrong.
 *   3. Decode base64 (Gmail bodies) and strip HTML from title/description
 *      so plain-text conditions match rendered text, not markup.
 */
const buildScanContext = (raw: any): IncidentEvaluationContext => {
  // Repair in place so nested and top-level fields agree before we read.
  try { repairCorruptedOcsfFields(raw); } catch { /* best-effort */ }
  const ocsf = raw?.rawOCSF || {};
  const pickTitle = raw?.title || ocsf.title || ocsf.subject || ocsf.name || '';
  const pickDesc = raw?.message || raw?.description || ocsf.desc || ocsf.message || ocsf.body || '';
  const decodedTitle = typeof pickTitle === 'string' ? decodeIfBase64(pickTitle) : pickTitle;
  const plainTitle = typeof decodedTitle === 'string' ? htmlToPlainText(decodedTitle) : decodedTitle;
  const decodedDesc = typeof pickDesc === 'string' ? decodeIfBase64(pickDesc) : pickDesc;
  const plainDesc = typeof decodedDesc === 'string' ? htmlToPlainText(decodedDesc) : decodedDesc;
  return {
    title: plainTitle,
    description: plainDesc,
    source: raw?.source,
    severity: raw?.severity,
    status: raw?.status,
    labels: raw?.labels,
    observables: raw?.observables,
    stakeholders: raw?.stakeholders,
    rawOCSF: raw?.rawOCSF,
  };
};
import { useNavigate } from '@/lib/router-compat';

type FieldChoice = {
  value: string;
  label: string;
};

const FIELD_CHOICES: FieldChoice[] = [
  { value: '*', label: 'Whole incident (any field)' },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'source', label: 'Source' },
  { value: 'rawOCSF.unmapped_original.subject', label: 'Email subject' },
  { value: 'rawOCSF.unmapped_original.from', label: 'Email from' },
  { value: 'rawOCSF.unmapped_original.to', label: 'Email to' },
  { value: 'labels', label: 'Labels' },
];

const OP_CHOICES: { value: RoutingConditionOp; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'equals', label: 'equals' },
];

const SEVERITY_OPTIONS = ['Informational', 'Low', 'Medium', 'High', 'Critical'];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent'];

// Detect whether a Node is inside an editable element the user is typing in.
// Inputs/textareas that are explicitly marked as selectable incident content
// (via `data-incident-field`) are NOT treated as editable here — we still
// want to offer the chip when the user highlights part of the title.
const isEditableTarget = (node: Node | null): boolean => {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      // Allow if this input is inside a marked incident field.
      if (el.closest?.('[data-incident-field]')) return false;
      return true;
    }
    if (el.isContentEditable) {
      // Allow if this contenteditable is inside a marked incident field (e.g. description).
      if (el.closest?.('[data-incident-field]')) return false;
      return true;
    }
    if (el.getAttribute?.('data-selection-rule-ui') === '1') return true;
    if (el.getAttribute?.('data-markdown-format-bar') === '1') return true;
    el = el.parentElement;
  }
  return false;
};

// Walk up to find the nearest [data-incident-field] hint. No heading fallback
// — random subtitle headings like "Timeline" or "Email Thread" should not
// trigger a rule creation.
const detectField = (node: Node | null): string => {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el) {
    const hint = el.getAttribute?.('data-incident-field');
    if (hint) return hint;
    el = el.parentElement;
  }
  return '*';
};

const isInsideIgnored = (node: Node | null): boolean => {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el) {
    if (el.getAttribute?.('data-selection-rule-ignore') === '1') return true;
    el = el.parentElement;
  }
  return false;
};

const isInsideIncidentContent = (node: Node | null): boolean => {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el) {
    if (el.hasAttribute?.('data-incident-content')) return true;
    el = el.parentElement;
  }
  return false;
};

const truncate = (s: string, max = 40) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const newRuleId = () =>
  `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

interface SelectionRuleChipProps {
  /** Incident id — used for the auto-generated rule name and audit only. */
  incidentId?: string;
}

export const SelectionRuleChip = ({ incidentId }: SelectionRuleChipProps) => {
  const { userInfo } = useAuth();
  const { parentOrg, subOrgs } = useSubOrgs(userInfo?.active_org?.id);
  const routingOrgId = parentOrg?.id || userInfo?.active_org?.id;
  const navigate = useNavigate();

  const { addItem } = useDatastore({
    category: ROUTING_DATASTORE_CATEGORY,
    orgId: routingOrgId,
  });

  const [chip, setChip] = useState<{ x: number; y: number; text: string; field: string } | null>(
    null,
  );
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Form state (only meaningful while the popover is open).
  const [field, setField] = useState<string>('*');
  const [op, setOp] = useState<RoutingConditionOp>('contains');
  const [value, setValue] = useState<string>('');
  const [action, setAction] = useState<RoutingAction>(() => defaultRoutingAction('set_status'));
  const [ruleName, setRuleName] = useState<string>('');

  // Post-save summary state — after a successful save we replace the form
  // with a summary that scans the most recent incidents to show the user
  // how many would have matched the rule they just created.
  const [savedRule, setSavedRule] = useState<RoutingRule | null>(null);
  // Duplicate detection state — when the user is about to create a rule that
  // already exists (same condition + same action), we surface the existing
  // rule and offer to run it now instead of creating a clone.
  const [existingRule, setExistingRule] = useState<RoutingRule | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ matched: number; scanned: number; applied: number; failed: number } | null>(null);


  const orgOptions = useMemo(
    () => (subOrgs || []).map((o: any) => ({ id: o.id, name: o.name })),
    [subOrgs],
  );

  const closeChip = useCallback(() => {
    setChip(null);
    setPopoverOpen(false);
    setSavedRule(null);
    setExistingRule(null);
    setScanResult(null);
    setScanning(false);
  }, []);

  // Determine whether an identical rule already exists. "Identical" means the
  // whole rule matches: same condition field/op/value and same action type/value.
  const findDuplicateRule = useCallback(
    (existingRules: RoutingRule[], candidateConditions: RoutingCondition[], candidateActions: RoutingAction[]): RoutingRule | null => {
      for (const rule of existingRules) {
        if (!rule.enabled) continue;
        const conditions = rule.conditions || [];
        if (conditions.length !== candidateConditions.length) continue;
        const actions = rule.actions || [];
        if (actions.length !== candidateActions.length) continue;

        const conditionsMatch = conditions.every((c, i) => {
          const cc = candidateConditions[i];
          return c.field === cc.field && c.op === cc.op && (c.value || '') === (cc.value || '');
        });
        if (!conditionsMatch) continue;

        const actionsMatch = actions.every((a, i) => {
          const ca = candidateActions[i];
          return a.type === ca.type && (a.value || '') === (ca.value || '') && (a.field || '') === (ca.field || '');
        });
        if (!actionsMatch) continue;

        return rule;
      }
      return null;
    },
    [],
  );

  // Run a retroactive scan + apply for a given rule. Returns the scan summary.
  const runRetroactiveScan = useCallback(
    async (rule: RoutingRule): Promise<{ matched: number; scanned: number; applied: number; failed: number }> => {
      const orgId = userInfo?.active_org?.id;
      if (!orgId) return { matched: 0, scanned: 0, applied: 0, failed: 0 };
      try {
        const resp = await getDatastoreByCategory(
          DATASTORE_CATEGORIES.INCIDENTS,
          undefined,
          undefined,
          orgId,
        );
        const items = (resp as any)?.items || (resp as any)?.data || [];
        let matched = 0;
        let scanned = 0;
        let applied = 0;
        let failed = 0;
        for (const it of items) {
          try {
            const raw = typeof it.value === 'string' ? JSON.parse(it.value) : it.value;
            if (!raw || typeof raw !== 'object') continue;
            scanned += 1;
            const ctx = buildScanContext(raw);
            const hits = evaluateRoutingRules(ctx, [rule]);
            if (hits.length === 0) continue;
            matched += 1;
            const allActions = hits.flatMap((h: any) => (Array.isArray(h?.rule?.actions) ? h.rule.actions : []));
            if (allActions.length === 0) continue;
            const result = applyRoutingActionsToRaw(raw, allActions, { ruleName: rule.name });
            if (!result.changed) continue;
            const incidentId = raw.id || it.key || it.id;
            if (!incidentId) { failed += 1; continue; }
            const write = await writeIncidentSafe(String(incidentId), result.next, orgId);
            if (write.success) applied += 1;
            else failed += 1;
          } catch {
            /* skip malformed */
          }
        }
        return { matched, scanned, applied, failed };
      } catch {
        return { matched: 0, scanned: 0, applied: 0, failed: 0 };
      }
    },
    [userInfo?.active_org?.id],
  );

  // Selection listener
  // The chip should only appear after the user has finished marking text
  // (pointer released), not while the mouse is still being dragged. No
  // modifier key is required — any real selection inside the incident
  // content opens the chip.
  const pointerDownRef = useRef(false);
  const pendingUpdateRef = useRef(false);

  const evaluateSelection = useCallback((_force = false) => {
    // Never react while the popover is open — analyst is filling the form.
    if (popoverOpen) return;


    // Case 1: selection inside an <input>/<textarea> that is explicitly
    // marked as an incident field (e.g. the title). window.getSelection() is
    // collapsed in that case, so we read selectionStart/End directly.
    const active = document.activeElement as HTMLElement | null;
    if (
      active &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
      active.closest?.('[data-incident-content]') &&
      active.closest?.('[data-incident-field]') &&
      !active.closest?.('[data-selection-rule-ignore="1"]')
    ) {
      const inp = active as HTMLInputElement | HTMLTextAreaElement;
      const start = inp.selectionStart ?? 0;
      const end = inp.selectionEnd ?? 0;
      if (end > start) {
        const text = (inp.value || '').slice(start, end).trim();
        if (text.length >= 3) {
          const rect = inp.getBoundingClientRect();
          setChip({
            x: rect.left + rect.width / 2,
            y: rect.bottom + 8,
            text,
            field: detectField(inp),
          });
          return;
        }
      }
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setChip(null);
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 3) {
      setChip(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const anchor = range.startContainer;
    if (isEditableTarget(anchor)) {
      setChip(null);
      return;
    }
    if (isInsideIgnored(range.commonAncestorContainer)) {
      setChip(null);
      return;
    }
    if (!isInsideIncidentContent(range.commonAncestorContainer)) {
      setChip(null);
      return;
    }
    let rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const clientRects = range.getClientRects();
      if (clientRects.length > 0) {
        rect = clientRects[0];
      } else {
        setChip(null);
        return;
      }
    }
    const detectedField = detectField(anchor);
    let chipY = rect.bottom + 8;
    // If the Markdown format bar is active and positioned below the selection,
    // position this automation rule chip below it so both popovers show at once.
    const formatBar = document.querySelector('[data-markdown-format-bar="1"]') as HTMLElement | null;
    if (formatBar && formatBar.getAttribute('data-format-bar-placement') === 'below') {
      const fbRect = formatBar.getBoundingClientRect();
      if (fbRect.bottom >= chipY) {
        chipY = fbRect.bottom + 8;
      }
    }
    setChip({
      x: rect.left + rect.width / 2,
      y: chipY,
      text,
      field: detectedField,
    });
  }, [popoverOpen]);


  useEffect(() => {
    const handleSelectionChange = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (pointerDownRef.current) {
          pendingUpdateRef.current = true;
          return;
        }
        pendingUpdateRef.current = false;
        evaluateSelection();
      });
    };

    const handlePointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-selection-rule-ui="1"], [data-markdown-format-bar="1"]')) return;
      pointerDownRef.current = true;
      // Hide any existing chip while a new selection is being created.
      if (chip && !popoverOpen) setChip(null);
    };

    const handlePointerUp = () => {
      pointerDownRef.current = false;
      pendingUpdateRef.current = false;
      evaluateSelection();
    };

    const handlePointerCancel = () => {
      pointerDownRef.current = false;
      pendingUpdateRef.current = false;
    };

    // Selections that originate in a sandboxed same-origin iframe (e.g. the
    // Email Thread body) don't reach the parent's selectionchange. Frames
    // bridge them via a custom `selection-rule:external` event.
    const handleExternalSelection = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as
        | { x: number; y: number; text: string; field?: string; altKey?: boolean }
        | undefined;
      if (!detail || !detail.text || detail.text.length < 3) return;
      if (popoverOpen) return;

      setChip({
        x: detail.x,
        y: detail.y,
        text: detail.text.trim(),
        field: detail.field || '*',
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('mouseup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('selection-rule:external', handleExternalSelection);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('mouseup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('selection-rule:external', handleExternalSelection);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [chip, popoverOpen, evaluateSelection]);

  // Dismiss on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeChip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeChip]);

  // Dismiss when clicking outside — but not on the chip / popover themselves.
  useEffect(() => {
    if (!chip && !popoverOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-selection-rule-ui="1"], [data-markdown-format-bar="1"]')) return;
      // Ignore clicks inside MUI portal-rendered popovers/menus (Selects).
      if (t?.closest?.('.MuiPopover-root, .MuiMenu-root, .MuiModal-root')) return;
      closeChip();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [chip, popoverOpen, closeChip]);

  const openPopover = () => {
    if (!chip) return;
    setField(chip.field || '*');
    setOp('contains');
    setValue(chip.text);
    setAction(defaultRoutingAction('set_status'));
    const snippet = truncate(chip.text, 32);
    setRuleName(`Auto-rule: "${snippet}"`);
    setPopoverOpen(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('selection-rule:popover-open'));
    }
  };

  const handleSave = async () => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      toast.error('Value is empty');
      return;
    }
    const actionError = validateRoutingAction(action);
    if (actionError) {
      toast.error(actionError);
      return;
    }
    if (!routingOrgId) {
      toast.error('Cannot resolve target org');
      return;
    }

    const id = newRuleId();
    const nowTs = Date.now();
    const conditionLeaf = { kind: 'condition' as const, field, op, value: trimmedValue };
    const rule: RoutingRule = {
      id,
      name: ruleName.trim() || `Auto-rule: "${truncate(trimmedValue, 32)}"`,
      enabled: true,
      priority: 100,
      matchMode: 'all',
      conditions: [{ field, op, value: trimmedValue }],
      conditionTree: { kind: 'group', op: 'and', children: [conditionLeaf] } as any,
      actions: [action],
      createdBy: userInfo?.username || userInfo?.id,
      createdTs: nowTs,
      updatedTs: nowTs,
      matchCount: 0,
    };

    setSaving(true);
    try {
      const ok = await addItem(id, JSON.stringify(rule));
      if (ok) {
        toast.success('Routing rule created');
        window.getSelection?.()?.removeAllRanges?.();
        // Switch popover into "saved" state and kick off a retro scan
        // against the most recent incidents so the user sees immediately
        // how many past incidents this rule would have matched.
        setSavedRule(rule);
        setScanning(true);
        setScanResult(null);
        void (async () => {
          const currentId = incidentId; // capture prop before inner shadowing
          try {
            const orgId = userInfo?.active_org?.id;
            if (!orgId) {
              setScanning(false);
              return;
            }
            const resp = await getDatastoreByCategory(
              DATASTORE_CATEGORIES.INCIDENTS,
              undefined,
              undefined,
              orgId,
            );
            const items = (resp as any)?.items || (resp as any)?.data || [];
            let matched = 0;
            let scanned = 0;
            let applied = 0;
            let failed = 0;
            for (const it of items) {
              try {
                const raw = typeof it.value === 'string' ? JSON.parse(it.value) : it.value;
                if (!raw || typeof raw !== 'object') continue;
                scanned += 1;
                const ctx = buildScanContext(raw);
                const hits = evaluateRoutingRules(ctx, [rule]);
                if (hits.length === 0) continue;
                matched += 1;
                const allActions = hits.flatMap((h: any) => Array.isArray(h?.rule?.actions) ? h.rule.actions : []);
                if (allActions.length === 0) continue;
                const result = applyRoutingActionsToRaw(raw, allActions, { ruleName: rule.name });
                if (!result.changed) continue;
                const targetId = raw.id || it.key || it.id;
                if (!targetId) { failed += 1; continue; }
                const write = await writeIncidentSafe(String(targetId), result.next, orgId);
                if (write.success) {
                  applied += 1;
                  // If we just mutated the incident the analyst is
                  // currently viewing, tell the detail view to reload so
                  // the change appears immediately.
                  if (currentId && String(targetId) === String(currentId)) {
                    window.dispatchEvent(
                      new CustomEvent('incident:refresh', { detail: { id: String(targetId) } }),
                    );
                  }
                } else failed += 1;
              } catch {
                /* skip malformed */
              }
            }
            setScanResult({ matched, scanned, applied, failed });
            // Final safety net: even if the current incident wasn't in the
            // matched set, refresh it so the UI is guaranteed consistent.
            if (currentId) {
              window.dispatchEvent(
                new CustomEvent('incident:refresh', { detail: { id: String(currentId) } }),
              );
            }
          } catch {
            setScanResult({ matched: 0, scanned: 0, applied: 0, failed: 0 });
          } finally {
            setScanning(false);
          }
        })();
      } else {
        toast.error('Failed to save routing rule');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!chip && !popoverOpen) return null;

  // Positioning: keep both chip and popover within the viewport.
  const anchor = chip ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, text: '', field: '*' };
  const popoverWidth = 380;
  const popoverLeft = Math.min(
    Math.max(anchor.x - popoverWidth / 2, 12),
    window.innerWidth - popoverWidth - 12,
  );
  const popoverTop = Math.min(anchor.y + 4, window.innerHeight - 420);

  return createPortal(
    <>
      {chip && !popoverOpen && (
        <Box
          data-selection-rule-ui="1"
          onMouseDown={(e) => {
            // Prevent losing the selection when clicking the chip.
            e.preventDefault();
          }}
          onClick={openPopover}
          sx={{
            position: 'fixed',
            top: anchor.y,
            left: anchor.x,
            transform: 'translateX(-50%)',
            zIndex: 10000,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 0.75,
            minHeight: 34,
            borderRadius: 999,
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: 13,
            color: 'hsl(var(--foreground))',
            whiteSpace: 'nowrap',
            '&:hover': { borderColor: 'hsl(var(--primary))' },
          }}
        >
          <Plus size={14} />
          <Typography variant="caption" sx={{ fontSize: 13, lineHeight: 1, fontWeight: 500 }}>
            Create automation rule...
          </Typography>
        </Box>
      )}

      {popoverOpen && (
        <Paper
          data-selection-rule-ui="1"
          elevation={0}
          sx={{
            position: 'fixed',
            top: popoverTop,
            left: popoverLeft,
            width: popoverWidth,
            zIndex: 10001,
            p: 2,
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 2,
            boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
            color: 'hsl(var(--foreground))',
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
              {savedRule ? 'Rule created' : 'New routing rule'}
            </Typography>
            <IconButton size="small" onClick={closeChip} sx={{ color: 'hsl(var(--muted-foreground))' }}>
              <X size={14} />
            </IconButton>
          </Stack>

          {savedRule ? (
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1} alignItems="center">
                <CheckCircle2 size={16} color="hsl(142 71% 45%)" />
                <Typography sx={{ fontSize: 12, color: 'hsl(var(--foreground))' }}>
                  {savedRule.name}
                </Typography>
              </Stack>
              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 1,
                  bgcolor: 'hsl(var(--muted) / 0.4)',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                {scanning ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={12} />
                    <Typography sx={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                      Applying rule to recent incidents...
                    </Typography>
                  </Stack>
                ) : scanResult ? (
                  <Stack spacing={0.75}>
                    <Typography sx={{ fontSize: 12, color: 'hsl(var(--foreground))' }}>
                      {scanResult.matched === 0 ? (
                        <>
                          Scanned <strong>{scanResult.scanned}</strong> recent incident{scanResult.scanned === 1 ? '' : 's'} — no historical matches.
                        </>
                      ) : (
                        <>
                          Scanned <strong>{scanResult.scanned}</strong>, matched <strong>{scanResult.matched}</strong>, applied to <strong>{scanResult.applied}</strong>
                          {scanResult.failed > 0 && (
                            <Box component="span" sx={{ color: 'hsl(0 84% 60%)' }}> ({scanResult.failed} failed)</Box>
                          )}
                          .
                        </>
                      )}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                      Base64-encoded bodies (Gmail, Outlook) and HTML are decoded before matching. The rule will also run on new incoming incidents.
                    </Typography>
                  </Stack>
                ) : (
                  <Typography sx={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                    Rule will apply to new incoming incidents.
                  </Typography>
                )}
              </Box>
              <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 1 }}>
                <Button
                  size="small"
                  onClick={() => {
                    closeChip();
                    navigate('/usecases/case_management_incident_routing_1');
                  }}
                  sx={{ textTransform: 'none', color: 'hsl(var(--muted-foreground))', height: 36 }}
                >
                  Open routing rules
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={closeChip}
                  sx={{
                    textTransform: 'none',
                    height: 36,
                    bgcolor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    '&:hover': { bgcolor: 'hsl(var(--primary))', filter: 'brightness(1.1)' },
                  }}
                >
                  Done
                </Button>
              </Stack>
            </Stack>
          ) : (

          <Stack spacing={1.25}>


            <Typography sx={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', mt: 0.5 }}>
              When
            </Typography>
            <Stack direction="row" spacing={1}>
              <Select
                size="small"
                value={field}
                onChange={(e) => setField(String(e.target.value))}
                sx={{ minWidth: 150, flex: 1 }}
                MenuProps={{ sx: { zIndex: '10010 !important' }, style: { zIndex: 10010 }, PaperProps: { sx: { zIndex: 10010 } } }}
              >
                {FIELD_CHOICES.map((f) => (
                  <MenuItem key={f.value} value={f.value}>
                    {f.label}
                  </MenuItem>
                ))}
              </Select>
              <Select
                size="small"
                value={op}
                onChange={(e) => setOp(e.target.value as RoutingConditionOp)}
                sx={{ minWidth: 120 }}
                MenuProps={{ sx: { zIndex: '10010 !important' }, style: { zIndex: 10010 }, PaperProps: { sx: { zIndex: 10010 } } }}
              >
                {OP_CHOICES.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </Stack>
            <TextField
              size="small"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Value"
              fullWidth
              multiline
              maxRows={3}
            />

            <Typography sx={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', mt: 0.5 }}>
              Then
            </Typography>
            <RoutingActionFields
              action={action}
              variant="compact"
              menuZIndex={10010}
              orgOptions={orgOptions}
              onChange={(patch) => setAction((prev) => ({ ...prev, ...patch }))}
              onTypeChange={(t) => setAction(defaultRoutingAction(t))}
            />


            <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 1 }}>
              <Button
                size="small"
                onClick={closeChip}
                sx={{ textTransform: 'none', color: 'hsl(var(--muted-foreground))', height: 36 }}
              >
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                disabled={saving}
                onClick={handleSave}
                sx={{
                  textTransform: 'none',
                  height: 36,
                  bgcolor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  '&:hover': { bgcolor: 'hsl(var(--primary))', filter: 'brightness(1.1)' },
                }}
              >
                {saving ? 'Saving…' : 'Create rule'}
              </Button>
            </Stack>
          </Stack>
          )}
        </Paper>
      )}
    </>,
    document.body,
  );
};

export default SelectionRuleChip;
