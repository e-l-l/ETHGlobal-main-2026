import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { WorldViewScreen } from "./screen";

export default async function Page() {
  return <WorldViewScreen initial={await serverView(q.world)} />;
}
