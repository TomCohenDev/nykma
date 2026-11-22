import { useLayoutEffect, useRef } from "react";
import type { Video } from "./ad";
import { applyFx } from "./fx";
import { FrameContext, VideoContext } from "./timing";

/**
 * Mounts an ad at its exact output size, in its language and direction, on a given frame. After every commit it
 * applies the `data-fx` effects (fx.ts) for that frame, before the browser paints: in the layout effect for a new frame
 * (so `seek`'s flushSync has them before its screenshot), and from a MutationObserver for a commit inside the ad alone,
 * like a knob changing or something that finished loading.
 */
export function Stage({ video, frame }: { video: Video; frame: number }) {
  const { component: Ad, ratio, take, width, height, lang, dir } = video;
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (root.current) applyFx(root.current);
  });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    // Our own writes come back here too; applyFx only writes what changed, so they settle at once.
    const observer = new MutationObserver(() => applyFx(el));
    observer.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "data-fx", "data-nykma-frame"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={root} data-nykma-stage data-nykma-frame={frame} data-nykma-length={video.frames} lang={lang} dir={dir} style={{ position: "relative", width, height, overflow: "hidden", background: "#000" }}>
      <VideoContext.Provider value={video}>
        <FrameContext.Provider value={frame}>
          <Ad ratio={ratio} take={take} />
        </FrameContext.Provider>
      </VideoContext.Provider>
    </div>
  );
}
