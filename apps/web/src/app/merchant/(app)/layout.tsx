import { SideNavLayout } from "@/final";
import { MerchantBackdrop } from "../_ui";
import { MerchantNav, MerchantSideNav } from "./merchant-nav";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    // isolate: the backdrop sits at -z-10 inside this context, above the body background and below the page.
    <div className="isolate">
      <MerchantBackdrop />
      <SideNavLayout side={<MerchantSideNav />}>
        <MerchantNav />
        {children}
      </SideNavLayout>
    </div>
  );
}
