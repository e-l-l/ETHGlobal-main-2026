import Link from "next/link";
import { Button } from "@/final/button";
import { Spinner } from "@/final/status";
import { MRA_ENV } from "./mra";
import { routes } from "./routes";

const MESSAGES: Record<string, { text: string; href: string; link: string }> = {
  not_found: { text: "Nothing here yet: this shop has no advance.", href: routes.merchant, link: "Back to home" },
};

/** What we say while the first read is in flight. Private (Nox mixnet) reads are slow, so say so. */
export const LOADING_TEXT = MRA_ENV.anonRpc
  ? "Reading the chain privately over the Nox mixnet… this can take up to a minute."
  : "Reading the chain…";

/** A fresh device: no shop keys here yet. Start an advance, or restore the passes from a World ID backup. */
function NoShopHere() {
  return (
    <div role="alert" className="flex max-w-xl flex-col gap-3 p-6">
      <h1 className="m-0 font-display text-h2 font-bold text-charcoal">No shop on this device yet</h1>
      <p className="m-0 font-body text-read text-charcoal-muted">
        Your shop lives on the device you signed up with. Start a new one here, or bring yours back with your World ID backup.
      </p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Button href={routes.welcome}>Get an advance</Button>
        <Button href={routes.restore} variant="secondary">
          Restore with World ID
        </Button>
      </div>
    </div>
  );
}

/**
 * What a screen shows while the SDK loads, or when it fails, in local / sepolia mode. Mock mode never renders
 * this: its data is on the server. Kept plain on purpose, so it sits in either design system.
 */
export function MRAState({ error }: { error?: string | undefined }) {
  if (!error) {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-3 p-6 font-body text-note text-charcoal-muted">
        <Spinner size={18} label="Loading" />
        <p className="m-0">{LOADING_TEXT}</p>
      </div>
    );
  }
  if (error === "session_missing") return <NoShopHere />;
  const m = MESSAGES[error] ?? { text: `Couldn't load this screen (${error}).`, href: routes.home, link: "Back to start" };
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
