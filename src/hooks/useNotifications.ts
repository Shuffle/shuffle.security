/**
 * Hook for fetching agent question notifications.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAgentNotifications, type AgentNotification } from '@/services/notifications';
import { hasShuffleAuth } from '@/Shuffle-Core/api';

export const useAgentNotifications = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-notifications'],
    queryFn: fetchAgentNotifications,
    // Never poll without auth — unauthenticated calls just 401 in a loop.
    enabled: hasShuffleAuth(),
    // Poll once per minute. Stuck-agent handoffs are rare, so 60s strikes a
    // balance between freshness and API load. The global watcher in
    // DashboardLayout uses the same query key so polling is shared, not duplicated.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });


  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['agent-notifications'] });
  };

  return {
    notifications: data?.notifications ?? [],
    isLoading,
    error,
    refresh,
  };
};

export type { AgentNotification };
