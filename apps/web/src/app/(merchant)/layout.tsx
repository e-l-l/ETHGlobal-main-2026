import { MerchantShell } from "@/components/layout";
import { MerchantNav } from "./merchant-nav";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return <MerchantShell header={<MerchantNav />}>{children}</MerchantShell>;
}
