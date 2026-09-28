/**
 * React hook for IOC types with React Query caching.
 * Data is cached for 5 minutes and shared across all components.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatastoreByCategory, DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';

// OCSF-based observable type categories
export const IOC_CATEGORIES = [
  { id: 'common', label: 'Common', color: '#f59e0b' },
  { id: 'hash', label: 'Hash Values', color: '#8b5cf6' },
  { id: 'network', label: 'Network Artifacts', color: '#3b82f6' },
  { id: 'file', label: 'File Artifacts', color: '#10b981' },
  { id: 'user', label: 'User/Identity', color: '#ec4899' },
  { id: 'device', label: 'Device/Endpoint', color: '#06b6d4' },
  { id: 'process', label: 'Process', color: '#f97316' },
  { id: 'registry', label: 'Registry', color: '#a855f7' },
  { id: 'threat_intel', label: 'Threat Intelligence', color: '#ef4444' },
  { id: 'other', label: 'Other', color: '#6b7280' },
] as const;

export type IOCCategory = typeof IOC_CATEGORIES[number]['id'];

// IOC types that are enabled by default (most commonly used in SOC operations)
export const DEFAULT_ENABLED_IOCS = new Set([
  'ipv4', 'ipv6', 'domain', 'url', 'email', 'hash_md5', 'hash_sha256',
  'file_name', 'hostname', 'username', 'cve',
]);

/**
 * Backward-compat alias map. Older datastore entries / payloads may still
 * use the legacy 'ip' name — normalize to STIX-style 'ipv4'.
 * STIX 2.1 uses `ipv4-addr` and `ipv6-addr` as distinct SCO types.
 */
export const IOC_TYPE_ALIASES: Record<string, string> = {
  ip: 'ipv4',
  'ipv4-addr': 'ipv4',
  'ipv6-addr': 'ipv6',
};

export const normalizeIOCType = (name: string | undefined | null): string => {
  if (!name) return '';
  const lower = String(name).toLowerCase();
  return IOC_TYPE_ALIASES[lower] || lower;
};

export interface IOCType {
  name: string;
  regex?: string;
  description?: string;
  category?: IOCCategory;
  needsPattern?: boolean;
  enabled?: boolean;
}

