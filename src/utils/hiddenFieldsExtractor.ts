/**
 * Utility to extract unmapped original fields from raw OCSF data
 * and identify which fields were not used in translation, custom fields,
 * observables, or standard incident attributes ("nowhere else").
 */

export interface HiddenFieldItem {
  /** Full dotted path in unmapped_original, e.g. "agentRealtimeInfo.agentOsName" */
  path: string;
  /** Leaf property name, e.g. "agentOsName" */
  leafKey: string;
  /** Human-readable label, e.g. "Agent OS Name" */
  label: string;
  /** Parent namespace or group if nested, e.g. "agentRealtimeInfo" */
  parentGroup?: string;
  /** Original raw value */
  value: any;
  /** Formatted string representation for display and copying */
  displayValue: string;
  /** Field type category */
  type: "text" | "number" | "boolean" | "list" | "json";
}

export interface ExtractHiddenFieldsOptions {
  /** Raw OCSF incident object containing unmapped_original or payload */
  rawOCSF?: any;
  /** High-level incident attributes currently active */
  incident?: {
    title?: string | null;
    description?: string | null;
    source?: string | null;
    severity?: string | null;
    status?: string | null;
    assignee?: string | null;
    labels?: string[] | null;
    references?: any[] | null;
  };
  /** Custom fields currently assigned to the incident */
  customFields?: Record<string, any>;
  /** Incident observables (extracted IOCs, entities, etc.) */
  observables?: Array<{ type?: string; value?: string; name?: string }>;
  /** Raw translation JSON file content if available */
  translationContent?: string | null;
}

const COMMON_ACRONYMS: Record<string, string> = {
  ip: "IP",
  os: "OS",
  sha256: "SHA256",
  sha1: "SHA1",
  md5: "MD5",
  id: "ID",
  uid: "UID",
  url: "URL",
  uri: "URI",
  uuid: "UUID",
  mitre: "MITRE",
  mac: "MAC",
  cve: "CVE",
  dns: "DNS",
  edr: "EDR",
  siem: "SIEM",
  pid: "PID",
  tls: "TLS",
  ssl: "SSL",
};

/**
 * Converts camelCase, snake_case, or dotted key names into clean Title Case labels
 * while respecting common cybersecurity acronyms (IP, OS, SHA256, MITRE, ID, etc.).
 */
export const formatFieldLabel = (leafKey: string): string => {
  if (!leafKey) return "";

  // Split on camelCase boundaries, underscores, dashes, and dots
  const words = leafKey
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/);

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (COMMON_ACRONYMS[lower]) {
        return COMMON_ACRONYMS[lower];
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
};

interface FlattenedLeaf {
  path: string;
  leafKey: string;
  parentGroup?: string;
  value: any;
  displayValue: string;
  type: "text" | "number" | "boolean" | "list" | "json";
}

/**
 * Recursively flattens an unmapped object into leaf entries.
 * Drops null, undefined, empty strings, and empty collections.
 */
const flattenUnmapped = (
  obj: any,
  parentPath = "",
  parentGroup?: string,
): FlattenedLeaf[] => {
  if (obj === null || obj === undefined) return [];
  const results: FlattenedLeaf[] = [];

  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined || val === "") continue;

    const currentPath = parentPath ? `${parentPath}.${key}` : key;
    const currentGroup = parentGroup || (parentPath ? parentPath.split(".")[0] : undefined);

    if (Array.isArray(val)) {
      if (val.length === 0) continue;

      const isPrimitiveArray = val.every(
        (item) =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      );

      if (isPrimitiveArray) {
        results.push({
          path: currentPath,
          leafKey: key,
          parentGroup: currentGroup,
          value: val,
          displayValue: val.map((v) => String(v)).join(", "),
          type: "list",
        });
      } else {
        results.push({
          path: currentPath,
          leafKey: key,
          parentGroup: currentGroup,
          value: val,
          displayValue: JSON.stringify(val, null, 2),
          type: "json",
        });
      }
    } else if (typeof val === "object") {
      const nested = flattenUnmapped(val, currentPath, currentGroup || key);
      results.push(...nested);
    } else if (typeof val === "boolean") {
      results.push({
        path: currentPath,
        leafKey: key,
        parentGroup: currentGroup,
        value: val,
        displayValue: val ? "true" : "false",
        type: "boolean",
      });
    } else if (typeof val === "number") {
      results.push({
        path: currentPath,
        leafKey: key,
        parentGroup: currentGroup,
        value: val,
        displayValue: String(val),
        type: "number",
      });
    } else {
      const strVal = String(val).trim();
      if (!strVal) continue;

      results.push({
        path: currentPath,
        leafKey: key,
        parentGroup: currentGroup,
        value: val,
        displayValue: strVal,
        type: "text",
      });
    }
  }

  return results;
};

