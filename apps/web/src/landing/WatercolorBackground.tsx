"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/*
 * Animated watercolour wash behind the hero. A hand-port of Feral UI's WebGL "wash" shader,
 * taken from the landing export (Main.dc.html: wcShader, wcLayers, wcDraw).
 *
 * Draws only while the canvas is on screen and the tab is visible. Under reduced motion it
 * paints one still frame (and repaints on resize). Without WebGL the canvas stays hidden and
 * the parent's flat fallback colour shows.
 */

const RECIPE = {
  stops: ["#5C7C62", "#DDF7E6", "#B7CDB1", "#C6F28C"],
  divs: [0.25, 0.5, 0.75],
  wetness: 74,
  pigment: 50,
  scale: 58,
  spread: 76,
  blooms: 32,
  granulation: 30,
  edges: 34,
  texture: 20,
  paperWarmth: 5,
  coverage: 100,
  seed: 419,
  angle: 274,
  layers: 8,
  technique: "wash" as "wash" | "veil" | "pools",
};
const SPEED = 28;
const START_TIME = 69.16211446400486;
const MAX_DPR = 2;
const MAX_SIDE = 1600;

/* Paper is tinted (0.89, 0.945, 0.885) = #e3f1e2 so no white shows through the wash. */
const FRAGMENT = `precision highp float;
uniform vec2 u_res;
uniform sampler2D u_noise;
uniform vec4 u_shape[8];
uniform vec4 u_pigment[8];
uniform vec2 u_turn[8];
uniform vec3 u_bloom[8];
uniform vec4 u_flow;
uniform float u_layers,u_seed,u_angle,u_scale,u_spread,u_wetness,u_pigmentStrength;
uniform float u_blooms,u_granulation,u_edges,u_texture,u_warmth,u_veil;
vec4 field(vec2 p) {
  vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return texture2D(u_noise,(mod(floor(p),256.0)+f+0.5)/256.0);
}
void main(){
  vec2 uv=vec2(gl_FragCoord.x/u_res.x,1.0-gl_FragCoord.y/u_res.y);
  float aspect=u_res.x/u_res.y;
  vec2 paper=(uv-0.5)*vec2(aspect,1.0)/max(1.0,aspect);
  float cs=cos(u_angle),sn=sin(u_angle);
  vec2 p=vec2(paper.x*cs-paper.y*sn,paper.x*sn+paper.y*cs)*u_scale;
  vec2 offset=vec2(mod(u_seed*13.71,197.0),mod(u_seed*7.93,211.0));
  vec4 large=field(p*3.7+offset+u_flow.xy);
  vec4 mid=field(p*11.8+offset+large.rg*1.7+u_flow.zw);
  vec4 fine=field(p*43.0+offset+mid.rg*0.8+u_flow.xy*0.35);
  vec2 warp=((large.rg-0.5)*0.44+(mid.rg-0.5)*0.16+(fine.rg-0.5)*0.027)*(0.25+u_spread*1.4);
  float frequency=min(620.0,min(u_res.x,u_res.y)*0.45);
  vec4 tooth=field(paper*frequency+vec2(37.0,89.0));
  vec4 fiber=field(paper*min(210.0,frequency*0.45)+vec2(71.0,13.0));
  float grain=(tooth.r-0.5)*0.68+(fiber.g-0.5)*0.32;
  float feather=0.025+u_wetness*0.31+u_veil*0.13;
  vec3 absorption=vec3(0.0);
  for(int i=0;i<8;i++){
    if(float(i)>=u_layers) break;
    vec2 delta=p+warp-u_shape[i].xy;
    vec2 turn=u_turn[i];
    vec2 q=vec2(delta.x*turn.x-delta.y*turn.y,delta.x*turn.y+delta.y*turn.x)/u_shape[i].zw;
    float d=length(q)+(fine.b-0.5)*0.08;
    float mask=1.0-smoothstep(1.0-feather,1.0+feather,d);
    float cloud=mix(large.b,large.a,mod(float(i),2.0));
    float uneven=0.55+cloud*0.8+(mid.b-0.5)*0.34;
    float edgeDistance=(d-(0.97-feather*0.28))/(0.014+feather*0.13);
    float ridge=exp(-edgeDistance*edgeDistance);
    ridge*=u_edges*(0.12+mid.a*0.45)*(1.0-u_wetness*0.45);
    vec2 b=q-u_bloom[i].xy;
    float bd=length(b)+(mid.a-0.5)*0.42+(fine.a-0.5)*0.13;
    float bloomRadius=0.2+u_blooms*(0.32+u_bloom[i].z);
    float bloom=(1.0-smoothstep(bloomRadius-0.09,bloomRadius+0.08,bd))*u_blooms;
    float bloomDistance=(bd-bloomRadius-0.045)/0.036;
    float bloomEdge=exp(-bloomDistance*bloomDistance)*u_blooms*0.33;
    float granulate=max(0.15,1.0+grain*u_granulation*0.85+(fine.g-0.5)*u_granulation*0.32);
    float density=(mask*uneven*(1.0-bloom*0.78)+ridge+bloomEdge*mask)*granulate;
    density*=u_pigment[i].a*u_pigmentStrength;
    absorption+=u_pigment[i].rgb*density;
  }
  vec3 paperColor=mix(vec3(0.89,0.945,0.885),vec3(0.93,0.95,0.86),u_warmth);
  vec3 color=paperColor*exp(-absorption);
  color*=1.0+grain*u_texture*0.095+(fiber.b-0.5)*u_texture*0.026;
  gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
}`;

