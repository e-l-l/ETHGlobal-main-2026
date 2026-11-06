"use client";

import { useMRAAction } from "@/lib/use-mra";
import { Banner } from "./surface";
import { Button } from "./button";

export function AgentStop({ onDone }: { onDone: () => void }) {
  const revoke = useMRAAction((m) => m.agent.revoke());
  return <div>
    <Button variant="secondary" loading={revoke.pending} onClick={() => { revoke.run().then(onDone, () => undefined); }}>Stop my agent</Button>
    {revoke.error ? <Banner tone="risk">Couldn’t stop the agent ({revoke.error}).</Banner> : null}
  </div>;
}
