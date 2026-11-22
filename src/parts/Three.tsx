/**
 * A three.js scene that's a function of the frame (.claude/guides/3d.md). Import it on its own, so ads without 3D
 * don't load three.js:
 *
 *   import { Three } from "../../parts/Three";
 *
 *   <Three
 *     setup={({ THREE, scene, camera, texture }) => {
 *       scene.add(new THREE.AmbientLight("#fff", 0.6));
 *       const card = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.1), new THREE.MeshStandardMaterial({ map: texture("ads/x/ui.png") }));
 *       scene.add(card);
 *       camera.position.set(0, 0, 8);
 *       return { card };
 *     }}
 *     draw={(f, { card }) => {
 *       card.rotation.y = interpolate(f, [0, 60], [-0.6, 0.2], { ease: easings.outCubic });
 *     }}
 *   />
 *
 * `setup` builds the scene once. `draw` sets everything that moves from the frame alone, then the part renders: no
 * clock, no animation loop, no physics that steps with time, and `random(seed)` for anything scattered. Text a viewer
 * reads stays in the DOM on top, where validate can see it. A texture or model holds the frame until it's loaded.
 */
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { asset, holdFrame, useFrame, useVideo } from "../engine";

export type ThreeKit = {
  THREE: typeof THREE;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  width: number;
  height: number;
  /** An image under public/ as an sRGB texture. Captures wait until it's in. */
  texture(src: string): THREE.Texture;
  /** A glTF or GLB model under public/, as a group that fills in once it's loaded. Captures wait for it. */
  model(src: string): THREE.Group;
};

type Props<T> = {
  setup: (kit: ThreeKit) => T;
  draw: (frame: number, objects: T, kit: ThreeKit) => void;
  /** The canvas size in output pixels. The video's size by default. */
  width?: number;
  height?: number;
  /** The camera's vertical field of view, in degrees. */
  fov?: number;
  /** A CSS colour, or null for a transparent canvas over whatever is behind it. */
  background?: string | null;
  /** Smooth edges (the default). `false` keeps hard pixels, for a small canvas scaled up with `imageRendering: "pixelated"`. */
  antialias?: boolean;
  style?: CSSProperties;
  className?: string;
};

export function Three<T>({ setup, draw, width, height, fov = 35, background = null, antialias = true, style, className }: Props<T>) {
  const frame = useFrame();
  const video = useVideo();
  const w = width ?? video.width;
  const h = height ?? video.height;
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ kit: ThreeKit; objects: T; paint: () => void } | null>(null);
  // The latest props, so a load that finishes later draws with them.
  const latest = useRef({ draw, frame });
  latest.current = { draw, frame };

  useLayoutEffect(() => {
    const renderer = new THREE.WebGLRenderer({ canvas: canvas.current!, antialias, alpha: background === null, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    if (background !== null) scene.background = new THREE.Color(background);
    const camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 1000);
    const paint = () => {
      if (!live.current) return;
      latest.current.draw(latest.current.frame, live.current.objects, live.current.kit);
      renderer.render(scene, camera);
    };
    const textures = new THREE.TextureLoader();
    const models = new GLTFLoader();
    const kit: ThreeKit = {
      THREE,
      scene,
      camera,
      renderer,
      width: w,
      height: h,
      texture(src) {
        const texture = new THREE.Texture();
        texture.colorSpace = THREE.SRGBColorSpace;
        void holdFrame(textures.loadAsync(asset(src))).then((loaded) => {
          texture.image = loaded.image;
          texture.needsUpdate = true;
          paint();
        });
        return texture;
      },
      model(src) {
        const group = new THREE.Group();
        void holdFrame(models.loadAsync(asset(src))).then((gltf) => {
          group.add(gltf.scene);
          paint();
        });
        return group;
      },
    };
    live.current = { kit, objects: setup(kit), paint };
    paint();
    return () => {
      live.current = null;
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        for (const material of ([] as THREE.Material[]).concat(mesh.material ?? [])) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    };
    // `setup` runs once per size: a new function each render isn't a new scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, fov, background, antialias]);

  // Every frame, drawn as React commits it, so the seek's paint shows it.
  useLayoutEffect(() => live.current?.paint(), [frame]);

  return <canvas ref={canvas} width={w} height={h} className={className} style={{ display: "block", width: w, height: h, ...style }} />;
}
