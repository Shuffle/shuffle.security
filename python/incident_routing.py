"""
incident_routing.py — Python port of the Incident Routing rule evaluator.

This file is the canonical Python mirror of the JavaScript modules:
    src/utils/routingRuleEvaluator.ts
    src/utils/routingConditionTree.ts

The behavior MUST stay one-to-one with the frontend so a backend can
validate/evaluate routing rules identically to what the browser preview
shows the user. Any change to routing rule semantics on the frontend
MUST be mirrored here (and vice-versa), with parity tests updated.

Public API (all you should need):

    evaluate_routing_rules(ctx: dict, rules: list[dict]) -> list[dict]
        Returns [{ "rule": <rule>, "matched": [<condition>, ...] }, ...]
        sorted by ascending `priority` (lower number = higher priority).
        Mirrors `evaluateRoutingRules` in routingRuleEvaluator.ts.

    evaluate_condition(ctx: dict, condition: dict) -> bool
        Evaluate a single flat condition. Mirrors `evaluateCondition`.

    evaluate_tree(node: dict, ctx: dict) -> bool
        Evaluate a tree (ConditionGroup / ConditionLeaf shape). Mirrors
        `evaluateTree` from routingConditionTree.ts, wired to
        `evaluateCondition`.

    migrate_legacy_conditions(rule: dict) -> dict
        Build a ConditionGroup tree from a legacy flat rule. Mirrors
        `migrateLegacyConditions`.

    flatten_tree_to_legacy(tree: dict) -> dict
        Best-effort flatten back to `{conditions, matchMode}`. Mirrors
        `flattenTreeToLegacy`.

Types (plain dicts, JSON-shaped, matching the TS interfaces):

    RoutingCondition = {
        "field": str,
        "op": "exists" | "equals" | "contains" | "startsWith" | "endsWith" | "regex",
        "value": str | None,
        "or": bool | None,           # legacy grouping flag
    }

    RoutingRule = {
        "id": str,
        "enabled": bool,
        "priority": int,             # lower = higher priority
        "matchMode": "all" | "any",  # legacy fallback
        "conditions": [RoutingCondition, ...],  # legacy flat model
        "conditionTree": ConditionGroup | None, # preferred tree model
        # ...anything else the frontend stores; passed through untouched.
    }

    ConditionLeaf = { "kind": "condition", "field": str, "op": str, "value": str | None }
    ConditionGroup = { "kind": "group", "op": "and" | "or", "children": [ConditionNode, ...] }

    IncidentEvaluationContext = {
        "title": str | None,
        "description": str | None,
        "source": str | None,
        "severity": str | None,
        "status": str | None,
        "labels": [str, ...] | None,
        "observables": [{"type": str, "value": str}, ...] | None,
        "stakeholders": [{"email": str}, ...] | None,
        "rawOCSF": any,
    }

Run the file directly to execute the parity self-tests:

    python3 python/incident_routing.py
"""

from __future__ import annotations

import base64
import binascii
import json
import re
from typing import Any, Callable, Iterable, Optional


# ── constants ──────────────────────────────────────────────────────────────
# Kept in lockstep with the TS module.

MAX_GROUP_DEPTH = 5            # routingConditionTree.ts
BASE64_MIN_LEN = 8             # routingRuleEvaluator.ts
BASE64_MAX_LEN = 200_000
MAX_STRINGS = 5000
MAX_DEPTH = 12

_BASE64_CHARSET_RE = re.compile(r"^[A-Za-z0-9+/_\-]+={0,2}$")


# ── base64 helpers ─────────────────────────────────────────────────────────

def _looks_base64ish(s: str) -> bool:
    if len(s) < BASE64_MIN_LEN or len(s) > BASE64_MAX_LEN:
        return False
    return bool(_BASE64_CHARSET_RE.match(s))


