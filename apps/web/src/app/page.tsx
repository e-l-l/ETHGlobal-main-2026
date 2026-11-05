import Link from "next/link";
import { Brand } from "@/components/layout";
import { Heading, Accent, Text } from "@/components/ui";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-column flex-col justify-center gap-4 px-4">
      <Brand />
      <Heading level={1} size="lg">
        Under <Accent>construction</Accent>.
      </Heading>
      <Text>
        Component kit: <Link className="underline" href="/dev/components">/dev/components</Link>
      </Text>
    </main>
  );
}
