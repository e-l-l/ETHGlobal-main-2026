import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FinalGallery } from "./gallery";

export const metadata: Metadata = { title: "Final kit" };

export default function FinalComponentsPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SHOW_KIT !== "1") notFound();
  return <FinalGallery />;
}
