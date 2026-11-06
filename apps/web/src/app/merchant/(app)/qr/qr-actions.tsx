"use client";

import { useState } from "react";
import { Button, CheckIcon, CopyIcon, PrintIcon, ShareIcon } from "@/final";

/** Share / Copy link / Print. Share falls back to copying where the Web Share API is missing. */
export function QrActions({ payLink }: { payLink: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () =>
    navigator.clipboard?.writeText(payLink).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );

  const share = () => {
    if (typeof navigator.share === "function") {
      navigator.share({ url: payLink }).catch(() => undefined);
    } else {
      void copy();
    }
  };

  return (
    <div className="grid w-full grid-cols-3 gap-2">
      <Button type="button" width="full" className="px-2" iconStart={<ShareIcon size={18} />} onClick={share}>
        Share
      </Button>
      <Button
        type="button"
        variant="secondary"
        width="full"
        className="px-2"
        iconStart={copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
        onClick={() => void copy()}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        width="full"
        className="px-2"
        iconStart={<PrintIcon size={18} />}
        onClick={() => window.print()}
      >
        Print
      </Button>
    </div>
  );
}