const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Checks if a flattened leaf field is used in translation or displayed elsewhere.
 */
const isFieldUsedElsewhere = (
  leaf: FlattenedLeaf,
  options: ExtractHiddenFieldsOptions,
): boolean => {
  const { rawOCSF, incident, customFields, observables, translationContent } =
    options;

  const normalizedPath = normalizeKey(leaf.path);
  const normalizedLeafKey = normalizeKey(leaf.leafKey);
  const strVal = leaf.displayValue.trim().toLowerCase();

  // 1. Check Custom Fields
  if (customFields && typeof customFields === "object") {
    for (const [cfKey, cfVal] of Object.entries(customFields)) {
      if (cfVal === null || cfVal === undefined || cfVal === "") continue;

      const normCfKey = normalizeKey(cfKey);
      if (
        normCfKey === normalizedPath ||
        normCfKey === normalizedLeafKey ||
        normCfKey.endsWith(normalizedLeafKey)
      ) {
        return true;
      }

      // Check if custom field value matches this leaf value
      const cfValStr = String(cfVal).trim().toLowerCase();
      if (cfValStr && cfValStr === strVal) {
        return true;
      }
    }
  }

  // 2. Check Observables
  if (Array.isArray(observables) && observables.length > 0) {
    for (const obs of observables) {
      if (!obs) continue;
      const obsVal = obs.value ? String(obs.value).trim().toLowerCase() : "";
      const obsName = obs.name ? String(obs.name).trim().toLowerCase() : "";

      if (obsVal && obsVal === strVal) return true;
      if (obsName && obsName === strVal) return true;
    }
  }

  // 3. Check Standard Incident Attributes
  if (incident) {
    // Title
    const title = incident.title ? String(incident.title).trim().toLowerCase() : "";
    if (title && (title === strVal || (strVal.length >= 10 && title.includes(strVal)))) {
      return true;
    }

    // Source
    const source = incident.source ? String(incident.source).trim().toLowerCase() : "";
    if (
      source &&
      (source === strVal ||
        source.includes(strVal) ||
        (leaf.leafKey.toLowerCase() === "source" && strVal.includes(source)))
    ) {
      return true;
    }

    // Severity
    if (leaf.leafKey.toLowerCase().includes("severity")) {
      const sev = incident.severity ? String(incident.severity).trim().toLowerCase() : "";
      if (sev && (sev === strVal || sev.includes(strVal) || strVal.includes(sev))) {
        return true;
      }
    }

    // Status
    if (
      leaf.leafKey.toLowerCase() === "status" ||
      leaf.leafKey.toLowerCase() === "status_id"
    ) {
      const status = incident.status ? String(incident.status).trim().toLowerCase() : "";
      if (status && (status === strVal || strVal.includes(status))) {
        return true;
      }
    }

    // Assignee
    const assignee = incident.assignee ? String(incident.assignee).trim().toLowerCase() : "";
    if (assignee && (assignee === strVal || (strVal.length >= 4 && assignee.includes(strVal)))) {
      return true;
    }

    // Labels / types
    if (Array.isArray(incident.labels)) {
      if (
        incident.labels.some((l) => {
          const lStr = String(l).trim().toLowerCase();
          return lStr === strVal || lStr === normalizedLeafKey;
        })
      ) {
        return true;
      }
    }

    // References
    if (Array.isArray(incident.references)) {
      if (incident.references.some((r) => String(r).trim().toLowerCase() === strVal)) {
        return true;
      }
    }

    // Description / narrative
    if (
      leaf.leafKey.toLowerCase() === "description" ||
      leaf.leafKey.toLowerCase() === "desc" ||
      leaf.leafKey.toLowerCase() === "message"
    ) {
      const desc = incident.description ? String(incident.description).trim().toLowerCase() : "";
      if (desc && (desc === strVal || (strVal.length >= 25 && desc.includes(strVal)))) {
        return true;
      }
    }
  }

  // 4. Check Translation File Content (if provided)
  if (translationContent && typeof translationContent === "string") {
    if (
      translationContent.includes(`$${leaf.path}`) ||
      translationContent.includes(`"${leaf.path}"`) ||
      translationContent.includes(`'${leaf.path}'`) ||
      (leaf.path.includes(".") && translationContent.includes(leaf.path))
    ) {
      return true;
    }
  }

  // 5. Check raw OCSF structure outside unmapped_original
  if (rawOCSF && typeof rawOCSF === "object") {
    // Check finding_info_list / finding_info
    const findingInfoList = rawOCSF.finding_info_list || (rawOCSF.finding_info ? [rawOCSF.finding_info] : []);
    if (Array.isArray(findingInfoList)) {
      for (const info of findingInfoList) {
        if (!info) continue;
        const infoTitle = info.title ? String(info.title).trim().toLowerCase() : "";
        if (infoTitle && (infoTitle === strVal || (strVal.length >= 10 && infoTitle.includes(strVal)))) {
          return true;
        }
      }
    }

    // Check product / metadata
    const prodName = rawOCSF.metadata?.product?.name ? String(rawOCSF.metadata.product.name).trim().toLowerCase() : "";
    if (prodName && (prodName === strVal || strVal.includes(prodName))) {
      return true;
    }

    // Check direct property at leafKey on root (if not unmapped container)
    if (
      leaf.leafKey !== "unmapped_original" &&
      leaf.leafKey !== "payload" &&
      leaf.leafKey !== "raw" &&
      rawOCSF[leaf.leafKey] !== undefined
    ) {
      const rootValStr = String(rawOCSF[leaf.leafKey]).trim().toLowerCase();
      if (rootValStr && rootValStr === strVal) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Extracts all unmapped original fields that are not used in translation or displayed elsewhere.
 */
export const extractHiddenFields = (
  options: ExtractHiddenFieldsOptions,
): HiddenFieldItem[] => {
  const { rawOCSF } = options;
  if (!rawOCSF) return [];

  // 1. Resolve raw unmapped container
  let container =
    rawOCSF.unmapped_original ??
    rawOCSF.payload ??
    rawOCSF.raw ??
    rawOCSF.original;

  if (!container) return [];

  if (typeof container === "string") {
    try {
      container = JSON.parse(container);
    } catch {
      return [];
    }
  }

  if (typeof container !== "object" || Array.isArray(container)) {
    return [];
  }

  // 2. Flatten all leaf fields
  const leaves = flattenUnmapped(container);
  if (leaves.length === 0) return [];

  // 3. Filter to leaves that are NOT used elsewhere
  const hiddenLeaves = leaves.filter((leaf) => !isFieldUsedElsewhere(leaf, options));

  // 4. Transform into public HiddenFieldItem list with friendly labels
  return hiddenLeaves.map((leaf) => ({
    path: leaf.path,
    leafKey: leaf.leafKey,
    label: formatFieldLabel(leaf.leafKey),
    parentGroup: leaf.parentGroup,
    value: leaf.value,
    displayValue: leaf.displayValue,
    type: leaf.type,
  }));
};
