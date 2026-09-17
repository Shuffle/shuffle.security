import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';
import { toast } from '@/lib/toast';

export interface ShuffleFile {
  id: string;
  filename: string;
  filesize: number;
  created_at: number;
  updated_at: number;
  status: string;
  md5_sum?: string;
  sha256_sum?: string;
  org_id: string;
  workflow_id: string;
  namespace?: string;
  labels?: string[];
  description?: string;
}

interface CreateFileResponse {
  success: boolean;
  id?: string;
  reason?: string;
}

interface UploadFileResponse {
  success: boolean;
  id?: string;
  reason?: string;
}

/**
 * Get the organization ID from localStorage
 */
const getOrgId = (): string => {
  try {
    const userInfo = localStorage.getItem('shuffle_user_info');
    if (userInfo) {
      const parsed = JSON.parse(userInfo);
      return parsed.active_org?.id || '';
    }
  } catch {
    console.error('Failed to get org ID');
  }
  return '';
};

/**
 * Create a file entry (required before uploading)
 */
export const createFile = async (
  filename: string,
  namespace?: string,
  labels?: string[]
): Promise<CreateFileResponse> => {
  try {
    const orgId = getOrgId();
    const response = await fetch(getApiUrl('/api/v1/files/create'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename,
        org_id: orgId,
        workflow_id: 'global',
        namespace: namespace || 'incidents',
        labels: labels || [],
      }),
    });

    return await response.json();
  } catch (error) {
    console.error('Failed to create file:', error);
    return { success: false, reason: 'Network error' };
  }
};

/**
 * Upload file content to a created file ID
 */
