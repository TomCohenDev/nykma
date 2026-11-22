/**
 * A project (spec.md §10.2): stages across the top, scenes, media and files on the left, the viewer in the middle with
 * the timeline under it, and the inspector and the agent on the right. The timeline is the story: the order the
 * scenes play, written to story.json. There are no arrows any more.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chat, type Chip, type Quick } from "./Chat";
import { GeneratedPanel } from "./Generated";
import { EffectsPanel, describeFx, describeTransition, fxOf } from "./Effects";
import { HistoryPanel, useHistory } from "./History";
import { Inspector, placementOf, saveKnob, useElementSource, type EditSource, type Tune } from "./Inspector";
import { PublishDialog } from "./Publish";
import { Scrubber, Timeline, timecode, type Clip } from "./Timeline";
import { Viewer, type Picked, type Transform, type ViewerApi } from "./Viewer";
import { BackIcon, CloseIcon, FileIcon, FilmIcon, FrameIcon, ImageIcon, PlayIcon, PauseIcon, PlusIcon, RenderIcon, SendIcon, SparkIcon } from "./icons";
import { Markdown } from "./md";
import { imageSeconds, type Story, type StoryImage } from "../engine/ad";
import type { StoryTransition } from "../engine/transitions";
import { imageId, normalize } from "./story";
import { RATIOS, SIZES, media, post, ratioLabel, storyboardImage, upload, useEscape, type Ad, type Project, type Ratio, type Run, type TakeInfo, type View } from "./api";

const VIDEO_FILE = /\.(mov|mp4|m4v|webm|mkv|avi)$/i;

type Props = {
  project?: Project;
  /** A new project whose agent hasn't made its folder yet. */
  run?: Run;
  go: (hash: string) => void;
  refresh: () => void;
  registryError?: string;
};

type Trim = { in?: number; out?: number };
type Local = { order: string[]; images: Record<string, StoryImage>; trim: Record<string, Trim>; transitions: Record<string, StoryTransition> };
type Selection = { kind: "clip"; id: string } | { kind: "el"; el: Picked; ratio: Ratio; stale?: boolean } | null;
type SceneInfoPlus = TakeInfo["scenes"][number] & { trimIn?: number; full?: number };
type TakePlus = TakeInfo & { cues?: { src: string; at: number; frames?: number; volume?: number }[] };

const savedView = (): View => (localStorage.getItem("nykma.view") as View) || "16x9";

const STAGES = ["Pitch", "Build", "First look", "Checks", "Post"] as const;
function stageOf(project?: Project, run?: Run): number {
  if (!project) return run ? 0 : -1;
  if (project.state === "pitch") return project.info || project.running ? 1 : 0;
  if (project.state === "first-look") return 2;
  if (project.state === "checked") return 3;
  if (project.state === "ready") return 4;
  return -1;
}

