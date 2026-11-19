import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { findVideo } from "../registry";
import type { Video } from "./ad";
import { installPageApi } from "./page-api";
import { Stage } from "./Stage";

/** capture.html?id=<id>: the bare stage that Playwright seeks and screenshots. `&thumbnail` shows the ad's cover image. */
function Capture({ video }: { video: Video }) {
  const [frame, setFrame] = useState(0);
  useLayoutEffect(() => installPageApi(video, (f) => flushSync(() => setFrame(f))), [video]);
  return <Stage video={video} frame={frame} />;
}

const query = new URLSearchParams(location.search);
const id = query.get("id") ?? "";
const found = findVideo(id);
if (!found) throw new Error(`no video "${id}"`);
// The cover is one still at the video's size: the same stage, with the thumbnail in place of the ad, on frame 0.
if (query.has("thumbnail") && !found.thumbnail) throw new Error(`${id} has no thumbnail on its registry line`);
const video: Video = query.has("thumbnail") ? { ...found, component: found.thumbnail!, frames: 1, cues: [] } : found;
createRoot(document.getElementById("root")!).render(<Capture video={video} />);
