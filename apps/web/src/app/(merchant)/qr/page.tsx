import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MyQrScreen } from "./screen";

export default async function Page() {
  return <MyQrScreen initial={await serverView(q.myQr)} />;
}