// Default IOC types organized by Pyramid of Pain levels.
// IMPORTANT: order matters — url MUST come before ip, and ip MUST come before
// domain. Parsers iterate this list and pick the first matching regex, so
// keeping URL > IP > domain prevents URLs from being mistyped as domains
// (and IPs embedded in URLs from being mistyped as domains).
export const DEFAULT_IOC_TYPES: IOCType[] = [
  // === MOST COMMONLY USED ===
  // URL regex — matches a URL anywhere inside a larger string (no anchors)
  // so it can be found embedded in JSON, prose, logs, etc. Accepts:
  //   1. Full URLs with scheme:    https?://host[/path...]
  //   2. Schemeless URLs:          host.tld/path...
  //   3. Schemeless URLs w/ qs:    host.tld?key=val
  //   4. Defanged variants:        host[.]tld/path,  host(.)tld/path,
  //                                hxxp://host.tld/path,  host[.]tld[/]path
  // Bare hostnames (no slash, no query) are intentionally NOT matched here —
  // those fall through to the `domain` IOC type. A leading lookbehind keeps
  // the match from starting in the middle of an alphanumeric run, and the
  // trailing class stops at whitespace, quotes, brackets, or commas so JSON
  // / HTML / CSV context is not swallowed.
  { name: 'url', regex: '(?:^|(?<=[^A-Za-z0-9._%+\\-]))(?:(?:h(?:tt|xx)ps?(?:://|\\[://\\]))(?:\\d{1,3}(?:\\.|\\[\\.\\]|\\(\\.\\))){3}\\d{1,3}(?::\\d{1,5})?(?:[\\/?#][^\\s"\'<>\\{\\}\\[\\],]*)?|(?:h(?:tt|xx)ps?(?:://|\\[://\\])|)[A-Za-z0-9](?:[A-Za-z0-9\\-]*[A-Za-z0-9])?(?:(?:\\.|\\[\\.\\]|\\(\\.\\))[A-Za-z0-9](?:[A-Za-z0-9\\-]*[A-Za-z0-9])?)*(?:\\.|\\[\\.\\]|\\(\\.\\))[A-Za-z]{2,24}(?::\\d{1,5})?(?:\\[?\\/\\]?|[?#])[^\\s"\'<>\\{\\}\\[\\],]*)', description: 'URL — matches embedded URLs, defanged forms (host[.]tld, hxxp://), and IP-based URLs with optional port', category: 'common', enabled: true },
  // IPv4: each octet 0-255, but no leading zeros (e.g. "026" historically meant
  // octal 22 — modern parsers either reject it or interpret unexpectedly, so we
  // treat it as invalid). Strict octet: 25[0-5] | 2[0-4]X | 1XX | [1-9]?X.
  { name: 'ipv4', regex: '^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$', description: 'IPv4 address (STIX ipv4-addr)', category: 'common', enabled: true },
  { name: 'ipv6', regex: '^(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}$|^::1$|^::$|^(?:[A-Fa-f0-9]{1,4}:){1,7}:$|^(?:[A-Fa-f0-9]{1,4}:){1,6}:[A-Fa-f0-9]{1,4}$', description: 'IPv6 address (STIX ipv6-addr)', category: 'common', enabled: true },
  // Domain regex: extracts the bare FQDN (host portion) from a string. The
  // domain may stand alone OR sit at the front of a URL — in both cases we
  // want the bare host. Supports defanged forms (`[.]`, `(.)`). The trailing
  // lookahead allows `/`, `?`, `#`, end-of-string, or any non-host char to
  // follow, but rejects another hostname label so we capture the full host.
  { name: 'domain', regex: '(?:^|(?<=[^A-Za-z0-9._%+\\-\\[\\(]))(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.|\\[\\.\\]|\\(\\.\\)))+(?!(?:data|html?|json|xml|css|jsx?|tsx?|mjs|cjs|yml|yaml|toml|log|tmp|bak|cfg|conf|env|lock|local|internal|example|invalid|test|localhost|md|txt|csv|tsv|png|jpe?g|gif|svg|webp|ico|pdf|docx?|xlsx?|pptx?|zip|tar|gz|tgz|bz2|xz|7z|rar|exe|dll|so|dylib|bin|app|dmg|iso|img|py|rb|go|rs|java|class|jar|sh|bash|zsh|fish|bat|ps1|cmd|ini|sql|db|sqlite|map|woff2?|ttf|otf|eot|mp[34]|wav|flac|ogg|webm|mkv|mov|avi|wmv)(?:[^A-Za-z]|$))[a-zA-Z]{2,24}(?![A-Za-z0-9\\-]|\\.[A-Za-z]|\\[\\.\\]|\\(\\.\\))', description: 'Domain / FQDN host (supports defanged forms; extracts host even when part of a URL)', category: 'common', enabled: true },
  { name: 'email', regex: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', description: 'Email address', category: 'common', enabled: true },
  { name: 'hash_md5', regex: '^[a-fA-F0-9]{32}$', description: 'MD5 hash (32 hex chars)', category: 'common', enabled: true },
  { name: 'hash_sha256', regex: '^[a-fA-F0-9]{64}$', description: 'SHA256 hash (64 hex chars)', category: 'common', enabled: true },
  { name: 'file_name', description: 'File name', category: 'common', needsPattern: true, enabled: true },
  { name: 'hostname', description: 'Hostname', category: 'common', needsPattern: true, enabled: true },
  { name: 'username', description: 'Username', category: 'common', needsPattern: true, enabled: true },
  // === HASH VALUES ===
  { name: 'hash_sha1', regex: '^[a-fA-F0-9]{40}$', description: 'SHA1 hash (40 hex chars)', category: 'hash' },
  { name: 'hash_sha512', regex: '^[a-fA-F0-9]{128}$', description: 'SHA512 hash (128 hex chars)', category: 'hash' },
  { name: 'hash_ssdeep', description: 'SSDeep fuzzy hash', category: 'hash', needsPattern: true },
  { name: 'hash_imphash', regex: '^[a-fA-F0-9]{32}$', description: 'PE Import hash', category: 'hash' },
  { name: 'hash_tlsh', description: 'TLSH locality-sensitive hash', category: 'hash', needsPattern: true },
  // === NETWORK ARTIFACTS ===
  { name: 'ipv4_range', regex: '^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\/(?:[0-9]|[1-2][0-9]|3[0-2])$', description: 'IPv4 CIDR range (e.g., 192.168.1.0/24)', category: 'network' },
  { name: 'ipv6_range', description: 'IPv6 CIDR range (e.g., 2001:db8::/32)', category: 'network', needsPattern: true },
  { name: 'asn', regex: '^AS\\d+$', description: 'Autonomous System Number', category: 'network' },
  { name: 'subdomain', description: 'Subdomain pattern', category: 'network' },
  { name: 'uri_path', description: 'URI path pattern', category: 'network' },
  { name: 'email_subject', description: 'Email subject line pattern', category: 'network' },
  { name: 'email_attachment', description: 'Email attachment filename', category: 'network' },
  { name: 'user_agent', description: 'HTTP User-Agent string', category: 'network' },
  { name: 'http_header', description: 'Specific HTTP header pattern', category: 'network' },
  { name: 'ssl_cert_hash', regex: '^[a-fA-F0-9]{40,64}$', description: 'SSL/TLS certificate hash', category: 'network' },
  { name: 'ssl_cert_serial', description: 'SSL certificate serial number', category: 'network' },
  { name: 'ja3_hash', regex: '^[a-fA-F0-9]{32}$', description: 'JA3 TLS fingerprint', category: 'network' },
  { name: 'ja3s_hash', regex: '^[a-fA-F0-9]{32}$', description: 'JA3S server fingerprint', category: 'network' },
  { name: 'jarm_hash', regex: '^[a-fA-F0-9]{62}$', description: 'JARM TLS server fingerprint', category: 'network' },
  { name: 'port', regex: '^([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$', description: 'Port number', category: 'network' },
  // === FILE ARTIFACTS ===
  { name: 'file_path', description: 'Full file path', category: 'file' },
  { name: 'file_extension', regex: '^\\.?[a-zA-Z0-9]{1,10}$', description: 'File extension', category: 'file' },
  { name: 'file_size', description: 'File size (bytes)', category: 'file' },
  { name: 'file_attachment', description: 'Uploaded file attachment', category: 'file' },
  { name: 'directory', description: 'Directory path', category: 'file' },
  // === USER/IDENTITY ===
  { name: 'user_email', regex: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', description: 'User email address', category: 'user' },
  { name: 'user_sid', regex: '^S-1-[0-9-]+$', description: 'Windows Security Identifier (SID)', category: 'user' },
  { name: 'user_guid', regex: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', description: 'User GUID/UUID', category: 'user' },
  { name: 'group_name', description: 'User group or role name', category: 'user' },
  // === DEVICE/ENDPOINT ===
  { name: 'mac_address', regex: '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$', description: 'MAC address', category: 'device' },
  { name: 'device_id', description: 'Device identifier', category: 'device' },
  { name: 'serial_number', description: 'Hardware serial number', category: 'device' },
  { name: 'event_id', regex: '^\\d+$', description: 'Windows Event ID', category: 'device' },
  // === PROCESS ===
  { name: 'process_name', description: 'Process name', category: 'process' },
  { name: 'process_path', description: 'Full process path', category: 'process' },
  { name: 'process_cmdline', description: 'Command line arguments', category: 'process' },
  { name: 'service_name', description: 'Windows/Linux service name', category: 'process' },
  { name: 'scheduled_task', description: 'Scheduled task name', category: 'process' },
  { name: 'mutex', description: 'Mutex name', category: 'process' },
  { name: 'named_pipe', description: 'Named pipe', category: 'process' },
  // === REGISTRY ===
  { name: 'registry_key', description: 'Windows registry key', category: 'registry' },
  { name: 'registry_value', description: 'Windows registry value', category: 'registry' },
  // === THREAT INTELLIGENCE ===
  { name: 'mitre_tactic', regex: '^TA\\d{4}$', description: 'MITRE ATT&CK Tactic ID', category: 'threat_intel' },
  { name: 'mitre_technique', regex: '^T\\d{4}(\\.\\d{3})?$', description: 'MITRE ATT&CK Technique ID', category: 'threat_intel' },
  { name: 'mitre_subtechnique', regex: '^T\\d{4}\\.\\d{3}$', description: 'MITRE ATT&CK Sub-technique', category: 'threat_intel' },
  { name: 'cve', regex: '^CVE-\\d{4}-\\d{4,}$', description: 'CVE vulnerability ID', category: 'threat_intel', enabled: true },
  { name: 'cwe', regex: '^CWE-\\d+$', description: 'CWE weakness ID', category: 'threat_intel' },
  { name: 'capec', regex: '^CAPEC-\\d+$', description: 'CAPEC attack pattern ID', category: 'threat_intel' },
  { name: 'malware_family', description: 'Malware family name', category: 'threat_intel' },
  { name: 'malware_variant', description: 'Malware variant identifier', category: 'threat_intel' },
  { name: 'tool_name', description: 'Attack tool name (e.g., Mimikatz, Cobalt Strike)', category: 'threat_intel' },
  { name: 'threat_actor', description: 'Threat actor/APT group name', category: 'threat_intel' },
  { name: 'campaign', description: 'Attack campaign name', category: 'threat_intel' },
  { name: 'yara_rule', description: 'YARA rule name', category: 'threat_intel' },
  { name: 'sigma_rule', description: 'Sigma detection rule', category: 'threat_intel' },
  { name: 'snort_rule', description: 'Snort/Suricata rule', category: 'threat_intel' },
  { name: 'attack_pattern', description: 'Attack pattern description', category: 'threat_intel' },
  { name: 'kill_chain_phase', description: 'Cyber Kill Chain phase', category: 'threat_intel' },
  // === OTHER ===
  { name: 'bitcoin_address', regex: '^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$', description: 'Bitcoin wallet address', category: 'other' },
  { name: 'ethereum_address', regex: '^0x[a-fA-F0-9]{40}$', description: 'Ethereum wallet address', category: 'other' },
  { name: 'monero_address', regex: '^4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}$', description: 'Monero wallet address', category: 'other' },
  { name: 'other', description: 'Other indicator type', category: 'other' },
];

const CANONICAL_REGEX_IOC_TYPES = new Set(['url', 'domain']);

export const normalizeDefaultIOCType = (iocType: IOCType): IOCType => {
  const defaultType = DEFAULT_IOC_TYPES.find(type => type.name === iocType.name);
  if (!defaultType) return iocType;

  const useCanonicalRegex = CANONICAL_REGEX_IOC_TYPES.has(iocType.name);
  return {
    ...defaultType,
    ...iocType,
    regex: useCanonicalRegex ? defaultType.regex : (iocType.regex ?? defaultType.regex),
    enabled: iocType.enabled ?? defaultType.enabled ?? DEFAULT_ENABLED_IOCS.has(iocType.name),
    needsPattern: useCanonicalRegex ? false : (iocType.needsPattern ?? defaultType.needsPattern),
  };
};

const QUERY_KEY = ['iocTypes'];
const STALE_TIME = 5 * 60 * 1000; // 5 minutes

const fetchIOCTypes = async (): Promise<IOCType[]> => {
  const response = await getDatastoreByCategory(DATASTORE_CATEGORIES.IOCS);
  if (response.success && response.data && response.data.length > 0) {
    const validItems = response.data.filter(item => !item.category || item.category === DATASTORE_CATEGORIES.IOCS);
    if (validItems.length > 0) {
      return validItems.map(item => {
        try {
          const obj = JSON.parse(item.value) as IOCType;
          // Fix double-escaped regex patterns from datastore serialization
          if (obj.regex && obj.regex.includes('\\\\')) {
            obj.regex = obj.regex.replace(/\\\\/g, '\\');
          }
          return normalizeDefaultIOCType({ ...obj, name: obj.name || item.key });
        } catch {
          return normalizeDefaultIOCType({ name: item.key, regex: typeof item.value === 'string' ? item.value : '', description: '' } as IOCType);
        }
      });
    }
  }
  // No items in datastore — use built-in defaults
  return DEFAULT_IOC_TYPES;
};

/**
 * Canonical IOC Types defaults seeder. SINGLE source of truth — used by:
 *   - The IOC Types page reset button (via the hook's initializeDefaults).
 *   - lib/initDefaults.ts (auto-init on /incidents load).
 *   - The demo-mode live environment bootstrap.
 *
 * Writes the curated DEFAULT_IOC_TYPES into the datastore using the bulk
 * API. Caller is responsible for deciding *whether* to call this — this
 * helper unconditionally writes (it is what "Reset to Defaults" needs).
 *
 * Returns true on success, false on failure.
 */
export const seedDefaultIOCTypes = async (): Promise<boolean> => {
  try {
    const { setDatastoreItems, DATASTORE_CATEGORIES } = await import('@/Shuffle-MCPs/datastore');
    const dsItems = DEFAULT_IOC_TYPES.map(ioc => ({
      key: ioc.name,
      value: { ...ioc, enabled: ioc.enabled ?? DEFAULT_ENABLED_IOCS.has(ioc.name) },
    }));
    const res = await setDatastoreItems(dsItems, DATASTORE_CATEGORIES.IOCS);
    return !!res?.success;
  } catch (err) {
    console.warn('[seedDefaultIOCTypes] failed', err);
    return false;
  }
};

export const useIOCTypes = () => {
  const queryClient = useQueryClient();

  const { data: iocTypes = DEFAULT_IOC_TYPES, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchIOCTypes,
    staleTime: STALE_TIME,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  // Validate a value against an IOC type's regex
  const validateValue = useCallback((typeName: string, value: string): boolean => {
    const iocType = iocTypes.find(t => t.name === typeName);
    if (!iocType?.regex) return true;
    try {
      return new RegExp(iocType.regex).test(value);
    } catch {
      return true;
    }
  }, [iocTypes]);

  // Initialize defaults in datastore using the shared canonical helper.
  const initializeDefaults = useCallback(async () => {
    await seedDefaultIOCTypes();
    invalidate();
  }, [invalidate]);

  // Get observable type names for dropdowns
  const observableTypeNames = iocTypes.map(t => t.name);

  return {
    iocTypes,
    isLoading,
    observableTypeNames,
    validateValue,
    initializeDefaults,
    refetch: invalidate,
    groupedTypes: IOC_CATEGORIES.reduce((acc, cat) => {
      acc[cat.id] = iocTypes.filter(t =>
        cat.id === 'other' ? (t.category === 'other' || !t.category) : t.category === cat.id
      );
      return acc;
    }, {} as Record<IOCCategory, IOCType[]>),
  };
};

export default useIOCTypes;
