import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from '@/lib/router-compat';
import { usePageMeta } from '@/hooks/usePageMeta';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Package, FileCode, ExternalLink, ShieldAlert, Info, Clock, Server, Search, Loader2, FolderOpen, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { getDatastoreItem, setDatastoreItems } from '@/Shuffle-Core/datastore';
import { getApiUrl, shuffleFetch } from '@/Shuffle-Core/api';
import { severityColors, severityOrder } from '@/config/incidentConfig';
import { detectEcosystemFromName } from '@/lib/packageEcosystem';
import { fetchHostSupplements } from '@/lib/mergeMonitorHosts';

/**
 * Normalize OSV severity strings to the canonical incident severity tokens
 * (critical/high/medium/low/informational) so we can reuse the incident colors
 * and sort order.
 *
 * OSV reports severity in several shapes:
 *  - database_specific.severity: "CRITICAL" | "HIGH" | "MODERATE" | "LOW"  (GHSA)
 *  - severity[].score: CVSS vector or numeric score (e.g. "CVSS:3.1/AV:N/...")
 */
const normalizeSeverity = (raw?: string | null): string => {
  if (!raw) return 'informational';
  const s = String(raw).trim().toLowerCase();
  if (!s) return 'informational';
  if (s.startsWith('crit')) return 'critical';
  if (s.startsWith('high') || s === 'severe') return 'high';
  if (s.startsWith('mod') || s.startsWith('med')) return 'medium';
  if (s.startsWith('low')) return 'low';
  if (s.startsWith('info') || s.startsWith('none') || s === 'negligible') return 'informational';
  // Try to parse numeric CVSS score (0.0–10.0)
  const num = parseFloat(s);
  if (!Number.isNaN(num)) {
    if (num >= 9) return 'critical';
    if (num >= 7) return 'high';
    if (num >= 4) return 'medium';
    if (num > 0) return 'low';
  }
  return 'informational';
};

/**
 * Strip common version prefixes (^, ~, >=, ==, v, etc.) so we can compare a host's
 * declared dependency version against an OSV affected range. Best-effort — OSV
 * ranges use ECOSYSTEM/SEMVER ordering which we approximate with numeric tuple
 * comparison sufficient for typical semver-like strings.
 */
const cleanVersion = (v?: string): string => {
  if (!v) return '';
  return String(v).trim().replace(/^[\^~=v><]+\s*/, '').replace(/^>=|^<=|^>|^</, '').trim();
};

const compareVersions = (a: string, b: string): number => {
  const pa = cleanVersion(a).split(/[.\-+]/);
  const pb = cleanVersion(b).split(/[.\-+]/);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i] || '0', 10);
    const nb = parseInt(pb[i] || '0', 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    // Fallback to string compare for non-numeric segments
    const sa = pa[i] || '';
    const sb = pb[i] || '';
    if (sa !== sb) return sa.localeCompare(sb);
  }
  return 0;
};

/**
 * Check if a given installed version is affected by an OSV vuln.
 * Matches against:
 *  - exact `versions` list, AND
 *  - `ranges[].events` (introduced/fixed) — version is affected when it is
 *    >= any introduced and < the corresponding fixed (or no fixed yet).
 * If we can't determine, return false (conservative — don't false-flag).
 */
const isVersionAffected = (installed: string | undefined, vuln: OsvVuln): boolean => {
  if (!installed) return false;
  const cleaned = cleanVersion(installed);
  if (!cleaned) return false;
  const affected = vuln.affected || [];
  for (const a of affected) {
    if (a.versions && a.versions.some(v => cleanVersion(v) === cleaned)) return true;
    for (const r of a.ranges || []) {
      const events = r.events || [];
      let introduced: string | null = null;
      let fixed: string | null = null;
      let isAffected = false;
      for (const e of events) {
        if (e.introduced !== undefined) {
          introduced = e.introduced;
          // "0" means affected from the beginning
          if (introduced === '0' || compareVersions(cleaned, introduced) >= 0) {
            isAffected = true;
          }
        }
        if (e.fixed !== undefined) {
          fixed = e.fixed;
          if (isAffected && compareVersions(cleaned, fixed) >= 0) {
            isAffected = false;
          }
        }
      }
      if (isAffected) return true;
    }
  }
  return false;
};

type EntityType = 'software' | 'package';

interface EntityReferencePageProps {
  type: EntityType;
}

/**
 * Map a programming language / ecosystem identifier (as reported in the
 * datastore `os` field for packages) to its canonical registry. Used for
 * both the registry deep-link and the language logo.
 *
 * Logos come from Simple Icons CDN — no extra deps, themable via currentColor.
 */