const VERTEX =
  "attribute vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}";

const UNIFORMS = [
  "res",
  "noise",
  "shape",
  "pigment",
  "turn",
  "bloom",
  "flow",
  "layers",
  "seed",
  "angle",
  "scale",
  "spread",
  "wetness",
  "pigmentStrength",
  "blooms",
  "granulation",
  "edges",
  "texture",
  "warmth",
  "veil",
] as const;
type UniformName = (typeof UNIFORMS)[number];

type Painter = {
  gl: WebGLRenderingContext;
  u: Record<UniformName, WebGLUniformLocation | null>;
  shapes: Float32Array;
  colors: Float32Array;
  turns: Float32Array;
  blooms: Float32Array;
};

/** Seeded LCG, same constants as the export so the wash looks identical. */
function lcg(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (Math.imul(t, 1664525) + 1013904223) >>> 0;
    return t / 4294967296;
  };
}

/** Wobble that starts at zero: sin(e·t + n) − sin(n). */
const wobble = (e: number, t: number, n: number) =>
  Math.sin(e * t + n) - Math.sin(n);

function createPainter(canvas: HTMLCanvasElement): Painter | null {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // One oversized triangle covers the viewport.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const pos = gl.getAttribLocation(prog, "position");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  const noise = new Uint8Array(256 * 256 * 4);
  const rnd = lcg(1977);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(rnd() * 256);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    256,
    256,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    noise,
  );

  const u = Object.fromEntries(
    UNIFORMS.map((k) => [k, gl.getUniformLocation(prog, `u_${k}`)]),
  ) as Painter["u"];
  gl.uniform1i(u.noise, 0);
  return {
    gl,
    u,
    shapes: new Float32Array(32),
    colors: new Float32Array(32),
    turns: new Float32Array(16),
    blooms: new Float32Array(24),
  };
}

type Layer = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  c: number;
  s: number;
  strength: number;
  color: number[];
  bloom: number[];
};

/** Pigment pools for one moment `a` of the animation. Stops become absorption colours along the layers. */
function layers(a: number): Layer[] {
  const P = RECIPE;
  const rnd = lcg(P.seed * 8191);
  const absorb = P.stops.map((hex) => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(
      (c) => -Math.log(Math.max(0.025, c / 255)),
    );
  });
  const divsOk =
    P.divs.length === absorb.length - 1 &&
    P.divs.every(
      (d, i) => Number.isFinite(d) && d >= (i ? P.divs[i - 1]! : 0) && d <= 1,
    );
  const edges = [
    0,
    ...(divsOk
      ? P.divs
      : absorb.slice(1).map((_, i) => (i + 1) / absorb.length)),
    1,
  ];
  const widths = absorb.map((_, i) => edges[i + 1]! - edges[i]!);
  const centres = absorb.map((_, i) => (edges[i + 1]! + edges[i]!) * 0.5);

  const out: Layer[] = [];
  for (let k = 0; k < P.layers; k++) {
    const p = (k + 0.5) / P.layers;
    const m = widths.map(
      (w, i) =>
        w *
        Math.exp(
          -0.5 * Math.pow((p - centres[i]!) / (0.13 + 0.2 / P.layers), 2),
        ),
    );
    const h = Math.max(
      1e-8,
      m.reduce((s, x) => s + x, 0),
    );
    const color = [0, 1, 2].map((c) =>
      absorb.reduce((s, col, i) => s + (col[c]! * m[i]!) / h, 0),
    );
    const f = k * 1.71 + P.seed * 0.007;
    const g = (rnd() - 0.5) * 2.5 + 0.12 * wobble(a, 0.47, f);
    const size = (0.12 + (P.coverage / 100) * 0.26) * (0.76 + rnd() * 0.46);
    const x = (p - 0.5) * 1.4 + (rnd() - 0.5) * 0.2 + 0.09 * wobble(a, 0.67, f);
    const y =
      Math.sin(p * Math.PI * 2 + P.seed * 0.7) * 0.2 +
      (rnd() - 0.5) * 0.28 +
      0.075 * wobble(a, 0.59, f + 1.6);
    out.push({
      x,
      y,
      rx:
        size *
        (P.technique === "veil" ? 1.7 : 1.22) *
        (1 + 0.09 * wobble(a, 0.81, f)),
      ry:
        size *
        (P.technique === "pools" ? 0.84 : 1.1) *
        (1 + 0.09 * wobble(a, 0.63, f + 1.8)),
      c: Math.cos(g),
      s: Math.sin(g),
      strength: 0.68 + rnd() * 0.4,
      color,
      bloom: [
        0.36 * Math.sin(k * 2.3 + 1) + 0.12 * wobble(a, 0.41, f),
        0.36 * Math.cos(k * 1.7) + 0.12 * wobble(a, 0.53, f + 1.2),
        0.04 * wobble(a, 0.65, f),
      ],
    });
  }
  return out;
}

