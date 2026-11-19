/**
 * The story: arrows between scenes on the board, and the order they make (spec.md §10.4).
 * Each scene has at most one arrow out and one in, and no loops, so the arrows form chains. The video plays the chain
 * that starts at `start`. Pure functions, so the board and its tests share them.
 */
import type { Story, StoryImage } from "../engine/ad";

export type Arrow = [from: string, to: string];
export type Place = [x: number, y: number];
export type StoryState = { order: string[]; arrows: Arrow[]; start: string; board: Record<string, Place>; images: Record<string, StoryImage> };

/** A scene's cell on the board, in 16:9 board units. Other ratios stretch the layout to fit (board.tsx). */
export const CELL = { w: 2400, h: 1700 };

const same = (a: Arrow, b: Arrow) => a[0] === b[0] && a[1] === b[1];

/** The chain from `start`, following arrows. */
export function chainFrom(start: string, arrows: Arrow[]) {
  const out = new Map(arrows.map(([from, to]) => [from, to]));
  const order = [start];
  for (let at = out.get(start); at !== undefined && !order.includes(at); at = out.get(at)) order.push(at);
  return order;
}

/** Walks back along arrows to the head of the chain `id` is on. */
export function headOf(id: string, arrows: Arrow[]) {
  const into = new Map(arrows.map(([from, to]) => [to, from]));
  const seen = new Set([id]);
  let at = id;
  for (let back = into.get(at); back !== undefined && !seen.has(back); back = into.get(at)) {
    seen.add(back);
    at = back;
  }
  return at;
}

const pairs = (order: string[]): Arrow[] => order.slice(1).map((id, i) => [order[i], id]);

/** Where scenes go when the board hasn't placed them: the story in a row, the rest in a row below. */
function placeMissing(ids: string[], order: string[], board: Record<string, Place>) {
  const placed = { ...board };
  const taken = Object.values(placed);
  const free = (x: number, y: number) => !taken.some(([px, py]) => Math.abs(px - x) < CELL.w * 0.8 && Math.abs(py - y) < CELL.h * 0.8);
  const rows = [order, ids.filter((id) => !order.includes(id))];
  rows.forEach((row, r) => {
    row.forEach((id, i) => {
      if (placed[id]) return;
      let x = i * CELL.w;
      const y = r * CELL.h;
      while (!free(x, y)) x += CELL.w;
      placed[id] = [x, y];
      taken.push([x, y]);
    });
  });
  return placed;
}

/**
 * Auto layout: the story in a row in the order it plays, each chain off the story in a row below it, and the scenes
 * with no arrows in a last row. Only the places change, so the video doesn't.
 */
export function autoLayout(state: StoryState, ids: string[]): StoryState {
  const onStory = new Set(state.order);
  const off = ids.filter((id) => !onStory.has(id));
  const offSet = new Set(off);
  const arrows = state.arrows.filter(([from, to]) => offSet.has(from) && offSet.has(to));
  const linked = new Set(arrows.flat());
  const chains = off.filter((id) => linked.has(id) && !arrows.some(([, to]) => to === id)).map((head) => chainFrom(head, arrows));
  const loose = off.filter((id) => !linked.has(id));
  const rows = [state.order.filter((id) => ids.includes(id)), ...chains, loose].filter((row) => row.length);
  const board = { ...state.board };
  rows.forEach((row, r) => row.forEach((id, i) => (board[id] = [i * CELL.w, r * CELL.h])));
  return { ...state, board };
}

/** Reads story.json against the ad's scenes. With no story, every scene plays in registry order. Board images are scenes too. */
export function normalize(codeIds: string[], story?: Story): StoryState {
  const images = Object.fromEntries(Object.entries(story?.images ?? {}).filter(([id, image]) => !codeIds.includes(id) && typeof image?.src === "string"));
  const ids = [...codeIds, ...Object.keys(images)];
  const known = new Set(ids);
  const order = story?.order ? [...new Set(story.order)].filter((id) => known.has(id)) : ids;
  let arrows: Arrow[] = (story?.arrows ?? []).filter(([from, to]) => known.has(from) && known.has(to) && from !== to);
  const start = order[0] ?? (story?.start && known.has(story.start) ? story.start : ids[0]);
  // The order is what plays, so when the arrows disagree (the agent wrote only the order), the order wins.
  if (order.length && chainFrom(start, arrows).join() !== order.join()) {
    const onStory = new Set(order);
    arrows = [...pairs(order), ...arrows.filter(([from, to]) => !onStory.has(from) && !onStory.has(to))];
  }
  return { order: order.length ? order : [start], arrows, start, board: placeMissing(ids, order, story?.board ?? {}), images };
}