interface LanguageInfo {
  label: string;           // Display name (e.g. "Python")
  registryLabel: string;   // Registry name (e.g. "PyPI")
  registryUrl: (name: string) => string;
  /** Simple Icons slug — see https://simpleicons.org/ */
  iconSlug: string;
  /** Hex color (no `#`) for the logo background tint */
  color: string;
  /** OSV.dev ecosystem identifier — see https://ossf.github.io/osv-schema/#defined-ecosystems */
  osvEcosystem?: string;
}

const LANGUAGE_REGISTRY: Record<string, LanguageInfo> = {
  javascript: { label: 'JavaScript', registryLabel: 'npm', registryUrl: n => `https://www.npmjs.com/package/${encodeURIComponent(n)}`, iconSlug: 'npm', color: 'CB3837', osvEcosystem: 'npm' },
  typescript: { label: 'TypeScript', registryLabel: 'npm', registryUrl: n => `https://www.npmjs.com/package/${encodeURIComponent(n)}`, iconSlug: 'npm', color: 'CB3837', osvEcosystem: 'npm' },
  node: { label: 'Node.js', registryLabel: 'npm', registryUrl: n => `https://www.npmjs.com/package/${encodeURIComponent(n)}`, iconSlug: 'npm', color: 'CB3837', osvEcosystem: 'npm' },
  npm: { label: 'npm', registryLabel: 'npm', registryUrl: n => `https://www.npmjs.com/package/${encodeURIComponent(n)}`, iconSlug: 'npm', color: 'CB3837', osvEcosystem: 'npm' },
  python: { label: 'Python', registryLabel: 'PyPI', registryUrl: n => `https://pypi.org/project/${encodeURIComponent(n)}/`, iconSlug: 'pypi', color: '3775A9', osvEcosystem: 'PyPI' },
  pypi: { label: 'Python', registryLabel: 'PyPI', registryUrl: n => `https://pypi.org/project/${encodeURIComponent(n)}/`, iconSlug: 'pypi', color: '3775A9', osvEcosystem: 'PyPI' },
  ruby: { label: 'Ruby', registryLabel: 'RubyGems', registryUrl: n => `https://rubygems.org/gems/${encodeURIComponent(n)}`, iconSlug: 'rubygems', color: 'E9573F', osvEcosystem: 'RubyGems' },
  go: { label: 'Go', registryLabel: 'pkg.go.dev', registryUrl: n => `https://pkg.go.dev/${encodeURIComponent(n)}`, iconSlug: 'go', color: '00ADD8', osvEcosystem: 'Go' },
  golang: { label: 'Go', registryLabel: 'pkg.go.dev', registryUrl: n => `https://pkg.go.dev/${encodeURIComponent(n)}`, iconSlug: 'go', color: '00ADD8', osvEcosystem: 'Go' },
  rust: { label: 'Rust', registryLabel: 'crates.io', registryUrl: n => `https://crates.io/crates/${encodeURIComponent(n)}`, iconSlug: 'rust', color: 'DEA584', osvEcosystem: 'crates.io' },
  java: { label: 'Java', registryLabel: 'Maven Central', registryUrl: n => `https://central.sonatype.com/search?q=${encodeURIComponent(n)}`, iconSlug: 'openjdk', color: 'ED8B00', osvEcosystem: 'Maven' },
  maven: { label: 'Java', registryLabel: 'Maven Central', registryUrl: n => `https://central.sonatype.com/search?q=${encodeURIComponent(n)}`, iconSlug: 'apachemaven', color: 'C71A36', osvEcosystem: 'Maven' },
  kotlin: { label: 'Kotlin', registryLabel: 'Maven Central', registryUrl: n => `https://central.sonatype.com/search?q=${encodeURIComponent(n)}`, iconSlug: 'kotlin', color: '7F52FF', osvEcosystem: 'Maven' },
  php: { label: 'PHP', registryLabel: 'Packagist', registryUrl: n => `https://packagist.org/packages/${encodeURIComponent(n)}`, iconSlug: 'php', color: '777BB4', osvEcosystem: 'Packagist' },
  composer: { label: 'PHP', registryLabel: 'Packagist', registryUrl: n => `https://packagist.org/packages/${encodeURIComponent(n)}`, iconSlug: 'composer', color: '885630', osvEcosystem: 'Packagist' },
  dotnet: { label: '.NET', registryLabel: 'NuGet', registryUrl: n => `https://www.nuget.org/packages/${encodeURIComponent(n)}`, iconSlug: 'nuget', color: '004880', osvEcosystem: 'NuGet' },
  csharp: { label: 'C#', registryLabel: 'NuGet', registryUrl: n => `https://www.nuget.org/packages/${encodeURIComponent(n)}`, iconSlug: 'nuget', color: '004880', osvEcosystem: 'NuGet' },
  swift: { label: 'Swift', registryLabel: 'Swift Package Index', registryUrl: n => `https://swiftpackageindex.com/search?query=${encodeURIComponent(n)}`, iconSlug: 'swift', color: 'F05138', osvEcosystem: 'SwiftURL' },
  dart: { label: 'Dart', registryLabel: 'pub.dev', registryUrl: n => `https://pub.dev/packages/${encodeURIComponent(n)}`, iconSlug: 'dart', color: '0175C2', osvEcosystem: 'Pub' },
  elixir: { label: 'Elixir', registryLabel: 'Hex', registryUrl: n => `https://hex.pm/packages/${encodeURIComponent(n)}`, iconSlug: 'elixir', color: '4B275F', osvEcosystem: 'Hex' },
};

