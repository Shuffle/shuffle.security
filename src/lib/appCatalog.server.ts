/**
 * Server-side reads from the public app catalog (Algolia `appsearch`).
 * Used for SEO: per-app page metadata and the generated sitemap.
 * Uses the same public search-only key as the browser catalog.
 */

const ALGOLIA_APP_ID = 'JNSS5CFDZZ';
const ALGOLIA_SEARCH_KEY = '33e4e3564f4f060e96e0531957bed552';
const QUERY_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/appsearch/query`;

export interface PublicCatalogApp {
  objectID: string;
  name: string;
  description?: string;
  image_url?: string;
  categories?: string[];
}

/** URL slug used by /apps links: lowercase name, whitespace to underscores. */
export const appSlug = (name: string): string => name.toLowerCase().replace(/\s+/g, '_');

const queryCatalog = async (body: Record<string, unknown>): Promise<{ hits: PublicCatalogApp[]; nbPages: number }> => {
  const res = await fetch(QUERY_URL, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_SEARCH_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ attributesToHighlight: [], attributesToSnippet: [], ...body }),
  });
  if (!res.ok) throw new Error(`App catalog query failed [${res.status}]: ${await res.text()}`);
  const data = (await res.json()) as { hits?: PublicCatalogApp[]; nbPages?: number };
  if (!Array.isArray(data.hits)) throw new Error('App catalog returned no hit list');
  return { hits: data.hits, nbPages: data.nbPages ?? 0 };
};

/** Every app in the public catalog, paging until the end. Throws on any failed page. */
export const fetchAllPublicApps = async (): Promise<PublicCatalogApp[]> => {
  const all: PublicCatalogApp[] = [];
  for (let page = 0; ; page++) {
    const { hits, nbPages } = await queryCatalog({
      query: '',
      hitsPerPage: 1000,
      page,
      attributesToRetrieve: ['name'],
    });
    all.push(...hits);
    if (hits.length === 0 || page + 1 >= nbPages) break;
  }
  return all;
};

/** Look up one public app by its URL slug (name slug or objectID). Null when not found. */
export const findPublicApp = async (slug: string): Promise<PublicCatalogApp | null> => {
  const wanted = decodeURIComponent(slug).toLowerCase();
  const { hits } = await queryCatalog({
    query: wanted.replace(/_/g, ' '),
    hitsPerPage: 50,
    attributesToRetrieve: ['name', 'description', 'image_url', 'categories'],
  });
  return (
    hits.find((h) => typeof h.name === 'string' && appSlug(h.name) === wanted) ??
    hits.find((h) => h.objectID?.toLowerCase() === wanted) ??
    null
  );
};
