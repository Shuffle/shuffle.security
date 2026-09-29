/**
 * VideoEmbed — shared inline video player for markdown content.
 *
 * Supports YouTube, Loom and direct video files (mp4/webm/ogg).
 * Rendered as a block-level span so it is valid inside <p> elements.
 */
import React from 'react';
import { Box } from '@mui/material';

export type VideoKind = 'youtube' | 'loom' | 'file';

export interface ResolvedVideo {
  kind: VideoKind;
  /** Embed URL for iframes, or the direct file URL for <video>. */
  src: string;
}

const FILE_EXT = /\.(mp4|webm|ogg|ogv|mov)(\?.*)?$/i;

/** Returns embed info when the URL points at a supported video, otherwise null. */
export function resolveVideoUrl(raw?: string | null): ResolvedVideo | null {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;

  let url: URL;
  try {
    // window.location is unavailable during SSR — fall back to the canonical
    // origin so relative URLs still resolve in server-rendered HTML.
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://shuffle.security';
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  // YouTube
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    if (id) return { kind: 'youtube', src: `https://www.youtube.com/embed/${id}` };
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const id = url.searchParams.get('v');
    if (id) return { kind: 'youtube', src: `https://www.youtube.com/embed/${id}` };
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
      if (parts[1]) return { kind: 'youtube', src: `https://www.youtube.com/embed/${parts[1]}` };
    }
  }

  // Loom
  if (host === 'loom.com' || host.endsWith('.loom.com')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'share' || p === 'embed');
    const id = idx >= 0 ? parts[idx + 1] : undefined;
    if (id) return { kind: 'loom', src: `https://www.loom.com/embed/${id}` };
  }

  // Direct video files
  if (FILE_EXT.test(url.pathname)) return { kind: 'file', src: value };

  return null;
}

export const VideoEmbed: React.FC<{ video: ResolvedVideo; title?: string }> = ({
  video,
  title,
}) => (
  <Box
    component="span"
    sx={{
      display: 'block',
      my: 1.5,
      position: 'relative',
      width: '100%',
      maxWidth: 720,
      aspectRatio: '16 / 9',
      borderRadius: 1,
      overflow: 'hidden',
      border: '1px solid hsl(var(--border))',
      backgroundColor: 'hsl(var(--muted))',
    }}
  >
    {video.kind === 'file' ? (
      <video
        src={video.src}
        controls
        preload="metadata"
        style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}
      />
    ) : (
      <iframe
        src={video.src}
        title={title || 'Embedded video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
      />
    )}
  </Box>
);

export default VideoEmbed;
