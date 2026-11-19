import type { ReactNode } from "react";

/**
 * The Gomlin character, redrawn as SVG from brands/gomlin/assets/app-icon.png (the app icon and the chat head):
 * dark-purple hair and beard, two light strands, square black glasses, wide eyes, peach skin, a coral nose and a
 * coral dot on the ear. Drawn in the icon's own 1024 space, so lens content is placed in the same coordinates.
 * He never speaks: he sweats, gulps and reads the scanner in his lenses.
 */
const HAIR = "#271C33", STRAND = "#6E587D", SKIN = "#F7C9AE", SKIN_EDGE = "#FBE3D3", CORAL = "#FF6A55", LINE = "#1B1324";

export const LENS_L = { x: 152, y: 402, w: 232, h: 236, r: 24 };
export const LENS_R = { x: 422, y: 398, w: 336, h: 242, r: 24 };

export type MascotProps = {
  size: number;
  /** 0..1: how far the sweat drop has slid down. Negative hides it. */
  sweat?: number;
  /** "smile" (the icon), "open" (a gasp), "gulp" (pressed lips). */
  mouth?: "smile" | "open" | "gulp";
  /** 1 is the icon; below 1 the pupils shrink in shock. */
  pupils?: number;
  /** What the lenses show, drawn in 1024 space and clipped to the glass. */
  lens?: ReactNode;
  /** 0..1: how much the lens content covers the eyes. */
  lensOpacity?: number;
  style?: React.CSSProperties;
};

export function Mascot({ size, sweat = -1, mouth = "smile", pupils = 1, lens, lensOpacity = 0.85, style }: MascotProps) {
  const id = "m" + Math.round(size);
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ overflow: "visible", ...style }}>
      <defs>
        <clipPath id={`${id}-lens`}>
          <rect x={LENS_L.x} y={LENS_L.y} width={LENS_L.w} height={LENS_L.h} rx={LENS_L.r} />
          <rect x={LENS_R.x} y={LENS_R.y} width={LENS_R.w} height={LENS_R.h} rx={LENS_R.r} />
        </clipPath>
        <linearGradient id={`${id}-glare`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* hair and beard: the dark silhouette behind everything */}
      <path d="M118 360 C96 170 250 40 470 40 L790 58 C905 66 950 160 944 300 L938 560 C930 700 900 800 820 880 C730 975 560 1010 430 990 C250 965 120 870 112 700 Z" fill={HAIR} stroke={LINE} strokeWidth="8" />
      {/* ear */}
      <circle cx="884" cy="610" r="102" fill={SKIN} stroke={LINE} strokeWidth="8" />
      <circle cx="884" cy="610" r="96" fill="none" stroke={SKIN_EDGE} strokeWidth="6" />
      <circle cx="886" cy="610" r="44" fill={CORAL} />
      {/* face, under the fringe */}
      <path d="M150 350 C148 262 205 218 270 216 C420 214 610 300 792 410 L796 690 C700 730 300 740 150 700 Z" fill={SKIN} stroke={LINE} strokeWidth="8" />
      <path d="M168 352 C168 280 214 238 272 236" fill="none" stroke={SKIN_EDGE} strokeWidth="7" strokeLinecap="round" />
      {/* beard, with the mouth area left open */}
      <path d="M130 640 C220 690 300 700 300 700 C300 700 560 700 600 690 C700 670 790 640 800 640 L820 760 C780 900 600 975 440 965 C270 952 150 860 128 720 Z" fill={HAIR} stroke={LINE} strokeWidth="8" />
      {mouth === "open" ? (
        <g>
          <path d="M318 690 C318 660 548 660 548 690 L548 790 C548 830 318 830 318 790 Z" fill={SKIN} stroke={LINE} strokeWidth="8" />
          <ellipse cx="433" cy="752" rx="62" ry="54" fill="#5A1F2A" stroke={LINE} strokeWidth="6" />
          <ellipse cx="433" cy="785" rx="38" ry="18" fill={CORAL} />
        </g>
      ) : (
        <g>
          <path d="M300 690 C300 668 560 668 560 690 L556 770 C552 812 304 812 300 770 Z" fill={SKIN} stroke={LINE} strokeWidth="8" />
          {mouth === "smile" ? (
            <path d="M340 742 C380 772 470 776 520 740" fill="none" stroke={CORAL} strokeWidth="18" strokeLinecap="round" />
          ) : (
            <path d="M360 752 C400 744 470 744 505 752" fill="none" stroke={CORAL} strokeWidth="14" strokeLinecap="round" />
          )}
        </g>
      )}
      {/* eyebrow */}
      <path d="M196 352 C220 300 300 290 336 318 C300 314 240 326 206 360 Z" fill={HAIR} />
      {/* eyes */}
      <circle cx="292" cy="518" r="100" fill="#fff" stroke={LINE} strokeWidth="6" />
      <circle cx="588" cy="518" r="112" fill="#fff" stroke={LINE} strokeWidth="6" />
      <circle cx="292" cy="518" r={58 * pupils} fill={HAIR} />
      <circle cx="588" cy="518" r={64 * pupils} fill={HAIR} />
      {/* what the lenses show */}
      {lens ? <g clipPath={`url(#${id}-lens)`} opacity={lensOpacity}>{lens}</g> : null}
      <g clipPath={`url(#${id}-lens)`}>
        <rect x="140" y="390" width="640" height="260" fill={`url(#${id}-glare)`} />
      </g>
      {/* glasses */}
      <rect x={LENS_L.x} y={LENS_L.y} width={LENS_L.w} height={LENS_L.h} rx={LENS_L.r} fill="none" stroke={HAIR} strokeWidth="24" />
      <rect x={LENS_R.x} y={LENS_R.y} width={LENS_R.w} height={LENS_R.h} rx={LENS_R.r} fill="none" stroke={HAIR} strokeWidth="24" />
      <path d="M384 505 L422 505" stroke={HAIR} strokeWidth="22" />
      <path d="M152 448 L100 440" stroke={HAIR} strokeWidth="20" strokeLinecap="round" />
      {/* nose, over the glasses as in the icon */}
      <circle cx="378" cy="632" r="38" fill={CORAL} stroke={LINE} strokeWidth="5" />
      {/* the two light strands on the hair */}
      <path d="M268 62 C285 190 420 250 628 266" fill="none" stroke={STRAND} strokeWidth="22" strokeLinecap="round" />
      <path d="M342 48 C368 250 520 318 678 334" fill="none" stroke={STRAND} strokeWidth="22" strokeLinecap="round" />
      {/* the sweat drop, sliding down the temple */}
      {sweat >= 0 ? (
        <g transform={`translate(${812 - 10 * sweat} ${300 + 230 * sweat})`}>
          <path d="M0 -46 C18 -12 30 6 30 22 C30 40 16 52 0 52 C-16 52 -30 40 -30 22 C-30 6 -18 -12 0 -46 Z" fill="#8FD3FF" stroke={LINE} strokeWidth="6" />
          <path d="M-10 18 C-12 8 -6 -2 0 -10" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
        </g>
      ) : null}
    </svg>
  );
}
