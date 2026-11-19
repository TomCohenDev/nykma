import { random, Sequence, useFrame, type AdProps, type Layout } from "../../engine";
import { easings, interpolate, prog } from "../../parts";
import { Three } from "../../parts/Three";

/**
 * The test ad for `<Three>` (.claude/guides/3d.md): 64 cubes fly in from seeded places and settle into a 4×4×4 cube
 * while the camera turns round it. The headline is DOM on top, so validate reads it. 3 s, 1:1 and 9:16.
 */
export const FRAMES = 90;
const N = 4;
const GAP = 1.15;

const L: Layout<{ size: number; top: number; pad: number; distance: number; lift: number }> = {
  "16x9": { size: 96, top: 80, pad: 120, distance: 13, lift: 0.8 },
  "1x1": { size: 92, top: 90, pad: 90, distance: 16, lift: 1.5 },
  "9x16": { size: 104, top: 240, pad: 80, distance: 21, lift: 2.6 },
};

/** `headline={false}` leaves the type off, for the cover to set its own. */
export function ThreeDemo({ ratio, headline = true }: AdProps & { headline?: boolean }) {
  const frame = useFrame();
  const l = L[ratio];
  const title = prog(frame, [40, 62], easings.outCubic);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#14141a", overflow: "hidden" }}>
      <Three
        setup={({ THREE, scene }) => {
          scene.add(new THREE.AmbientLight("#ffffff", 0.5));
          const key = new THREE.DirectionalLight("#ffffff", 2.2);
          key.position.set(5, 8, 6);
          scene.add(key);
          const rim = new THREE.DirectionalLight("#8b6cff", 1.4);
          rim.position.set(-6, -2, -5);
          scene.add(rim);
          const geometry = new THREE.BoxGeometry(1, 1, 1);
          const cubes = Array.from({ length: N ** 3 }, (_, i) => {
            const cell = [i % N, Math.floor(i / N) % N, Math.floor(i / N ** 2)].map((k) => (k - (N - 1) / 2) * GAP);
            const from = [0, 1, 2].map((axis) => (random(`from-${i}-${axis}`) - 0.5) * 30);
            const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: random(`tint-${i}`) > 0.85 ? "#8b6cff" : "#e9e7f2", roughness: 0.45 }));
            scene.add(mesh);
            return { mesh, cell, from, delay: random(`delay-${i}`) * 18 };
          });
          return { cubes };
        }}
        draw={(f, { cubes }, { camera }) => {
          for (const { mesh, cell, from, delay } of cubes) {
            const k = prog(f, [delay, delay + 34], easings.outCubic);
            mesh.position.set(...(cell.map((c, axis) => from[axis] + (c - from[axis]) * k) as [number, number, number]));
            mesh.rotation.set((1 - k) * 3, (1 - k) * 2, 0);
          }
          const turn = interpolate(f, [0, FRAMES - 1], [0.9, -0.35], { ease: easings.inOutSine });
          camera.position.set(Math.sin(turn) * l.distance, l.distance * 0.45, Math.cos(turn) * l.distance);
          // Looking above the cube sets it lower in the frame, under the headline.
          camera.lookAt(0, l.lift, 0);
        }}
      />
      {headline && <div
        style={{
          position: "absolute",
          top: l.top,
          left: l.pad,
          right: l.pad,
          color: "#f4f2fb",
          font: `700 ${l.size}px/1.05 "Segoe UI", Arial, sans-serif`,
          opacity: title,
          transform: `translateY(${(1 - title) * 30}px)`,
        }}
      >
        Every frame, a function.
      </div>}
    </div>
  );
}

/**
 * The cover: the settled cube from the ad's last frame (a Sequence that starts before 0 shows that moment), with one
 * short line, bigger and bolder than the ad has room for, because a cover is read small, in a grid, without motion.
 */
export function ThreeDemoThumbnail({ ratio }: AdProps) {
  const l = L[ratio];
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Sequence from={-(FRAMES - 1)}>
        <ThreeDemo ratio={ratio} headline={false} />
      </Sequence>
      <div
        style={{
          position: "absolute",
          top: l.top,
          left: l.pad,
          color: "#14141a",
          background: "#8b6cff",
          font: `800 ${Math.round(l.size * 1.25)}px/1 "Segoe UI", Arial, sans-serif`,
          padding: "16px 26px 22px",
          whiteSpace: "nowrap",
        }}
      >
        3D, in code.
      </div>
    </div>
  );
}
