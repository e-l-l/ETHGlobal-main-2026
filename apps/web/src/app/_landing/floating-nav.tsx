"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A floating, sticky nav pill. It slides away as soon as you scroll down and comes straight back on
 * the smallest scroll up (or when it takes keyboard focus). Always shown at the very top of the page.
 * Transform only, so it stays on the compositor; the page flow is untouched because it is fixed.
 */
export function FloatingNav({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= 8) setHidden(false);
      else if (y > last && y > 64) setHidden(true);
      else if (y < last) setHidden(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-3 pt-[env(safe-area-inset-top)] md:top-4 md:px-6">
      <div
        ref={ref}
        inert={hidden}
        onFocus={() => setHidden(false)}
        className={cn(
          "pointer-events-auto relative w-full max-w-[1010px] rounded-2xl border border-hairline bg-canvas/80 shadow-lift backdrop-blur-xl backdrop-saturate-150 motion-reduce:backdrop-blur-none",
          "transition-[transform,opacity] duration-250 ease-snappy motion-reduce:duration-150",
          hidden ? "-translate-y-[calc(100%+1.5rem)] opacity-0 motion-reduce:translate-y-0" : "translate-y-0 opacity-100",
        )}
      >
        {children}
      </div>
    </div>
  );
}
