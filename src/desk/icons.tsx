/** The desk's icons: 16 px line drawings on a 16 grid, in currentColor. */
import type { ReactNode, SVGProps } from "react";

const Icon = ({ children, size = 16, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
    {children}
  </svg>
);

type P = SVGProps<SVGSVGElement> & { size?: number };

export const MoveIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 2.5l9 4.2-3.9 1.2-1.6 3.8z" fill="currentColor" stroke="none" />
  </Icon>
);
export const HandIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 8.5V4.2a1 1 0 012 0V8m0-.5V3a1 1 0 012 0v4.5m0-.3V3.8a1 1 0 012 0v4.4m0-1.2a1 1 0 012 0v2.8c0 2.6-1.8 4.5-4.3 4.5h-.6c-1.5 0-2.4-.6-3.3-1.7L3.1 9.9a1.1 1.1 0 011.6-1.5L5 8.7" />
  </Icon>
);
export const ArrowToolIcon = (p: P) => (
  <Icon {...p}>
    <rect x="1.5" y="2.5" width="4" height="4" rx="1" />
    <rect x="10.5" y="9.5" width="4" height="4" rx="1" />
    <path d="M5.5 4.5h3a2 2 0 012 2v3m-1.6-1.4l1.6 1.6 1.6-1.6" />
  </Icon>
);
export const FitIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2.5 5.5v-3h3m5 0h3v3m0 5v3h-3m-5 0h-3v-3" />
  </Icon>
);
export const LayersIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 2.2l6 3.3-6 3.3-6-3.3z" />
    <path d="M2 8.4l6 3.3 6-3.3" />
    <path d="M2 11.2l6 3.3 6-3.3" />
  </Icon>
);
export const LayoutIcon = (p: P) => (
  <Icon {...p}>
    <rect x="1.5" y="3" width="3.5" height="3" rx=".75" />
    <rect x="6.25" y="3" width="3.5" height="3" rx=".75" />
    <rect x="11" y="3" width="3.5" height="3" rx=".75" />
    <rect x="1.5" y="10" width="3.5" height="3" rx=".75" />
    <rect x="6.25" y="10" width="3.5" height="3" rx=".75" />
  </Icon>
);
export const PlayIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 3v10l8.5-5z" fill="currentColor" stroke="none" />
  </Icon>
);
export const PauseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 3.5v9M11 3.5v9" strokeWidth={2} />
  </Icon>
);
export const StopIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" />
  </Icon>
);
export const PlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
export const SendIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 13V3.5M4 7.5l4-4 4 4" strokeWidth={1.6} />
  </Icon>
);
export const ClipIcon = (p: P) => (
  <Icon {...p}>
    <path d="M13 7.5l-5.3 5.3a3.2 3.2 0 01-4.5-4.5l5.6-5.6a2.1 2.1 0 013 3l-5.5 5.5a1 1 0 01-1.5-1.5l5-5" />
  </Icon>
);
export const BackIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 3.5L5.5 8l4.5 4.5" />
  </Icon>
);
export const ChevronIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 6.5L8 10l3.5-3.5" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
export const FileIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 1.5h5l3 3v10H4z" />
    <path d="M9 1.5v3h3M6 8h4M6 10.5h4" />
  </Icon>
);
export const CutIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="M8 7.5 20 17M8 16.5 20 7" />
  </Icon>
);

export const FilmIcon = (p: P) => (
  <Icon {...p}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M5 3v10M11 3v10M2 6h3m6 0h3M2 10h3m6 0h3" />
  </Icon>
);
export const FrameIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 1.5v13M11 1.5v13M1.5 5h13M1.5 11h13" />
  </Icon>
);
export const ProjectsIcon = (p: P) => (
  <Icon {...p}>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </Icon>
);
export const BrandIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6" />
    <circle cx="6" cy="6" r="1" fill="currentColor" />
    <circle cx="10" cy="6" r="1" fill="currentColor" />
    <circle cx="5.5" cy="9.5" r="1" fill="currentColor" />
    <path d="M9 14c-1-1 0-2.5 1.5-2.5H12" />
  </Icon>
);
export const SparkIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 1.5l1.3 4.2 4.2 1.3-4.2 1.3L8 12.5 6.7 8.3 2.5 7l4.2-1.3z" fill="currentColor" stroke="none" />
    <path d="M13 11l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" fill="currentColor" stroke="none" />
  </Icon>
);
export const FolderIcon = (p: P) => (
  <Icon {...p}>
    <path d="M1.5 4.5v8h13v-7H7.5l-1.5-2h-4z" />
  </Icon>
);
export const GlobeIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M1.5 8h13M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13" />
  </Icon>
);
export const UploadIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10v3.5h11V10" />
  </Icon>
);
export const RenderIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 2v7m-3-3l3 3 3-3M3 11v2.5h10V11" />
  </Icon>
);
/** nykma's icon (brands/nykma/assets/icon.svg): a play button and the red cursor on a black tile. Not in currentColor. */
export const NykmaIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <rect width="64" height="64" rx="16" fill="#0b0b0d" />
    <rect x="0.5" y="0.5" width="63" height="63" rx="15.5" fill="none" stroke="rgba(244,239,230,0.12)" />
    <path d="M19 18.5 L37 30 L19 41.5 Z" fill="#fff" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
    <rect x="34" y="42" width="15" height="5.5" rx="2.5" fill="#e8301f" />
  </svg>
);
export const GearIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7L3.6 3.6" />
    <circle cx="8" cy="8" r="4.6" />
  </Icon>
);
export const ImageIcon = (p: P) => (
  <Icon {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <circle cx="5.75" cy="6" r="1.25" />
    <path d="M2.5 12l3.6-3.6a1 1 0 011.4 0L10 11m-1-1l1.6-1.6a1 1 0 011.4 0l1.5 1.5" />
  </Icon>
);
