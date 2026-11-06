import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery2 } from "./gallery";

export const metadata: Metadata = { title: "Dollar Jar kit" };

export default function Components2Page() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SHOW_KIT !== "1") notFound();
  return <Gallery2 />;
}