/** Paint one frame at time t. Returns false when the canvas has no size yet. */
function draw(W: Painter, canvas: HTMLCanvasElement, t: number) {
  const { gl, u } = W;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
  let w = Math.round(rect.width * dpr);
  let h = Math.round(rect.height * dpr);
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  gl.viewport(0, 0, w, h);
  gl.uniform2f(u.res, w, h);

  const P = RECIPE;
  const a = Math.max(0, t - 20.75);
  layers(a).forEach((L, i) => {
    W.shapes.set([L.x, L.y, L.rx, L.ry], i * 4);
    W.colors.set([L.color[0]!, L.color[1]!, L.color[2]!, L.strength], i * 4);
    W.turns.set([L.c, L.s], i * 2);
    W.blooms.set(L.bloom, i * 3);
  });
  gl.uniform4fv(u.shape, W.shapes);
  gl.uniform4fv(u.pigment, W.colors);
  gl.uniform2fv(u.turn, W.turns);
  gl.uniform3fv(u.bloom, W.blooms);
  gl.uniform4fv(
    u.flow,
    new Float32Array([
      0.32 * wobble(a, 0.72, 0),
      0.3 * wobble(a, 0.57, 1.3),
      0.28 * wobble(a, 0.39, 0.7),
      0.3 * wobble(a, 0.83, 2.1),
    ]),
  );
  gl.uniform1f(u.spread, P.spread / 100);
  gl.uniform1f(u.wetness, P.wetness / 100);
  gl.uniform1f(u.blooms, P.blooms / 100);
  gl.uniform1f(u.granulation, P.granulation / 100);
  gl.uniform1f(u.edges, P.edges / 100);
  gl.uniform1f(u.texture, P.texture / 100);
  gl.uniform1f(u.warmth, P.paperWarmth / 100);
  gl.uniform1f(u.layers, P.layers);
  gl.uniform1f(u.seed, P.seed);
  gl.uniform1f(u.angle, (P.angle * Math.PI) / 180);
  gl.uniform1f(u.scale, 1.75 - (P.scale / 100) * 1.2);
  gl.uniform1f(u.pigmentStrength, (P.pigment / 100) * 1.05);
  gl.uniform1f(u.veil, P.technique === "veil" ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return true;
}

export function WatercolorBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const W = (() => {
      try {
        return createPainter(canvas);
      } catch {
        return null;
      }
    })();
    if (!W) return; // Canvas stays hidden; the parent's flat colour shows.

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let t = START_TIME;
    let raf = 0;
    let last = 0;
    let onScreen = true;
    let dirty = true;
    let lost = false;

    const active = () => !lost && onScreen && !document.hidden;

    const paint = () => {
      if (draw(W, canvas, t)) {
        dirty = false;
        canvas.style.opacity = "1";
      }
    };

    const step = (now: number) => {
      raf = 0;
      if (!active()) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!reduce) {
        t += (SPEED / 100) * 1.2 * dt;
        dirty = true;
      }
      if (dirty) paint();
      if (!reduce || dirty) raf = requestAnimationFrame(step);
    };

    const wake = () => {
      if (raf || !active()) return;
      last = 0; // Don't jump forward by the time spent paused.
      raf = requestAnimationFrame(step);
    };
    const sleep = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const ro = new ResizeObserver(() => {
      dirty = true;
      wake();
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      if (onScreen) wake();
      else sleep();
    });
    io.observe(canvas);

    const onVisibility = () => (document.hidden ? sleep() : wake());
    document.addEventListener("visibilitychange", onVisibility);

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      sleep();
      canvas.style.opacity = "0";
    };
    canvas.addEventListener("webglcontextlost", onLost);

    wake();

    return () => {
      sleep();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
    };
  }, []);

  /* Hidden until the first frame lands, so the unpainted (black) buffer never flashes. */
  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("absolute inset-0 block size-full opacity-0", className)}
    />
  );
}
