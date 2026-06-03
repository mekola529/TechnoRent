const SITE_URL = import.meta.env.VITE_SITE_URL || "https://technorent.ua";
const API_BASE = import.meta.env.VITE_API_URL || "/api";

export const DEFAULT_OG_IMAGE =
  "https://images.unsplash.com/photo-1695795692564-586c6ab80a69?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1200";

export function absoluteSiteUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function absoluteImageUrl(url?: string | null) {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/uploads/")) {
    const backendOrigin = API_BASE.replace(/\/api$/, "");
    return backendOrigin ? `${backendOrigin}${url}` : absoluteSiteUrl(url);
  }
  return absoluteSiteUrl(url);
}
