import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MyQrScreen } from "./screen";

/** M21 My QR: `merchant.qr()`. */
export default async function MyQrPage() {
  return <MyQrScreen initial={await serverView(q.myQr)} />;
}