const getLanguageInfo = (os?: string, fallbackName?: string): (LanguageInfo & { inferred?: boolean; inferReason?: string }) | null => {
  const direct = os ? LANGUAGE_REGISTRY[os.toLowerCase().trim()] : null;
  if (direct) return direct;
  // Fallback: infer ecosystem from the package name's format
  // (e.g. "org.bouncycastle:bcprov-jdk14" → Maven, "@scope/pkg" → npm).
  if (fallbackName) {
    const guess = detectEcosystemFromName(fallbackName);
    if (guess) {
      const info = LANGUAGE_REGISTRY[guess.key];
      if (info) return { ...info, inferred: true, inferReason: guess.reason };
    }
  }
  return null;
};

const CONFIG: Record<EntityType, {
  label: string;
  icon: typeof Package;
  category: string;
  buildLinks: (name: string) => { label: string; url: string }[];
}> = {
  software: {
    label: 'Software',
    icon: Package,
    category: 'shuffle-security_sensors',
    buildLinks: (name) => [
      { label: 'NVD (NIST)', url: `https://nvd.nist.gov/vuln/search#/nvd/home?keyword=${encodeURIComponent(name)}&resultType=records` },
      { label: 'Google Search', url: `https://www.google.com/search?q=vulnerabilities "${encodeURIComponent(name)}"` },
    ],
  },
  package: {
    label: 'Package',
    icon: FileCode,
    category: 'shuffle-security_packages',
    // Note: language-specific registry link is injected dynamically via os field.
    buildLinks: (name) => [
      { label: 'NVD (NIST)', url: `https://nvd.nist.gov/vuln/search/results?query=${encodeURIComponent(name)}` },
      { label: 'OSV.dev', url: `https://osv.dev/list?q=${encodeURIComponent(name)}` },
      { label: 'Snyk Vulnerability DB', url: `https://security.snyk.io/search?q=${encodeURIComponent(name)}` },
      { label: 'Google Search', url: `https://www.google.com/search?q=${encodeURIComponent(name + ' vulnerability')}` },
    ],
  },
};

interface HostMatch {
  hostname: string;
  path?: string;
  version?: string;
  updatedAt?: number;
}

/** OSV.dev vulnerability schema (subset) — see https://ossf.github.io/osv-schema/ */
interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  modified?: string;
  published?: string;
  severity?: Array<{ type?: string; score?: string }>;
  database_specific?: { severity?: string; cwe_ids?: string[] };
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    ranges?: Array<{ type?: string; events?: Array<{ introduced?: string; fixed?: string }> }>;
    versions?: string[];
  }>;
  references?: Array<{ type?: string; url?: string }>;
}

