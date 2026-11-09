import type { SVGProps } from "react";

const PATHS = {
  lock: "M7 10V8a5 5 0 0 1 10 0v2m-11 0h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z",
  check: "m5 12.5 4.5 4.5L19 7.5",
  play: "M8 5.5v13l11-6.5-11-6.5Z",
  close: "M6 6l12 12M18 6 6 18",
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  repeat: "M4 11a8 8 0 0 1 14-5l2 2m0-5v5h-5M20 13a8 8 0 0 1-14 5l-2-2m0 5v-5h5",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z",
  flag: "M6 21V4m0 1h11l-2 4 2 4H6",
  path: "M7 3v4a4 4 0 0 0 4 4h2a4 4 0 0 1 4 4v6M7 3h0m10 18h0",
  chart: "M5 20V10m7 10V4m7 16v-7",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-2.5.9.7-1.5 2.6-1.1-.4a7 7 0 0 1-1.7 1l-.2 1.2h-3l-.2-1.2a7 7 0 0 1-1.7-1l-1.1.4-1.5-2.6.9-.7a7 7 0 0 1 0-2l-.9-.7 1.5-2.6 1.1.4a7 7 0 0 1 1.7-1l.2-1.2h3l.2 1.2a7 7 0 0 1 1.7 1l1.1-.4 1.5 2.6-.9.7a7 7 0 0 1 0 2Z",
  speaker: "M5 9v6h4l5 4V5L9 9H5Zm12 0a4 4 0 0 1 0 6",
  mute: "M5 9v6h4l5 4V5L9 9H5Zm12 1 4 4m0-4-4 4",
  bulb: "M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h10",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
  info: "M12 11v6m0-10v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  warn: "M12 4 2.5 20h19L12 4Zm0 6v5m0 3v.01",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4M12 13v4m-4 3h8",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Original brand mark: a stave whose last note climbs into a path. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="var(--brand)" />
      <g stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".55">
        <path d="M10 22h44M10 31h44M10 40h44" />
      </g>
      <ellipse cx="25" cy="40" rx="8" ry="6" transform="rotate(-20 25 40)" fill="#fff" />
      <path d="M32 38V15c8 1 14 5 14 12" stroke="#ffd166" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
