/**
 * Host wrapper around the Shuffle-Core CustomDashboard — supplies `orgId`
 * from the host AuthContext, forwards the host's resolved color scheme so the
 * charts follow light/dark mode, and passes through any additional props.
 */
import type { ComponentProps } from 'react';
import { API_CONFIG, CustomDashboard as CoreCustomDashboard } from '@/Shuffle-Core';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

type Props = ComponentProps<typeof CoreCustomDashboard>;

export const CustomDashboard = (props: Props) => {
  const { userInfo, isLoading, isAuthenticated } = useAuth();
  const { resolvedTheme } = useTheme();
  return (
    <CoreCustomDashboard
      orgId={userInfo?.active_org?.id}
      userdata={userInfo}
      isLoaded={!isLoading}
      isLoggedIn={isAuthenticated}
      globalUrl={API_CONFIG.baseUrl}
      theme={resolvedTheme}
      {...props}
    />
  );
};

export default CustomDashboard;
