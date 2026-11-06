import Link from "next/link";
import { routes } from "./routes";

/**
 * What a screen shows while the SDK loads, or when it fails, in local / sepolia mode. Mock mode never renders
 * this: its data is on the server. Plain text on purpose, so it sits in either design system.
 */
export function MRAState({ error }: { error?: string | undefined }) {
  if (!error) {
    return (
      <p role="status" className="p-6 text-small text-fg-muted">
        Loading…
      </p>
    );
  }
  const noShop = error === "session_missing";
  return (
    <div role="alert" className="flex flex-col gap-2 p-6 text-small text-fg-muted">
      <p>{noShop ? "No shop on this device yet." : `Couldn't load this screen (${error}).`}</p>
      <p>
        <Link className="underline" href={noShop ? routes.welcome : routes.screens}>
          {noShop ? "Set up a shop" : "All screens"}
        </Link>
      </p>
    </div>
  );
}
