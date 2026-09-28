/**
 * Inline SVG icons (no icon library needed). All inherit `currentColor` and
 * size from the `size` prop. Stroke icons follow the Lucide 24×24 grid.
 */

function Svg({ size = 20, children, fill = 'none', strokeWidth = 2.25, className = '', label, ...rest }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill} stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={`icon ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      {label && <title>{label}</title>}
      {children}
    </svg>
  );
}

export const Basketball = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2v20M2 12h20" />
    <path d="M5.6 4.4a11 11 0 0 1 0 15.2M18.4 4.4a11 11 0 0 0 0 15.2" />
  </Svg>
);

export const Trophy = (p) => (
  <Svg {...p}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </Svg>
);

export const Crown = (p) => (
  <Svg fill="currentColor" strokeWidth={1.5} {...p}>
    <path d="M2.5 7.5 7 11l5-7 5 7 4.5-3.5L19.5 18h-15Z" />
    <path d="M4.5 21h15" fill="none" strokeWidth={2.5} />
  </Svg>
);

export const Flame = (p) => (
  <Svg fill="currentColor" strokeWidth={1.25} {...p}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </Svg>
);

export const TrendUp = (p) => (
  <Svg {...p}><path d="M22 7 13.5 15.5l-5-5L2 17M16 7h6v6" /></Svg>
);

export const TrendDown = (p) => (
  <Svg {...p}><path d="M22 17 13.5 8.5l-5 5L2 7M16 17h6v-6" /></Svg>
);

export const Blocked = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></Svg>
);

export const Caret = ({ down, ...p }) => (
  <Svg fill="currentColor" strokeWidth={0} {...p}>
    <path d={down ? 'M4 7h16l-8 11Z' : 'M4 17h16L12 6Z'} />
  </Svg>
);

// Podium medal: ribbon + coloured disc with the rank number.
const MEDAL_COLORS = { 1: ['#ffd400', '#b58a00'], 2: ['#e3e3e3', '#8f8f8f'], 3: ['#e0914f', '#8c4f1c'] };
export const Medal = ({ rank, size = 34 }) => {
  const [face, edge] = MEDAL_COLORS[rank];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={`Rank ${rank}`} className="icon">
      <path d="M9 1h6l3 9h-6Z" fill="#ff6a00" stroke="#0d0d0d" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M23 1h-6l-3 9h6Z" fill="#3b2a1a" stroke="#0d0d0d" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="10" fill={face} stroke="#0d0d0d" strokeWidth="2" />
      <circle cx="16" cy="20" r="7" fill="none" stroke={edge} strokeWidth="1.5" />
      <text x="16" y="24.5" textAnchor="middle" fontFamily="'Archivo Black', sans-serif" fontSize="12" fill="#0d0d0d">{rank}</text>
    </svg>
  );
};

// ── player controls ──────────────────────────────────────────────────────────
export const Play = (p) => (
  <Svg fill="currentColor" strokeWidth={1.5} {...p}><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></Svg>
);

export const Pause = (p) => (
  <Svg fill="currentColor" strokeWidth={0} {...p}><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="12" y="4" width="5" height="16" rx="1" /></Svg>
);

const Speaker = () => <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" />;

export const VolumeHigh = (p) => (
  <Svg {...p}><Speaker /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></Svg>
);

export const VolumeLow = (p) => (
  <Svg {...p}><Speaker /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></Svg>
);

export const VolumeOff = (p) => (
  <Svg {...p}><Speaker /><path d="m22 9-6 6M16 9l6 6" /></Svg>
);

export const Maximize = (p) => (
  <Svg {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></Svg>
);

export const Minimize = (p) => (
  <Svg {...p}><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M16 21v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></Svg>
);