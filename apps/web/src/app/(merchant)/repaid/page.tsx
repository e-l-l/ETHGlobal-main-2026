import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { RepaidScreen } from "./screen";

export default async function Page() {
  return <RepaidScreen initial={await serverView(q.repaid)} />;
}
