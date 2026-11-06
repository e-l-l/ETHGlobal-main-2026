import type { ReactNode } from "react";

/* 24px grid, 2px stroke, round caps. Same drawing rules as the kit's Icon set in controls.tsx. */
type P = { size?: number };
const svg = (size: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const I = {
  back: ({ size = 24 }: P) => svg(size, <path d="M15 5l-7 7 7 7" />),
  next: ({ size = 20 }: P) => svg(size, <path d="M9 6l6 6-6 6" />),
  close: ({ size = 22 }: P) => svg(size, <path d="M6 6l12 12M18 6L6 18" />),
  check: ({ size = 18 }: P) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />),
  eye: ({ size = 22 }: P) => svg(size, <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>),
  lock: ({ size = 18 }: P) => svg(size, <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>),
  shield: ({ size = 18 }: P) => svg(size, <path d="M12 3l7 3v5.5c0 4.2-3 7.6-7 9.5-4-1.9-7-5.3-7-9.5V6z" />),
  info: ({ size = 18 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" /></>),
  alert: ({ size = 18 }: P) => svg(size, <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.5v.01" /></>),
  store: ({ size = 20 }: P) => svg(size, <><path d="M4 9.5l1.5-5h13L20 9.5" /><path d="M4 9.5h16a0 0 0 0 1 0 0 2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 9.5z" /><path d="M5.5 12.5V20h13v-7.5" /></>),
  globe: ({ size = 20 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>),
  wallet: ({ size = 16 }: P) => svg(size, <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12.5h2M3 9.5h18" /></>),
  copy: ({ size = 16 }: P) => svg(size, <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>),
  earn: ({ size = 22 }: P) => svg(size, <><path d="M4 17l5-5 4 3 7-8" /><path d="M15 7h5v5" /></>),
  layers: ({ size = 22 }: P) => svg(size, <><path d="M12 4l9 5-9 5-9-5z" /><path d="M3 14l9 5 9-5" /></>),
  grid: ({ size = 22 }: P) => svg(size, <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>),
  pulse: ({ size = 22 }: P) => svg(size, <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />),
  search: ({ size = 20 }: P) => svg(size, <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  sparkle: ({ size = 20 }: P) => svg(size, <path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z" />),
  del: ({ size = 26 }: P) => svg(size, <><path d="M9 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-6-6z" /><path d="M12.5 9.5l5 5M17.5 9.5l-5 5" /></>),
  phone: ({ size = 18 }: P) => svg(size, <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18.5h2" /></>),
  swap: ({ size = 18 }: P) => svg(size, <><path d="M7 4L4 7l3 3" /><path d="M4 7h13" /><path d="M17 20l3-3-3-3" /><path d="M20 17H7" /></>),
  person: ({ size = 18 }: P) => svg(size, <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5" /></>),
};
