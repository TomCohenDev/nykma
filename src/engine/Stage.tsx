import type { Video } from "./ad";
import { FrameContext, VideoContext } from "./timing";

/** Mounts an ad at its exact output size, in its language and direction, on a given frame. */
export function Stage({ video, frame }: { video: Video; frame: number }) {
  const { component: Ad, ratio, take, width, height, lang, dir } = video;
  return (
    <div data-nykma-stage lang={lang} dir={dir} style={{ position: "relative", width, height, overflow: "hidden", background: "#000" }}>
      <VideoContext.Provider value={video}>
        <FrameContext.Provider value={frame}>
          <Ad ratio={ratio} take={take} />
        </FrameContext.Provider>
      </VideoContext.Provider>
    </div>
  );
}
