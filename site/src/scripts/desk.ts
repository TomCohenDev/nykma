// The desk demo on the home page (components/Desk.astro): four chapters, each a mock of the real desk that a cursor
// works through. Like an ad, everything on screen is a function of the time `t` (ms into the chapter): which classes
// the chapter has, what's typed, where the cursor is, how far a tween has got. So jumping to a chapter is rendering it
// at t = 0, reduced motion is rendering each at its end, and pausing is not moving t.

/** An element (its centre, nudged by dx, dy) or a point in the mock's 1120 × 680 pixels. */
type Target = string | { k: string; dx?: number; dy?: number } | [number, number];
/** The cursor arrives at `to` at `t`, having set off `ms` earlier. `hold`: the button is down on the way (a drag). */
type Move = { t: number; to: Target; ms?: number; click?: boolean; hold?: boolean };
/** The chapter has class `cls` from `t` until `until`. */
type Set = [t: number, cls: string, until?: number];
/** From `t`, the element `k` types `text`, `ms` per letter. Before, it shows what the page put in it. */
type Type = { t: number; k: string; text: string; ms?: number };
/** From `t`, over `d` ms, the CSS variable `v` on element `k` goes from `from` to `to`. */
type Tween = { t: number; d: number; k: string; v: string; from: number; to: number; ease?: (x: number) => number };
type Chapter = { dur: number; steps: number[]; moves: Move[]; sets?: Set[]; types?: Type[]; tweens?: Tween[] };

const W = 1120;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const out = (x: number) => 1 - (1 - x) ** 3;

const CHAPTERS: Chapter[] = [
  // projects: the brief, Go, the pitch card, the library
  {
    dur: 11000,
    steps: [0, 3500, 5600, 8200],
    moves: [
      { t: 0, to: [760, 560] },
      { t: 900, to: { k: "brief", dx: -300, dy: -14 }, click: true },
      { t: 3400, to: "go", ms: 900, click: true },
      { t: 6600, to: "pgo", ms: 900 },
      { t: 9000, to: "lib3", ms: 900 },
    ],
    sets: [
      [900, "is-focus", 3400],
      [1100, "is-typed"],
      [3400, "is-pitching"],
      [5600, "is-pitched"],
      [8200, "is-lib"],
      [9000, "is-hover"],
    ],
    types: [{ t: 1100, k: "brieftext", text: "make an ad about the free plan for myapp", ms: 48 }],
    tweens: [{ t: 3500, d: 2000, k: "pitch", v: "--pp", from: 0, to: 1 }],
  },
  // edit: select the headline, change its text, drag it, history
  {
    dur: 12000,
    steps: [0, 2200, 6200, 8800],
    moves: [
      { t: 0, to: [900, 380] },
      { t: 1000, to: "h1", click: true },
      { t: 2700, to: "field", ms: 900, click: true },
      { t: 6900, to: "h1", ms: 900 },
      { t: 8000, to: "h1", ms: 1100, hold: true },
      { t: 9700, to: "undo", ms: 900 },
    ],
    sets: [
      [1000, "is-sel"],
      [2700, "is-editing", 4300],
      [2950, "is-selall", 3250],
      [4500, "is-h1"],
      [8000, "is-moved"],
      [8300, "is-h2"],
      [9700, "is-undo"],
    ],
    types: [
      { t: 3250, k: "fieldtext", text: "Free. Forever.", ms: 70 },
      { t: 3250, k: "h1text", text: "Free. Forever.", ms: 70 },
      { t: 3250, k: "eltext", text: "Free. Forever.", ms: 70 },
    ],
    tweens: [{ t: 6900, d: 1100, k: "h1", v: "--dy", from: 0, to: 42, ease: inOut }],
  },
  // effects: Fade up on the headline, then Push left between two clips
  {
    dur: 12500,
    steps: [0, 1700, 5000, 7300],
    moves: [
      { t: 0, to: [520, 330] },
      { t: 1000, to: "tabfx", click: true },
      { t: 2300, to: "fadeup", ms: 900, click: true },
      { t: 5800, to: "dia", ms: 1000, click: true },
      { t: 7900, to: "push", ms: 900, click: true },
      { t: 10400, to: [470, 300], ms: 1200 },
    ],
    sets: [
      [1000, "is-fx"],
      [2300, "is-picked"],
      [5800, "is-pop", 8100],
      [8100, "is-push"],
    ],
    tweens: [
      { t: 2300, d: 1, k: "h1", v: "--fu", from: 1, to: 0 },
      { t: 2550, d: 700, k: "h1", v: "--fu", from: 0, to: 1, ease: out },
      { t: 2400, d: 1100, k: "tl", v: "--ph", from: 0, to: 70 },
      { t: 8300, d: 1, k: "tl", v: "--ph", from: 70, to: 270 },
      { t: 8400, d: 1300, k: "tl", v: "--ph", from: 270, to: 350 },
      { t: 8500, d: 1000, k: "ad", v: "--push", from: 0, to: 1, ease: inOut },
    ],
  },
  // publish: two accounts, a time, approve, confirm, the posts
  {
    dur: 13500,
    steps: [0, 3000, 4800, 7600],
    moves: [
      { t: 0, to: [560, 600] },
      { t: 1000, to: "ig", click: true },
      { t: 2000, to: "yt", ms: 700, click: true },
      { t: 3600, to: "at", ms: 900, click: true },
      { t: 5300, to: "approve", ms: 900, click: true },
      { t: 6800, to: "ok", ms: 900, click: true },
      { t: 11000, to: "view", ms: 1100 },
    ],
    sets: [
      [1000, "is-ig"],
      [2000, "is-yt"],
      [3600, "is-at"],
      [5300, "is-confirm", 7100],
      [7100, "is-done"],
      [9300, "is-clock"],
      [10000, "is-posted"],
    ],
  },
];

