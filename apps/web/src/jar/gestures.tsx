"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./controls";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------------------ SlideToApprove
 *
 * Built to the apple-design and emil-design-eng rules:
 * - pointer capture, 1:1 tracking that keeps the grab offset (no snapping to the knob centre)
 * - transforms written straight to the DOM during drag: no React render per frame
 * - rubber-band past both ends instead of a hard wall
 * - release uses momentum projection: a quick flick completes even if the knob is short of the end
 * - the settle is a critically damped spring that starts from the release velocity and the live position,
 *   so grabbing the knob mid-flight just continues from where it is
 * - keyboard: Enter or Space on the knob approves. Reduced motion jumps instead of springing.
 */

const PAD = 4;
const KNOB = 42;

export function SlideToApprove({ label, doneLabel, onComplete }: { label: string; doneLabel: string; onComplete?: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const s = useRef({ dragging: false, pointerId: -1, grab: 0, x: 0, hist: [] as { x: number; t: number }[], raf: 0 });
  const [done, setDone] = useState(false);

  const max = () => (trackRef.current ? trackRef.current.clientWidth - KNOB - PAD * 2 : 0);

  const paint = useCallback((x: number) => {
    s.current.x = x;
    const w = trackRef.current?.clientWidth ?? 0;
    const m = w - KNOB - PAD * 2;
    if (knobRef.current) knobRef.current.style.transform = `translateX(${x}px)`;
    if (fillRef.current) fillRef.current.style.transform = `translateX(${x + PAD + KNOB / 2 - w}px)`;
    if (textRef.current) textRef.current.style.opacity = String(Math.max(0, 1 - x / Math.max(1, m * 0.6)));
  }, []);

  const finish = useCallback(() => {
    setDone(true);
    onComplete?.();
  }, [onComplete]);

  const settle = useCallback(
    (target: number, velocityPxPerMs: number, then?: () => void) => {
      cancelAnimationFrame(s.current.raf);
      if (prefersReducedMotion()) {
        paint(target);
        then?.();
        return;
      }
      const k = 520; // stiffness
      const d = 2 * Math.sqrt(k); // critical damping: no bounce on a money action
      let x = s.current.x;
      let v = velocityPxPerMs * 1000;
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(0.032, (now - last) / 1000);
        last = now;
        v += (-k * (x - target) - d * v) * dt;
        x += v * dt;
        if (Math.abs(x - target) < 0.5 && Math.abs(v) < 8) {
          paint(target);
          then?.();
          return;
        }
        paint(x);
        s.current.raf = requestAnimationFrame(step);
      };
      s.current.raf = requestAnimationFrame(step);
    },
    [paint],
  );

  useEffect(() => () => cancelAnimationFrame(s.current.raf), []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (done || s.current.dragging) return; // ignore a second finger
    cancelAnimationFrame(s.current.raf); // interrupt: continue from the live position
    const knob = e.currentTarget;
    knob.setPointerCapture(e.pointerId);
    const rect = trackRef.current!.getBoundingClientRect();
    s.current.dragging = true;
    s.current.pointerId = e.pointerId;
    s.current.grab = e.clientX - rect.left - PAD - s.current.x;
    s.current.hist = [{ x: s.current.x, t: e.timeStamp }];
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!s.current.dragging || e.pointerId !== s.current.pointerId) return;
    const rect = trackRef.current!.getBoundingClientRect();
    const m = max();
    const raw = e.clientX - rect.left - PAD - s.current.grab;
    // Friction past the ends instead of a hard stop.
    const x = raw < 0 ? Math.max(-8, raw * 0.2) : raw > m ? Math.min(m + 8, m + (raw - m) * 0.2) : raw;
    paint(x);
    const h = s.current.hist;
    h.push({ x, t: e.timeStamp });
    while (h.length > 2 && e.timeStamp - h[0]!.t > 100) h.shift();
  };

  const release = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!s.current.dragging || e.pointerId !== s.current.pointerId) return;
    s.current.dragging = false;
    const h = s.current.hist;
    const first = h[0]!;
    const last = h[h.length - 1]!;
    const v = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    const m = max();
    const projected = s.current.x + v * 150; // where the flick is going, not where it stopped
    if (projected >= m * 0.9) settle(m, v, finish);
    else settle(0, v);
  };

  return (
    <div ref={trackRef} className="dj-slide" data-done={done}>
      <span ref={fillRef} className="dj-slide__fill" aria-hidden />
      <span ref={textRef} className="dj-slide__text" aria-hidden>
        {done ? doneLabel : label}
      </span>
      <button
        ref={knobRef}
        type="button"
        className="dj-slide__knob"
        aria-label={done ? doneLabel : `${label}. Drag right, or press Enter.`}
        aria-disabled={done || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onClick={(e) => {
          // detail 0 = keyboard activation. Pointer taps are handled by the drag above.
          if (e.detail === 0 && !done) settle(max(), 0, finish);
        }}
      >
        {done ? <Icon.check size={20} /> : <Icon.chevronRight />}
      </button>
      {done ? (
        <span role="status" className="sr-only-dj">
          {doneLabel}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- HoldToConfirm
 *
 * Revoke agent. Recipe from skills-anay/animate: clip-path fill, 2s linear while held,
 * 200ms ease-out back on release. Fires on the fill's transitionend, so the visual and the action agree.
 */

export function HoldToConfirm({ children, holdingLabel, onConfirm }: { children: ReactNode; holdingLabel: string; onConfirm: () => void }) {
  const [holding, setHolding] = useState(false);
  const stop = () => setHolding(false);
  return (
    <button
      type="button"
      className="dj-btn dj-btn--danger dj-hold"
      data-holding={holding}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setHolding(true);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          setHolding(true);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") stop();
      }}
      onBlur={stop}
    >
      {/* Name starts with the visible label (WCAG 2.5.3), then says how to use it. */}
      <span className="dj-btn__label">
        {children}
        <span className="sr-only-dj"> (hold for 2 seconds)</span>
      </span>
      <span
        className="dj-hold__overlay"
        aria-hidden
        onTransitionEnd={(e) => {
          if (holding && e.propertyName === "clip-path") {
            setHolding(false);
            onConfirm();
          }
        }}
      >
        {holdingLabel}
      </span>
    </button>
  );
}