const safeParse = (raw: unknown): Record<string, unknown> | null => {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Expected shape from get_cache:
 * {
 *   name, os, versions: string[],
 *   hostnames: [{ hostname, paths: string[], version, updated_at }, ...]
 * }
 *
 * We expand to one row per (hostname, path) and keep the latest updated_at
 * + version per pair.
 */
const extractMatchesFromValue = (value: unknown): HostMatch[] => {
  if (!value || typeof value !== 'object') return [];
  const obj = value as Record<string, unknown>;
  const hostnames = Array.isArray(obj.hostnames) ? (obj.hostnames as Array<Record<string, unknown>>) : [];
  if (hostnames.length === 0) return [];

  // Deduplicate by hostname + path, keeping the latest updated_at and version.
  const map = new Map<string, HostMatch>();
  for (const entry of hostnames) {
    const hostname = String(entry?.hostname || '').trim();
    if (!hostname) continue;
    const version = entry?.version ? String(entry.version) : undefined;
    const updatedAt = typeof entry?.updated_at === 'number' ? entry.updated_at as number : undefined;
    const paths = Array.isArray(entry?.paths) ? (entry.paths as unknown[]).map(p => String(p)) : [];
    const uniquePaths = paths.length > 0 ? Array.from(new Set(paths)) : [undefined as unknown as string];
    for (const path of uniquePaths) {
      const key = `${hostname}::${path ?? ''}`;
      const existing = map.get(key);
      if (!existing || (updatedAt && (!existing.updatedAt || updatedAt > existing.updatedAt))) {
        map.set(key, { hostname, path: path || undefined, version, updatedAt });
      }
    }
  }
  // Sort: hostname asc, then path asc
  return Array.from(map.values()).sort((a, b) =>
    a.hostname.localeCompare(b.hostname) || (a.path || '').localeCompare(b.path || '')
  );
};

/**
 * Fallback path: when the per-entity datastore key has no record (or no
 * `hostnames` field), scan every sensor record and aggregate hostnames whose
 * `installed_software` (for software) or `code_scanner[].packages` (for
 * packages) contains an entry matching `name` (case-insensitive).
 *
 * This is what /software/{name} and /packages/{name} need when no upstream
 * job has populated a per-entity cache yet.
 */
const scanSensorsForEntity = async (
  entityType: EntityType,
  name: string,
): Promise<HostMatch[]> => {
  const supplements = await fetchHostSupplements();
  const target = name.toLowerCase().trim();
  if (!target) return [];
  const map = new Map<string, HostMatch>();
  const upsert = (hostname: string, version?: string, path?: string) => {
    const key = `${hostname}::${path ?? ''}`;
    const existing = map.get(key);
    if (!existing) map.set(key, { hostname, version, path });
  };

  for (const [hostnameLower, sensor] of supplements.sensorsByHost.entries()) {
    const hostname = String(
      (sensor.hostname as string | undefined) || hostnameLower,
    );
    if (entityType === 'software') {
      const sw = Array.isArray(sensor.installed_software)
        ? (sensor.installed_software as Array<Record<string, unknown>>)
        : [];
      for (const item of sw) {
        const itemName = String(item?.name || '').toLowerCase().trim();
        if (!itemName || itemName !== target) continue;
        upsert(hostname, item?.version ? String(item.version) : undefined);
      }
    } else if (entityType === 'package') {
      const projects = Array.isArray(sensor.code_scanner)
        ? (sensor.code_scanner as Array<Record<string, unknown>>)
        : [];
      for (const proj of projects) {
        const path = proj?.path ? String(proj.path) : undefined;
        const pkgs = Array.isArray(proj?.packages)
          ? (proj.packages as Array<Record<string, unknown>>)
          : [];
        for (const pkg of pkgs) {
          const pkgName = String(pkg?.name || '').toLowerCase().trim();
          if (!pkgName || pkgName !== target) continue;
          upsert(hostname, pkg?.version ? String(pkg.version) : undefined, path);
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.hostname.localeCompare(b.hostname) || (a.path || '').localeCompare(b.path || ''),
  );
};

const EntityReferencePage = ({ type }: EntityReferencePageProps) => {
  const params = useParams();
  const navigate = useNavigate();
  // Use splat param ('*') to capture multi-segment names like '@eslint/js'
  const raw = (params['*'] || params.id || '') as string;
  const name = decodeURIComponent(raw);
  const config = CONFIG[type];
  const Icon = config.icon;

  usePageMeta({ title: `${name} — ${config.label}`, description: `${config.label} detail for ${name}` });

  const [matches, setMatches] = useState<HostMatch[]>([]);
  const [os, setOs] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // OSV-style vulnerability lookup via /api/v1/vulnerabilities
  const [vulns, setVulns] = useState<OsvVuln[]>([]);
  const [vulnsLoading, setVulnsLoading] = useState(false);
  const [vulnsError, setVulnsError] = useState<string | null>(null);
  const [vulnsQueried, setVulnsQueried] = useState(false);
  const [vulnsSort, setVulnsSort] = useState<'affected' | 'severity' | 'date' | 'id'>('affected');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setOs(null);

      // 1) Try the per-entity datastore key (legacy / pre-aggregated cache).
      const res = await getDatastoreItem(name, config.category);
      if (cancelled) return;

      let directMatches: HostMatch[] = [];
      if (res.success && res.item) {
        const parsed = safeParse(res.item.value);
        const value = parsed ?? res.item.value;
        if (value && typeof value === 'object' && 'os' in value && typeof (value as Record<string, unknown>).os === 'string') {
          setOs((value as Record<string, unknown>).os as string);
        }
        directMatches = extractMatchesFromValue(value);
      }

      // 2) Fallback: scan every sensor record for installed_software /
      // code_scanner entries matching this name. This is the path that
      // actually works today because nothing populates per-entity caches.
      if (directMatches.length === 0) {
        try {
          const scanned = await scanSensorsForEntity(type, name);
          if (cancelled) return;
          setMatches(scanned);
        } catch (err) {
          if (cancelled) return;
          // If scanning fails we still want to render the page; just leave
          // matches empty rather than blocking on an error.
          console.warn('[EntityReferencePage] sensor scan failed', err);
          setMatches([]);
        }
      } else {
        setMatches(directMatches);
      }

      // Soft errors from the direct fetch shouldn't block fallback rendering.
      if (!res.success && directMatches.length === 0) {
        // Only surface the error if the fallback also produced nothing.
        // We still allow the page to render; the empty-state copy explains.
      }

      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [name, config.category, type]);

  const language = type === 'package' ? getLanguageInfo(os || undefined, name) : null;

  // Lowest version observed across all hosts (for narrowing the OSV query).
  // If we don't know any version, we omit `version` and fall back to a plain
  // package/CVE lookup.
  const lowestVersion = useMemo(() => {
    const versions = matches
      .map(m => cleanVersion(m.version || ''))
      .filter(v => v.length > 0);
    if (versions.length === 0) return undefined;
    return versions.slice().sort(compareVersions)[0];
  }, [matches]);

  // OSV-style vulnerability query: POST /api/v1/vulnerabilities
  // Mirrors https://google.github.io/osv.dev/post-v1-query/
  // Always includes the lowest known version when available so the API can
  // narrow results to ranges actually affecting our fleet.
  useEffect(() => {
    const ecosystem = language?.osvEcosystem;
    // Packages require a known ecosystem (OSV-style). Software is queried by
    // name only (CVE-style), with version narrowing when we have one.
    if (type === 'package' && !ecosystem) {
      setVulns([]);
      setVulnsQueried(false);
      return;
    }
    if (!name) {
      setVulns([]);
      setVulnsQueried(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setVulnsLoading(true);
      setVulnsError(null);
      setVulnsQueried(true);
      try {
        const payload: Record<string, unknown> =
          type === 'package'
            ? { package: { name, ecosystem } }
            : { package: { name } };
        if (lowestVersion) payload.version = lowestVersion;
        const res = await shuffleFetch(getApiUrl('/api/v1/vulnerabilities'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (cancelled) return;
        if (!res.ok) {
          setVulnsError(`Vulnerability lookup failed (${res.status})`);
          setVulns([]);
          return;
        }
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.vulns) ? (data.vulns as OsvVuln[]) : [];
        setVulns(list);
      } catch (e) {
        if (cancelled) return;
        setVulnsError(e instanceof Error ? e.message : 'Vulnerability lookup failed');
        setVulns([]);
      } finally {
        if (!cancelled) setVulnsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [name, type, language?.osvEcosystem, lowestVersion]);

  // Build reference links: prepend language registry link when known, dedupe by URL.
  const referenceLinks = useMemo(() => {
    const base = config.buildLinks(name);
    if (!language) return base;
    const registryLink = { label: language.registryLabel, url: language.registryUrl(name) };
    const seen = new Set<string>([registryLink.url]);
    return [registryLink, ...base.filter(l => !seen.has(l.url) && (seen.add(l.url), true))];
  }, [config, name, language]);

  // Pre-compute normalized severity per vuln + which of our hosts are affected
  // by checking each host's installed version against the OSV affected ranges.
  const vulnsWithMeta = useMemo(() => vulns.map(v => {
    const rawSev = v.database_specific?.severity || v.severity?.[0]?.score;
    const sevToken = normalizeSeverity(rawSev);
    const affectedHosts = matches.filter(m => isVersionAffected(m.version, v));
    const affectedHostNames = Array.from(new Set(affectedHosts.map(h => h.hostname)));
    return {
      vuln: v,
      sevToken,
      sevColor: severityColors[sevToken] || severityColors.informational,
      sevOrder: severityOrder[sevToken] ?? 0,
      modifiedTs: v.modified ? new Date(v.modified).getTime() : 0,
      publishedTs: v.published ? new Date(v.published).getTime() : 0,
      affectedHosts,
      affectedHostNames,
      affectedCount: affectedHostNames.length,
    };
  }), [vulns, matches]);

  // Per-host vulnerability severity tallies. Each host gets a count for
  // critical/high/medium/low so we can render an L M H C strip.
  type HostSevCounts = { critical: number; high: number; medium: number; low: number; informational: number; total: number; vulnIds: Record<string, string[]> };
  const matchesWithVulns = useMemo(() => {
    return matches.map(m => {
      const counts: HostSevCounts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0, total: 0, vulnIds: { critical: [], high: [], medium: [], low: [], informational: [] } };
      // Use a per-host set to avoid double-counting the same vuln across multiple paths
      const seen = new Set<string>();
      for (const meta of vulnsWithMeta) {
        if (seen.has(meta.vuln.id)) continue;
        if (!isVersionAffected(m.version, meta.vuln)) continue;
        seen.add(meta.vuln.id);
        const bucket = (meta.sevToken as keyof HostSevCounts);
        if (bucket === 'critical' || bucket === 'high' || bucket === 'medium' || bucket === 'low' || bucket === 'informational') {
          counts[bucket] += 1;
          counts.vulnIds[bucket].push(meta.vuln.id);
          counts.total += 1;
        }
      }
      return { match: m, counts };
    });
  }, [matches, vulnsWithMeta]);

  // Manual sync of affected vulnerabilities to shuffle-security_vulns.
  // For each OSV vuln with at least one affected host, store the OSV record verbatim
  // and inject a `hosts: [{ hostname, paths: [{ last_seen, path, version }] }]` array.
  // Keyed by the OSV vuln id (e.g. "GHSA-xxxx" or "CVE-xxxx"). Direct overwrite.
  const [syncing, setSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);
  const syncVulns = useCallback(async () => {
    const affectedMetas = vulnsWithMeta.filter(m => m.affectedHosts.length > 0);
    if (affectedMetas.length === 0) {
      toast.info('No affected vulnerabilities to sync');
      return;
    }
    setSyncing(true);
    setSyncedCount(null);
    const items = affectedMetas.map(meta => {
      const hostMap = new Map<string, { hostname: string; paths: Array<{ last_seen?: string; path?: string; version?: string }> }>();
      for (const h of meta.affectedHosts) {
        const existing = hostMap.get(h.hostname) || { hostname: h.hostname, paths: [] };
        existing.paths.push({
          last_seen: h.updatedAt ? new Date(h.updatedAt * (h.updatedAt < 1e12 ? 1000 : 1)).toISOString() : undefined,
          path: h.path,
          version: h.version,
        });
        hostMap.set(h.hostname, existing);
      }
      return {
        key: meta.vuln.id,
        value: { ...meta.vuln, hosts: Array.from(hostMap.values()) },
      };
    });
    const result = await setDatastoreItems(items, 'shuffle-security_vulns');
    setSyncing(false);
    if (result.success) {
      setSyncedCount(items.length);
      toast.success(`Synced ${items.length} vulnerabilit${items.length === 1 ? 'y' : 'ies'} — ready on /vulnerabilities`, {
        action: { label: 'View', onClick: () => navigate('/vulnerabilities') },
      });
    } else {
      console.warn('[EntityReferencePage] bulk persist failed', result.error);
      toast.error(`Sync failed: ${result.error || 'Unknown error'}`);
    }
  }, [vulnsWithMeta, navigate]);

  // Reset the synced indicator if the underlying data changes (e.g. user navigates
  // to a different package), so the badge doesn't get stale.
  useEffect(() => { setSyncedCount(null); }, [name]);

  const filteredMatches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? matchesWithVulns.filter(({ match: m }) =>
          m.hostname.toLowerCase().includes(q) ||
          (m.path || '').toLowerCase().includes(q) ||
          (m.version || '').toLowerCase().includes(q),
        )
      : matchesWithVulns;
    // Sort: total affected desc, then severity-weighted (crit*1000+high*100+med*10+low),
    // then hostname asc, then path asc.
    return [...list].sort((a, b) => {
      const ta = a.counts.total;
      const tb = b.counts.total;
      if (ta !== tb) return tb - ta;
      const wa = a.counts.critical * 1000 + a.counts.high * 100 + a.counts.medium * 10 + a.counts.low;
      const wb = b.counts.critical * 1000 + b.counts.high * 100 + b.counts.medium * 10 + b.counts.low;
      if (wa !== wb) return wb - wa;
      return a.match.hostname.localeCompare(b.match.hostname) || (a.match.path || '').localeCompare(b.match.path || '');
    });
  }, [matchesWithVulns, filter]);

  const sortedVulns = useMemo(() => {
    const arr = [...vulnsWithMeta];
    if (vulnsSort === 'affected') {
      arr.sort((a, b) =>
        b.affectedCount - a.affectedCount
        || b.sevOrder - a.sevOrder
        || (b.modifiedTs - a.modifiedTs)
        || a.vuln.id.localeCompare(b.vuln.id),
      );
    } else if (vulnsSort === 'severity') {
      arr.sort((a, b) => b.sevOrder - a.sevOrder || (b.modifiedTs - a.modifiedTs) || a.vuln.id.localeCompare(b.vuln.id));
    } else if (vulnsSort === 'date') {
      arr.sort((a, b) => (b.modifiedTs || b.publishedTs) - (a.modifiedTs || a.publishedTs) || b.sevOrder - a.sevOrder);
    } else {
      arr.sort((a, b) => a.vuln.id.localeCompare(b.vuln.id));
    }
    return arr;
  }, [vulnsWithMeta, vulnsSort]);
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/vulnerabilities')} className="gap-1.5 shrink-0">
          <ArrowLeft size={14} /> Back
        </Button>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Icon size={18} className="text-primary shrink-0" />
          <h1 className="text-lg font-semibold text-foreground truncate">{name}</h1>
          {language && (
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[0.65rem] font-medium text-foreground shrink-0"
              title={`${language.label} — ${language.registryLabel}`}
            >
              <img
                src={`https://cdn.simpleicons.org/${language.iconSlug}/${language.color}`}
                alt=""
                width={12}
                height={12}
                loading="lazy"
                className="shrink-0"
              />
              {language.label}
            </span>
          )}
          {!language && os && (
            <span className="inline-flex items-center rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground shrink-0">
              {os}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {syncedCount !== null && !syncing && (
            <button
              type="button"
              onClick={() => navigate('/vulnerabilities')}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[0.7rem] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 transition-colors"
              title="Open Vulnerabilities page"
            >
              <CheckCircle2 size={12} />
              Synced {syncedCount} — view
            </button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={syncVulns}
            disabled={syncing || vulnsWithMeta.filter(m => m.affectedHosts.length > 0).length === 0}
            className="gap-1.5"
            title="Persist affected vulnerabilities to shuffle-security_vulns"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync to Vulnerabilities'}
          </Button>
        </div>
      </div>

      {/* Hosts containing this entity */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-foreground">
            <Server size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">Hosts with this {config.label.toLowerCase()}</span>
            {!loading && (
              <span className="text-[0.65rem] text-muted-foreground">({matches.length})</span>
            )}
          </div>
          {matches.length > 0 && (
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter hosts…"
                className="h-7 pl-7 text-xs w-44"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
            <Loader2 size={12} className="animate-spin" />
            Searching {config.category}…
          </div>
        ) : error ? (
          <p className="text-xs text-destructive py-2">{error}</p>
        ) : matches.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No hosts found with <span className="font-mono font-medium text-foreground">{name}</span> installed.
          </p>
        ) : filteredMatches.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No hosts match "{filter}".</p>
        ) : (
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr className="text-left text-muted-foreground">
                  {vulnsQueried && (
                    <th className="pl-3 pr-1 py-1.5 font-medium w-[1%] whitespace-nowrap">Risk</th>
                  )}
                  <th className="px-3 py-1.5 font-medium">Hostname</th>
                  {type === 'package' && <th className="px-3 py-1.5 font-medium">Path</th>}
                  <th className="px-3 py-1.5 font-medium">Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <TooltipProvider delayDuration={150}>
                  {filteredMatches.map(({ match: m, counts }, i) => {
                    const showRisk = vulnsQueried;
                    const buckets: Array<{ key: 'critical' | 'high' | 'medium' | 'low' | 'informational'; letter: string; label: string }> = [
                      { key: 'critical', letter: 'C', label: 'Critical' },
                      { key: 'high', letter: 'H', label: 'High' },
                      { key: 'medium', letter: 'M', label: 'Medium' },
                      { key: 'low', letter: 'L', label: 'Low' },
                      { key: 'informational', letter: 'I', label: 'Informational' },
                    ];
                    return (
                      <tr
                        key={`${m.hostname}-${m.path || ''}-${i}`}
                        className="hover:bg-muted/20 cursor-pointer"
                        onClick={() => navigate(`/monitors/${encodeURIComponent(m.hostname)}`)}
                      >
                        {showRisk && (
                          <td className="pl-3 pr-1 py-1.5 align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {counts.total === 0 ? (
                              <span className="text-[0.6rem] text-muted-foreground">—</span>
                            ) : (
                              <div className="inline-flex items-center gap-0.5">
                                {buckets.map(({ key, letter, label }) => {
                                  const n = counts[key];
                                  if (n === 0) return null;
                                  const color = severityColors[key];
                                  const ids = counts.vulnIds[key];
                                  return (
                                    <Tooltip key={key}>
                                      <TooltipTrigger asChild>
                                        <span
                                          className="inline-flex items-center gap-0.5 rounded-xs px-1 py-0.5 text-[0.6rem] font-bold leading-none"
                                          style={{
                                            backgroundColor: `${color}26`,
                                            color,
                                            border: `1px solid ${color}55`,
                                          }}
                                        >
                                          {letter}
                                          <span className="font-semibold">{n}</span>
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <div className="text-xs font-medium" style={{ color }}>{label} ({n})</div>
                                        <div className="text-[0.65rem] font-mono mt-1 break-all">
                                          {ids.slice(0, 6).join(', ')}
                                          {ids.length > 6 && ` +${ids.length - 6} more`}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-1.5 font-medium text-foreground">{m.hostname}</td>
                        {type === 'package' && (
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {m.path ? (
                              <span className="inline-flex items-center gap-1 font-mono">
                                <FolderOpen size={10} className="shrink-0" />
                                {m.path}
                              </span>
                            ) : '—'}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-muted-foreground font-mono">{m.version || '—'}</td>
                      </tr>
                    );
                  })}
                </TooltipProvider>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Known vulnerabilities (OSV-style query) */}
      {vulnsQueried && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-foreground flex-wrap">
              <ShieldAlert size={14} className="text-orange-500" />
              <span className="text-sm font-medium">Known vulnerabilities</span>
              {!vulnsLoading && !vulnsError && (
                <>
                  <span className="text-[0.65rem] text-muted-foreground">({vulns.length})</span>
                  {(() => {
                    const affectedCount = vulnsWithMeta.filter(m => m.affectedCount > 0).length;
                    if (affectedCount === 0) return null;
                    return (
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide"
                        style={{
                          backgroundColor: `${severityColors.high}1f`,
                          color: severityColors.high,
                          border: `1px solid ${severityColors.high}55`,
                        }}
                        title="Vulnerabilities matching an installed version on at least one host"
                      >
                        <AlertTriangle size={9} />
                        {affectedCount} affecting your hosts
                      </span>
                    );
                  })()}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {vulns.length > 1 && !vulnsLoading && !vulnsError && (
                <select
                  value={vulnsSort}
                  onChange={(e) => setVulnsSort(e.target.value as 'affected' | 'severity' | 'date' | 'id')}
                  className="h-7 rounded-md border border-border bg-background px-2 text-[0.65rem] text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                  aria-label="Sort vulnerabilities"
                >
                  <option value="affected">Sort: Affected</option>
                  <option value="severity">Sort: Severity</option>
                  <option value="date">Sort: Newest</option>
                  <option value="id">Sort: ID</option>
                </select>
              )}
              {language?.osvEcosystem && (
                <span className="text-[0.65rem] text-muted-foreground font-mono">
                  {language.osvEcosystem}
                </span>
              )}
            </div>
          </div>

          {vulnsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 size={12} className="animate-spin" />
              Querying vulnerability database…
            </div>
          ) : vulnsError ? (
            <p className="text-xs text-destructive py-2">{vulnsError}</p>
          ) : vulns.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No known vulnerabilities reported for <span className="font-mono font-medium text-foreground">{name}</span>.
            </p>
          ) : (
            <div className="space-y-2">
              {sortedVulns.map(({ vuln: v, sevToken, sevColor, affectedHostNames, affectedCount }) => {
                const fixedVersions = (v.affected || [])
                  .flatMap(a => (a.ranges || []).flatMap(r => (r.events || []).map(e => e.fixed).filter(Boolean) as string[]));
                const advisoryUrl = v.references?.find(r => r.type === 'ADVISORY')?.url
                  || v.references?.[0]?.url
                  || `https://osv.dev/vulnerability/${encodeURIComponent(v.id)}`;
                const isAffected = affectedCount > 0;
                return (
                  <div
                    key={v.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/vulnerabilities/${encodeURIComponent(v.id)}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/vulnerabilities/${encodeURIComponent(v.id)}`);
                      }
                    }}
                    className="block rounded-md border bg-muted/20 px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-ring"
                    style={isAffected ? { borderColor: `${sevColor}66` } : { borderColor: 'hsl(var(--border))' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-medium text-foreground">{v.id}</span>
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide"
                            style={{
                              backgroundColor: `${sevColor}1f`,
                              color: sevColor,
                              border: `1px solid ${sevColor}55`,
                            }}
                          >
                            <AlertTriangle size={9} />
                            {sevToken}
                          </span>
                          {isAffected && (
                            <span
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
                              style={{
                                backgroundColor: `${sevColor}2a`,
                                color: sevColor,
                                border: `1px solid ${sevColor}66`,
                              }}
                              title={`Affects ${affectedCount} host${affectedCount === 1 ? '' : 's'}: ${affectedHostNames.join(', ')}`}
                            >
                              <Server size={9} />
                              {affectedCount} affected
                            </span>
                          )}
                          {v.aliases?.slice(0, 2).map(a => (
                            <span key={a} className="text-[0.6rem] font-mono text-muted-foreground">{a}</span>
                          ))}
                        </div>
                        {v.summary && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{v.summary}</p>
                        )}
                        {isAffected && (
                          <p className="mt-1 text-[0.65rem]">
                            <span className="text-muted-foreground">Hosts: </span>
                            <span className="font-mono text-foreground">
                              {affectedHostNames.slice(0, 3).join(', ')}
                              {affectedHostNames.length > 3 && ` +${affectedHostNames.length - 3} more`}
                            </span>
                          </p>
                        )}
                        {fixedVersions.length > 0 && (
                          <p className="mt-1 text-[0.65rem] text-muted-foreground">
                            Fixed in: <span className="font-mono text-foreground">{Array.from(new Set(fixedVersions)).slice(0, 3).join(', ')}</span>
                          </p>
                        )}
                      </div>
                      <a
                        href={advisoryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground"
                        title="Open external advisory"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Version & vulnerability status */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Clock size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">Version Status</span>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            Check the reference links below to determine if the installed version is current or outdated.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <ShieldAlert size={14} className="text-orange-500" />
            <span className="text-sm font-medium">Vulnerability Check</span>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            Search for known CVEs and advisories related to <span className="font-mono font-medium text-foreground">{name}</span> using the databases below.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Info size={14} className="text-blue-500" />
            <span className="text-sm font-medium">Reference Links</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
            {referenceLinks.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors"
              >
                <ExternalLink size={12} className="text-muted-foreground shrink-0" />
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntityReferencePage;
