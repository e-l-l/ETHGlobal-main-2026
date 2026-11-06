import { getLang } from "@/lib/lang";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { HomeScreen } from "./screen";

/** M10 Home: `merchant.home()`. Mock data renders on the server; live modes load it in the client screen. */
export default async function DashboardPage() {
  const [initial, lang] = await Promise.all([serverView(q.home), getLang()]);
  return <HomeScreen initial={initial} lang={lang} />;
}
