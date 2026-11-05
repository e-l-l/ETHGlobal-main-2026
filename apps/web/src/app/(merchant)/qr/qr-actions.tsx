import { Button } from "@/components/ui";

/** Share / Download / Print. Not wired yet: the buttons do nothing. */
export function QrActions() {
  return (
    <div className="grid w-full grid-cols-3 gap-2">
      <Button fullWidth className="px-2">
        Share
      </Button>
      <Button variant="outline" fullWidth className="px-2">
        Download
      </Button>
      <Button variant="outline" fullWidth className="px-2">
        Print
      </Button>
    </div>
  );
}
