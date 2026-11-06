"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useLive } from "./use-live";

/*
 * Hero scene: a pixel-art Buenos Aires street on a bright day, drawn in brand greens only.
 * Pale sky, striped sun, skyline with the Obelisco, Corner Kiosk under a wave-striped awning.
 *
 * One sale, told in order (explanation, so it plays slowly and in sequence):
 *   1. a customer walks up to the counter
 *   2. they tap their phone: it lights lime and a ring pulses out      -> "Sale" chip
 *   3. a coin arcs onto the counter and the counter flashes
 *   4. 10% hops from the counter into the jar, the jar fills and sparks -> "Jar" chip
 *   5. the customer turns and walks off
 *
 * Drawn at two canvas pixels per art unit (3px squares on desktop) and scaled up with
 * image-rendering: pixelated. The still background is painted once per resize into cached layers;
 * only clouds, windows, the customer and the sale effects are redrawn per frame.
 * Colours are read from token swatches, so no hex lives here.
 */

const TOKENS = [
  "deep",
  "charcoal",
  "forest",
  "hunter",
  "fern",
  "sage",
  "leaf",
  "lime",
  "honeydew",
  "honeydew-line",
  "canvas",
  "unlit",
  "track",
  "surface",
  "well",
  "hairline",
] as const;
type Tok = (typeof TOKENS)[number];
const SWATCH: Record<Tok, string> = {
  deep: "text-deep",
  charcoal: "text-charcoal",
  forest: "text-forest",
  hunter: "text-hunter",
  fern: "text-fern",
  sage: "text-sage",
  leaf: "text-leaf",
  lime: "text-lime",
  honeydew: "text-honeydew",
  "honeydew-line": "text-honeydew-line",
  canvas: "text-canvas",
  unlit: "text-unlit",
  track: "text-track",
  surface: "text-surface",
  well: "text-well",
  hairline: "text-hairline",
};

export type SceneEvent = { id: number; kind: "Sale" | "Jar" | "Agent"; text: string };

const SALES = [
  ["Phone charger", 10],
  ["Yerba mate, 1 kg", 6.2],
  ["Alfajores, box of 6", 5.4],
  ["Batteries, 4-pack", 4.8],
  ["Sparkling water", 7.3],
] as const;

/** Canvas pixels per art unit. Art units keep the layout maths simple; half units give fine detail. */
const S = 2;

/** Moments in one sale, in seconds from the customer appearing. */
const T = { tap: 1.3, coin: 2.1, land: 2.8, drip: 3.5, leave: 3.1, gone: 4.4, cycle: 5.6 };

/** Seeded RNG so the skyline is the same on every render. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};

type Layout = {
  cols: number;
  rows: number;
  cell: number;
  gy: number;
  kerb: number;
  sun: { x: number; y: number; r: number };
  buildings: { x: number; w: number; h: number; tone: Tok; windows: [number, number, boolean][] }[];
  obelisk: { x: number; h: number };
  trees: { x: number; r: number }[];
  clouds: { x: number; y: number; w: number; v: number }[];
  kiosk: { x: number; y: number; w: number; h: number };
  lamp: number;
  customer: { x: number; y: number };
};

function layout(w: number, h: number): Layout {
  /* Phones get 2px canvas pixels, desktop 3px. Both are whole numbers so the squares stay crisp. */
  const cell = w < 640 ? 4 : 6;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const phone = cols < 110;
  const gy = Math.round(rows * (phone ? 0.84 : 0.72));
  const r = rng(7);

  const buildings: Layout["buildings"] = [];
  for (const [tone, maxH, minH] of [
    ["track", 0.34, 0.12],
    ["sage", 0.22, 0.06],
  ] as const) {
    let x = -2;
    while (x < cols) {
      const bw = 4 + Math.floor(r() * 9);
      const bh = Math.round(gy * (minH + r() * (maxH - minH)));
      const windows: [number, number, boolean][] = [];
      for (let wy = gy - bh + 2; wy < gy - 2; wy += 2) for (let wx = x + 1; wx < x + bw - 1; wx += 2) if (r() < 0.11) windows.push([wx, wy, r() < 0.7]);
      buildings.push({ x, w: bw, h: bh, tone, windows });
      x += bw + (r() < 0.3 ? 1 : 0);
    }
  }

  const kw = phone ? 36 : 46;
  const kh = phone ? 28 : 32;
  const kx = Math.round(phone ? cols / 2 - kw / 2 + 6 : Math.min(cols - kw - 10, cols * 0.66 - kw / 2));
  const ky = gy + 5 - kh;

  return {
    cols,
    rows,
    cell,
    gy,
    kerb: gy + Math.round((rows - gy) * 0.58),
    sun: { x: Math.round(cols * (phone ? 0.84 : 0.5)), y: phone ? gy - 34 : Math.round(gy * 0.5), r: Math.round(Math.min(phone ? 8 : 15, rows * 0.13)) },
    buildings,
    obelisk: { x: Math.round(cols * (phone ? 0.16 : 0.37)), h: Math.round(gy * 0.5) },
    trees: phone ? [{ x: 3, r: 7 }] : [{ x: Math.round(cols * 0.05), r: 10 }, { x: Math.round(cols * 0.14), r: 8 }, { x: Math.round(cols * 0.93), r: 11 }],
    clouds: [0.08, 0.3, 0.55, 0.8].map((f, i) => ({ x: cols * f, y: Math.round(gy * (0.12 + 0.1 * (i % 3))), w: 10 + ((i * 7) % 9), v: 0.6 + (i % 2) * 0.5 })),
    kiosk: { x: kx, y: ky, w: kw, h: kh },
    lamp: Math.round(phone ? kx + kw + 4 : cols * 0.86),
    customer: { x: kx - 8, y: gy + 5 },
  };
}