/** Each terminal line's start and the time it's fully there: typed lines letter by letter, the rest a beat apart. */
function termTimes(lines: HTMLElement[]) {
  let at = 500;
  return lines.map((line) => {
    const typed = line.dataset.kind === "in" || line.dataset.kind === "sh";
    const len = line.dataset.text!.length;
    const start = at;
    at += typed ? 250 + len * 30 + 400 : 450;
    return { start: typed ? start + 250 : start, typed, len };
  });
}

export function startDesk(root: HTMLElement) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wrap = root.querySelector<HTMLElement>("[data-win]")!;
  const inner = root.querySelector<HTMLElement>("[data-in]")!;
  const cursor = root.querySelector<HTMLElement>("[data-cursor]")!;
  const chapters = [...root.querySelectorAll<HTMLElement>("[data-chapter]")];
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  const stepLists = [...root.querySelectorAll<HTMLElement>("[data-steps]")];
  const terms = [...root.querySelectorAll<HTMLElement>("[data-term]")];
  const pause = root.querySelector<HTMLButtonElement>("[data-pause]")!;
  /** How long the change between chapters takes before the new one's clock starts, in ms. */
  const LEAD = 800;
  /** Where the cursor last was, and where a change between chapters started it from. */
  let lastPos: [number, number] = [W / 2, 340];
  let glideFrom: [number, number] | null = null;
  const termLines = terms.map((term) => [...term.querySelectorAll<HTMLElement>("[data-line]")]);
  const termPlan = termLines.map(termTimes);

  // On a wide screen the whole mock desk shows, scaled down. On a narrow one it shows a window of VIEW mock pixels
  // across at a readable size, which follows the cursor like a screen recording zoomed in.
  const H = 680;
  const VIEW = 560;
  let scale = 1;
  let zoomed = false;
  let pan: [number, number] = [0, 0];
  const place = () => {
    inner.style.transform = zoomed ? `scale(${scale}) translate(${-pan[0]}px, ${-pan[1]}px)` : `scale(${scale})`;
  };
  const fit = () => {
    zoomed = wrap.clientWidth < 700;
    root.classList.toggle("is-zoomed", zoomed);
    scale = wrap.clientWidth / (zoomed ? VIEW : W);
    place();
  };
  fit();
  new ResizeObserver(fit).observe(wrap);

  const found = new Map<string, HTMLElement | null>();
  const find = (ch: number, k: string) => {
    const key = `${ch}:${k}`;
    if (!found.has(key)) found.set(key, chapters[ch].querySelector<HTMLElement>(`[data-k="${k}"]`));
    return found.get(key)!;
  };
  // What each typed element showed before the demo touched it.
  const original = new Map<HTMLElement, string>();
  const at = (ch: number, target: Target): [number, number] => {
    if (Array.isArray(target)) return target;
    const { k, dx = 0, dy = 0 } = typeof target === "string" ? { k: target } : target;
    const el = find(ch, k);
    if (!el) return [W / 2, 340];
    const box = el.getBoundingClientRect();
    const frame = inner.getBoundingClientRect();
    return [(box.left + box.width / 2 - frame.left) / scale + dx, (box.top + box.height / 2 - frame.top) / scale + dy];
  };

  function render(ch: number, raw: number) {
    // A change between chapters runs the clock from -LEAD: the chapter holds its first frame, only the cursor moves.
    const t = Math.max(0, raw);
    const chapter = CHAPTERS[ch];
    const el = chapters[ch];
    for (const [from, cls, until] of chapter.sets ?? []) el.classList.toggle(cls, t >= from && (until === undefined || t < until));

    const typing = new Map<HTMLElement, Type>();
    for (const type of chapter.types ?? []) {
      const target = find(ch, type.k);
      if (!target) continue;
      if (!original.has(target)) original.set(target, target.textContent ?? "");
      if (t >= type.t) typing.set(target, type);
      else if (!typing.has(target)) typing.set(target, { ...type, text: "", t: -1 });
    }
    for (const [target, type] of typing) {
      if (type.t < 0) {
        target.textContent = original.get(target)!;
        target.classList.remove("is-typing");
        continue;
      }
      const n = Math.min(type.text.length, Math.floor((t - type.t) / (type.ms ?? 50)));
      target.textContent = type.text.slice(0, n);
      target.classList.toggle("is-typing", n < type.text.length);
    }

    const tweens = new Map<string, Tween>();
    for (const tween of chapter.tweens ?? []) {
      const key = `${tween.k}|${tween.v}`;
      if (!tweens.has(key) || t >= tween.t) tweens.set(key, tween);
    }
    for (const tween of tweens.values()) {
      const target = find(ch, tween.k);
      if (!target) continue;
      const p = t < tween.t ? 0 : clamp((t - tween.t) / tween.d);
      target.style.setProperty(tween.v, String(tween.from + (tween.to - tween.from) * (tween.ease ?? ((x) => x))(p)));
    }

    // The cursor: between the move it last made and the next one.
    const moves = chapter.moves;
    const next = moves.findIndex((move) => move.t > t);
    let pos: [number, number];
    let down = false;
    if (next <= 0) pos = at(ch, moves[next === 0 ? 0 : moves.length - 1].to);
    else {
      const a = moves[next - 1];
      const b = moves[next];
      const start = Math.max(a.t, b.t - (b.ms ?? 700));
      const p = inOut(clamp((t - start) / (b.t - start)));
      const [ax, ay] = at(ch, a.to);
      const [bx, by] = at(ch, b.to);
      pos = [ax + (bx - ax) * p, ay + (by - ay) * p];
      down = !!b.hold && t >= start;
    }
    const click = moves.filter((move) => move.click && t >= move.t && t - move.t < 500).pop();
    down ||= !!click && t - click.t < 170;
    // While the chapters cross-fade (t < 0) the cursor glides from where it was to this chapter's first spot.
    if (glideFrom && raw < 0) {
      const p = inOut(clamp((raw + LEAD) / LEAD));
      pos = [glideFrom[0] + (pos[0] - glideFrom[0]) * p, glideFrom[1] + (pos[1] - glideFrom[1]) * p];
      down = false;
    } else glideFrom = null;
    lastPos = pos;
    cursor.style.transform = `translate(${pos[0].toFixed(1)}px, ${pos[1].toFixed(1)}px)`;
    if (zoomed) {
      const viewH = wrap.clientHeight / scale;
      // Aim between the cursor and the middle of the desk, so a dialog doesn't get cut in half.
      const fx = pos[0] * 0.6 + (W / 2) * 0.4;
      const fy = pos[1] * 0.6 + (H / 2) * 0.4;
      pan = [Math.min(W - VIEW, Math.max(0, fx - VIEW / 2)), Math.min(H - viewH, Math.max(0, fy - viewH / 2))];
      place();
    }
    cursor.classList.toggle("is-down", down);
    cursor.style.setProperty("--rp", click ? String((t - click.t) / 500) : "1");

    // The steps beside it, the chapter's progress bar and the terminal under it.
    const step = chapter.steps.filter((s) => s <= t).length - 1;
    [...stepLists[ch].children].forEach((li, i) => {
      li.classList.toggle("is-now", i === step);
      li.classList.toggle("is-past", i < step);
    });
    tabs[ch].style.setProperty("--fill", String(clamp(t / chapter.dur)));
    termLines[ch].forEach((line, i) => {
      const plan = termPlan[ch][i];
      const text = line.querySelector<HTMLElement>("[data-text]")!;
      const shown = t >= plan.start;
      line.classList.toggle("is-shown", shown);
      if (!plan.typed) return;
      const n = Math.max(0, Math.min(plan.len, Math.floor((t - plan.start) / 30)));
      text.textContent = line.dataset.text!.slice(0, n);
      line.classList.toggle("is-typing", shown && n < plan.len);
    });
  }

  let current = 0;
  let t = 0;
  let playing = !still;
  let seen = false;
  let last = 0;
  let running = false;

  // Restarts a CSS animation on an element: off, a reflow, on.
  const replay = (el: HTMLElement, cls: string) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };
  let leaving: ReturnType<typeof setTimeout> | undefined;
  const show = (ch: number, animate = false) => {
    const prev = current;
    current = ch;
    clearTimeout(leaving);
    chapters.forEach((el) => el.classList.remove("is-leaving"));
    if (animate && prev !== ch) {
      chapters[prev].classList.add("is-leaving");
      leaving = setTimeout(() => chapters[prev].classList.remove("is-leaving"), 500);
    }
    chapters.forEach((el, i) => el.classList.toggle("is-active", i === ch));
    stepLists.forEach((el, i) => (el.hidden = i !== ch));
    terms.forEach((el, i) => (el.hidden = i !== ch));
    if (animate) {
      glideFrom = lastPos;
      replay(stepLists[ch], "is-in");
      replay(terms[ch], "is-in");
    }
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === ch));
      tab.style.setProperty("--fill", i < ch ? "1" : "0");
    });
  };
  const jump = (ch: number, animate = !still) => {
    show(ch, animate);
    // The new chapter waits on its first frame while the change plays, then its clock starts.
    t = still ? CHAPTERS[ch].dur : animate ? -LEAD : 0;
    render(ch, t);
  };

  tabs.forEach((tab, i) => tab.addEventListener("click", () => jump(i)));
  const setPlaying = (on: boolean) => {
    playing = on;
    pause.setAttribute("aria-pressed", String(!on));
    pause.textContent = on ? "pause" : "play";
  };
  pause.addEventListener("click", () => setPlaying(!playing));

  if (still) {
    root.classList.add("is-still");
    pause.hidden = true;
    jump(0, false);
    return;
  }

  const frame = (now: number) => {
    const dt = Math.min(100, now - last);
    last = now;
    if (playing && seen && !document.hidden) {
      t += dt;
      if (t > CHAPTERS[current].dur + 900) {
        jump((current + 1) % CHAPTERS.length);
      } else {
        render(current, Math.min(t, CHAPTERS[current].dur));
      }
    }
    if (seen) requestAnimationFrame(frame);
    else running = false;
  };
  new IntersectionObserver(
    (entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      seen = visible;
      if (visible && !running) {
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
      }
    },
    { threshold: 0.2 },
  ).observe(wrap);
  jump(0, false);
}