def _try_decode_base64(s: str) -> Optional[str]:
    if not _looks_base64ish(s):
        return None
    b = s.replace("-", "+").replace("_", "/")
    while len(b) % 4 != 0:
        b += "="
    try:
        raw = base64.b64decode(b, validate=False)
    except (binascii.Error, ValueError):
        return None
    try:
        decoded = raw.decode("utf-8", errors="replace")
    except Exception:
        return None
    if not decoded:
        return None
    # Match the JS "mostly printable" heuristic (letters, digits, punctuation,
    # whitespace, or non-ASCII UTF-8). Codepoints from the U+FFFD replacement
    # sit in the c > 160 bucket, matching TextDecoder({fatal:false}).
    printable = 0
    for ch in decoded:
        c = ord(ch)
        if c == 9 or c == 10 or c == 13 or (32 <= c < 127) or c > 160:
            printable += 1
    if printable / len(decoded) < 0.85:
        return None
    if decoded == s:
        return None
    return decoded


# ── string collection ──────────────────────────────────────────────────────

def _collect_all_strings(root: Any) -> list[str]:
    """Walk any value and return every reachable string, bounded to keep
    the evaluator fast even on very large rawOCSF payloads.
    """
    out: list[str] = []
    seen_ids: set[int] = set()

    def visit(v: Any, depth: int) -> None:
        if len(out) >= MAX_STRINGS or depth > MAX_DEPTH or v is None:
            return
        if isinstance(v, str):
            out.append(v)
            return
        if isinstance(v, bool):
            out.append("true" if v else "false")
            return
        if isinstance(v, (int, float)):
            # Mirror JS String(number): drop trailing .0 for whole floats.
            if isinstance(v, float) and v.is_integer():
                out.append(str(int(v)))
            else:
                out.append(str(v))
            return
        if isinstance(v, (list, tuple)):
            if id(v) in seen_ids:
                return
            seen_ids.add(id(v))
            for it in v:
                visit(it, depth + 1)
            return
        if isinstance(v, dict):
            if id(v) in seen_ids:
                return
            seen_ids.add(id(v))
            for k in v.keys():
                visit(v[k], depth + 1)
            return
        # Other objects — ignore (matches JS `typeof !== 'object'` skip).

    visit(root, 0)
    return out


# ── field resolution ───────────────────────────────────────────────────────

def _get_deep(obj: Any, path: str) -> Any:
    if obj is None:
        return None
    cur = obj
    for p in path.split("."):
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            cur = getattr(cur, p, None)
    return cur


def _resolve_field(ctx: dict, field: str) -> Any:
    if not field:
        return None

    if field == "*" or field == "$whole":
        buckets = [
            ctx,
            [f"{o.get('type') or ''}:{o.get('value') or ''}" for o in (ctx.get("observables") or [])],
            [s.get("email") or "" for s in (ctx.get("stakeholders") or [])],
        ]
        return _collect_all_strings(buckets)

    if field in ("title", "description", "source", "severity", "status", "labels"):
        return ctx.get(field)

    if field.startswith("observables."):
        t = field[len("observables."):].lower()
        return [
            o.get("value")
            for o in (ctx.get("observables") or [])
            if (o.get("type") or "").lower() == t and isinstance(o.get("value"), str)
        ]

    if field == "stakeholders.email":
        return [
            s.get("email")
            for s in (ctx.get("stakeholders") or [])
            if isinstance(s.get("email"), str)
        ]

    if field.startswith("rawOCSF."):
        return _get_deep(ctx.get("rawOCSF"), field[len("rawOCSF."):])

    deep = _get_deep(ctx, field)
    if deep is not None:
        return deep

    return None


