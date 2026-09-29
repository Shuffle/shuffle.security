import { useState, useEffect, useRef } from 'react';
import { getApiUrl, getAuthHeader, API_CONFIG } from '@/Shuffle-Core/api';

export interface UserPublicProfile {
  github_avatar?: string;
  github_url?: string;
  github_username?: string;
  [key: string]: unknown;
}

export interface User {
  id: string;
  username: string;
  role: string;
  active: boolean;
  orgs?: string[];
  created_at?: number;
  public_profile?: UserPublicProfile;
}

// Shared cache to prevent multiple fetches across component instances
let usersCache: User[] | null = null;
let fetchPromise: Promise<User[]> | null = null;

const fetchUsersOnce = async (): Promise<User[]> => {
  // Return cached data if available
  if (usersCache !== null) {
    return usersCache;
  }

  // If a fetch is already in progress, wait for it
  if (fetchPromise) {
    return fetchPromise;
  }

  // Start new fetch
  fetchPromise = (async () => {
    try {
      const response = await fetch(getApiUrl('/api/v1/getusers'), {
        credentials: 'include',
        headers: {
          ...getAuthHeader(),
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.reason || 'Failed to fetch users');
      }

      const data = await response.json();
      usersCache = Array.isArray(data) ? data : data.users || [];
      return usersCache ?? [];
    } catch (err) {
      fetchPromise = null; // Reset on error to allow retry
      throw err;
    }
  })();

  return fetchPromise;
};

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>(usersCache || []);
  const [loading, setLoading] = useState(usersCache === null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    
    // If already cached, no need to fetch
    if (usersCache !== null) {
      setUsers(usersCache);
      setLoading(false);
      return;
    }

    fetchUsersOnce()
      .then((data) => {
        if (mounted.current) {
          setUsers(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch users');
          setLoading(false);
        }
      });

    return () => {
      mounted.current = false;
    };
  }, []);

  return { users, loading, error };
};

// Optional: Function to invalidate cache if users change
export const invalidateUsersCache = () => {
  usersCache = null;
  fetchPromise = null;
};
