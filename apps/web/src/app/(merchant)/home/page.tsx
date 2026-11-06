import { getLang } from "@/lib/lang";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { HomeScreen } from "./screen";

export default async function HomePage() {
  const [initial, lang] = await Promise.all([serverView(q.home), getLang()]);
  return <HomeScreen initial={initial} lang={lang} />;
}
