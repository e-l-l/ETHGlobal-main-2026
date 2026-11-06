import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { HomeScreen } from "./screen";

/** M10 Home: `merchant.home()`. Mock data renders on the server; live modes load it in the client screen. */
export default async function DashboardPage() {
  return <HomeScreen initial={await serverView(q.home)} />;
}
