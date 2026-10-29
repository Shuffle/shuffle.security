import { createFileRoute } from "@tanstack/react-router";
import { fetchAllPublicApps } from "@/lib/appCatalog.server";
import { appSlug } from "@/lib/appSlug";

const BASE_URL = "https://shuffle.security";

/** Public, indexable static pages. Pages marked noindex are deliberately left out. */
const STATIC_PATHS = ["/", "/apps", "/pricing", "/docs", "/login", "/register"];

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

const fetchDocNames = async (): Promise<string[]> => {
  const base = (process.env["VITE_SHUFFLE_API_URL"] || "https://shuffler.io").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v1/docs`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Docs list failed [${res.status}]`);
  const data = (await res.json()) as { success?: boolean; list?: { name?: unknown }[] };
  if (!data.success || !Array.isArray(data.list)) throw new Error("Docs list returned no entries");
  return data.list.map((d) => d.name).filter((n): n is string => typeof n === "string" && n.length > 0);
};

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const [apps, docs] = await Promise.all([fetchAllPublicApps(), fetchDocNames()]);
          const paths = new Set<string>(STATIC_PATHS);
          for (const name of docs) paths.add(`/docs/${encodeURIComponent(name)}`);
          for (const app of apps) {
            if (typeof app.name === "string" && app.name.trim()) {
              paths.add(`/apps/${encodeURIComponent(appSlug(app.name))}`);
            }
          }
          const urls = [...paths].map((p) => `<url><loc>${escapeXml(BASE_URL + p)}</loc></url>`).join("");
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
            { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } },
          );
        } catch (error) {
          // Never serve a partial sitemap; Google retries later.
          console.error("Sitemap generation failed", error);
          return new Response("Sitemap temporarily unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store", "Retry-After": "600" },
          });
        }
      },
    },
  },
});
