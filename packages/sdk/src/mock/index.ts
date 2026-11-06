/**
 * `@repo/sdk/mock`: the raw mock values, COPIED from apps/web/src/lib/mock/* (see each file's header).
 * Screens should prefer `createMRA({ mode: "mock" })`; these exports exist for stories and tests.
 */
export * from "./shop.js";
export * from "./merchant.js";
export * from "./lend.js";
export * from "./catalog.js";
export { routes, type FailReason } from "./routes.js";
export { APP_NAME } from "./brand.js";
