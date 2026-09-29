import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { CTASection } from '@/components/landing/CTASection';
import { Footer } from '@/components/landing/Footer';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useAuth } from '@/context/AuthContext';
import { isCapacitorNative } from '@/Shuffle-Core/api';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileAuthGateway } from '@/components/mobile/MobileAuthGateway';
import { Navigate } from '@/lib/router-compat';

const Index = () => {
  usePageMeta({
    title: 'Shuffle Security — Open Source Alert & Case Management',
    description: 'Open-source AI-powered incident response platform with 3,000+ integrations. Automatic security you control — cloud, on-prem, hybrid.',
    url: '/',
  });

  const { isAuthenticated, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 1. If already logged in, redirect directly to Incidents
  if (isAuthenticated) {
    return <Navigate to="/incidents" replace />;
  }

  // 2. Only inside the native mobile app (Capacitor) do we render the
  // dedicated Mobile Onboarding & Auth Gateway. Mobile web browsers keep the
  // marketing landing page.
  if (isClient && isCapacitorNative()) {
    return <MobileAuthGateway />;
  }

  // 3. Desktop browser landing page
  return (
    <Box sx={{ minHeight: '100vh', background: 'hsl(var(--background))' }}>
      <LandingNavbar />
      <Box component="main">
        <HeroSection />
        <FeaturesSection />
        <CTASection />
      </Box>
      <Footer />
    </Box>
  );
};

export default Index;
