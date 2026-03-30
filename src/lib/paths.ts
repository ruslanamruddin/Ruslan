export const baseUrl = import.meta.env.BASE_URL;

export function withBase(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

  if (!normalizedPath) {
    return baseUrl;
  }

  return `${baseUrl}${normalizedPath}`.replace(/\/{2,}/g, "/");
}
