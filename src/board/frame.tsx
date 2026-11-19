/**
 * board.html?id=<video id>&scene=<scene id>&f=<frame>: one scene at its exact size, for the desk's board (spec.md §10.3).
 * The desk shows it in an iframe, so a broken ad breaks only its own frames. The parent sends the frame to show:
 *   parent → frame   { nykma: "frame", frame }
 *   frame → parent   { nykma: "ready", frames }  or  { nykma: "error", message }
 * The registry is imported dynamically, so even an ad that fails to load reports back instead of a blank frame.
 */
import { Component, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Video } from "../engine/ad";
import { Stage } from "../engine/Stage";

const params = new URLSearchParams(location.search);
const tell = (message: object) => parent.postMessage({ nykma: "board", ...message }, location.origin);

window.addEventListener("error", (event) => tell({ type: "error", message: event.message }));
window.addEventListener("unhandledrejection", (event) => tell({ type: "error", message: String(event.reason?.message ?? event.reason) }));

class Guard extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    tell({ type: "error", message: error.message });
  }
  render() {
    return this.state.error ? <div className="scene-error">{this.state.error.message}</div> : this.props.children;
  }
}

function Scene({ video }: { video: Video }) {
  const [frame, setFrame] = useState(Number(params.get("f")) || 0);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin === location.origin && event.data?.nykma === "frame") setFrame(Number(event.data.frame) || 0);
    };
    window.addEventListener("message", onMessage);
    tell({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <Guard>
      <Stage video={video} frame={frame} />
    </Guard>
  );
}

const root = createRoot(document.getElementById("root")!);
const fail = (message: string) => {
  root.render(<div className="scene-error">{message}</div>);
  tell({ type: "error", message });
};

import("../registry")
  .then(({ findVideo }) => {
    sessionStorage.removeItem(`nykma.reloaded:${location.search}`);
    const video = findVideo(params.get("id") ?? "");
    if (!video) return fail(`No video "${params.get("id")}" in the registry.`);
    const sceneId = params.get("scene");
    const scene = sceneId ? video.scenes.find((item) => item.id === sceneId) : undefined;
    if (sceneId && !scene) return fail(`${video.slug} has no scene "${sceneId}".`);
    // A scene alone: its own component, its own frames from 0. The rest of the video stays as it is, so useVideo() matches the render.
    root.render(<Scene video={scene ? { ...video, component: scene.component } : video} />);
  })
  .catch((error) => {
    // Vite rebuilt its dependency cache since this page loaded, so its imports are stale. One reload fetches the new
    // ones; a second failure is a real error and is shown.
    const key = `nykma.reloaded:${location.search}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      return location.reload();
    }
    sessionStorage.removeItem(key);
    fail(`The registry didn't load: ${error?.message ?? error}`);
  });
