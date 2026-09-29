/**
 * Related-usecases render slot.
 *
 * The "related usecases" section shown inside the app detail view is a
 * Shuffle-Core concern (it renders UsecaseCard/UsecaseDrawer and pulls in the
 * whole usecase catalog + workflow-health chain). Shuffle-MCPs is the lower
 * layer and must NOT depend on Shuffle-Core, so instead of importing that
 * component directly, AppDetailContent renders whatever renderer the higher
 * layer registers here.
 *
 * Shuffle-Core registers its `AppRelatedUsecases` implementation at import
 * time via `setRelatedUsecasesRenderer` (see Shuffle-Core/registerRelatedUsecases).
 * When Shuffle-Core is not present (pure MCP embedding), the section simply
 * does not render. Mirrors the existing `setToastImpl` / `setHostBaseUrl`
 * injection pattern used across this package.
 */
import type { ReactNode } from 'react';

export interface AppRelatedUsecasesRenderProps {
  appName: string;
  displayName: string;
  categories?: string[];
  hasValidAuth?: boolean;
  onNavigateToAuth?: () => void;
  mode?: 'drawer' | 'page';
}

export type RelatedUsecasesRenderer = (
  props: AppRelatedUsecasesRenderProps,
) => ReactNode;

let _renderer: RelatedUsecasesRenderer | null = null;

export function setRelatedUsecasesRenderer(fn: RelatedUsecasesRenderer | null) {
  _renderer = fn;
}

export function getRelatedUsecasesRenderer(): RelatedUsecasesRenderer | null {
  return _renderer;
}