export const uploadFile = async (
  fileId: string,
  file: File
): Promise<UploadFileResponse> => {
  try {
    const formData = new FormData();
    formData.append('shuffle_file', file);

    const response = await fetch(getApiUrl(`/api/v1/files/${fileId}/upload`), {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeader(),
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error('Failed to upload file:', error);
    return { success: false, reason: 'Network error' };
  }
};

/**
 * Create and upload a file in one operation
 */
export const createAndUploadFile = async (
  file: File,
  namespace?: string,
  labels?: string[]
): Promise<{ success: boolean; file?: ShuffleFile; reason?: string }> => {
  // Step 1: Create file entry
  const createResult = await createFile(file.name, namespace, labels);
  if (!createResult.success || !createResult.id) {
    return { success: false, reason: createResult.reason || 'Failed to create file entry' };
  }

  // Step 2: Upload file content
  const uploadResult = await uploadFile(createResult.id, file);
  if (!uploadResult.success) {
    return { success: false, reason: uploadResult.reason || 'Failed to upload file' };
  }

  // Cache local object URL for instant rendering without re-fetching
  if (createResult.id && typeof window !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const localUrl = URL.createObjectURL(file);
      cacheFileBlob(`/api/v1/files/${createResult.id}/content`, localUrl);
      cacheFileBlob(createResult.id, localUrl);
    } catch {
      /* ignore object URL failure */
    }
  }

  // Return the file info
  return {
    success: true,
    file: {
      id: createResult.id,
      filename: file.name,
      filesize: file.size,
      created_at: Date.now() / 1000,
      updated_at: Date.now() / 1000,
      status: 'active',
      org_id: getOrgId(),
      workflow_id: 'global',
      namespace: namespace || 'incidents',
      labels,
    },
  };
};

/**
 * List all files
 */
export const listFiles = async (namespace?: string): Promise<ShuffleFile[]> => {
  try {
    let url = '/api/v1/files';
    if (namespace) {
      url += `?namespace=${encodeURIComponent(namespace)}`;
    }

    const response = await fetch(getApiUrl(url), {
      credentials: 'include',
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Failed to list files:', error);
    return [];
  }
};

/**
 * Get file metadata
 */
export const getFileMeta = async (fileId: string): Promise<ShuffleFile | null> => {
  try {
    const response = await fetch(getApiUrl(`/api/v1/files/${fileId}`), {
      credentials: 'include',
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to get file meta:', error);
    return null;
  }
};

/**
 * Get file download URL
 */
export const getFileDownloadUrl = (fileId: string): string => {
  return getApiUrl(`/api/v1/files/${fileId}/content`);
};

/**
 * Delete a file. The backend may respond with either a JSON body
 * (`{ success: true }`), an empty body, or a non-2xx status with a
 * text/JSON error reason. Normalize all of these into a single shape
 * so the UI can show accurate feedback.
 */
export const deleteFile = async (
  fileId: string,
): Promise<{ success: boolean; reason?: string; status?: number }> => {
  try {
    const response = await fetch(getApiUrl(`/api/v1/files/${fileId}`), {
      method: 'DELETE',
      credentials: 'include',
      headers: getAuthHeader(),
    });

    const raw = await response.text();
    let parsed: unknown = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch { /* non-JSON body */ }
    }
    const body = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};

    if (!response.ok) {
      const reason =
        (typeof body.reason === 'string' && body.reason) ||
        (typeof body.error === 'string' && body.error) ||
        (raw && raw.slice(0, 200)) ||
        `HTTP ${response.status}`;
      return { success: false, reason, status: response.status };
    }

    // 2xx: treat as success unless the server explicitly says otherwise.
    if (body && body.success === false) {
      return {
        success: false,
        reason: (typeof body.reason === 'string' ? body.reason : 'Delete rejected by server'),
        status: response.status,
      };
    }
    return { success: true, status: response.status };
  } catch (error) {
    console.error('Failed to delete file:', error);
    return { success: false, reason: 'Network error' };
  }
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// In-memory cache for resolved blob URLs so re-rendering or navigating views never re-fetches
const blobCache = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string>>();

/**
 * Normalize a file source to extract its canonical relative endpoint, e.g.
 * '/api/v1/files/UUID/content' regardless of whether it was prefixed with
 * an absolute backend URL.
 */
export const normalizeFileKey = (src: string): string => {
  if (!src) return '';
  const idx = src.indexOf('/api/v1/files/');
  if (idx !== -1) {
    return src.slice(idx);
  }
  return src;
};

/**
 * Cache a local blob URL for a file source (e.g. immediately after upload).
 */
export const cacheFileBlob = (src: string, blobUrl: string): void => {
  if (!src || !blobUrl) return;
  blobCache.set(normalizeFileKey(src), blobUrl);
  blobCache.set(src, blobUrl);
};

/**
 * Get an already-resolved blob URL from memory if present.
 */
export const getCachedFileBlob = (src?: string | null): string | undefined => {
  if (!src) return undefined;
  return blobCache.get(normalizeFileKey(src)) || blobCache.get(src);
};

/**
 * Check if a source string refers to a Shuffle file API endpoint.
 */
export const isShuffleFileUrl = (src?: string | null): boolean => {
  if (!src || typeof src !== 'string') return false;
  return src.includes('/api/v1/files/');
};

/**
 * Resolves a file URL (which may be a bare file ID, a relative /api/v1/files/... or absolute URL)
 * into a renderable URL. For Shuffle file endpoints requiring authentication,
 * fetches the content with auth headers and returns a local object URL.
 */
export const resolveFileUrl = async (src: string): Promise<string> => {
  if (!src) return '';
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return src;
  }

  // Normalize bare file IDs into file content endpoints
  let normalizedSrc = src;
  if (
    !normalizedSrc.startsWith('http') &&
    !normalizedSrc.startsWith('/') &&
    !normalizedSrc.startsWith('data:') &&
    !normalizedSrc.startsWith('blob:')
  ) {
    normalizedSrc = `/api/v1/files/${normalizedSrc}/content`;
  }

  const cached = getCachedFileBlob(normalizedSrc) || getCachedFileBlob(src);
  if (cached) return cached;

  const key = normalizeFileKey(normalizedSrc);
  const pending =
    pendingFetches.get(key) ||
    pendingFetches.get(normalizedSrc) ||
    pendingFetches.get(src);
  if (pending) return pending;

  // If not a Shuffle file endpoint and already absolute, return directly
  if (!isShuffleFileUrl(normalizedSrc) && /^https?:\/\//i.test(normalizedSrc)) {
    return normalizedSrc;
  }

  const fetchPromise = (async () => {
    try {
      const url = normalizedSrc.startsWith('http')
        ? normalizedSrc
        : getApiUrl(normalizedSrc);
      const res = await fetch(url, {
        credentials: 'include',
        headers: getAuthHeader(),
      });
      if (!res.ok) {
        throw new Error(`Failed to load file: HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      cacheFileBlob(normalizedSrc, objectUrl);
      cacheFileBlob(src, objectUrl);
      return objectUrl;
    } finally {
      pendingFetches.delete(key);
      pendingFetches.delete(normalizedSrc);
      pendingFetches.delete(src);
    }
  })();

  pendingFetches.set(key, fetchPromise);
  pendingFetches.set(normalizedSrc, fetchPromise);
  pendingFetches.set(src, fetchPromise);
  return fetchPromise;
};

/**
 * Triggers a browser download for a file given its ID or URL and filename.
 */
export const downloadFileAttachment = async (
  fileIdOrUrl: string,
  filename: string,
): Promise<void> => {
  try {
    if (!fileIdOrUrl) {
      throw new Error('No file identifier provided');
    }
    const blobUrl = await resolveFileUrl(fileIdOrUrl);
    if (!blobUrl) {
      throw new Error('Could not resolve file content');
    }
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || 'download';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Failed to download file:', error);
    toast.error(`Failed to download ${filename || 'file'}`);
  }
};

