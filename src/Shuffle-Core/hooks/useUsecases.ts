/**
 * useUsecases — React Query hook that fetches usecases from the API,
 * renders backend usecases as the primary source of truth,
 * and falls back to local defaults when the API is unavailable.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '@shuffleio/shuffle-mcps';
import { shuffleFetch } from '@/Shuffle-Core/api';
import {
  DEFAULT_USECASES,
  type Usecase,
  type FlowPhase,
  type ApiUsecaseCategory,
  type ApiUsecase,
  getUsecasesByArea,
  getUsecasesByPhase,
  getAutomationLabels,
  apiCategoryToPhase,
  normalizeCategory,
} from '@/Shuffle-Core/config/usecases';

// The host AuthContext is not available inside Shuffle-Core; treat
// authentication as a cache-key seed only. Callers that need the actual auth
// state should pass it via React Query invalidation. We default to `true` so
// the cache key is stable in both standalone and host environments.
const useAuth = () => ({ isAuthenticated: true });

export type DriftType =
  | 'api_only'
  | 'local_only'
  | 'phase_mismatch'
  | 'description_added';

export interface UsecaseDrift {
  usecaseId: string;
  drifts: DriftType[];
  apiUsecase?: ApiUsecase;
  apiCategory?: string;
  localValue?: Usecase;
}

interface FetchResult {
  usecases: Usecase[];
  apiCategories: ApiUsecaseCategory[];
  drifts: UsecaseDrift[];
}

const ROUTE_ALIASES: Record<string, string[]> = {
  communication: ['email'],
  email: ['communication'],
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'usecase';

const getApiSource = (apiUsecase: ApiUsecase) =>
  normalizeCategory(apiUsecase.source_id || apiUsecase.type);

const getApiTarget = (apiUsecase: ApiUsecase) =>
  normalizeCategory(apiUsecase.target_id || apiUsecase.last || apiUsecase.destination || '');

const buildApiOnlyId = (apiUsecase: ApiUsecase) => {
  const source = getApiSource(apiUsecase);
  const target = getApiTarget(apiUsecase);
  return `api_${source}_${target}_${slugify(apiUsecase.name)}`;
};

const buildLocalRouteMap = () => {
  const map = new Map<string, Usecase[]>();

  for (const usecase of DEFAULT_USECASES) {
    const key = `${usecase.source}→${usecase.target}`;
    const existing = map.get(key) || [];
    existing.push(usecase);
    map.set(key, existing);
  }

  return map;
};

const LOCAL_ROUTE_MAP = buildLocalRouteMap();

function getMatchingLocalUsecase(apiUsecase: ApiUsecase, matchedLocalIds: Set<string>): Usecase | undefined {
  if ((apiUsecase as any).id) {
    const byId = DEFAULT_USECASES.find((l) => !matchedLocalIds.has(l.id) && l.id === (apiUsecase as any).id);
    if (byId) return byId;
  }
  const source = getApiSource(apiUsecase);
  const target = getApiTarget(apiUsecase);
  const candidateSources = [source, ...(ROUTE_ALIASES[source] || [])];
  const apiNameSlug = slugify(apiUsecase.name || '');

  if (apiNameSlug) {
    for (const candidateSource of candidateSources) {
      const locals = LOCAL_ROUTE_MAP.get(`${candidateSource}→${target}`) || [];
      const byLabel = locals.find(
        (local) => !matchedLocalIds.has(local.id) && slugify(local.label) === apiNameSlug
      );
      if (byLabel) return byLabel;
    }
  }

  for (const candidateSource of candidateSources) {
    const locals = LOCAL_ROUTE_MAP.get(`${candidateSource}→${target}`) || [];
    const unmatched = locals.find((local) => !matchedLocalIds.has(local.id) && !local.customAction);
    if (unmatched) return unmatched;
  }

  return undefined;
}

function mapApiUsecaseToFrontend(apiCategory: ApiUsecaseCategory, apiUsecase: ApiUsecase, localUsecase?: Usecase): Usecase {
  const resolvedPhase = (apiCategory.phase && (apiCategory.phase === 'ingest' || apiCategory.phase === 'correlation' || apiCategory.phase === 'response'))
    ? apiCategory.phase
    : apiCategoryToPhase(apiCategory.name);
  return {
    id: localUsecase?.id || (apiUsecase as any).id || buildApiOnlyId(apiUsecase),
    source: getApiSource(apiUsecase),
    target: getApiTarget(apiUsecase),
    label: apiUsecase.name || localUsecase?.label || 'Untitled usecase',
    description: apiUsecase.description || localUsecase?.description || '',
    agenticDescription: localUsecase?.agenticDescription || apiUsecase.agentic_description || apiUsecase.description || '',
    phase: resolvedPhase,
    tags: apiUsecase.tags || localUsecase?.tags || [],
    // Backend is the source of truth — anything returned by the API counts as
    // active/animated unless the local override explicitly says otherwise.
    animated: typeof apiUsecase.disabled === 'boolean' ? !apiUsecase.disabled : (localUsecase ? localUsecase.animated : true),
    supportOnly: typeof (apiUsecase as any).support_only === 'boolean' ? (apiUsecase as any).support_only : localUsecase?.supportOnly,
    automationLabel: apiUsecase.automation_label || localUsecase?.automationLabel,
    automationCategory: apiUsecase.automation_category || localUsecase?.automationCategory,
    automationArea: (apiUsecase.automation_area as Usecase['automationArea'] | undefined) || localUsecase?.automationArea,
    status: localUsecase?.status,
    manualVerification: typeof apiUsecase.manual_verification === 'boolean' ? apiUsecase.manual_verification : localUsecase?.manualVerification,
    priority: typeof apiUsecase.priority === 'number' ? apiUsecase.priority : localUsecase?.priority,
    video: apiUsecase.video || localUsecase?.video,
    blogpost: apiUsecase.blogpost || localUsecase?.blogpost,
    referenceImage: apiUsecase.reference_image || localUsecase?.referenceImage,
    customAction: apiUsecase.custom_action || localUsecase?.customAction,
  };
}

function buildBackendUsecases(apiCategories: ApiUsecaseCategory[]): Pick<FetchResult, 'usecases' | 'drifts'> {
  const matchedLocalIds = new Set<string>();
  const usecases: Usecase[] = [];
  const drifts: UsecaseDrift[] = [];

  for (const apiCategory of apiCategories) {
    for (const apiUsecase of apiCategory.list || []) {
      if ((apiUsecase as any).id === 'threat_intel_cloud_1') continue;
      if (apiUsecase.name === 'IOC feeds' && (getApiTarget(apiUsecase) === 'cloud' || (apiCategory.phase && apiCategory.phase !== 'ingest') || apiCategoryToPhase(apiCategory.name) !== 'ingest')) continue;
      if (!getApiSource(apiUsecase) || !getApiTarget(apiUsecase)) continue;

      const localUsecase = getMatchingLocalUsecase(apiUsecase, matchedLocalIds);
      if (localUsecase) matchedLocalIds.add(localUsecase.id);

      const mapped = mapApiUsecaseToFrontend(apiCategory, apiUsecase, localUsecase);
      const driftTypes: DriftType[] = [];

      if (!localUsecase) {
        driftTypes.push('api_only');
      } else {
        if (mapped.phase !== localUsecase.phase) driftTypes.push('phase_mismatch');
        if (apiUsecase.description && !localUsecase.description) driftTypes.push('description_added');
      }

      usecases.push(mapped);
      drifts.push({
        usecaseId: mapped.id,
        drifts: driftTypes,
        apiUsecase,
        apiCategory: apiCategory.name,
        ...(localUsecase ? { localValue: localUsecase } : {}),
      });
    }
  }

  for (const localUsecase of DEFAULT_USECASES) {
    if (matchedLocalIds.has(localUsecase.id)) continue;
    // Merge local-only usecases into the rendered list so the UI shows the
    // union of both sources. Support users see a "local only" drift badge.
    usecases.push(localUsecase);
    if (localUsecase.id !== 'threat_intel_ingest_1') {
      drifts.push({
        usecaseId: localUsecase.id,
        drifts: ['local_only'],
        localValue: localUsecase,
      });
    }
  }

  return { usecases, drifts };
}

async function fetchUsecases(): Promise<FetchResult> {
  try {
    const response = await shuffleFetch(getApiUrl('/api/v1/workflows/usecases'));

    if (!response.ok) {
      console.warn(`[useUsecases] API returned ${response.status}, using defaults`);
      return { usecases: DEFAULT_USECASES, apiCategories: [], drifts: [] };
    }

    const data = await response.json();
    const apiCategories: ApiUsecaseCategory[] = Array.isArray(data) ? data : [];

    if (apiCategories.length === 0) {
      console.log('[useUsecases] No categories in API response, using defaults');
      return { usecases: DEFAULT_USECASES, apiCategories: [], drifts: [] };
    }

    const rendered = buildBackendUsecases(apiCategories);

    console.log(
      `[useUsecases] Rendering ${rendered.usecases.length} backend usecases from ${apiCategories.length} API categories`
    );

    return {
      usecases: rendered.usecases,
      apiCategories,
      drifts: rendered.drifts,
    };
  } catch (error) {
    console.warn('[useUsecases] Fetch failed, using defaults:', error);
    return { usecases: DEFAULT_USECASES, apiCategories: [], drifts: [] };
  }
}

export function useUsecases() {
  const { isAuthenticated } = useAuth();
  const query = useQuery<FetchResult>({
    queryKey: ['usecases', isAuthenticated],
    queryFn: fetchUsecases,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const usecases = query.data?.usecases ?? DEFAULT_USECASES;
  const apiCategories = query.data?.apiCategories ?? [];
  const drifts = query.data?.drifts ?? [];

  const driftMap = useMemo(() => {
    const map = new Map<string, UsecaseDrift>();
    for (const drift of drifts) map.set(drift.usecaseId, drift);
    return map;
  }, [drifts]);

  return {
    ...query,
    usecases,
    apiCategories,
    apiLoaded: apiCategories.length > 0,
    drifts,
    driftMap,
    hasDrift: drifts.some((drift) => drift.drifts.length > 0),
    getDrift: (id: string) => driftMap.get(id),
    getById: (id: string) => usecases.find((usecase) => usecase.id === id),
    getByPhase: (phase: FlowPhase) => getUsecasesByPhase(phase, usecases),
    getByArea: (area: string) => getUsecasesByArea(area, usecases),
    getAutomationLabels: (area: string) => getAutomationLabels(area, usecases),
    getBySourceOrTarget: (categoryId: string) =>
      usecases.filter((usecase) => usecase.source === categoryId || usecase.target === categoryId),
  };
}