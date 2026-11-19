/** The shape of an ad's `hand.ts` (what to trace) and `hand.gen.json` (what came out). Imports nothing, so scripts can load it. */

/** A font to trace in: a name from `HAND_FONTS`, or a file under public/. A brand's hand font is copied to public/ads/<slug>/ first. */
export type HandFontRef = string | { family: string; src: string };

/** One line of text to trace. Line breaks aren't traced: give each line its own id. */
export type HandTextSpec = {
  id: string;
  text: string;
  font: HandFontRef;
  /** Font size the trace is done at. `<HandText size>` scales it freely; 200 or more gives clean centre lines. */
  size?: number;
  weight?: number;
  /** Default: worked out from the first strong letter, so Hebrew is RTL. */
  dir?: "ltr" | "rtl";
};

/** Single-line SVG paths, drawn in the order listed (the portfolio's HandwritingMVP way): logos, arrows, doodles. */
export type HandPathSpec = {
  id: string;
  paths: string[];
  /** Pen width in the paths' own units. */
  ink: number;
};

/** The default export of src/ads/<slug>/hand.ts. */
export type HandManifest = { texts?: HandTextSpec[]; paths?: HandPathSpec[] };

export type Point = [x: number, y: number];

export type HandStroke = {
  /** Catmull-Rom curve, carried past both tips so a flat pen covers them. The mask uses this. */
  d: string;
  /** The same curve on the letter's centre line, without the extended tips. `mode="ink"` uses this. */
  core: string;
  /** Length of `d`. */
  len: number;
  /** Width of the mask pen on this stroke: as wide as the ink it has to uncover. */
  reveal: number;
  /** Points along `core`, evenly spaced, for the stylus and `hand:check`. */
  pts: Point[];
  /** Which letter of the text it belongs to, counted in logical order (the order they're written). -1 on a path. */
  letter: number;
};

export type HandEntry = {
  kind: "text" | "path";
  /** Hash of everything that went into the trace. */
  key: string;
  /** x, y, width, height of the SVG. */
  viewBox: [number, number, number, number];
  /** `reveal` is the widest mask pen of any stroke. `ink` is the pen for `mode="ink"`: the font's stroke thickness. */
  reveal: number;
  ink: number;
  /** In writing order. */
  strokes: HandStroke[];
  /** Text only: how to set it, the same way it was traced. */
  text?: string;
  font?: { family: string; src: string; weight: number };
  size?: number;
  dir?: "ltr" | "rtl";
  /** Text only: where the text is anchored and its baseline. */
  x?: number;
  y?: number;
};

/** The whole of src/ads/<slug>/hand.gen.json. */
export type HandGen = { version: number; entries: Record<string, HandEntry> };
