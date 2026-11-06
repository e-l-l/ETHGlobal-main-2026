import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { AdvanceDetailsScreen } from "./screen";

/** M12 Advance details: `merchant.advance()`. `?demo=behind` previews the late-fee state in mock mode. */
export default async function AdvanceDetailsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  return <AdvanceDetailsScreen initial={await serverView(q.advance)} demo={demo} />;
}
