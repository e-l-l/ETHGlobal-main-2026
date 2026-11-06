"use client";

import { useSyncExternalStore } from "react";

/*
 * "What the world sees": one switch that follows you across screens.
 * Kept in sessionStorage so it survives navigation within the demo but not a new tab.
 * Storage can throw (private mode, blocked site data), so every access is guarded.
 */

const KEY = "dm-world-view";
const listeners = new Set<() => void>();
let memory = false;

function read(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return memory;
  }
}

export function setWorldView(on: boolean) {
  memory = on;
  try {
    window.sessionStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* memory fallback above */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useWorldView() {
  return useSyncExternalStore(subscribe, read, () => false);
}
