import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Video } from "../engine/ad";
import { installPageApi } from "../engine/page-api";
import { Stage } from "../engine/Stage";
import { videos, findVideo } from "../registry";
import { Sound } from "./sound";
import "./preview.css";

const sound = new Sound();

const family = (video: Video) => (video.take ? `${video.slug}-${video.take}` : video.slug);
const families = [...new Set(videos.map(family))];
/** ?embed: the desk's Play overlay. No picker, and ?play starts it playing. */
const embed = new URLSearchParams(location.search).has("embed");
const autoplay = new URLSearchParams(location.search).has("play");

function fromUrl() {
  const params = new URLSearchParams(location.search);
  return { video: findVideo(params.get("id") ?? "") ?? videos[0], frame: Number(params.get("f")) || 0 };
}

function Preview() {
  const [video, setVideo] = useState(() => fromUrl().video);
  const [frame, setFrame] = useState(() => Math.min(fromUrl().frame, Math.max(video.frames - 1, 0)));
  const [playing, setPlaying] = useState(autoplay);
  const [scale, setScale] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const frameNow = useRef(frame);
  frameNow.current = frame;

  useEffect(() => {
    if (embed) document.querySelector<HTMLElement>(".preview")?.focus();
  }, []);

  useLayoutEffect(() => installPageApi(video, (f) => flushSync(() => setFrame(f))), [video]);

  useEffect(() => {
    if (playing) return;
    history.replaceState(null, "", `?id=${video.id}&f=${frame}${embed ? "&embed" : ""}`);
  }, [video, frame, playing]);

  useLayoutEffect(() => {
    const fit = () => {
      const box = viewport.current!.getBoundingClientRect();
      setScale(Math.min(box.width / video.width, box.height / video.height));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, [video]);

  useEffect(() => {
    if (!playing) return;
    let stopped = false;
    let raf = 0;
    const playFrom = async (from: number) => {
      const origin = await sound.play(video, from);
      if (stopped) return sound.stop();
      const tick = () => {
        const f = from + Math.floor((sound.now() - origin) * video.fps);
        if (f >= video.frames) {
          sound.stop();
          return void playFrom(0);
        }
        setFrame(Math.max(f, from));
        raf = requestAnimationFrame(tick);
      };
      tick();
    };
    void playFrom(frameNow.current >= video.frames - 1 ? 0 : frameNow.current);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      sound.stop();
    };
  }, [playing, video]);

  const show = (next: Video, f = frame) => {
    setPlaying(false);
    setVideo(next);
    setFrame(Math.min(f, Math.max(next.frames - 1, 0)));
  };
  const step = (by: number) => {
    setPlaying(false);
    setFrame(Math.min(Math.max(frame + by, 0), video.frames - 1));
  };
  const onKey = (event: KeyboardEvent) => {
    const by = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowRight") step(by);
    else if (event.key === "ArrowLeft") step(-by);
    else if (event.key === " ") setPlaying((on) => !on);
    else return;
    event.preventDefault();
  };

  const ratios = videos.filter((other) => family(other) === family(video));
  return (
    <div className={`preview${embed ? " embed" : ""}`} tabIndex={0} onKeyDown={onKey}>
      <header hidden={embed}>
        <label>
          Ad
          <select
            value={family(video)}
            onChange={(event) => show(videos.find((other) => family(other) === event.target.value)!, 0)}
          >
            {families.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <div className="ratios" role="group" aria-label="Ratio">
          {ratios.map((other) => (
            <button key={other.id} aria-pressed={other.id === video.id} onClick={() => show(other)}>
              {other.ratio}
            </button>
          ))}
        </div>
        <span className="id">{video.id}</span>
      </header>

      <main ref={viewport}>
        {video.frames ? (
          <div className="fit" style={{ width: video.width * scale, height: video.height * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
              <Stage video={video} frame={frame} />
            </div>
          </div>
        ) : (
          <p>No length yet. Run: .venv/Scripts/python py/mv.py build {video.slug}</p>
        )}
      </main>

      <footer>
        <button onClick={() => setPlaying((on) => !on)} disabled={!video.frames}>
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => step(-1)} aria-label="Previous frame">
          ‹
        </button>
        <button onClick={() => step(1)} aria-label="Next frame">
          ›
        </button>
        <input
          type="range"
          aria-label="Frame"
          min={0}
          max={Math.max(video.frames - 1, 0)}
          value={frame}
          onChange={(event) => {
            setPlaying(false);
            setFrame(Number(event.target.value));
          }}
        />
        <output>
          {frame} / {video.frames - 1} · {(frame / video.fps).toFixed(2)}s
        </output>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
