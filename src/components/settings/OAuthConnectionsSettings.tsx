/**
 * Host wrapper around the Shuffle-Core OAuth / MCP connected applications settings surface.
 */
import { OAuthConnectionsSettings as CoreOAuthConnectionsSettings } from '@/Shuffle-Core/components/oauth/OAuthConnectionsSettings';
import { useAuth } from '@/context/AuthContext';

export const OAuthConnectionsSettings = () => {
  const { userInfo } = useAuth();
  return (
    <CoreOAuthConnectionsSettings
      orgId={userInfo?.active_org?.id}
      orgName={userInfo?.active_org?.name}
    />
  );
};

export default OAuthConnectionsSettings;
