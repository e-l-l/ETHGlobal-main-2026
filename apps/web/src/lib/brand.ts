/** Product name . Every surface reads it from here. */
export const APP_NAME = "DripMoni";

/** Public domain, used for pay links and QR codes. */
export const APP_DOMAIN = "dripmoni.app";

/** Absolute URL for a route path, e.g. the link a shop's QR code encodes. */
export function appUrl(path: string) {
  return `https://${APP_DOMAIN}${path}`;
}