def _as_string_array(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        out: list[str] = []
        for it in v:
            out.extend(_as_string_array(it))
        return out
    if isinstance(v, dict):
        try:
            return [json.dumps(v, separators=(",", ":"), ensure_ascii=False)]
        except Exception:
            return []
    if isinstance(v, bool):
        return ["true" if v else "false"]
    if isinstance(v, float) and v.is_integer():
        return [str(int(v))]
    return [str(v)]


def _with_base64_decodes(haystacks: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for s in haystacks:
        if s not in seen:
            seen.add(s)
            out.append(s)
        if len(out) >= MAX_STRINGS:
            break
        decoded = _try_decode_base64(s.strip())
        if decoded is not None and decoded not in seen:
            seen.add(decoded)
            out.append(decoded)
    return out


# ── condition evaluation ───────────────────────────────────────────────────

_OPS = {"exists", "equals", "contains", "startsWith", "endsWith", "regex"}


def evaluate_condition(ctx: dict, condition: dict) -> bool:
    """Evaluate a single flat condition against a context. Mirrors
    `evaluateCondition` in routingRuleEvaluator.ts.
    """
    field = condition.get("field", "")
    op = condition.get("op", "")
    value = condition.get("value")

    raw = _resolve_field(ctx, field)
    raw_strings = _as_string_array(raw)
    haystacks = [s.lower() for s in _with_base64_decodes(raw_strings)]
    needle = (value or "").lower()

    if op == "exists":
        return len(haystacks) > 0 and any(len(s) > 0 for s in haystacks)
    if op == "equals":
        return any(s == needle for s in haystacks)
    if op == "contains":
        return len(needle) > 0 and any(needle in s for s in haystacks)
    if op == "startsWith":
        return len(needle) > 0 and any(s.startswith(needle) for s in haystacks)
    if op == "endsWith":
        return len(needle) > 0 and any(s.endswith(needle) for s in haystacks)
    if op == "regex":
        if not value:
            return False
        try:
            # JS `new RegExp(value, 'i')` — case-insensitive.
            re_c = re.compile(value, re.IGNORECASE)
        except re.error:
            return False
        return any(re_c.search(s) is not None for s in haystacks)
    return False


# ── tree helpers ───────────────────────────────────────────────────────────

def _is_group(n: Any) -> bool:
    return isinstance(n, dict) and n.get("kind") == "group"


def _is_leaf(n: Any) -> bool:
    return isinstance(n, dict) and n.get("kind") == "condition"


def evaluate_tree(node: dict, ctx: dict) -> bool:
    """Evaluate a ConditionGroup/ConditionLeaf tree. Mirrors `evaluateTree`
    from routingConditionTree.ts, wired to `evaluate_condition`.
    """
    if _is_leaf(node):
        return evaluate_condition(ctx, {
            "field": node.get("field", ""),
            "op": node.get("op", ""),
            "value": node.get("value"),
        })
    if not _is_group(node):
        return False
    children = node.get("children") or []
    if not children:
        return False
    if node.get("op") == "and":
        return all(evaluate_tree(c, ctx) for c in children)
    return any(evaluate_tree(c, ctx) for c in children)


def _collect_leaves(node: dict) -> list[dict]:
    if _is_leaf(node):
        return [node]
    if not _is_group(node):
        return []
    out: list[dict] = []
    for c in node.get("children") or []:
        out.extend(_collect_leaves(c))
    return out


def tree_depth(node: dict) -> int:
    """Depth of the deepest nested group. Root group = 1."""
    if not _is_group(node):
        return 0
    max_d = 1
    for c in node.get("children") or []:
        if _is_group(c):
            max_d = max(max_d, 1 + tree_depth(c))
    return max_d


# ── legacy grouping (flat conditions[] + `or` flag) ────────────────────────

def _build_groups(rule: dict) -> list[list[dict]]:
    conditions = rule.get("conditions") or []
    has_or_flag = any(c.get("or") for c in conditions)
    if not has_or_flag:
        if rule.get("matchMode") == "any":
            return [list(conditions)]
        return [[c] for c in conditions]
    groups: list[list[dict]] = []
    for c in conditions:
        if c.get("or") and groups:
            groups[-1].append(c)
        else:
            groups.append([c])
    return groups


def migrate_legacy_conditions(rule: dict) -> dict:
    """Build a ConditionGroup tree from a legacy flat rule. Mirrors
    `migrateLegacyConditions` in routingConditionTree.ts.
    """
    conds = rule.get("conditions") or []

    def leaf_from_legacy(c: dict) -> dict:
        return {
            "kind": "condition",
            "field": c.get("field", "title"),
            "op": c.get("op", "contains"),
            "value": c.get("value", ""),
        }

    def empty_leaf() -> dict:
        return {"kind": "condition", "field": "title", "op": "contains", "value": ""}

    if not conds:
        return {"kind": "group", "op": "and", "children": [empty_leaf()]}

    has_or = any(c.get("or") for c in conds)
    if not has_or:
        if rule.get("matchMode") == "any":
            return {"kind": "group", "op": "or", "children": [leaf_from_legacy(c) for c in conds]}
        return {"kind": "group", "op": "and", "children": [leaf_from_legacy(c) for c in conds]}

    groups: list[dict] = []
    current: list[dict] = []

    def flush() -> None:
        nonlocal current
        if len(current) == 1:
            groups.append(current[0])
        elif len(current) > 1:
            groups.append({"kind": "group", "op": "or", "children": current})
        current = []

    for i, c in enumerate(conds):
        if i > 0 and c.get("or"):
            current.append(leaf_from_legacy(c))
        else:
            flush()
            current = [leaf_from_legacy(c)]
    flush()

    if len(groups) == 1 and _is_group(groups[0]):
        return groups[0]
    return {"kind": "group", "op": "and", "children": groups}


def flatten_tree_to_legacy(tree: dict) -> dict:
    """Best-effort flatten back to {conditions, matchMode}. Mirrors
    `flattenTreeToLegacy` in routingConditionTree.ts.
    """
    children = tree.get("children") or []
    all_leaves = all(_is_leaf(c) for c in children)
    if all_leaves:
        if tree.get("op") == "or":
            return {
                "matchMode": "any",
                "conditions": [
                    {
                        "field": c.get("field"),
                        "op": c.get("op"),
                        "value": c.get("value"),
                        "or": i > 0,
                    }
                    for i, c in enumerate(children)
                ],
            }
        return {
            "matchMode": "all",
            "conditions": [
                {"field": c.get("field"), "op": c.get("op"), "value": c.get("value")}
                for c in children
            ],
        }
    # AND of OR-groups (2-layer)
    if tree.get("op") == "and" and all(
        _is_leaf(c) or (_is_group(c) and c.get("op") == "or" and all(_is_leaf(cc) for cc in c.get("children") or []))
        for c in children
    ):
        out: list[dict] = []
        for child in children:
            if _is_leaf(child):
                out.append({"field": child.get("field"), "op": child.get("op"), "value": child.get("value")})
            else:
                for li, leaf in enumerate(child.get("children") or []):
                    out.append({
                        "field": leaf.get("field"),
                        "op": leaf.get("op"),
                        "value": leaf.get("value"),
                        "or": li > 0,
                    })
        return {"matchMode": "all", "conditions": out}
    # Deeper — legacy consumers only see the first leaf as a stub.
    first = _find_first_leaf(tree)
    return {
        "matchMode": "all",
        "conditions": [{"field": first.get("field"), "op": first.get("op"), "value": first.get("value")}] if first else [],
    }


def _find_first_leaf(n: dict) -> Optional[dict]:
    if _is_leaf(n):
        return n
    for c in n.get("children") or []:
        f = _find_first_leaf(c)
        if f:
            return f
    return None


# ── top-level evaluator ────────────────────────────────────────────────────

def evaluate_routing_rules(ctx: dict, rules: Iterable[dict]) -> list[dict]:
    """Evaluate a list of rules against an incident context. Mirrors
    `evaluateRoutingRules` in routingRuleEvaluator.ts.

    Returns matches sorted by ascending priority (lower number wins).
    Each match: { "rule": <input rule>, "matched": [<flat condition>, ...] }
    """
    out: list[dict] = []
    for rule in rules:
        if not rule.get("enabled"):
            continue

        tree = rule.get("conditionTree")
        if _is_group(tree) and (tree.get("children") or []):
            def leaf_eval(leaf: dict) -> bool:
                return evaluate_condition(ctx, {
                    "field": leaf.get("field", ""),
                    "op": leaf.get("op", ""),
                    "value": leaf.get("value"),
                })
            if _evaluate_tree_with(tree, leaf_eval):
                matched = [
                    {"field": l.get("field"), "op": l.get("op"), "value": l.get("value")}
                    for l in _collect_leaves(tree)
                    if leaf_eval(l)
                ]
                out.append({"rule": rule, "matched": matched})
            continue

        conditions = rule.get("conditions") or []
        if not conditions:
            continue
        groups = _build_groups(rule)
        matched: list[dict] = []
        ok = True
        for group in groups:
            hits = [c for c in group if evaluate_condition(ctx, c)]
            if not hits:
                ok = False
                break
            matched.extend(hits)
        if ok:
            out.append({"rule": rule, "matched": matched})

    out.sort(key=lambda m: m["rule"].get("priority") or 0)
    return out


def _evaluate_tree_with(node: dict, leaf_eval: Callable[[dict], bool]) -> bool:
    if _is_leaf(node):
        return leaf_eval(node)
    if not _is_group(node):
        return False
    children = node.get("children") or []
    if not children:
        return False
    if node.get("op") == "and":
        return all(_evaluate_tree_with(c, leaf_eval) for c in children)
    return any(_evaluate_tree_with(c, leaf_eval) for c in children)


# ── self-tests ─────────────────────────────────────────────────────────────
# Run: `python3 python/incident_routing.py`
# These are the same shapes the TS evaluator handles; when either side
# changes, update BOTH the module and these tests.

def _run_tests() -> None:
    failures: list[str] = []

    def check(name: str, cond: bool) -> None:
        if cond:
            print(f"  ok  {name}")
        else:
            failures.append(name)
            print(f"FAIL  {name}")

    ctx = {
        "title": "Phishing email from acme.com",
        "description": "User reported a suspicious message",
        "source": "gmail",
        "severity": "high",
        "status": "new",
        "labels": ["phishing", "email"],
        "observables": [
            {"type": "domain", "value": "acme.com"},
            {"type": "ip", "value": "1.2.3.4"},
        ],
        "stakeholders": [{"email": "alice@example.com"}],
        "rawOCSF": {
            "unmapped_original": {"subject": "Please pay this invoice"},
            "payload": {"body": {"data": base64.urlsafe_b64encode(b"secret invoice payload here").decode()}},
        },
    }

    # ─ single conditions
    check("contains on title",
          evaluate_condition(ctx, {"field": "title", "op": "contains", "value": "phishing"}))
    check("equals on severity",
          evaluate_condition(ctx, {"field": "severity", "op": "equals", "value": "HIGH"}))
    check("exists on labels",
          evaluate_condition(ctx, {"field": "labels", "op": "exists"}))
    check("regex ci on description",
          evaluate_condition(ctx, {"field": "description", "op": "regex", "value": r"SUSPICIOUS\s+message"}))
    check("startsWith on source",
          evaluate_condition(ctx, {"field": "source", "op": "startsWith", "value": "gm"}))
    check("endsWith on observables.domain",
          evaluate_condition(ctx, {"field": "observables.domain", "op": "endsWith", "value": ".com"}))
    check("stakeholders.email contains",
          evaluate_condition(ctx, {"field": "stakeholders.email", "op": "contains", "value": "@example.com"}))
    check("rawOCSF deep path contains",
          evaluate_condition(ctx, {"field": "rawOCSF.unmapped_original.subject", "op": "contains", "value": "invoice"}))
    check("* whole-object contains hits nested string",
          evaluate_condition(ctx, {"field": "*", "op": "contains", "value": "please pay"}))
    check("base64 auto-decode on rawOCSF path",
          evaluate_condition(ctx, {"field": "rawOCSF.payload.body.data", "op": "contains", "value": "secret invoice"}))
    check("* whole-object also decodes base64",
          evaluate_condition(ctx, {"field": "*", "op": "contains", "value": "secret invoice"}))
    check("arbitrary datastore field resolution",
          evaluate_condition({"hostname": "prod-web-01", "ip": "10.0.1.5"}, {"field": "hostname", "op": "equals", "value": "prod-web-01"}))
    check("arbitrary datastore deep path resolution",
          evaluate_condition({"asset": {"owner": {"email": "sec@shuffler.io"}}}, {"field": "asset.owner.email", "op": "endsWith", "value": "@shuffler.io"}))
    check("no match returns false",
          not evaluate_condition(ctx, {"field": "title", "op": "contains", "value": "ransomware"}))
    check("regex invalid returns false",
          not evaluate_condition(ctx, {"field": "title", "op": "regex", "value": "([unclosed"}))

    # ─ flat rules (legacy)
    rules_legacy = [
        {  # AND of two conditions
            "id": "r1", "enabled": True, "priority": 10, "matchMode": "all",
            "conditions": [
                {"field": "severity", "op": "equals", "value": "high"},
                {"field": "title", "op": "contains", "value": "phishing"},
            ],
        },
        {  # OR (matchMode=any)
            "id": "r2", "enabled": True, "priority": 5, "matchMode": "any",
            "conditions": [
                {"field": "title", "op": "contains", "value": "ransomware"},
                {"field": "source", "op": "equals", "value": "gmail"},
            ],
        },
        {  # disabled
            "id": "r3", "enabled": False, "priority": 1, "matchMode": "all",
            "conditions": [{"field": "title", "op": "contains", "value": "phishing"}],
        },
        {  # OR-flag grouping: severity=high AND (title~invoice OR source=gmail)
            "id": "r4", "enabled": True, "priority": 20, "matchMode": "all",
            "conditions": [
                {"field": "severity", "op": "equals", "value": "high"},
                {"field": "title", "op": "contains", "value": "invoice"},
                {"field": "source", "op": "equals", "value": "gmail", "or": True},
            ],
        },
    ]
    matches = evaluate_routing_rules(ctx, rules_legacy)
    matched_ids = [m["rule"]["id"] for m in matches]
    check("legacy matched rules are r2, r1, r4 in priority order",
          matched_ids == ["r2", "r1", "r4"])

    # ─ tree rules
    tree_rule = {
        "id": "t1", "enabled": True, "priority": 1,
        "conditionTree": {
            "kind": "group", "op": "and", "children": [
                {"kind": "condition", "field": "severity", "op": "equals", "value": "high"},
                {"kind": "group", "op": "or", "children": [
                    {"kind": "condition", "field": "title", "op": "contains", "value": "ransomware"},
                    {"kind": "group", "op": "and", "children": [
                        {"kind": "condition", "field": "source", "op": "equals", "value": "gmail"},
                        {"kind": "condition", "field": "*", "op": "contains", "value": "invoice"},
                    ]},
                ]},
            ],
        },
    }
    tm = evaluate_routing_rules(ctx, [tree_rule])
    check("nested tree rule matches", len(tm) == 1 and tm[0]["rule"]["id"] == "t1")
    check("nested tree reports matched leaves",
          len(tm) == 1 and len(tm[0]["matched"]) >= 3)

    # ─ migration / flatten round-trip
    migrated = migrate_legacy_conditions(rules_legacy[3])  # r4
    check("migrate legacy or-flag produces AND-of-(leaf, OR-group)",
          migrated["op"] == "and"
          and _is_leaf(migrated["children"][0])
          and _is_group(migrated["children"][1])
          and migrated["children"][1]["op"] == "or")
    flattened = flatten_tree_to_legacy(migrated)
    check("flatten of migrated matches legacy shape",
          flattened["matchMode"] == "all"
          and len(flattened["conditions"]) == 3
          and flattened["conditions"][2].get("or") is True)

    # ─ depth
    deep = {"kind": "group", "op": "and", "children": [
        {"kind": "group", "op": "or", "children": [
            {"kind": "group", "op": "and", "children": [
                {"kind": "condition", "field": "title", "op": "contains", "value": "x"},
            ]},
        ]},
    ]}
    check("tree_depth counts nested groups", tree_depth(deep) == 3)
    check("MAX_GROUP_DEPTH parity with TS", MAX_GROUP_DEPTH == 5)

    print()
    if failures:
        print(f"{len(failures)} test(s) failed:")
        for f in failures:
            print(f"  - {f}")
        raise SystemExit(1)
    print("all incident_routing.py parity tests passed")


if __name__ == "__main__":
    _run_tests()