export function PixelScene() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swatches = useRef<Partial<Record<Tok, HTMLSpanElement | null>>>({});
  const live = useLive(wrapRef);
  const [chipAt, setChipAt] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const main = canvas?.getContext("2d");
    if (!wrap || !canvas || !main) return;

    const C = {} as Record<Tok, string>;
    for (const t of TOKENS) C[t] = swatches.current[t] ? getComputedStyle(swatches.current[t]!).color : "currentColor";

    /* Three cached layers, painted on resize: sky and sun, skyline, and the street with the kiosk. */
    const back = document.createElement("canvas");
    const mid = document.createElement("canvas");
    const front = document.createElement("canvas");
    let g: CanvasRenderingContext2D = main;

    let L = layout(wrap.clientWidth, wrap.clientHeight);
    let jar = 3;
    let jarV = 3;
    let saleN = 0;
    let evId = 100;
    let ct = live.running ? 0 : T.land + 0.2; // seconds into the current sale; a still frame when motion is off
    let clock = 0;
    let amt = 0;
    const done = { tap: false, land: false, drip: false };
    let counterFlash = 0;
    let jarGlow = 0;

    const q = (v: number) => Math.round(v * S) / S;
    /** One fine pixel, in fine-pixel indices. */
    const fp = (i: number, j: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(i / S, j / S, 1 / S, 1 / S);
    };
    const px = (x: number, y: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(q(x), q(y), 1 / S, 1 / S);
    };
    /** Rects snap to half units, so shapes stay on the fine grid. */
    const rect = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      const x0 = q(x);
      const y0 = q(y);
      g.fillRect(x0, y0, q(x + w) - x0, q(y + h) - y0);
    };
    const disc = (cx: number, cy: number, r: number, c: string, keep?: (x: number, y: number) => boolean) => {
      const f = 1 / S;
      for (let y = -r; y <= r; y += f)
        for (let x = -r; x <= r; x += f) if (x * x + y * y <= r * r + r * 0.6 && (!keep || keep(cx + x, cy + y))) px(cx + x, cy + y, c);
    };

    function prep(cv: HTMLCanvasElement) {
      const c2 = cv.getContext("2d")!;
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, cv.width, cv.height);
      c2.setTransform(S, 0, 0, S, 0, 0);
      return c2;
    }

    /* ---- static layers ---- */

    function paintSkyAndSun() {
      const bands: [Tok, number][] = [
        ["canvas", 0.3],
        ["well", 0.5],
        ["honeydew", 0.72],
        ["honeydew-line", 1],
      ];
      let from = 0;
      bands.forEach(([tok, until], i) => {
        const to = Math.round(L.gy * until);
        rect(0, from, L.cols, to - from, C[tok]);
        /* Dither the seam into the next band: the pixel-art way to blend. */
        const next = bands[i + 1];
        if (next) for (let x = 0; x < L.cols * S; x++) for (let k = 0; k < 4; k++) if ((x + k) % 2 === 0) fp(x, to * S - 1 - k, C[next[0]]);
        from = to;
      });
      const { x, y, r } = L.sun;
      /* Retro striped sun: gaps widen toward the horizon, echoing the jar bands. */
      disc(x, y, r, C.leaf, (_, py) => {
        const d = Math.floor(py - (y - r * 0.15));
        if (d <= 0) return true;
        const gap = 1 + Math.floor(d / 4);
        return d % (gap + 2) >= gap;
      });
    }

    function paintSkyline() {
      const { x: ox, h: oh } = L.obelisk;
      for (let k = 0; k < oh; k += 1 / S) {
        const half = k > oh - 4 ? Math.max(0, oh - k - 2) : k > oh * 0.5 ? 1 : 2;
        rect(ox - half, L.gy - k, half * 2 + 1, 1 / S, C.unlit);
      }
      for (const b of L.buildings) rect(b.x, L.gy - b.h, b.w, b.h, C[b.tone]);
    }

    function paintFront() {
      const { gy, cols, rows, kerb } = L;

      /* Trees. */
      for (const t of L.trees) {
        const base = gy + 4;
        rect(t.x - 1, base - t.r - 6, 2, t.r + 6, C.forest);
        disc(t.x, base - t.r - 6, t.r, C.fern);
        disc(t.x - 2, base - t.r - 8, Math.round(t.r * 0.7), C.leaf, (x, y) => (Math.round(x * S) + Math.round(y * S)) % 2 === 0 || y < base - t.r - 10);
        for (let i = 0; i < 8; i++) rect(t.x - t.r + ((i * 5) % (t.r * 2)), base - t.r * 2 - 4 + ((i * 3) % t.r), 1, 1, C.lime);
      }

      /* Pavement with staggered joints, a kerb, then a quiet road. No planting, nothing busy. */
      rect(0, gy, cols, kerb - gy, C.well);
      rect(0, gy, cols, 1, C.track);
      for (let y = gy + 4, k = 0; y < kerb - 1; y += 4, k++) {
        rect(0, y, cols, 0.5, C.hairline);
        for (let x = (k % 2) * 5; x < cols; x += 10) rect(x, y, 0.5, 4, C.hairline);
      }
      rect(0, kerb, cols, 1.5, C.track);
      rect(0, kerb + 1.5, cols, rows - kerb, C.unlit);
      const roadMid = kerb + 1.5 + (rows - kerb - 1.5) / 2;
      for (let x = 4; x < cols; x += 18) rect(x, roadMid, 9, 1, C.surface);

      /* Lamp post. */
      const lx = L.lamp;
      const top = gy - 22;
      rect(lx, top, 1, 27, C.forest);
      rect(lx - 2, top - 1, 5, 2, C.forest);
      rect(lx - 1, top + 1, 3, 1, C.honeydew);

      paintKiosk();
    }

    function geom() {
      const { x, y, w, h } = L.kiosk;
      const body = y + 9;
      return { x, y, w, h, body, jx: x + w - 10, jy: body + 4, counter: { x: x + w / 2, y: body + 10 } };
    }

    function paintKiosk() {
      const { x, y, w, h, body } = geom();
      /* Sign with the ribbon drop in pixels. */
      rect(x + 5, y, w - 10, 6, C.hunter);
      const dx = x + Math.floor(w / 2) - 2;
      const drop = ["..#..", ".###.", "#####", "#####", ".###."];
      drop.forEach((row, ry) => [...row].forEach((ch, rx) => ch === "#" && rect(dx + rx, y + 0.5 + ry, 1, 1, ry >= 3 ? C.lime : C.honeydew)));
      for (let i = 0; i < 3; i++) rect(x + 8 + i * 3, y + 2, 2, 2, C.honeydew);
      for (let i = 0; i < 3; i++) rect(x + w - 15 + i * 3, y + 2, 2, 2, C.honeydew);
      /* Wave-striped awning with a scalloped edge. */
      for (let i = -3; i < w + 3; i++) {
        const c = Math.floor((i + 3) / 3) % 2 === 0 ? C.lime : C.honeydew;
        rect(x + i, y + 6, 1, 4, c);
        if ((i + 3) % 3 === 1) rect(x + i, y + 10, 1, 1, c);
      }
      rect(x, body + 1, w, h - 10, C.forest);
      /* Window with shelves of goods. */
      rect(x + 3, body + 2, w - 6, 9, C.deep);
      const goods: Tok[] = ["lime", "honeydew", "leaf", "honeydew-line", "fern"];
      for (let s = 0; s < 2; s++) {
        rect(x + 3, body + 6 + s * 4, w - 6, 1, C.sage);
        for (let gx = x + 4; gx < x + w - 4; gx += 3) rect(gx, body + 4 + s * 4, 2, 2, C[goods[(gx + s) % goods.length]!]);
      }
      /* Counter and QR stand. */
      rect(x - 2, body + 11, w + 4, 2, C.honeydew);
      rect(x, body + 13, w, h - 14, C.hunter);
      for (let i = x + 3; i < x + w; i += 4) rect(i, body + 14, 1, h - 16, C.fern);
      const qx = x + 4;
      rect(qx, body + 5, 6, 6, C.honeydew);
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (hash(i, j + 3) > 0.45) rect(qx + 0.5 + i * 0.5, body + 5.5 + j * 0.5, 0.5, 0.5, C.deep);
    }

    /* ---- dynamic drawing ---- */

    function windows() {
      for (const b of L.buildings) for (const [wx, wy, on] of b.windows) if (on) rect(wx, wy, 1, 1, b.tone === "track" ? C.well : C.honeydew);
    }

    function clouds() {
      for (const c of L.clouds) {
        const x = (((c.x % (L.cols + 30)) + L.cols + 30) % (L.cols + 30)) - 20;
        rect(x, c.y, c.w, 3, C.surface);
        rect(x + 3, c.y - 2, c.w * 0.5, 2, C.surface);
        rect(x + c.w * 0.45, c.y - 3, c.w * 0.35, 3, C.surface);
        for (let i = 0; i < c.w; i += 2) rect(x + i, c.y + 3, 1, 0.5, C.track);
      }
    }

    /** The shopper, drawn facing right at local x = 0; `f` flips them to face left when they leave. */
    function person(x: number, y: number, f: 1 | -1, walking: boolean, phoneUp: boolean, alpha: number) {
      const stepB = walking ? Math.floor(clock * 7) % 2 : 0;
      const yb = y - (walking && stepB ? 0.5 : 0);
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, 0);
      g.scale(f, 1);
      rect(0, y - 4, 2, 4 - (stepB ? 0.5 : 0), C.charcoal);
      rect(3, y - 4, 2, 4 - (stepB ? 0 : 0.5), C.charcoal);
      rect(-1, yb - 11, 7, 7, C.leaf);
      rect(-1, yb - 11, 7, 1, C.fern);
      rect(5, yb - 10, 1, 6, C.hunter);
      rect(1, yb - 15, 4, 4, C["honeydew-line"]);
      rect(0.5, yb - 16.5, 5, 2, C.charcoal);
      rect(4, yb - 13.5, 0.5, 1, C.charcoal);
      if (phoneUp) {
        rect(5, yb - 9, 3, 1.5, C.leaf);
        rect(7.5, yb - 11, 2, 3.5, C.lime);
        rect(7.5, yb - 11, 2, 0.5, C.honeydew);
      } else {
        rect(5, yb - 9.5, 1.5, 4, C.leaf);
        rect(5.5, yb - 6, 2, 3, C.charcoal);
      }
      g.restore();
    }

    function coin(x: number, y: number, size: number) {
      rect(x - size / 2 - 0.5, y - size / 2 - 0.5, size + 1, size + 1, C.forest);
      rect(x - size / 2, y - size / 2, size, size, C.lime);
      rect(x - size / 2, y - size / 2, size, 0.5, C.honeydew);
    }

    function sale() {
      const k = geom();
      const home = L.customer.x;
      const reach = 34;

      /* Where the customer is: in from the left, hold, then turn and go back out. */
      const arriving = ct < T.tap - 0.1;
      const leaving = ct >= T.leave;
      let cx = home;
      if (arriving) cx = home - reach * (1 - easeOut(ct / (T.tap - 0.1)));
      else if (leaving) cx = home - reach * easeInOut((ct - T.leave) / (T.gone - T.leave));
      const alpha = Math.min(clamp01(ct / 0.5), 1 - clamp01((ct - (T.gone - 0.7)) / 0.7));
      const paying = ct >= T.tap && ct < T.land + 0.2;
      if (alpha > 0.01 && ct < T.gone) person(cx, L.customer.y, leaving ? -1 : 1, arriving || leaving, paying, alpha);

      const phone = { x: home + 8.5, y: L.customer.y - 9.5 };

      /* 2. The tap: rings spread from the phone. */
      if (ct >= T.tap && ct < T.tap + 0.8) {
        const p = (ct - T.tap) / 0.8;
        for (let n = 0; n < 2; n++) {
          const pp = clamp01(p - n * 0.25);
          if (pp <= 0) continue;
          const r = 2 + easeOut(pp) * 7;
          g.save();
          g.globalAlpha = 1 - pp;
          for (let a = 0; a < Math.PI * 2; a += 0.14) px(phone.x + Math.cos(a) * r, phone.y + Math.sin(a) * r, C.hunter);
          g.restore();
        }
      }

      /* 3. The coin arcs onto the counter. */
      if (ct >= T.coin && ct < T.land) {
        const p = easeInOut((ct - T.coin) / (T.land - T.coin));
        coin(phone.x + (k.counter.x - phone.x) * p, phone.y + (k.counter.y - phone.y) * p - Math.sin(Math.PI * p) * 11, 3);
      }

      /* 4. Ten percent hops from the counter into the jar. */
      if (ct >= T.land && ct < T.drip) {
        const p = easeInOut((ct - T.land) / (T.drip - T.land));
        const tx = k.jx + 3;
        const ty = k.jy - 2;
        coin(k.counter.x + (tx - k.counter.x) * p, k.counter.y + (ty - k.counter.y) * p - Math.sin(Math.PI * p) * 7, 2);
      }

      /* Counter flash on landing. */
      if (counterFlash > 0) {
        g.save();
        g.globalAlpha = clamp01(counterFlash / 0.35);
        rect(k.x - 2, k.body + 11, k.w + 4, 2, C.lime);
        g.restore();
      }
    }

    function jarDraw() {
      const { jx, jy } = geom();
      rect(jx, jy, 6, 7, C["honeydew-line"]);
      rect(jx + 1, jy, 4, 6, C.deep);
      rect(jx + 1, jy + 6 - jarV, 4, jarV, C.lime);
      rect(jx - 1, jy - 1, 8, 1, jarGlow > 0 ? C.lime : C.charcoal);
      if (jarGlow > 0) {
        const p = 1 - jarGlow / 0.7;
        g.save();
        g.globalAlpha = 1 - p;
        rect(jx - 2, jy - 2, 10, 0.5, C.lime);
        for (let i = 0; i < 3; i++) rect(jx + 1 + i * 2, jy - 2 - p * 7 - (i % 2) * 1.5, 1, 1, C.lime);
        g.restore();
      }
    }

    function draw() {
      main!.setTransform(1, 0, 0, 1, 0, 0);
      main!.clearRect(0, 0, canvas!.width, canvas!.height);
      main!.drawImage(back, 0, 0);
      main!.setTransform(S, 0, 0, S, 0, 0);
      g = main!;
      clouds();
      main!.setTransform(1, 0, 0, 1, 0, 0);
      main!.drawImage(mid, 0, 0);
      main!.setTransform(S, 0, 0, S, 0, 0);
      windows();
      main!.setTransform(1, 0, 0, 1, 0, 0);
      main!.drawImage(front, 0, 0);
      main!.setTransform(S, 0, 0, S, 0, 0);
      jarDraw();
      sale();
    }

    function size() {
      L = layout(wrap!.clientWidth, wrap!.clientHeight);
      for (const cv of [canvas!, back, mid, front]) {
        cv.width = L.cols * S;
        cv.height = L.rows * S;
      }
      canvas!.style.width = `${L.cols * L.cell}px`;
      canvas!.style.height = `${L.rows * L.cell}px`;
      g = prep(back);
      paintSkyAndSun();
      g = prep(mid);
      paintSkyline();
      g = prep(front);
      paintFront();
      main!.setTransform(S, 0, 0, S, 0, 0);
      g = main!;
      setChipAt({ left: (L.kiosk.x + L.kiosk.w / 2) * L.cell, top: (L.kiosk.y - 3) * L.cell });
    }

    function emit(kind: SceneEvent["kind"], text: string) {
      postSceneEvent({ id: evId++, kind, text });
    }

    function step(dt: number) {
      clock += dt;
      for (const c of L.clouds) c.x += c.v * dt;
      /* Windows twinkle: a few flip each second. */
      if (Math.random() < dt * 4) {
        const b = L.buildings[Math.floor(Math.random() * L.buildings.length)];
        const wnd = b?.windows[Math.floor(Math.random() * (b?.windows.length ?? 0))];
        if (wnd) wnd[2] = !wnd[2];
      }
      counterFlash = Math.max(0, counterFlash - dt);
      jarGlow = Math.max(0, jarGlow - dt);
      jarV += (jar - jarV) * Math.min(1, dt * 9);

      ct += dt;
      if (ct >= T.cycle) {
        ct = 0;
        done.tap = done.land = done.drip = false;
      }
      if (!done.tap && ct >= T.tap) {
        done.tap = true;
        const [item, a] = SALES[saleN % SALES.length]!;
        amt = a;
        emit("Sale", `${item} · $${a.toFixed(2)}`);
      }
      if (!done.land && ct >= T.land) {
        done.land = true;
        counterFlash = 0.35;
      }
      if (!done.drip && ct >= T.drip) {
        done.drip = true;
        jar = jar >= 6 ? 2 : jar + 1;
        jarGlow = 0.7;
        emit("Jar", `$${(amt / 10).toFixed(2)} drips back`);
        saleN++;
        if (saleN % 4 === 0) emit("Agent", "Drew $100 for stock");
      }
    }

    /* ResizeObserver fires once on observe, which does the first layout and paint. */
    const ro = new ResizeObserver(() => {
      size();
      draw();
    });
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      /* ~30 fps: enough for the walk and the hops to read as steps, cheap enough to leave running. */
      if (acc >= 1 / 30) {
        step(acc);
        acc = 0;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    if (live.running) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [live.running]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} aria-hidden className="block [image-rendering:pixelated]" />
      {TOKENS.map((t) => (
        <span
          key={t}
          ref={(el) => {
            swatches.current[t] = el;
          }}
          className={cn("hidden", SWATCH[t])}
        />
      ))}
      {chipAt ? <ChipStack anchor={chipAt} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------- Chip stack */

const INITIAL: SceneEvent[] = [
  { id: 3, kind: "Agent", text: "Drew $100 for stock" },
  { id: 2, kind: "Jar", text: "$0.48 drips back" },
  { id: 1, kind: "Sale", text: "Batteries, 4-pack · $4.80" },
];

const chipBus = new EventTarget();

/** The scene posts events here; the chip stack listens. Keeps the canvas loop free of React state. */
export function postSceneEvent(e: SceneEvent) {
  chipBus.dispatchEvent(new CustomEvent("e", { detail: e }));
}

const DOT: Record<SceneEvent["kind"], string> = { Sale: "bg-hunter", Jar: "bg-lime ring-1 ring-hunter/40", Agent: "bg-leaf" };

/** Newest chip sits at the bottom, nearest the kiosk where it happened; older ones lift away and fade. */
function ChipStack({ anchor }: { anchor: { left: number; top: number } }) {
  const [items, setItems] = useState(INITIAL);
  useEffect(() => {
    const on = (ev: Event) => setItems((s) => [(ev as CustomEvent<SceneEvent>).detail, ...s].slice(0, 3));
    chipBus.addEventListener("e", on);
    return () => chipBus.removeEventListener("e", on);
  }, []);
  return (
    <ol
      aria-label="What just happened at the kiosk"
      className="absolute m-0 hidden w-64 -translate-x-1/2 sm:flex -translate-y-full list-none flex-col-reverse gap-1.5 p-0"
      style={{ left: anchor.left, top: anchor.top }}
    >
      {items.map((e, i) => (
        <li
          key={e.id}
          className={cn(
            "flex items-center gap-2 rounded-md border bg-surface/90 px-2.5 py-1.5 font-ledger text-[12px] text-charcoal backdrop-blur-md",
            "transition-[opacity,transform,filter] duration-300 ease-snappy starting:translate-y-1.5 starting:opacity-0 starting:blur-[2px]",
            i === 0 ? "border-hunter/40 shadow-lift" : "border-hairline",
            i === 1 && "opacity-75",
            i === 2 && "opacity-45",
          )}
        >
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-[1px]", DOT[e.kind])} />
          <span className="text-charcoal-muted">{e.kind}</span>
          <span className="truncate">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}
