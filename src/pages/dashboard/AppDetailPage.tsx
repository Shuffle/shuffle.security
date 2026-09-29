import { useState } from 'react';
import { ArrowLeft as ArrowBackIcon } from 'lucide-react';
import { useParams, useSearchParams, Link } from '@/lib/router-compat';
import { usePageMeta } from '@/hooks/usePageMeta';
import { Box, Button } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { AppDetailContent, type AppInfo } from '@/Shuffle-Core';

const AppDetailPage = () => {
  const { appname } = useParams<{ appname: string }>();
  const [searchParams] = useSearchParams();
  const autoActivateRequested = searchParams.get('autoActivate') === '1';
  const { isAuthenticated, userInfo } = useAuth();
  const [loadedAppInfo, setLoadedAppInfo] = useState<AppInfo | null>(null);

  const displayName = (loadedAppInfo?.name || appname || '').replace(/_/g, ' ');

  usePageMeta({
    title: displayName ? `${displayName} Integration` : 'App Integration',
    description: loadedAppInfo?.description
      ? `${displayName} — ${loadedAppInfo.description}. Connect and automate with Shuffle Security.`
      : `Connect ${displayName} to Shuffle Security. Automate workflows, run AI-powered actions, and integrate with 3,000+ tools.`,
    image: (loadedAppInfo?.large_image as string) || undefined,
    url: `/apps/${appname}`,
    jsonLd: displayName
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: `${displayName} Integration`,
          description: loadedAppInfo?.description
            ? `${displayName} — ${loadedAppInfo.description}. Connect and automate with Shuffle Security.`
            : `Connect ${displayName} to Shuffle Security and automate workflows.`,
          image: (loadedAppInfo?.large_image as string) || undefined,
          url: `https://shuffle.security/apps/${appname}`,
          brand: { '@type': 'Brand', name: 'Shuffle Security' },
          category: 'Security Integration',
        }
      : undefined,
  });

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'hsl(var(--background))' }}>
      {/* Show landing navbar for guests */}
      {!isAuthenticated && <LandingNavbar />}

      <Box
        sx={{
          p: { xs: 2, md: 4 },
          maxWidth: 800,
          mx: 'auto',
          pt: !isAuthenticated ? 12 : { xs: 2, md: 4 },
        }}
      >
        {/* Back navigation */}
        <Button
          component={Link}
          to="/apps"
          startIcon={<ArrowBackIcon size={16} />}
          sx={{
            color: 'hsl(var(--muted-foreground))',
            fontWeight: 500,
            mb: 4,
            textTransform: 'none',
            fontSize: '0.85rem',
            '&:hover': {
              color: 'hsl(var(--foreground))',
              background: 'transparent',
            },
          }}
        >
          Back to Apps
        </Button>

        {/* Unified App Detail Content */}
        <AppDetailContent
          mode="page"
          appName={appname || null}
          isAuthenticated={isAuthenticated}
          activeOrgId={userInfo?.active_org?.id}
          autoActivate={autoActivateRequested}
          allowGuestLocked={true}
          showQuickInfo={true}
          showApiCallViewer={true}
          onAppInfoLoaded={setLoadedAppInfo}
        />
      </Box>
    </Box>
  );
};

export default AppDetailPage;
