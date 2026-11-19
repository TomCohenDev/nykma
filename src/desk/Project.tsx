/** A project: the top bar, scenes and files on the left, the board in the middle, the chat on the right (spec.md §10.2). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board, type BoardHandle, type BoardItem } from "./Board";
import { Chat, type Chip, type Quick } from "./Chat";
import { BackIcon, ChevronIcon, CloseIcon, FileIcon, FilmIcon, FrameIcon, PlayIcon, RenderIcon } from "./icons";
import { Markdown } from "./md";
import { imageSeconds } from "../engine/ad";
import { addImages, imageId, normalize, toStory, type Place, type StoryState } from "./story";
import { GeneratedPanel } from "./Generated";
import { RATIOS, SIZES, STATE_LABEL, media, post, ratioLabel, seconds, storyboardImage, upload, useEscape, type Ad, type Project, type Ratio, type Run, type TakeInfo, type View } from "./api";

const VIDEO_FILE = /\.(mov|mp4|m4v|webm|mkv|avi)$/i;

type Props = {
  project?: Project;
  /** A new project whose agent hasn't made its folder yet. */
  run?: Run;
  go: (hash: string) => void;
  refresh: () => void;
  registryError?: string;
};

const savedView = (): View => (localStorage.getItem("nykma.view") as View) || "16x9";

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
          {playing ? "❚❚" : <PlayIcon size={14} />}
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

/** The whole story with sound, in the preview page. A pitch plays its animatic. */
function Player({ src, video, ratio, onClose }: { src?: string; video?: string; ratio: Ratio; onClose: () => void }) {
  const { width, height } = SIZES[ratio];
  useEscape(onClose);
  const k = Math.min((innerWidth * 0.86) / width, (innerHeight * 0.8 - 56) / height);
  return (
    <div className="overlay-veil" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="player" role="dialog" aria-label="Play">
        <button className="icon-button player-close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
        {src ? (
          <iframe title="Play" src={src} style={{ width: width * k, height: height * k + 56 }} />
        ) : (
          video && <video src={video} controls autoPlay style={{ width: width * k, height: height * k }} />
        )}
      </div>
    </div>
  );
}

