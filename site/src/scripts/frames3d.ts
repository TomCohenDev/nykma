// "Every frame is code" on the home page (components/Frames.astro): the same little ad for myapp at 16:9, 1:1 and
// 9:16, each drawn on a canvas from the frame number alone (as Hook.tsx in the code beside it would draw it), and
// shown as three textures turning gently in 3D. Loaded only when the section nears the screen, so the page's first
// load doesn't pay for three.js.
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, SRGBColorSpace, Scene, WebGLRenderer } from "three";

export const FRAMES = 120;
const FPS = 30;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const inOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;

type Ratio = "16x9" | "1x1" | "9x16";
const SIZES: Record<Ratio, [number, number]> = { "16x9": [960, 540], "1x1": [600, 600], "9x16": [540, 960] };

/** One frame of the ad, the way Hook.tsx lays it out at this ratio. */
export function drawAd(ctx: CanvasRenderingContext2D, ratio: Ratio, frame: number) {
  const [w, h] = SIZES[ratio];
  const u = Math.min(w, h) / 100;
  const font = (weight: number, size: number) => `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fbf8f2";
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "alphabetic";

  const pad = 7 * u;
  ctx.fillStyle = "#141414";
  ctx.font = font(800, 5.5 * u);
  ctx.fillText("myapp", pad, pad + 4.5 * u);
  ctx.fillStyle = "rgba(20,20,20,0.4)";
  ctx.font = font(600, 3.6 * u);
  ctx.textAlign = "right";
  ctx.fillText(ratio.replace("x", ":"), w - pad, pad + 4 * u);
  ctx.fillText(`f ${String(frame).padStart(3, "0")}`, w - pad, h - pad + 1 * u);
  ctx.textAlign = "left";

  // h1, data-fx="in:fade-up@12+15"
  const v = outCubic(clamp((frame - 12) / 15));
  const wide = ratio === "16x9";
  const size = wide ? 12 * u : ratio === "1x1" ? 15 * u : 16 * u;
  const top = wide ? 44 * u : ratio === "1x1" ? 34 * u : 56 * u;
  ctx.save();
  ctx.globalAlpha = clamp((frame - 12) / 6);
  ctx.translate(0, (1 - v) * 7 * u);
  ctx.fillStyle = "#141414";
  ctx.font = font(800, size);
  if (wide) ctx.fillText("Free. Forever.", pad, top);
  else {
    ctx.fillText("Free.", pad, top);
    ctx.fillText("Forever.", pad, top + size * 1.02);
  }
  ctx.restore();

  // the week: a day ticks every 6 frames from frame 30
  const days = Math.min(7, Math.max(0, Math.floor((frame - 30) / 6)));
  const box = wide ? 9 * u : ratio === "1x1" ? 10.5 * u : 10.8 * u;
  const gap = wide ? 2.2 * u : 1.6 * u;
  const wy = wide ? 60 * u : ratio === "1x1" ? 60 * u : 104 * u;
  "MTWTFSS".split("").forEach((day, i) => {
    const x = pad + i * (box + gap);
    const done = i < days;
    ctx.beginPath();
    ctx.roundRect(x, wy, box, box, 1.8 * u);
    ctx.fillStyle = done ? "#e8301f" : "#ffffff";
    ctx.fill();
    ctx.lineWidth = Math.max(1, 0.35 * u);
    ctx.strokeStyle = done ? "#e8301f" : "rgba(20,20,20,0.18)";
    ctx.stroke();
    ctx.fillStyle = done ? "#ffffff" : "rgba(20,20,20,0.55)";
    ctx.font = font(700, box * 0.42);
    ctx.textAlign = "center";
    ctx.fillText(day, x + box / 2, wy + box * 0.64);
    ctx.textAlign = "left";
  });

  // the price, data-fx="in:fade@75+12"
  ctx.save();
  ctx.globalAlpha = inOutSine(clamp((frame - 75) / 12));
  ctx.fillStyle = "#141414";
  ctx.font = font(800, wide ? 7 * u : 8 * u);
  const py = wide ? 86 * u : ratio === "1x1" ? 87 * u : 150 * u;
  ctx.fillText("$0 a month", pad, py);
  ctx.restore();

  // a hairline frame, so the edge reads on the dark page
  ctx.strokeStyle = "rgba(20,20,20,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
}

export function start(stage: HTMLElement, readout: { frame: HTMLElement; slider: HTMLInputElement; play: HTMLButtonElement }) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ratios: Ratio[] = ["16x9", "1x1", "9x16"];
  const canvases = ratios.map((ratio) => {
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = SIZES[ratio];
    return canvas;
  });
  const ctxs = canvases.map((canvas) => canvas.getContext("2d")!);

  let frame = still ? 100 : 0;
  let playing = !still;
  let drawn = -1;
  const draw = () => {
    if (frame === drawn) return false;
    drawn = frame;
    ratios.forEach((ratio, i) => drawAd(ctxs[i], ratio, frame));
    readout.frame.textContent = String(frame).padStart(3, "0");
    readout.slider.value = String(frame);
    return true;
  };

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    // No WebGL: the three canvases, flat, side by side.
    stage.classList.add("is-flat");
    readout.play.hidden = true;
    readout.slider.closest("label")!.hidden = true;
    canvases.forEach((canvas) => stage.appendChild(canvas));
    draw();
    document.fonts?.ready.then(() => {
      drawn = -1;
      draw();
    });
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 10.5);
  const group = new Group();
  group.position.x = 0.55; // the planes' middle, so the arc sits centred
  scene.add(group);

  // The planes, sized as the ads are (height 2 for the tallest), set in a shallow arc.
  const layout: { w: number; h: number; x: number; y: number; z: number; ry: number }[] = [
    { w: 3.2, h: 1.8, x: -2.55, y: 0.25, z: -0.3, ry: 0.36 },
    { w: 1.9, h: 1.9, x: 0.15, y: -0.2, z: 0.35, ry: 0.04 },
    { w: 1.24, h: 2.2, x: 2.3, y: 0.1, z: -0.1, ry: -0.34 },
  ];
  const textures = canvases.map((canvas) => {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  });
  layout.forEach((p, i) => {
    const shadow = new Mesh(new PlaneGeometry(p.w * 1.04, p.h * 1.04), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
    shadow.position.set(p.x + 0.06, p.y - 0.09, p.z - 0.08);
    shadow.rotation.y = p.ry;
    const mesh = new Mesh(new PlaneGeometry(p.w, p.h), new MeshBasicMaterial({ map: textures[i] }));
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.ry;
    group.add(shadow, mesh);
  });

  const fit = () => {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep all three in view (about 8.4 units across, with a margin) on a narrow stage: back the camera off.
    camera.position.z = Math.max(10.5, 8.4 / (2 * Math.tan((15 * Math.PI) / 180) * (w / h)));
    camera.updateProjectionMatrix();
    renderOnce();
  };
  const renderOnce = () => {
    if (draw()) textures.forEach((texture) => (texture.needsUpdate = true));
    renderer.render(scene, camera);
  };

  // The pointer turns the group a little; with nothing to follow it sways on its own.
  const target = { x: 0, y: 0 };
  const turn = { x: 0, y: 0 };
  if (!still)
    stage.addEventListener("pointermove", (event) => {
      const box = stage.getBoundingClientRect();
      target.y = ((event.clientX - box.left) / box.width - 0.5) * 0.5;
      target.x = ((event.clientY - box.top) / box.height - 0.5) * 0.25;
    });
  stage.addEventListener("pointerleave", () => {
    target.x = 0;
    target.y = 0;
  });

  let visible = false;
  let running = false;
  let last = 0;
  let clock = 0;
  let time = 0;
  const tick = (now: number) => {
    const dt = Math.min(100, now - last);
    last = now;
    time += dt / 1000;
    if (playing) {
      clock += dt;
      frame = Math.floor((clock / 1000) * FPS) % FRAMES;
    }
    turn.x += (target.x - turn.x) * 0.06;
    turn.y += (target.y - turn.y) * 0.06;
    group.rotation.y = turn.y + Math.sin(time * 0.45) * 0.06;
    group.rotation.x = turn.x + Math.sin(time * 0.31) * 0.025;
    renderOnce();
    if (visible) requestAnimationFrame(tick);
    else running = false;
  };

  new ResizeObserver(fit).observe(stage);
  fit();
  if (!still)
    new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible && !running) {
        running = true;
        last = performance.now();
        requestAnimationFrame(tick);
      }
    }).observe(stage);

  const setPlaying = (on: boolean) => {
    playing = on;
    if (on) clock = (frame / FPS) * 1000;
    readout.play.textContent = on ? "pause" : "play";
    readout.play.setAttribute("aria-pressed", String(!on));
  };
  readout.play.addEventListener("click", () => setPlaying(!playing));
  readout.slider.addEventListener("input", () => {
    setPlaying(false);
    frame = Number(readout.slider.value);
    renderOnce();
  });
  setPlaying(playing);
  readout.play.hidden = still;
  // The canvases use the page's JetBrains Mono: draw again once it has loaded.
  document.fonts?.ready.then(() => {
    drawn = -1;
    renderOnce();
  });
}
