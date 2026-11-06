import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { WeekScreen } from "./screen";

/** M13 This week: `merchant.week()`. */
export default async function WeekPage() {
  return <WeekScreen initial={await serverView(q.week)} />;
}
