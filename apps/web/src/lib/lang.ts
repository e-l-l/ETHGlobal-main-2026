import { cookies } from "next/headers";
import type { Lang } from "./copy";

export type { Lang };
export const LANG_COOKIE = "dj-lang";

/** The language is a setting, not a URL: a cookie the ES/EN chip writes, read on the server. */
export async function getLang(): Promise<Lang> {
  const jar = await cookies();
  return jar.get(LANG_COOKIE)?.value === "es" ? "es" : "en";
}
