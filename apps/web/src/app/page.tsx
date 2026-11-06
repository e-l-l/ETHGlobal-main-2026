import { redirect } from "next/navigation";

/**
 * Reserved for the marketing landing page (what the company does).
 * Until it exists, send visitors to the app hub so the bare domain is never blank.
 */
export default function LandingPage() {
  redirect("/home");
}
