import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "./gallery";
import { Compositions } from "./compositions";

export const metadata: Metadata = { title: "Component kit" };

export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SHOW_KIT !== "1") notFound();
  return (
    <>
      <Gallery />
      <Compositions />
    </>
  );
}