const withOrder = (state: Omit<StoryState, "order">): StoryState => ({ ...state, order: chainFrom(state.start, state.arrows) });

/** Draws an arrow. Replaces the arrow out of `from` and the one into `to`. `null` if it would close a loop. */
export function addArrow(state: StoryState, from: string, to: string): StoryState | null {
  if (from === to) return null;
  const arrows = state.arrows.filter(([a, b]) => a !== from && b !== to);
  if (chainFrom(to, arrows).includes(from)) return null;
  arrows.push([from, to]);
  // Drawing into the start from outside makes the new scene the start: the story grows backwards.
  return withOrder({ ...state, arrows, start: headOf(state.start, arrows) });
}

/** Takes an arrow away. Cutting the start loose from the story makes the scene it pointed at the start. */
export function removeArrow(state: StoryState, arrow: Arrow): StoryState {
  const arrows = state.arrows.filter((item) => !same(item, arrow));
  const loose = state.start === arrow[0] && !arrows.some(([from]) => from === arrow[0]);
  return withOrder({ ...state, arrows, start: loose ? headOf(arrow[1], arrows) : state.start });
}

/** "Start here": the video begins at `id`, so the arrow into it goes. */
export function setStart(state: StoryState, id: string): StoryState {
  return withOrder({ ...state, start: id, arrows: state.arrows.filter(([, to]) => to !== id) });
}

/** An id for an image (or with `kind` "clip", a video clip) from its file name, unlike any scene's. */
export function imageId(file: string, taken: Iterable<string>, kind = "image") {
  const used = new Set(taken);
  const stem = file.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 32) || "image";
  let id = `${kind}-${stem}`;
  for (let n = 2; used.has(id); n++) id = `${kind}-${stem}-${n}`;
  return id;
}

/** Puts images on the board, off the story until an arrow takes them in. */
export function addImages(state: StoryState, added: { id: string; image: StoryImage; place: Place }[]): StoryState {
  const board = { ...state.board };
  const images = { ...state.images };
  for (const { id, image, place } of added) {
    images[id] = image;
    board[id] = place;
  }
  return { ...state, board, images };
}

export function updateImage(state: StoryState, id: string, change: Partial<StoryImage>): StoryState {
  const image = state.images[id];
  return image ? { ...state, images: { ...state.images, [id]: { ...image, ...change } } } : state;
}

/** Takes images off the board. The chain closes over the gap, so A → image → B becomes A → B. */
export function removeImages(state: StoryState, ids: string[]): StoryState {
  const gone = new Set(ids.filter((id) => state.images[id]));
  if (!gone.size) return state;
  let { arrows, start } = state;
  for (const id of gone) {
    const into = arrows.find(([, to]) => to === id)?.[0];
    const out = arrows.find(([from]) => from === id)?.[1];
    arrows = arrows.filter(([from, to]) => from !== id && to !== id);
    if (into && out && !chainFrom(out, arrows).includes(into)) arrows.push([into, out]);
    if (start === id) start = out ?? "";
  }
  const left = Object.keys(state.board).filter((id) => !gone.has(id));
  if (!start || gone.has(start)) start = state.order.find((id) => !gone.has(id)) ?? left[0] ?? "";
  const board = Object.fromEntries(Object.entries(state.board).filter(([id]) => !gone.has(id)));
  const images = Object.fromEntries(Object.entries(state.images).filter(([id]) => !gone.has(id)));
  return withOrder({ ...state, arrows, start: headOf(start, arrows), board, images });
}

/** What goes in story.json. */
export function toStory(state: StoryState): Story {
  const round = (place: Place): Place => [Math.round(place[0]), Math.round(place[1])];
  return {
    order: state.order,
    arrows: state.arrows,
    start: state.start,
    board: Object.fromEntries(Object.entries(state.board).map(([id, place]) => [id, round(place)])),
    ...(Object.keys(state.images).length ? { images: state.images } : {}),
  };
}
