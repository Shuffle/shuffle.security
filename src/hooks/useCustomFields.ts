/**
 * React hook for fetching custom fields with React Query caching.
 * Data is cached for 5 minutes and shared across all components.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatastoreByCategory, DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';

type FieldType = 'text' | 'number' | 'select' | 'date' | 'boolean';

export interface CustomField {
  name: string;
  key: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  description?: string;
}

const QUERY_KEY = ['customFields'];
const STALE_TIME = 5 * 60 * 1000; // 5 minutes

const fetchCustomFields = async (): Promise<CustomField[]> => {
  const response = await getDatastoreByCategory(DATASTORE_CATEGORIES.CUSTOM_FIELDS);
  if (response.success && response.data) {
    return response.data
      .filter(item => !item.category || item.category === DATASTORE_CATEGORIES.CUSTOM_FIELDS)
      .map(item => {
        try {
          const parsed = JSON.parse(item.value);
          if (parsed && typeof parsed === 'object') {
            return {
              name: typeof parsed.name === 'string' && parsed.name ? parsed.name : item.key,
              key: typeof parsed.key === 'string' && parsed.key ? parsed.key : item.key,
              type: (['text', 'number', 'select', 'date', 'boolean'].includes(parsed.type) ? parsed.type : 'text') as FieldType,
              required: Boolean(parsed.required),
              options: Array.isArray(parsed.options) ? parsed.options : undefined,
              description: typeof parsed.description === 'string' ? parsed.description : '',
            };
          }
          return { name: item.key, key: item.key, type: 'text' as FieldType, required: false };
        } catch {
          return { name: item.key, key: item.key, type: 'text' as FieldType, required: false };
        }
      });
  }
  throw new Error(response.error || 'Failed to fetch custom fields');
};

export const useCustomFields = () => {
  const queryClient = useQueryClient();

  const { data: fields = [], isLoading: loading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchCustomFields,
    staleTime: STALE_TIME,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  return {
    fields,
    loading,
    error: error?.message ?? null,
    refetch: invalidate,
  };
};
