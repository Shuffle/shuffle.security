import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { findPublicApp } from './appCatalog.server';

export const getPublicAppMeta = createServerFn({ method: 'GET' })
  .inputValidator((data) => z.object({ slug: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    try {
      return await findPublicApp(data.slug);
    } catch {
      return null;
    }
  });

/** Public app documentation (OpenAPI first, then Python) so app pages render it in the first HTML. */
export const getPublicAppDoc = createServerFn({ method: 'GET' })
  .inputValidator((data) => z.object({ name: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const base = 'https://uk.shuffler.io';
    const cleaned = data.name.toLowerCase().trim();
    const attempts: Array<{ location: 'openapi' | 'python'; name: string; query: string }> = [
      { location: 'openapi', name: cleaned.replace(/[\s-]+/g, '_'), query: 'location=openapi' },
      { location: 'python', name: cleaned.replace(/[\s_]+/g, '-'), query: 'location=python&version=1.0.0' },
    ];
    for (const a of attempts) {
      try {
        const res = await fetch(`${base}/api/v1/docs/${encodeURIComponent(a.name)}?${a.query}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) continue;
        const json = (await res.json()) as { success?: boolean; reason?: unknown; meta?: unknown };
        if (json?.success === true && typeof json.reason === 'string' && !json.reason.includes('404: Not Found') && json.reason.trim().length > 25) {
          const markdown = json.reason.replace(/<img[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi, '![]($1)').trim();
          return {
            markdown,
            meta: json.meta && typeof json.meta === 'object'
              ? (() => {
                  const m = json.meta as { read_time?: unknown; link?: unknown };
                  return {
                    read_time: typeof m.read_time === 'number' ? m.read_time : undefined,
                    link: typeof m.link === 'string' ? m.link : undefined,
                  };
                })()
              : undefined,
            location: a.location,
            version: a.location === 'python' ? '1.0.0' : undefined,
            updatedAt: Date.now(),
          };
        }
      } catch {
        // try next location
      }
    }
    return null;
  });