/** Every ratio of a take at one height, playing together. The first carries the sound. */
function Renders({ folder, take }: { folder: string; take: Ad["takes"][string] }) {
  const ratios = RATIOS.filter((ratio) => take[ratio]);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const each = (act: (video: HTMLVideoElement) => void) => videos.current.forEach((video) => video && act(video));
  const seek = (to: number) => {
    setTime(to);
    each((video) => (video.currentTime = to));
  };
  const toggle = () => {
    const lead = videos.current[0];
    if (!lead) return;
    if (lead.ended) seek(0);
    if (lead.paused) {
      each((video) => (video.currentTime = lead.currentTime));
      each((video) => void video.play());
      setPlaying(true);
    } else {
      each((video) => video.pause());
      setPlaying(false);
    }
  };
  const follow = () => {
    const lead = videos.current[0];
    if (!lead) return;
    setTime(lead.currentTime);
    each((video) => {
      if (Math.abs(video.currentTime - lead.currentTime) > 0.12) video.currentTime = lead.currentTime;
    });
  };
  return (
    <div className="renders">
      <div className="renders-row">
        {ratios.map((ratio, index) => (
          <figure key={ratio} style={{ flexGrow: SIZES[ratio].width / SIZES[ratio].height }}>
            <video
              ref={(video) => void (videos.current[index] = video)}
              src={media(folder, take[ratio]!)}
              style={{ aspectRatio: `${SIZES[ratio].width} / ${SIZES[ratio].height}` }}
              muted={index > 0}
              playsInline
              preload="auto"
              onClick={toggle}
              onLoadedMetadata={index === 0 ? (event) => setLength(event.currentTarget.duration) : undefined}
              onTimeUpdate={index === 0 ? follow : undefined}
              onEnded={index === 0 ? () => setPlaying(false) : undefined}
            />
            <figcaption>
              {ratioLabel(ratio)} · <a href={media(folder, take[ratio]!)} download>{take[ratio]}</a>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="transport">
        <button className="icon-button" onClick={toggle}>
          {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
        </button>
        <input type="range" min={0} max={length || 1} step={1 / 30} value={time} onChange={(event) => seek(Number(event.target.value))} />
        <output>
          {time.toFixed(1)} / {length.toFixed(1)} s
        </output>
      </div>
    </div>
  );
}

/** The project's files: docs as Markdown, renders as synced players. */
function Reader({ ad, open, onClose }: { ad: Ad; open: string; onClose: () => void }) {
  const tabs = [
    ...ad.docs.map((doc) => ({ key: doc.file, label: doc.file })),
    ...Object.keys(ad.takes).map((take) => ({ key: `take:${take}`, label: `${take} renders` })),
    ...(ad.stills.length ? [{ key: "stills", label: "Stills" }] : []),
    ...(ad.thumbnails?.length ? [{ key: "thumbnails", label: "Thumbnails" }] : []),
    ...(ad.animatic ? [{ key: "animatic", label: "animatic.mp4" }] : []),
  ];
  const [tab, setTab] = useState(open);
  useEscape(onClose);
  const doc = ad.docs.find((item) => item.file === tab);
  return (
    <div className="overlay-veil" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="reader" role="dialog" aria-label="Project files">
        <header>
          <div className="tabs" role="tablist">
            {tabs.map((item) => (
              <button key={item.key} role="tab" aria-selected={item.key === tab} onClick={() => setTab(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        <div className="reader-body">
          {doc && <Markdown text={doc.text} className="md doc" />}
          {tab.startsWith("take:") && ad.takes[tab.slice(5)] && <Renders key={tab} folder={ad.folder} take={ad.takes[tab.slice(5)]} />}
          {tab === "stills" && (
            <div className="stills">
              {ad.stills.map((still) => (
                <figure key={still}>
                  <img src={media(ad.folder, still)} alt={still} />
                  <figcaption>{still}</figcaption>
                </figure>
              ))}
            </div>
          )}
          {tab === "thumbnails" && (
            <div className="stills">
              {ad.thumbnails.map((file) => (
                <figure key={file}>
                  <img src={media(ad.folder, file)} alt={file} />
                  <figcaption>
                    {file} · <a href={media(ad.folder, file.replace(/\.png$/, ".jpg"))} download>JPG</a>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          {tab === "animatic" && ad.animatic && <video className="animatic" src={media(ad.folder, ad.animatic)} controls autoPlay />}
          {ad.extras.length > 0 && tab.startsWith("take:") && (
            <p className="extras">
              Also: {ad.extras.map((file) => (
                <a key={file} href={media(ad.folder, file)} download>
                  {file}
                </a>
              ))}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Before there's code: the animatic plays in the viewer, or the storyboard row's image under the playhead. */
function PitchViewer({ ad, frame, fps, playing, onFrame, onEnded }: { ad?: Ad; frame: number; fps: number; playing: boolean; onFrame: (f: number) => void; onEnded: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (!playing) {
      el.pause();
      if (Math.abs(el.currentTime - frame / fps) > 0.05) el.currentTime = frame / fps;
      return;
    }
    let raf = 0;
    void el.play();
    const tick = () => {
      onFrame(Math.round(el.currentTime * fps));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, playing ? 0 : frame]);
  if (!ad) return <div className="viewer-area empty-viewer" />;
  const row = ad.storyboard.find((item) => frame / fps >= item.start && frame / fps < item.end) ?? ad.storyboard[0];
  return (
    <div className="viewer-area">
      <div className="viewer-row">
        {ad.animatic ? (
          <video ref={video} className="pitch-video" src={media(ad.folder, ad.animatic)} onEnded={onEnded} playsInline />
        ) : row?.image ? (
          <img className="pitch-video" src={storyboardImage(row.image, ad.folder, ad.brand)} alt="" />
        ) : (
          <div className="pitch-card" dir="auto">
            {row?.happens ?? "The pitch has no storyboard yet."}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectView({ project, run, go, refresh, registryError }: Props) {
  const info = project?.info;
  const ad = project?.ad;
  const [takeName, setTakeName] = useState(info?.takes[0]?.name);
  const take = (info?.takes.find((item) => item.name === takeName) ?? info?.takes[0]) as TakePlus | undefined;
  const [view, setView] = useState<View>(savedView);
  const ratios = (take?.ratios.map((item) => item.ratio) ?? ["16x9"]) as Ratio[];
  const shown: View = view === "all" || ratios.includes(view) ? view : ratios[0];
  const ratioShown = shown === "all" ? ratios[0] : shown;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [picking, setPicking] = useState(true);
  const [safe, setSafe] = useState(() => localStorage.getItem("nykma.safe") === "1");
  const [selection, setSelection] = useState<Selection>(null);
  const [rightTab, setRightTab] = useState<"inspect" | "effects" | "history" | "agent">(() => (project?.running || run || !project || project.state === "pitch" ? "agent" : "inspect"));
  const [leftTab, setLeftTab] = useState<"scenes" | "media" | "files">("scenes");
  const [reader, setReader] = useState<string>();
  const [publishing, setPublishing] = useState(false);
  const [note, setNote] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const [asked, setAsked] = useState<Chip[]>([]);
  const [sourceKey, setSourceKey] = useState(0);
  const [historyKey, setHistoryKey] = useState(0);
  const [textFocus, setTextFocus] = useState(0);
  const viewerApi = useRef<ViewerApi | null>(null);
  const lastWrite = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => localStorage.setItem("nykma.view", view), [view]);
  useEffect(() => localStorage.setItem("nykma.safe", safe ? "1" : "0"), [safe]);
  useEffect(() => {
    if (project?.running) setRightTab("agent");
  }, [project?.running]);

  /* ── The story, from disk unless the desk just wrote it ── */
  const codeScenes = (take?.scenes.filter((scene) => !scene.image) ?? []) as SceneInfoPlus[];
  const ids = codeScenes.map((scene) => scene.id);
  const fromDisk = useCallback((): Local => {
    const state = normalize(ids, take?.story);
    const disk = take?.story as (Story & { trim?: Record<string, Trim>; transitions?: Record<string, StoryTransition> }) | undefined;
    return { order: state.order, images: state.images, trim: (disk?.trim ?? {}) as Record<string, Trim>, transitions: disk?.transitions ?? {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take?.name, JSON.stringify(take?.story), ids.join()]);
  const [story, setStory] = useState<Local>(fromDisk);
  const shownTake = useRef(take?.name);
  useEffect(() => {
    // The desk's own write echoes back from the registry a moment later; another take is always loaded fresh.
    const switched = shownTake.current !== take?.name;
    shownTake.current = take?.name;
    if (switched || Date.now() - lastWrite.current > 3000) setStory(fromDisk());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDisk]);
  const storyNow = useRef(story);
  storyNow.current = story;
  const editable = Boolean(take) && (Boolean(take!.hasScenes) || Object.keys(story.images).length > 0);

  const nameOf = (id: string) => story.images[id]?.name ?? codeScenes.find((scene) => scene.id === id)?.name ?? id;
  const saveStory = (next: Local, label = "Timeline") => {
    if (!take || !project) return;
    const before = story.order.join(" → ");
    setStory(next);
    lastWrite.current = Date.now();
    // Keep what the desk doesn't own; arrows and board places belonged to the old board and go.
    const { arrows: _a, start: _s, board: _b, ...rest } = (take.story ?? {}) as Story & { trim?: unknown };
    const trim = Object.fromEntries(Object.entries(next.trim).filter(([, value]) => value && (value.in || value.out !== undefined)));
    const written = {
      ...rest,
      order: next.order,
      images: Object.keys(next.images).length ? next.images : undefined,
      trim: Object.keys(trim).length ? trim : undefined,
      transitions: Object.keys(next.transitions).length ? next.transitions : undefined,
    };
    post("/api/story", { slug: project.slug, take: take.take, story: JSON.parse(JSON.stringify(written)), label })
      .then(() => (refresh(), setHistoryKey((key) => key + 1)))
      .catch((failure) => setError(failure.message));
    const after = next.order.join(" → ");
    if (after !== before) setNote(`I changed the order on the timeline. It now plays: ${next.order.map(nameOf).join(" → ")} (saved in src/ads/${project.slug}/story${take.take ? `-${take.take}` : ""}.json).`);
  };

  /* ── The timeline's clips ── */
  const fps = take?.fps ?? 30;
  const clipOf = (id: string): Clip | undefined => {
    const image = story.images[id];
    if (image && take) {
      const frames = take.kind === "asset" ? 1 : Math.max(1, Math.round(imageSeconds(image) * fps));
      return { id, name: image.name ?? id, kind: image.clip ? "clip" : "image", frames, thumb: image.clip ? undefined : { src: `/${image.src}` }, sub: image.clip ? "your clip" : "your image" };
    }
    const scene = codeScenes.find((item) => item.id === id);
    if (!scene || !take) return undefined;
    const trim = story.trim[id];
    const full = scene.full;
    const tin = trim?.in ?? scene.trimIn ?? 0;
    const frames = full !== undefined ? Math.max(1, (trim?.out ?? (trim ? full : tin + scene.frames)) - tin) : scene.frames;
    const videoId = take.ratios.find((item) => item.ratio === ratioShown)?.id ?? take.ratios[0]?.id;
    const onDisk = `${scene.frames}-${scene.trimIn ?? 0}`;
    return { id, name: scene.name, kind: "scene", frames: take.kind === "asset" ? 1 : frames, trimIn: tin, full, thumb: videoId ? { videoId, ratio: ratioShown, scene: id, version: onDisk } : undefined };
  };
  const clips: Clip[] = take
    ? (editable ? story.order : ids).map(clipOf).filter((clip): clip is Clip => Boolean(clip))
    : (ad?.storyboard ?? []).map((row) => ({
        id: `row-${row.number}`,
        name: row.happens.split(/[.!?\n]/)[0].slice(0, 60) || `Row ${row.number}`,
        kind: "row" as const,
        frames: Math.max(1, Math.round((row.end - row.start) * 30)),
        thumb: row.image ? { src: storyboardImage(row.image, ad!.folder, ad!.brand) } : undefined,
      }));
  const offStory = take && editable ? [...ids, ...Object.keys(story.images)].filter((id) => !story.order.includes(id)).map(clipOf).filter((clip): clip is Clip => Boolean(clip)) : [];
  const total = Math.max(1, clips.reduce((sum, clip) => sum + clip.frames, 0));
  const starts = clips.reduce<number[]>((list, clip, i) => [...list, i ? list[i - 1] + clips[i - 1].frames : 0], []);
  const clipAt = (f: number) => clips.findIndex((clip, i) => f >= starts[i] && f < starts[i] + clip.frames);
  const current = clips[clipAt(frame)];
  useEffect(() => {
    if (frame > total - 1) setFrame(Math.max(0, total - 1));
  }, [total, frame]);

  // The viewer loads the video again when what plays changes on disk.
  const reloadKey = JSON.stringify([take?.name, take?.story?.order, (take?.story as { trim?: unknown })?.trim, take?.story?.images, (take?.story as { transitions?: unknown })?.transitions]);

  /* ── Changing the story ── */
  const reorder = (order: string[]) => {
    const moved = order.find((id, i) => clips[i]?.id !== id && order.indexOf(id) !== clips.findIndex((clip) => clip.id === id));
    saveStory({ ...story, order: [...order, ...story.order.filter((id) => !order.includes(id) && !clips.some((clip) => clip.id === id))] }, `Moved "${nameOf(moved ?? order[0])}"`);
  };
  const toggleStory = (id: string) => {
    if (story.order.includes(id) && story.order.length === 1) return setError("The video needs at least one scene in it.");
    saveStory({ ...story, order: story.order.includes(id) ? story.order.filter((item) => item !== id) : [...story.order, id] }, story.order.includes(id) ? `Took "${nameOf(id)}" out` : `Put "${nameOf(id)}" in`);
  };
  const trimScene = (id: string, trim: { in: number; out: number }) => {
    const full = codeScenes.find((scene) => scene.id === id)?.full;
    const value: Trim = { ...(trim.in > 0 ? { in: trim.in } : {}), ...(full === undefined || trim.out < full ? { out: trim.out } : {}) };
    const next = { ...story.trim };
    if (Object.keys(value).length) next[id] = value;
    else delete next[id];
    saveStory({ ...story, trim: next }, `Trimmed "${nameOf(id)}" to ${trim.in}–${trim.out}`);
  };
  const setTransition = (id: string, value: StoryTransition | null, label: string) => {
    const transitions = { ...story.transitions };
    if (value) transitions[id] = value;
    else delete transitions[id];
    saveStory({ ...story, transitions }, label);
  };
  const changeImage = (id: string, change: Partial<StoryImage>) => {
    const image = story.images[id];
    if (image) saveStory({ ...story, images: { ...story.images, [id]: { ...image, ...change } } }, change.seconds !== undefined ? `"${nameOf(id)}" shown for ${change.seconds} s` : `Changed "${nameOf(id)}"`);
  };
  const removeImage = (id: string) => {
    const images = { ...story.images };
    delete images[id];
    saveStory({ ...story, images, order: story.order.filter((item) => item !== id) }, `Removed "${nameOf(id)}"`);
    setSelection(null);
  };

  /** Images go to public/ads/<slug>/board/, clips to footage/ and are unpacked to frames (spec.md §6.5). */
  const addFiles = async (files: File[], index?: number) => {
    if (!take || !project) return;
    setError("");
    const taken = new Set([...ids, ...Object.keys(storyNow.current.images)]);
    const added: { id: string; image: StoryImage }[] = [];
    for (const file of files) {
      try {
        if (file.type.startsWith("video/") || VIDEO_FILE.test(file.name)) {
          setBusy(`Uploading ${file.name}…`);
          const path = await upload(file, `footage:${project.slug}`);
          setBusy(`Unpacking ${file.name} into frames. A long clip takes a minute…`);
          const clip = await post("/api/footage", { slug: project.slug, file: path });
          const id = imageId(clip.name, taken, "clip");
          taken.add(id);
          added.push({ id, image: { src: clip.src, name: file.name.replace(/\.[^.]+$/, ""), clip: { fps: clip.fps, frames: clip.frames, ...(clip.sound ? { sound: clip.sound } : {}) } } });
        } else if (file.type.startsWith("image/")) {
          setBusy(`Uploading ${file.name}…`);
          const path = await upload(file, `board:${project.slug}`);
          const src = path.replace(/^public\//, "");
          const id = imageId(src.split("/").pop()!, taken);
          taken.add(id);
          added.push({ id, image: { src, name: file.name.replace(/\.[^.]+$/, "") } });
        }
      } catch (failure) {
        setError((failure as Error).message);
      } finally {
        setBusy("");
      }
    }
    if (!added.length) return;
    const now = storyNow.current;
    const images = { ...now.images, ...Object.fromEntries(added.map((item) => [item.id, item.image])) };
    const order = [...now.order];
    if (index !== undefined) order.splice(index, 0, ...added.map((item) => item.id));
    saveStory({ ...now, images, order }, added.length === 1 ? `Added "${added[0].image.name ?? added[0].id}"` : `Added ${added.length} files`);
    setSelection({ kind: "clip", id: added[0].id });
  };

  /* ── The selected element: its code, and every way of changing it ── */
  const picked = selection?.kind === "el" ? selection.el : null;
  const { source, failed: sourceFailed, setFailed: setSourceFailed, load: loadSource } = useElementSource(picked, sourceKey, project?.slug);
  const [tune, setTune] = useState<Tune>({});
  useEffect(() => setTune(((take as unknown as { tune?: Tune })?.tune ?? {}) as Tune), [take]);
  const history = useHistory(project?.slug, historyKey, rightTab === "history");
  const changed = () => {
    setError("");
    setHistoryKey((key) => key + 1);
  };
  const editSource: EditSource = async (change, label, at) => {
    if (!source) return;
    try {
      const reply = await post<{ loc: string; hash: string }>("/api/source/edit", { loc: at?.loc ?? source.loc, hash: at?.hash ?? source.hash, edit: change, label });
      setSourceFailed("");
      // The element's own tag moved (a new style on its line): follow it.
      if (!at && reply.loc && reply.loc !== source.loc && selection?.kind === "el") setSelection({ ...selection, stale: true, el: { ...selection.el, loc: reply.loc } });
      else loadSource();
      changed();
    } catch (failure) {
      setSourceFailed((failure as Error).message);
      loadSource();
      throw failure;
    }
  };
  const setKnob = async (id: string, scope: "all" | Ratio, value: unknown, label: string) => {
    if (!project) return;
    await saveKnob(project.slug, take?.take, scope, id, value, label);
    setTune((current) => {
      const next = { ...(current[scope] ?? {}) };
      if (value === null) delete next[id];
      else next[id] = value;
      return { ...current, [scope]: next };
    });
    changed();
  };
  const placement = picked ? placementOf(picked, source, tune, selection?.kind === "el" ? selection.ratio : ratioShown) : undefined;
  const transform = async (el: Picked, change: Transform) => {
    const knob = el.knobs.find((id) => el.knobInfo?.[id]?.kind === "nudge");
    if (knob) {
      const now = (tune.all?.[knob] ?? {}) as { dx?: number; dy?: number; scale?: number };
      return setKnob(knob, "all", "translate" in change ? { ...now, dx: change.translate[0], dy: change.translate[1] } : { ...now, scale: change.scale }, "translate" in change ? `Moved ${knob}` : `Scaled ${knob}`);
    }
    if ("translate" in change) {
      const [x, y] = change.translate;
      return editSource({ kind: "style", name: "translate", value: x || y ? `${x}px ${y}px` : null }, `Moved ${el.tag}${el.text ? ` "${el.text.slice(0, 18)}"` : ""} to ${x}, ${y}`);
    }
    return editSource({ kind: "style", name: "scale", value: change.scale === 1 ? null : change.scale }, `Scaled ${el.tag}${el.text ? ` "${el.text.slice(0, 18)}"` : ""} to ${Math.round(change.scale * 100)}%`);
  };
  /** Undo, redo or a point in the history: then everything reads the files again. */
  const travel = async (to: "undo" | "redo" | number) => {
    try {
      await history.move(to);
      afterTravel();
    } catch (failure) {
      setError((failure as Error).message);
    }
  };
  const afterTravel = () => {
    setError("");
    lastWrite.current = 0;
    setSourceKey((key) => key + 1);
    refresh();
  };
  const preview = (style: Record<string, string> | null, restore = true) => {
    if (!picked) return;
    if (style) viewerApi.current?.preview(picked.loc, style);
    else viewerApi.current?.endPreview(restore);
  };

  /* ── The agent ── */
  const ask = async (text: string, shown: string) => {
    if (run && !project) return post("/api/ask", { after: run.id, text, shown });
    if (!project) throw new Error("There's no project yet.");
    await post("/api/ask", project.folder ? { folder: project.folder, text, shown } : { slug: project.slug, text, shown });
    refresh();
  };
  const say = (text: string) => {
    setRightTab("agent");
    void ask(text, text).catch((failure) => setError(failure.message));
  };
  const act = (path: string) => () => post(path, { folder: project?.folder }).then(refresh);
  const quick: Quick[] = !project?.folder
    ? []
    : project.state === "pitch"
      ? [{ label: "Go", send: "go", tone: "primary" }, { label: "Another idea", send: "another idea" }, { label: "Drop it", act: act("/api/drop"), tone: "danger" }]
      : project.state === "first-look"
        ? [{ label: "Check it", send: "check it", tone: "primary" }, { label: "Skip the checks", send: "skip the checks" }, { label: "Drop it", act: act("/api/drop"), tone: "danger" }]
        : project.state === "dropped"
          ? [{ label: "Bring it back", act: act("/api/restore") }]
          : [{ label: "Drop it", act: act("/api/drop"), tone: "danger" }];

  const where = (f: number) => {
    const i = clipAt(f);
    return i < 0 ? `frame ${f}` : `frame ${f} of the video (${clips[i].kind} \`${clips[i].id}\`, ${f - starts[i] + (clips[i].trimIn ?? 0)} frames in)`;
  };
  const selectionChip: Chip | undefined =
    selection?.kind === "el"
      ? {
          key: `el:${selection.el.loc}`,
          label: `@${selection.el.tag}${selection.el.text ? ` "${selection.el.text.slice(0, 18)}"` : ""} · f${frame}`,
          context: `I'm looking at the <${selection.el.tag}> at ${selection.el.loc}${selection.el.text ? ` ("${selection.el.text.slice(0, 80)}")` : ""} in ${ratioLabel(selection.ratio)}, at ${where(frame)}. On the stage it's ${Math.round(selection.el.box.width)}×${Math.round(selection.el.box.height)} at ${Math.round(selection.el.box.x)},${Math.round(selection.el.box.y)}, ${selection.el.font} ${selection.el.size}px ${selection.el.color}.`,
        }
      : selection?.kind === "clip"
        ? (() => {
            const clip = [...clips, ...offStory].find((item) => item.id === selection.id);
            return clip ? { key: `clip:${clip.id}`, label: `@${clip.name}`, context: `I'm looking at the ${clip.kind} \`${clip.id}\` ("${clip.name}"), ${clip.frames} frames long, ${story.order.includes(clip.id) ? "in the video" : "not in the video"}, with the playhead at ${where(frame)}.` } : undefined;
          })()
        : current && take
          ? { key: "frame", label: `@${timecode(frame, fps)}`, context: `I'm at ${where(frame)} in ${shown === "all" ? "every ratio" : ratioLabel(ratioShown)}.` }
          : undefined;
  const chips = [...asked.filter((chip) => chip.key !== selectionChip?.key), ...(selectionChip ? [selectionChip] : [])];

  const render = () => {
    if (!project) return;
    setError("");
    setRightTab("agent");
    post("/api/render", { slug: project.slug, folder: project.folder }).then(refresh, (failure) => setError(failure.message));
  };

  /* ── Keys: Space, ←/→ (Shift: 10), ↑/↓ scenes, Home/End, V select, Esc, Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo ── */
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable], .cm-editor") || document.querySelector(".overlay-veil")) return;
    // A button keeps focus after a click, and Space would press it again (Render, Publish…) as well as play.
    if (event.key === " " && target.closest("button")) (target as HTMLElement).blur();
    const by = event.shiftKey ? 10 : 1;
    const seek = (f: number) => (setPlaying(false), setFrame(Math.max(0, Math.min(total - 1, f))));
    const i = clipAt(frame);
    if (event.key === " ") setPlaying((on) => !on);
    else if (event.key === "ArrowRight") seek(frame + by);
    else if (event.key === "ArrowLeft") seek(frame - by);
    else if (event.key === "ArrowDown") seek(i + 1 < clips.length ? starts[i + 1] : total - 1);
    else if (event.key === "ArrowUp") seek(frame > starts[i] ? starts[i] : starts[Math.max(0, i - 1)]);
    else if (event.key === "Home") seek(0);
    else if (event.key === "End") seek(total - 1);
    else if (event.key.toLowerCase() === "v" && !event.ctrlKey && !event.metaKey) setPicking((on) => !on);
    else if (event.key === "Escape") setSelection(null);
    else if ((event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") && (event.ctrlKey || event.metaKey))
      void travel(event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo");
    else return;
    event.preventDefault();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stage = stageOf(project, run);
  const state = project?.state;
  const name = project?.slug ?? "New project";
  const primary: { label: string; run: () => void } | undefined =
    state === "pitch" && stage === 0 && project?.folder && !project.running
      ? { label: "Go", run: () => say("go") }
      : state === "first-look" && !project?.running
        ? { label: "Check it", run: () => say("check it") }
        : state === "ready" && ad && Object.keys(ad.takes).length
          ? { label: "Publish", run: () => setPublishing(true) }
          : undefined;
  const codeOrder = story.order.filter((id) => ids.includes(id));
  const reordered = editable && take?.audioTimed && (codeOrder.join() !== ids.join() || story.order.some((id) => story.images[id]) || Object.keys(story.trim).length > 0);
  const banner: ReactNode = busy || (reordered ? "This ad is timed by its voice, so the new order or trim puts the voice out of time. Ask the agent to rebuild the mix: that spends ElevenLabs credits." : error) || undefined;

  const selectedClip = selection?.kind === "clip" ? [...clips, ...offStory].find((clip) => clip.id === selection.id) : undefined;

  return (
    <div className="studio">
      <header className="topbar studio-top">
        <div className="topbar-left">
          <button className="ghost back" onClick={() => go("#/")} title="All projects">
            <BackIcon />
          </button>
          <span className="crumb" onClick={() => go("#/")}>
            Projects
          </span>
          {project?.brand && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb" onClick={() => go(`#/brand/${encodeURIComponent(project.brand!)}`)}>
                {project.brand}
              </span>
            </>
          )}
          <span className="crumb-sep">/</span>
          <h1 className="crumb-here">{name}</h1>
          {info && info.takes.length > 1 && (
            <select className="take-select" value={take?.name} onChange={(event) => setTakeName(event.target.value)} aria-label="Take">
              {info.takes.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.take ? `Take ${item.take}` : "Main take"}
                </option>
              ))}
            </select>
          )}
        </div>
        <nav className="stages" aria-label="Stage">
          {state === "dropped" ? (
            <span className="stage dropped">Dropped</span>
          ) : state === "code" ? (
            <span className="stage">In code, no queue folder</span>
          ) : (
            STAGES.map((label, i) => (
              <span key={label} className={`stage${i < stage ? " done" : i === stage ? " now" : ""}`}>
                {i === stage && (project?.running || run?.running) ? <span className="working-dot" /> : i < stage ? <span className="stage-check">✓</span> : null}
                {label}
              </span>
            ))
          )}
        </nav>
        <div className="topbar-right">
          {project && (
            <span className="undo-pair">
              <button className="ghost icon" disabled={history.position === 0} onClick={() => void travel("undo")} title={history.position ? `Undo: ${history.entries[history.position - 1]?.label} (Ctrl+Z)` : "Nothing to undo"}>
                ↶
              </button>
              <button className="ghost icon" disabled={history.position >= history.entries.length} onClick={() => void travel("redo")} title={history.position < history.entries.length ? `Redo: ${history.entries[history.position]?.label} (Ctrl+Shift+Z)` : "Nothing to redo"}>
                ↷
              </button>
            </span>
          )}
          <button className="ghost" disabled={!take || !take.frames} onClick={render} title={take?.kind === "asset" ? "Render every ratio to PNG, no agent" : "Render every ratio to MP4, no agent"}>
            <RenderIcon size={14} /> Render
          </button>
          {state !== "ready" && (
            <button className="ghost" disabled={!ad || !Object.keys(ad.takes).length} onClick={() => setPublishing(true)} title={ad && Object.keys(ad.takes).length ? "Post or schedule the MP4s. Nothing posts until you approve it" : "Render the ad first"}>
              <SendIcon size={12} /> Publish
            </button>
          )}
          {primary && (
            <button className="primary" onClick={primary.run}>
              {primary.label}
            </button>
          )}
        </div>
      </header>

      <aside className="studio-left">
        <div className="ptabs">
          {(["scenes", "media", "files"] as const).map((tab) => (
            <button key={tab} className={`ptab${leftTab === tab ? " on" : ""}`} onClick={() => setLeftTab(tab)}>
              {tab === "scenes" ? <FilmIcon size={14} /> : tab === "media" ? <ImageIcon size={14} /> : <FileIcon size={14} />}
              {tab === "scenes" ? (take?.kind === "asset" ? "Images" : "Scenes") : tab === "media" ? "Media" : "Files"}
            </button>
          ))}
        </div>
        <div className="studio-left-body">
          {leftTab === "scenes" && (
            <>
              {clips.length === 0 && <p className="panel-empty">{run?.running || project?.running ? "The agent is working on it." : "Nothing here yet. Ask the agent."}</p>}
              <ol className="scene-list">
                {clips.map((clip, i) => (
                  <li key={clip.id}>
                    <button
                      className={selection?.kind === "clip" && selection.id === clip.id ? "on" : current?.id === clip.id ? "here" : ""}
                      onClick={() => {
                        setSelection({ kind: "clip", id: clip.id });
                        setPlaying(false);
                        setFrame(starts[i]);
                      }}
                    >
                      <span className="layer-n">{i + 1}</span>
                      <span className="layer-name" dir="auto">
                        {clip.name}
                      </span>
                      <span className="layer-sub">{take ? `${(clip.frames / fps).toFixed(1)} s` : `${(starts[i] / 30).toFixed(1)} s`}</span>
                    </button>
                  </li>
                ))}
              </ol>
              {offStory.length > 0 && (
                <>
                  <h4 className="panel-h">Not in the video</h4>
                  <ol className="scene-list off">
                    {offStory.map((clip) => (
                      <li key={clip.id}>
                        <button className={selection?.kind === "clip" && selection.id === clip.id ? "on" : ""} onClick={() => setSelection({ kind: "clip", id: clip.id })}>
                          <span className="layer-n">–</span>
                          <span className="layer-name" dir="auto">
                            {clip.name}
                          </span>
                          <span
                            className="add-back"
                            role="button"
                            title="Put it at the end of the video"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleStory(clip.id);
                            }}
                          >
                            <PlusIcon size={12} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {take && project && (
                <>
                  <button className="ghost wide add-files" onClick={() => fileInput.current?.click()}>
                    <PlusIcon size={12} /> Add an image or a clip
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      const files = [...(event.target.files ?? [])];
                      event.target.value = "";
                      void addFiles(files);
                    }}
                  />
                </>
              )}
              {!info && project && <p className="panel-empty">The ad isn't in the registry yet, so the timeline shows the pitch's storyboard.</p>}
              {registryError && <p className="panel-error">The registry didn't load: {registryError}</p>}
            </>
          )}
          {leftTab === "media" && project && (
            <GeneratedPanel
              slug={project.slug}
              onRetake={(id, retake) =>
                ask(
                  `Retake the still "${id}": ${retake}

Change its prompt or settings in public/ads/${project.slug}/gen.json to match, run bun run gen ${project.slug} to make it again, and stop. I approve the new still on the desk before any video is made from it.`,
                  `Retake ${id}: ${retake}`,
                )
              }
            />
          )}
          {leftTab === "files" && (
            <>
              {ad?.idea && (
                <section className="idea" dir="auto">
                  {ad.idea}
                </section>
              )}
              {ad && (
                <ul className="file-list">
                  {ad.docs.map((doc) => (
                    <li key={doc.file}>
                      <button onClick={() => setReader(doc.file)}>
                        <FileIcon size={14} /> {doc.file}
                      </button>
                    </li>
                  ))}
                  {Object.entries(ad.takes).map(([takeId, files]) => (
                    <li key={takeId}>
                      <button onClick={() => setReader(`take:${takeId}`)}>
                        <FilmIcon size={14} /> {takeId} <span className="layer-sub">{Object.keys(files).length} MP4s</span>
                      </button>
                    </li>
                  ))}
                  {ad.stills.length > 0 && (
                    <li>
                      <button onClick={() => setReader("stills")}>
                        <FrameIcon size={14} /> Stills <span className="layer-sub">{ad.stills.length}</span>
                      </button>
                    </li>
                  )}
                  {ad.thumbnails?.length > 0 && (
                    <li>
                      <button onClick={() => setReader("thumbnails")}>
                        <FrameIcon size={14} /> Thumbnails <span className="layer-sub">{ad.thumbnails.length}</span>
                      </button>
                    </li>
                  )}
                  {ad.animatic && (
                    <li>
                      <button onClick={() => setReader("animatic")}>
                        <FilmIcon size={14} /> animatic.mp4
                      </button>
                    </li>
                  )}
                </ul>
              )}
              {!ad && <p className="panel-empty">No files yet.</p>}
            </>
          )}
        </div>
      </aside>

      <main className="studio-center">
        <div className="viewer-bar">
          <div className="seg" role="group" aria-label="Ratio">
            {RATIOS.map((ratio) => (
              <button key={ratio} aria-pressed={shown === ratio} disabled={!take || !ratios.includes(ratio)} onClick={() => setView(ratio)}>
                {ratioLabel(ratio)}
              </button>
            ))}
            <button aria-pressed={shown === "all"} disabled={!take || ratios.length < 2} onClick={() => setView("all")}>
              All
            </button>
          </div>
          <span className="spacer" />
          <div className="seg">
            <button aria-pressed={picking} disabled={!take} onClick={() => setPicking((on) => !on)} title="Click elements in the ad to inspect them (V)">
              Select
            </button>
            <button aria-pressed={safe} disabled={!take} onClick={() => setSafe((on) => !on)} title="Show the safe areas the checks use">
              Safe areas
            </button>
          </div>
        </div>
        {take && take.frames > 0 ? (
          <Viewer
            take={take}
            ratios={shown === "all" ? ratios : [shown]}
            frame={frame}
            playing={playing}
            picking={picking}
            safe={safe}
            reloadKey={reloadKey}
            selectedLoc={selection?.kind === "el" ? selection.el.loc : undefined}
            onFrame={setFrame}
            onEnded={() => setPlaying(false)}
            onKey={(key) => keys.current(key as unknown as KeyboardEvent)}
            onSelected={(el) => {
              // After a breadcrumb pick only the loc is known; the viewer's next report fills in the rest.
              if (selection?.kind === "el" && selection.stale && el.loc === selection.el.loc) setSelection({ ...selection, el, stale: false });
            }}
            onPick={(el, ratio) => {
              if (!el) return setSelection(null);
              setSelection({ kind: "el", el, ratio });
              setRightTab((tab) => (tab === "effects" ? tab : "inspect"));
            }}
            banner={banner}
            api={viewerApi}
            placement={placement}
            onTransform={transform}
            onEditText={() => (setRightTab("inspect"), setTextFocus((key) => key + 1))}
          />
        ) : take ? (
          <div className="viewer-area empty-viewer">
            <p>No length yet. The voice and its timeline come first: .venv/Scripts/python py/mv.py build {take.name}</p>
          </div>
        ) : (
          <PitchViewer ad={ad} frame={frame} fps={30} playing={playing} onFrame={setFrame} onEnded={() => setPlaying(false)} />
        )}
        {total > 1 && <Scrubber frame={frame} total={total} starts={starts} onSeek={(f) => (setPlaying(false), setFrame(f))} />}
        <div className="transport-bar">
          <span className="tc">{timecode(frame, fps)}</span>
          <span className="tc dim">/ {timecode(total, fps)}</span>
          <span className="spacer" />
          <button className="tbtn" onClick={() => (setPlaying(false), setFrame(starts[Math.max(0, clipAt(frame) - (frame > starts[clipAt(frame)] ? 0 : 1))] ?? 0))} title="Previous scene (↑)">
            ⏮
          </button>
          <button className="tbtn" onClick={() => (setPlaying(false), setFrame(Math.max(0, frame - 1)))} title="Back a frame (←)">
            ‹
          </button>
          <button className="tbtn play" onClick={() => setPlaying((on) => !on)} disabled={!take?.frames && !ad?.animatic} title="Play (Space)">
            {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <button className="tbtn" onClick={() => (setPlaying(false), setFrame(Math.min(total - 1, frame + 1)))} title="Forward a frame (→)">
            ›
          </button>
          <button className="tbtn" onClick={() => (setPlaying(false), setFrame(starts[clipAt(frame) + 1] ?? total - 1))} title="Next scene (↓)">
            ⏭
          </button>
          <span className="spacer" />
          <span className="tc dim">
            f {frame} · {fps} fps
          </span>
        </div>
      </main>

      <Timeline
        clips={clips}
        cues={take?.cues ?? []}
        fps={take ? fps : 30}
        frame={frame}
        selected={selection?.kind === "clip" ? selection.id : undefined}
        editable={editable}
        transitions={story.transitions}
        onTransition={(id) => {
          setSelection({ kind: "clip", id });
          setRightTab("effects");
        }}
        dir={take?.dir ?? "ltr"}
        onSeek={(f) => (setPlaying(false), setFrame(f))}
        onSelect={(id) => {
          setSelection({ kind: "clip", id });
          setRightTab((tab) => (tab === "effects" ? tab : "inspect"));
        }}
        onReorder={reorder}
        onTrim={trimScene}
        onSeconds={(id, seconds) => changeImage(id, { seconds })}
        onDropFiles={take && project ? addFiles : undefined}
      />

      <aside className="studio-right">
        <div className="ptabs">
          <button className={`ptab${rightTab === "inspect" ? " on" : ""}`} onClick={() => setRightTab("inspect")}>
            Inspect
          </button>
          <button className={`ptab${rightTab === "effects" ? " on" : ""}`} onClick={() => setRightTab("effects")}>
            Effects
          </button>
          <button className={`ptab${rightTab === "history" ? " on" : ""}`} onClick={() => setRightTab("history")}>
            History
          </button>
          <button className={`ptab${rightTab === "agent" ? " on" : ""}`} onClick={() => setRightTab("agent")}>
            <SparkIcon size={13} /> Agent {(project?.running || run?.running) && <span className="working-dot" />}
          </button>
        </div>
        <div className="studio-right-body" hidden={rightTab !== "inspect"}>
          <Inspector
            take={take}
            slug={project?.slug}
            ratio={selection?.kind === "el" ? selection.ratio : ratioShown}
            el={picked}
            source={source}
            failed={sourceFailed}
            onEdit={editSource}
            onPreview={preview}
            textFocus={textFocus}
            onEffects={() => setRightTab("effects")}
            effects={picked ? describeFx(fxOf(source).value) : selectedClip ? describeTransition(story.transitions[selectedClip.id], fps) : undefined}
            tune={tune}
            onKnob={setKnob}
            scene={
              selectedClip && selectedClip.kind !== "row"
                ? { id: selectedClip.id, name: selectedClip.name, kind: selectedClip.kind, frames: selectedClip.frames, fps, onStory: story.order.includes(selectedClip.id), trimIn: selectedClip.trimIn, full: selectedClip.full, image: story.images[selectedClip.id] }
                : undefined
            }
            onAsk={(about) => {
              if (selectionChip) setAsked((list) => [...list.filter((chip) => chip.key !== selectionChip.key), selectionChip]);
              setRightTab("agent");
              setFocusKey((key) => key + 1);
              void about;
            }}
            onSelectLoc={(loc) => {
              if (selection?.kind === "el") setSelection({ ...selection, stale: true, el: { ...selection.el, loc, knobs: [], knobInfo: {}, path: selection.el.path.filter((item) => item.loc !== loc) } });
            }}
            onTrim={trimScene}
            onImage={changeImage}
            onToggleStory={toggleStory}
            onRemoveImage={removeImage}
            onEdited={() => setError("")}
            onlyOne={story.order.length <= 1}
          />
        </div>
        <div className="studio-right-body" hidden={rightTab !== "effects"}>
          <EffectsPanel
            el={picked}
            elementProps={picked ? { source, onEdit: editSource, localFrame: Math.max(0, frame - (starts[clipAt(frame)] ?? 0) + (clips[clipAt(frame)]?.trimIn ?? 0)), fps } : undefined}
            scene={(() => {
              const target = selectedClip ?? (selection ? undefined : current);
              if (!target || target.kind === "row") return undefined;
              const i = clips.findIndex((item) => item.id === target.id);
              return {
                scene: { id: target.id, name: target.name, frames: target.frames },
                prev: i > 0 ? { id: clips[i - 1].id, name: clips[i - 1].name } : undefined,
                transition: story.transitions[target.id],
                fps,
                onTransition: setTransition,
                editable: editable && i >= 0,
              };
            })()}
            hint="Pick an element in the viewer for its entrance, loop and exit, or a scene on the timeline for the transition into it."
          />
        </div>
        <div className="studio-right-body" hidden={rightTab !== "history"}>
          <HistoryPanel history={history} onMoved={afterTravel} />
        </div>
        <div className="studio-right-body chat-host" hidden={rightTab !== "agent"}>
          <Chat
            query={project?.folder ? `folder=${encodeURIComponent(project.folder)}` : project ? `slug=${encodeURIComponent(project.slug)}` : run ? `run=${run.thread ?? run.id}` : null}
            title="ad-agent"
            subtitle={project?.brand ? `${project.brand} · ${project.kind === "asset" ? "asset" : "video"}` : project?.kind === "asset" ? "asset" : undefined}
            quick={quick}
            chips={chips}
            onRemoveChip={(key) => {
              setAsked((list) => list.filter((chip) => chip.key !== key));
              if (key === selectionChip?.key) setSelection(null);
            }}
            note={note}
            onSent={() => {
              setNote(undefined);
              setAsked([]);
            }}
            ask={ask}
            uploadTo={project?.folder ? `folder:${project.folder}` : undefined}
            placeholder={state === "pitch" ? "Notes on the pitch, or say go" : state === "first-look" ? "Notes on what you saw" : "Ask the agent"}
            focusKey={focusKey}
            empty={
              <>
                <p>Click anything in the viewer, or a scene on the timeline, and it comes with your message, with the frame you're on.</p>
                <p>Drag scenes on the timeline to change the order. Drop your own images or clips there to put them in the video.</p>
              </>
            }
          />
        </div>
      </aside>

      {reader && ad && <Reader ad={ad} open={reader} onClose={() => setReader(undefined)} />}
      {publishing && ad && <PublishDialog folder={ad.folder} go={go} onClose={() => setPublishing(false)} />}
    </div>
  );
}