export function ProjectView({ project, run, go, refresh, registryError }: Props) {
  const info = project?.info;
  const ad = project?.ad;
  const [takeName, setTakeName] = useState(info?.takes[0]?.name);
  const take: TakeInfo | undefined = info?.takes.find((item) => item.name === takeName) ?? info?.takes[0];
  const [view, setView] = useState<View>(savedView);
  const ratios = (take?.ratios.map((item) => item.ratio) ?? ["16x9"]) as Ratio[];
  const shown: View = view === "all" || ratios.includes(view) ? view : ratios[0];
  const board = useRef<BoardHandle>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomMenu, setZoomMenu] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [frames, setFrames] = useState<Record<string, number>>({});
  const [reader, setReader] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState<string>();
  const [error, setError] = useState("");
  const [unpacking, setUnpacking] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const lastWrite = useRef(0);

  useEffect(() => localStorage.setItem("nykma.view", view), [view]);

  /* The story: from disk, unless the board just wrote it. Images on the board come from it too, not the registry. */
  const codeScenes = take?.scenes.filter((scene) => !scene.image) ?? [];
  const ids = codeScenes.map((scene) => scene.id);
  const pitchIds = ad?.storyboard.map((row) => `row-${row.number}`) ?? [];
  const fresh = useCallback(
    (): StoryState => (take ? normalize(ids, take.story) : normalize(pitchIds)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [take?.name, JSON.stringify(take?.story), ids.join(), pitchIds.join()],
  );
  const [story, setStory] = useState<StoryState>(fresh);
  useEffect(() => {
    if (Date.now() - lastWrite.current > 2500) setStory(fresh());
  }, [fresh]);
  const storyNow = useRef(story);
  storyNow.current = story;
  const imageCount = Object.keys(story.images).length;
  // Arrows mean something once there are two things to order: scenes, or one component and an image.
  const editable = Boolean(take) && ((Boolean(take!.hasScenes) && codeScenes.length > 1) || imageCount > 0);

  const saveStory = (next: StoryState, commit: boolean) => {
    const before = story.order.join(" → ");
    setStory(next);
    if (!commit || !take || !project) return;
    lastWrite.current = Date.now();
    post("/api/story", { slug: project.slug, take: take.take, story: toStory(next) }).catch((failure) => setError(failure.message));
    const after = next.order.join(" → ");
    if (after !== before) {
      const names = next.order.map((id) => next.images[id]?.name ?? take.scenes.find((scene) => scene.id === id)?.name ?? id);
      setNote(`I changed the story on the board. It now plays: ${names.join(" → ")} (saved in src/ads/${project.slug}/story${take.take ? `-${take.take}` : ""}.json).`);
    }
  };

  /* What's on the board. */
  const items: BoardItem[] = useMemo(() => {
    if (take) {
      const videoIds = Object.fromEntries(take.ratios.map((item) => [item.ratio, item.id]));
      const scenes: BoardItem[] = codeScenes.map((scene) => ({
        id: scene.id,
        name: scene.name,
        sub: take.kind === "asset" ? "still" : scene.frames ? seconds(scene.frames, take.fps) : "no length yet",
        frames: scene.frames,
        fps: take.fps,
        scene: { videoIds },
      }));
      const images: BoardItem[] = Object.entries(story.images).map(([id, image]) => {
        const length = imageSeconds(image);
        if (image.clip)
          return {
            id,
            name: image.name ?? id,
            sub: `clip · ${Math.round(length * 10) / 10} s`,
            frames: Math.max(1, Math.round(length * take.fps)),
            fps: take.fps,
            clip: { src: `/${image.src}`, fps: image.clip.fps, frames: image.clip.frames, from: image.clip.from ?? 0, fit: image.fit ?? "cover" },
          };
        return {
          id,
          name: image.name ?? id,
          sub: take.kind === "asset" ? "image" : `image · ${length} s`,
          frames: take.kind === "asset" ? 1 : Math.round(length * take.fps),
          fps: take.fps,
          image: { src: `/${image.src}`, fit: image.fit ?? "cover", seconds: length },
        };
      });
      return [...scenes, ...images];
    }
    return (ad?.storyboard ?? []).map((row) => ({
      id: `row-${row.number}`,
      name: row.happens.split(/[.!?\n]/)[0].slice(0, 48) || `Row ${row.number}`,
      sub: row.time,
      frames: 0,
      fps: 30,
      card: { image: row.image ? storyboardImage(row.image, ad!.folder, ad!.brand) : undefined, happens: row.happens, text: row.text, voice: row.voice, time: row.time },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take, ad, story.images]);

  // Each scene opens on a frame from its middle, where most scenes have something on screen.
  useEffect(() => {
    setFrames((current) => {
      const next = { ...current };
      for (const item of items) if (next[item.id] === undefined || next[item.id] >= Math.max(item.frames, 1)) next[item.id] = Math.floor(item.frames / 2);
      return next;
    });
  }, [items]);

  const onFrame = useCallback((id: string, frame: number) => setFrames((current) => ({ ...current, [id]: frame })), []);

  /* Chat context. */
  const ratioShown = shown === "all" ? ratios[0] : shown;
  const chips: Chip[] = selected.flatMap((id) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return [];
    const frame = frames[id] ?? 0;
    return [
      {
        key: id,
        label: item.scene ? `@${item.name} · f${frame}` : `@${item.name}`,
        context: item.clip
          ? `I'm looking at \`${id}\`, a video clip I put on the board (frames public${item.clip.src}, ${item.sub}), at frame ${frame} of ${item.frames}.`
          : item.scene
          ? `I'm looking at scene \`${id}\` ("${item.name}") in ${shown === "all" ? "every ratio" : ratioShown}, at frame ${frame} of ${item.frames} (scene-local).`
          : item.image
            ? `I'm looking at \`${id}\`, an image I put on the board (public${item.image.src}, shown ${item.image.seconds} s, ${item.image.fit === "contain" ? "fitted on black" : "filling the frame"}).`
            : `I'm looking at storyboard row ${id.slice(4)} ("${item.name}", ${item.sub}).`,
      },
    ];
  });

  const ask = async (text: string, shown: string) => {
    if (run && !project) return post("/api/ask", { after: run.id, text, shown });
    if (!project) throw new Error("There's no project yet.");
    await post("/api/ask", project.folder ? { folder: project.folder, text, shown } : { slug: project.slug, text, shown });
    refresh();
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

  /**
   * Uploads images to public/ads/<slug>/board/ and puts them on the board, off the story until you draw an arrow.
   * A video clip goes to public/ads/<slug>/footage/ and is unpacked to frames first (spec.md §6.5).
   */
  const addBoardImages = async (files: File[], places: Place[]) => {
    if (!take || !project) return;
    setError("");
    const taken = new Set([...ids, ...Object.keys(story.images)]);
    const added: Parameters<typeof addImages>[1] = [];
    for (const [i, file] of files.entries()) {
      if (file.type.startsWith("video/") || VIDEO_FILE.test(file.name)) {
        try {
          setUnpacking(`Uploading ${file.name}…`);
          const path = await upload(file, `footage:${project.slug}`);
          setUnpacking(`Unpacking ${file.name} into frames. A long clip takes a minute…`);
          const clip = await post("/api/footage", { slug: project.slug, file: path });
          const id = imageId(clip.name, taken, "clip");
          taken.add(id);
          const name = file.name.replace(/\.[^.]+$/, "");
          added.push({ id, image: { src: clip.src, name, clip: { fps: clip.fps, frames: clip.frames, ...(clip.sound ? { sound: clip.sound } : {}) } }, place: places[i] });
        } catch (failure) {
          setError((failure as Error).message);
        } finally {
          setUnpacking("");
        }
        continue;
      }
      try {
        const path = await upload(file, `board:${project.slug}`);
        const src = path.replace(/^public\//, "");
        const id = imageId(src.split("/").pop()!, taken);
        taken.add(id);
        added.push({ id, image: { src, name: file.name.replace(/\.[^.]+$/, "") }, place: places[i] });
      } catch (failure) {
        setError((failure as Error).message);
      }
    }
    if (!added.length) return;
    saveStory(addImages(storyNow.current, added), true); // the story as it is now, not when the uploads began
    setSelected(added.map((item) => item.id));
  };

  const render = () => {
    if (!project) return;
    setError("");
    post("/api/render", { slug: project.slug, folder: project.folder }).then(refresh, (failure) => setError(failure.message));
  };

  const playId = take?.ratios.find((item) => item.ratio === ratioShown)?.id ?? take?.ratios[0]?.id;
  const canPlay = Boolean((take && take.frames > 0) || ad?.animatic);
  const totalSeconds = take && take.frames ? seconds(take.frames, take.fps) : undefined;
  const offStory = editable ? items.filter((item) => !story.order.includes(item.id)) : [];
  const storyItems = editable ? story.order.map((id) => items.find((item) => item.id === id)!).filter(Boolean) : items;
  // Timed by its audio: the scenes in a new order, or an image pushing them later, put the voice out of time.
  const codeOrder = story.order.filter((id) => ids.includes(id));
  const imageOnStory = story.order.some((id) => story.images[id]);
  const reordered = editable && take?.audioTimed && (codeOrder.join() !== ids.join() || (take.hasScenes && imageOnStory));
  const name = project?.slug ?? "New project";
  const state = project?.state;

  return (
    <div className="project">
      <header className="topbar">
        <div className="topbar-left">
          <button className="ghost back" onClick={() => go("#/")} title="All projects">
            <BackIcon />
          </button>
          <span className="crumb" onClick={() => go("#/")}>Projects</span>
          <span className="crumb-sep">/</span>
          <h1 className="crumb-here">{name}</h1>
          {state && <span className={`state ${state}`}>{STATE_LABEL[state]}</span>}
          {project?.running && <span className="working-dot" title="The agent is working" />}
        </div>
        <div className="topbar-mid">
          {info && info.takes.length > 1 && (
            <select className="take-select" value={take?.name} onChange={(event) => setTakeName(event.target.value)} aria-label="Take">
              {info.takes.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.take ? `Take ${item.take}` : "Main take"}
                </option>
              ))}
            </select>
          )}
          <div className="segmented" role="group" aria-label="Ratio">
            {RATIOS.map((ratio) => (
              <button key={ratio} aria-pressed={shown === ratio} disabled={!take || !ratios.includes(ratio)} onClick={() => setView(ratio)}>
                {ratioLabel(ratio)}
              </button>
            ))}
            <button aria-pressed={shown === "all"} disabled={!take || ratios.length < 2} onClick={() => setView("all")}>
              All
            </button>
          </div>
        </div>
        <div className="topbar-right">
          <button className="ghost" disabled={!canPlay} onClick={() => setPlaying(true)} title="Play the whole story with sound">
            <PlayIcon size={12} /> Play
          </button>
          <button className="primary" disabled={!take || !take.frames} onClick={render} title={take?.kind === "asset" ? "Render every ratio to PNG, no agent" : "Render every ratio to MP4, no agent"}>
            <RenderIcon size={14} /> Render
          </button>
          <div className="zoom">
            <button className="ghost" onClick={() => setZoomMenu((on) => !on)}>
              {Math.round(zoom * 100)}% <ChevronIcon size={12} />
            </button>
            {zoomMenu && (
              <div className="menu right" onPointerLeave={() => setZoomMenu(false)}>
                <button onClick={() => (board.current?.zoomBy(1.25), setZoomMenu(false))}>Zoom in <kbd>+</kbd></button>
                <button onClick={() => (board.current?.zoomBy(0.8), setZoomMenu(false))}>Zoom out <kbd>−</kbd></button>
                <button onClick={() => (board.current?.fit(), setZoomMenu(false))}>Zoom to fit <kbd>⇧1</kbd></button>
                <button onClick={() => (board.current?.fitSelection(), setZoomMenu(false))}>Zoom to selection <kbd>⇧2</kbd></button>
                <button onClick={() => (board.current?.zoomTo(1), setZoomMenu(false))}>Zoom to 100% <kbd>⇧0</kbd></button>
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className="left-panel">
        {ad?.idea && (
          <section className="panel-section idea" dir="auto">
            {ad.idea}
          </section>
        )}
        <section className="panel-section">
          <h3>
            {take ? (take.kind === "asset" ? "Images" : "Scenes") : "Storyboard"}
            <span className="count">{totalSeconds ?? (items.length || "")}</span>
          </h3>
          {items.length === 0 && <p className="panel-empty">{run?.running ? "The agent is working on it." : "Nothing on the board yet."}</p>}
          <ol className="layer-list">
            {storyItems.map((item, i) => (
              <li key={item.id}>
                <button
                  className={selected.includes(item.id) ? "on" : ""}
                  onClick={(event) => {
                    setSelected(event.shiftKey ? [...new Set([...selected, item.id])] : [item.id]);
                    board.current?.focus(item.id);
                  }}
                >
                  <span className="layer-n">{editable || !take ? i + 1 : <FrameIcon size={12} />}</span>
                  <span className="layer-name" dir="auto">{item.name}</span>
                  <span className="layer-sub">{item.sub}</span>
                </button>
              </li>
            ))}
          </ol>
          {offStory.length > 0 && (
            <>
              <h4>Off the story</h4>
              <ol className="layer-list off">
                {offStory.map((item) => (
                  <li key={item.id}>
                    <button
                      className={selected.includes(item.id) ? "on" : ""}
                      onClick={() => {
                        setSelected([item.id]);
                        board.current?.focus(item.id);
                      }}
                    >
                      <span className="layer-n">–</span>
                      <span className="layer-name" dir="auto">{item.name}</span>
                      <span className="layer-sub">{item.sub}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
        {project && (
          <GeneratedPanel
            slug={project.slug}
            onRetake={(id, note) =>
              ask(
                `Retake the still "${id}": ${note}

Change its prompt or settings in public/ads/${project.slug}/gen.json to match, run bun run gen ${project.slug} to make it again, and stop. I approve the new still on the desk before any video is made from it.`,
                `Retake ${id}: ${note}`,
              )
            }
          />
        )}
        {ad && (
          <section className="panel-section">
            <h3>Files</h3>
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
          </section>
        )}
        {!info && project && (
          <p className="panel-empty">
            The ad isn't in the registry yet, so the board shows the pitch.
          </p>
        )}
        {registryError && <p className="panel-error">The registry didn't load: {registryError}</p>}
      </aside>

      <main className="board-wrap">
        <Board
          ref={board}
          items={items}
          view={take ? shown : "16x9"}
          ratios={ratios}
          dir={take?.dir ?? "ltr"}
          story={story}
          editable={editable}
          onStory={saveStory}
          selected={selected}
          onSelect={setSelected}
          frames={frames}
          onFrame={onFrame}
          onAsk={(id) => {
            setSelected([id]);
            setFocusKey((key) => key + 1);
          }}
          onAddImages={take && project ? addBoardImages : undefined}
          onZoom={setZoom}
          banner={
            unpacking ? (
              <>{unpacking}</>
            ) : reordered ? (
              <>This ad is timed by its audio, so the new order puts the voice out of order. Ask the agent to rebuild the mix: that spends ElevenLabs credits.</>
            ) : error ? (
              <>{error}</>
            ) : undefined
          }
          empty={
            <div>
              {run?.running || project?.running ? <span className="spinner big" /> : null}
              <p>{run?.running || project?.running ? "The agent is writing the pitch. The board fills in as it works." : "Nothing here yet. Ask the agent in the chat."}</p>
            </div>
          }
        />
      </main>

      <Chat
        query={project?.folder ? `folder=${encodeURIComponent(project.folder)}` : project ? `slug=${encodeURIComponent(project.slug)}` : run ? `run=${run.thread ?? run.id}` : null}
        title="ad-agent"
        subtitle={project?.brand ? `${project.brand} · ${project.kind === "asset" ? "asset" : "video"}` : project?.kind === "asset" ? "asset" : undefined}
        quick={quick}
        chips={chips}
        onRemoveChip={(key) => setSelected((current) => current.filter((id) => id !== key))}
        note={note}
        onSent={() => setNote(undefined)}
        ask={ask}
        uploadTo={project?.folder ? `folder:${project.folder}` : undefined}
        placeholder={state === "pitch" ? "Notes on the pitch, or say go" : state === "first-look" ? "Notes on what you saw" : "Ask the agent"}
        focusKey={focusKey}
        empty={
          <>
            <p>Select scenes on the board to talk about them. They come with your message, with the frame you're on.</p>
            <p>Drag from a scene's edge to another scene to change the story.</p>
            <p>Drop, paste or add (I) your own images or video clips on the board, and draw arrows to put them in the video.</p>
          </>
        }
      />

      {reader && ad && <Reader ad={ad} open={reader} onClose={() => setReader(undefined)} />}
      {playing && (
        <Player
          ratio={take ? ratioShown : "16x9"}
          src={take && take.frames && playId ? `/?id=${encodeURIComponent(playId)}&embed&play` : undefined}
          video={!take && ad?.animatic ? media(ad.folder, ad.animatic) : undefined}
          onClose={() => setPlaying(false)}
        />
      )}
    </div>
  );
}
