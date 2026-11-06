import { MerchantNav } from "./merchant-nav";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MerchantNav />
      {children}
    </>
  );
}
