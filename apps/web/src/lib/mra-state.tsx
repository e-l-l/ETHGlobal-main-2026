import Link from "next/link";
import { routes } from "./routes";

const MESSAGES: Record<string, { text: string; href: string; link: string }> = {
  session_missing: { text: "No shop on this device yet.", href: routes.welcome, link: "Set up a shop" },
  not_found: { text: "Nothing here yet: this shop has no advance.", href: routes.merchant, link: "Back to home" },
};

/**
 * What a screen shows while the SDK loads, or when it fails, in local / sepolia mode. Mock mode never renders
 * this: its data is on the server. Plain text on purpose, so it sits in either design system.
 */
export function MRAState({ error }: { error?: string | undefined }) {
  if (!error) {
    return (
      <p role="status" className="p-6 font-body text-note text-charcoal-muted">
        Loading…
      </p>
    );
  }
  const m = MESSAGES[error] ?? { text: `Couldn't load this screen (${error}).`, href: routes.screens, link: "All screens" };
  return (
    <div role="alert" className="flex flex-col gap-2 p-6 font-body text-note text-charcoal-muted">
      <p className="m-0">{m.text}</p>
      <p className="m-0">
        <Link className="underline" href={m.href}>
          {m.link}
        </Link>
      </p>
    </div>
  );
}
