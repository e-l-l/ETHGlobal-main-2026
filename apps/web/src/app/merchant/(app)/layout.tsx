import { SideNavLayout } from "@/final";
import { MerchantNav, MerchantSideNav } from "./merchant-nav";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <SideNavLayout side={<MerchantSideNav />}>
      <MerchantNav />
      {children}
    </SideNavLayout>
  );
}
