import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { WeekScreen } from "./screen";

export default async function Page() {
  return <WeekScreen initial={await serverView(q.week)} />;
}
