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
