#!/usr/bin/env node
/*
 * Generates the DripMoney cover image with OpenAI's image model (ChatGPT image generation).
 *
 *   OPENAI_API_KEY=sk-... node scripts/generate-cover.mjs [out.png] [--ref logo.png --ref pattern.png]
 *
 * Without --ref it uses the text prompt only (generations endpoint).
 * With one or more --ref images (PNG/JPG/WebP screenshots of the logo lockup or /block-pattern page)
 * it uses the edits endpoint so the model sees the real marks.
 *
 * Brand context comes from anay-design.md and apps/web/src/final/brand.tsx, apps/web/src/blocks.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";

const args = process.argv.slice(2);
const refs = [];
let out = "docs/cover.png";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--ref") refs.push(args[++i]);
  else out = args[i];
}

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("Set OPENAI_API_KEY first.");
  process.exit(1);
}

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

const PROMPT = `
A bold, flat, geometric cover image for a fintech product called "DripMoney". Landscape 3:2.

BRAND
- Name: DripMoney. Tagline: "Every sale puts 10% in your dollar jar. Stock on credit, repaid from each sale."
- Greens only. Palette: Deep #151A13, Charcoal #262E24, Forest #234A2F, Hunter #2C5A3A, Fern #3F7D4F, Sage #5C7C62, Leaf #6FA65A, Lime #C6F28C, Honeydew #DDF7E6. No blue, pink, white, gradients on tiles, shadows, outlines or photography.

LOGO (the "ribbon drop")
- A water-drop silhouette cut into exactly FOUR slanted ribbon bands: bands tilt up to the right about 16 degrees, equal thickness, thin equal gaps between them, all clipped to the drop outline.
- The bottom band is bright Lime #C6F28C, the other three are Honeydew #DDF7E6, on a dark green ground. Do not add a fifth band, change the slant, or use any other colour.
- Place the logo large on the left third, with clear space around it equal to two band heights.

WORDMARK
- "DripMoney" in Urbanist ExtraBold (geometric rounded sans), tight tracking, Honeydew on the dark ground, set to the right of or below the logo as a horizontal lockup. Spelled exactly: D-r-i-p-M-o-n-e-y. A small monospace uppercase label "DOLLAR JAR CREDIT FOR SMALL SHOPS" beneath it in JetBrains Mono style, Lime, wide letter-spacing.

BLOCK PATTERN
- The background and frame is the brand "block pattern": a strict square grid of flat square tiles, no gaps, no rounded tile corners. Each tile is a solid brand green and carries exactly ONE flat geometric shape (quarter circle, half circle, arc, circle, diagonal split, stripe, dot, corner wedge) drawn in a second green that reads on it (e.g. Hunter tile with Lime shape, Lime tile with Hunter shape, Fern tile with Lime shape, Forest tile with Leaf shape, Honeydew tile with Fern shape, Deep tile with Leaf shape).
- Neighbouring tiles never share the same background tone. Shapes are rotated in quarter turns (0, 90, 180, 270). A single 2x2 cluster of tiles near the logo is "lit": Lime tiles with Hunter shapes.
- The tile field frames the cover on the top, right and bottom edges and fills the right half, fading calmly toward a quiet dark Deep/Charcoal panel on the left where the logo and wordmark sit. Never put text on busy tiles.

STYLE
- Confident, calm, modern, trustworthy. Flat vector look, crisp edges, generous negative space, high contrast. Looks like a designed brand system, not a stock illustration.
`.trim();

async function main() {
  let res;
  if (refs.length) {
    const form = new FormData();
    form.append("model", MODEL);
    form.append("prompt", `${PROMPT}\n\nThe attached images are the real logo and block pattern. Match them exactly.`);
    form.append("size", "1536x1024");
    form.append("quality", "high");
    for (const r of refs) {
      const buf = await readFile(r);
      form.append("image[]", new Blob([buf]), basename(r));
    }
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt: PROMPT, size: "1536x1024", quality: "high", n: 1 }),
    });
  }
  const json = await res.json();
  if (!res.ok) {
    console.error("OpenAI error:", JSON.stringify(json, null, 2));
    process.exit(1);
  }
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    console.error("No image returned:", JSON.stringify(json, null, 2));
    process.exit(1);
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(b64, "base64"));
  console.log(`Wrote ${out}`);
}

main();
