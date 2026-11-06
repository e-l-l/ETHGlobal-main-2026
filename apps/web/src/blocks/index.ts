/*
 * Block pattern system: square tiles of brand greens, each carrying one flat shape.
 * Living spec and playground at /block-pattern.
 *
 *   tones.ts         which greens, which shape colours read on which tile, themes
 *   shapes.tsx       the shape vocabulary (100×100, currentColor)
 *   generate.ts      seeded generator that keeps neighbours apart
 *   tile.tsx         <Tile>, <Grain>
 *   grid.tsx         <BlockGrid>: tiles + content panels, lit tiles, step turns, tap to turn
 *   compositions.tsx <BlockFrame>, <BlockBand>, <BlockCluster>, <BlockWall>
 */
export * from "./tones";
export * from "./shapes";
export * from "./generate";
export * from "./tile";
export * from "./grid";
export * from "./compositions";
