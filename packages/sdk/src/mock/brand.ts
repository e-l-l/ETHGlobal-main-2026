/** COPIED from apps/web/src/lib/brand.ts. Placeholder product name; mock pay links embed it. */
export const APP_NAME = "[app]";

/** Public domain, used for pay links and QR codes (apps/web's APP_DOMAIN). */
export const APP_DOMAIN = "dripmoni.app";

/** Absolute URL for a route path, e.g. the link a shop's QR code encodes (apps/web's appUrl). */
export function appUrl(path: string) {
  return `https://${APP_DOMAIN}${path}`;
}
