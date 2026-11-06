import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/cookies";
import { accountFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const jar = await cookies();
  redirect(accountFromToken(jar.get(SESSION_COOKIE)?.value) ? "/dashboard" : "/login");
}
