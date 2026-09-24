/**
 * AppDetailDrawer — Shows app detail content (header, auth, MCP chat, API viewer)
 * inside a drawer. Used from alluvial diagrams and the app search drawer.
 *
 * Delegates state and views to AppDetailContent (single source of truth).
 */

import { Drawer } from '@mui/material';
import { useShuffleMcpTheme } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider';
import type { ShuffleHostProps } from '@/Shuffle-MCPs/host-props';
import AppDetailContent, { checkAppNameMatch } from '@/Shuffle-MCPs/views/AppDetailContent';
import { useDrawerLayer } from '@/Shuffle-MCPs/drawerLayer';

export { checkAppNameMatch };

export interface AppDetailDrawerProps extends ShuffleHostProps {
  open: boolean;
  onClose: () => void;
  /** App name to load */
  appName: string | null;
  /** Pre-resolved Algolia objectID — bypasses Algolia lookup when provided (e.g. when the
   *  caller already had the hit, like AppSearchDrawer / "Add Ingestion Source"). */
  appId?: string | null;
  /** Pre-resolved app icon/image (optional fast path from chip/picker) */
  appImage?: string | null;
  /** Anchor side */
  anchor?: 'left' | 'right';
  /** Width in px */
  width?: number;
  /** Minimum drawer width in px. Defaults to 380. */
  minWidth?: number;
  /** Maximum drawer width in px. Defaults to 720. */
  maxWidth?: number;
  /** Called when drawer closes so parent can refresh data */
  onRefresh?: () => void;
  onAddToCanvas?: (app: { name: string; icon: string; algoliaId?: string | null }) => void;
  isAuthenticated?: boolean;
  activeOrgId?: string | null;
  /** When true, automatically fire the Activate action once the app is loaded
   *  and not yet activated. Used when the drawer is opened from a flow that
   *  expects the app to be wired up immediately (e.g. Usecases tool picker). */
  autoActivate?: boolean;
}

export default function AppDetailDrawer({
  open,
  onClose,
  appName,
  appId,
  appImage,
  anchor = 'right',
  width = 520,
  minWidth = 380,
  maxWidth = 720,
  onRefresh,
  onAddToCanvas,
  isAuthenticated = true,
  activeOrgId,
  autoActivate = false,
  globalUrl,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
  theme,
  colorMode,
}: AppDetailDrawerProps) {
  const themeScope = useShuffleMcpTheme();
  const scopeClassName = themeScope?.scopeClassName ?? (theme === 'dark' ? 'shuffle-mcp-scope dark' : theme === 'light' ? 'shuffle-mcp-scope' : undefined);
  const drawerWidth = `min(${width}px, 100vw)`;
  const drawerMinWidth = `min(${minWidth}px, 100vw)`;
  const drawerMaxWidth = `min(${maxWidth}px, 100vw)`;
  const drawerZIndex = useDrawerLayer(open);

  const handleClose = () => {
    onRefresh?.();
    onClose();
  };

  const drawerPaperProps = {
    className: scopeClassName,
    sx: {
      width: drawerWidth,
      minWidth: drawerMinWidth,
      maxWidth: drawerMaxWidth,
      flex: `0 0 ${drawerWidth}`,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
      borderLeft: anchor === 'right' ? '1px solid hsl(var(--border))' : 'none',
      borderRight: anchor === 'left' ? '1px solid hsl(var(--border))' : 'none',
    },
  };

  return (
    <Drawer
      anchor={anchor}
      open={open}
      onClose={handleClose}
      slotProps={{
        paper: drawerPaperProps,
      }}
      {...({ PaperProps: drawerPaperProps } as any)}
      sx={{
        zIndex: drawerZIndex,
        '& .MuiDrawer-paper': {
          boxSizing: 'border-box',
          width: `${drawerWidth} !important`,
          minWidth: `${drawerMinWidth} !important`,
          maxWidth: `${drawerMaxWidth} !important`,
          flex: `0 0 ${drawerWidth} !important`,
        },
      }}
    >
      <AppDetailContent
        mode="drawer"
        open={open}
        appName={appName}
        appId={appId}
        appImage={appImage}
        onClose={handleClose}
        onRefresh={onRefresh}
        onAddToCanvas={onAddToCanvas}
        isAuthenticated={isAuthenticated}
        activeOrgId={activeOrgId}
        autoActivate={autoActivate}
        showIncidentStats={true}
        showQuickInfo={false}
        showApiCallViewer={false}
        globalUrl={globalUrl}
        userdata={userdata}
        isLoaded={isLoaded}
        isLoggedIn={isLoggedIn}
        serverside={serverside}
        theme={theme}
        colorMode={colorMode}
      />
    </Drawer>
  );
}
