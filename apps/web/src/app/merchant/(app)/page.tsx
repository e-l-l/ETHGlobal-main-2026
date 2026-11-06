import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { HomeScreen } from "./screen";

/**
 * M10 Home: `merchant.home()`. Mock data renders on the server; live modes load it in the client screen.
 * `?demo=behind` previews the late-fee state in mock mode.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  return <HomeScreen initial={await serverView(q.home)} demo={demo} />;
}
