/** URL slug used by /apps links: lowercase name, whitespace to underscores. */
export const appSlug = (name: string): string => name.toLowerCase().replace(/\s+/g, '_');
