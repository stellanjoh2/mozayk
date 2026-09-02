import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { createBentPanel, bendExisting } from "./bentPlane";
import { FisheyePass } from "./fisheye";
import { floorY, itemSize, ringRadius, slotAngles } from "./layout";
import { kindFromSrc, loadMedia, type LoadedMedia } from "./media";
import { createPanelMaterial, setPanelCorners, setPanelSaturation } from "./panelMaterial";
import {
  DEFAULT_SETTINGS,
  MAX_ITEMS,
  MAX_RINGS,
  RATIO_VALUE,
  padBackgrounds,
  type GalleryItem,
  type GalleryOptions,
  type GallerySettings,
} from "./types";

const SEGMENTS = 48;
const HOME_Y = 0.04;
const BASE_FOV = 72;
/** Slight extra zoom so the panel reaches the viewport edges through AA. */
const FILL = 1.02;
const WHEEL_MAX = 0.36;
/** rad/s. Index 0 = speed 1 (very slow). Last is brisk, not a blur. */
const AUTO_SPEEDS = [0.04, 0.08, 0.14, 0.24, 0.38, 0.55, 0.75, 1.0];
export const AUTO_SPEED_MAX = AUTO_SPEEDS.length;

export function revolutionSeconds(level: number): number {
  const i = Math.max(1, Math.min(AUTO_SPEEDS.length, Math.round(level))) - 1;
  return (Math.PI * 2) / AUTO_SPEEDS[i];
}

const ZOOM_IN = 1.2;
const ZOOM_OUT = 0.96;
/** Tilt, unflatten, and fisheye finish before the camera dolly does. */
const WORLD_OUT = 0.52;

gsap.registerPlugin(CustomEase);

/**
 * easings.net easeInOutCubic (0.65, 0, 0.35, 1) with the out-handle
 * pulled in so the last stretch of motion occupies extra time.
 */
const MOTION_EASE = CustomEase.create("galleryMotion", "0.65,0,0.16,1");
/** Same cubic in, even longer settle — fullscreen zoom in / out. */
const FOCUS_EASE = CustomEase.create("galleryFocus", "0.58,0,0.08,1");
const AXIS_LOCK = 10;
const FLOOR_DRAG = 72;
const SWIPE = 56;
const SWIPE_FLICK = 520;
/** rad/s while an arrow key is held zoomed out — same as auto-rotate speed 7. */
const KEY_SPIN = 0.75;
/** Delay before a held arrow becomes a constant spin instead of a single step. */
const KEY_HOLD = 0.28;
/** Extra ignore window after zoom-out so leftover wheel ticks don't spin. */
const WHEEL_FOCUS_LOCK = 0.25;

type Panel = {
  group: Group;
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  angle: number;
  targetAngle: number;
  flatten: number;
  saturation: number;
  src: string;
  loadGen: number;
  media: LoadedMedia | null;
};

type Floor = {
  group: Group;
  items: GalleryItem[];
  panels: Panel[];
  radius: number;
  targetRadius: number;
  spin: number;
  spinVel: number;
};

export class RingGallery {
  readonly el: HTMLElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private axis = new Group();
  private floors: Floor[] = [];
  private fisheye = new FisheyePass();
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private bg = new Color(DEFAULT_SETTINGS.backgrounds[0]);

  private settings: GallerySettings = { ...DEFAULT_SETTINGS };
  private activeRing = 0;
  private selectedIndex = -1;
  private facedIndex = -1;
  private onSelect: ((index: number, ring?: number) => void) | null = null;

  private autoRotate = false;
  private autoSpeed = 1;
  private aligning = false;
  private keySpin = 0;
  private keyHoldTimer = 0;
  private focusT = 0;
  private worldT = 0;
  private floorY = 0;
  private focusPoint = new Vector3(0, 0, -3.3);
  private homePos = new Vector3(0, HOME_Y, 0);
  private homeLook = new Vector3(0, 0, -1);
  private camPos = new Vector3();
  private camLook = new Vector3();
  private zoomPos = new Vector3();
  private dragging = false;
  private moved = false;
  private dragAxis: "x" | "y" | null = null;
  private lastX = 0;
  private lastY = 0;
  private hoverX = 0;
  private hoverY = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragY = 0;
  private dragFromFocus = false;
  private dragCommitted = false;
  private wheelLockUntil = 0;
  private pendingFloor = -1;
  private pendingIndex = -1;
  private dragVx = 0;
  private lastDragT = 0;
  private lastT = 0;
  private raf = 0;
  private disposed = false;
  private capturing = false;
  private ro: ResizeObserver;
  private stepBlend = { t: 0 };

  constructor(el: HTMLElement, options: GalleryOptions = {}) {
    this.el = el;
    this.settings = { ...DEFAULT_SETTINGS, ...pickSettings(options) };
    this.settings.backgrounds = padBackgrounds(this.settings.backgrounds);
    this.onSelect = options.onSelect ?? null;

    this.camera = new PerspectiveCamera(BASE_FOV, 1, 0.08, 80);

    this.renderer = new WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(this.bg, 1);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";
    el.appendChild(this.renderer.domElement);

    this.scene.background = this.bg;
    this.scene.add(this.axis);
    this.fisheye.setBackground(this.bg.r, this.bg.g, this.bg.b);
    this.fisheye.setChroma(this.settings.chromaticAberration);
    this.fisheye.setOverscan(this.settings.overscan);

    for (const items of initialRings(options)) this.addFloor(items);
    this.placeFloors();
    this.activeRing = clampRing(options.selectedRing ?? 0, this.floors.length);
    this.selectedIndex = options.selectedIndex ?? -1;
    this.floorY = floorY(this.activeRing, this.settings.ratio);
    this.bg.set(this.ringColor(this.activeRing));
    this.paintBg();

    this.syncFisheyeCoverage();
    this.applyView();
    this.applyCamera();
    if (this.selectedIndex >= 0) this.focusIndex(this.selectedIndex);

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);
    this.loop = this.loop.bind(this);

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  setItems(items: GalleryItem[]): void {
    if (this.floors.length === 0) this.addFloor([]);
    this.setFloorItems(this.floors[0], items);
  }

  setRings(rings: GalleryItem[][]): void {
    const next = normalizeRings(rings);
    let countChanged = false;
    while (this.floors.length > next.length) {
      this.removeLastFloor();
      countChanged = true;
    }
    while (this.floors.length < next.length) {
      this.addFloor([]);
      countChanged = true;
    }
    if (countChanged) this.placeFloors();
    next.forEach((items, i) => this.setFloorItems(this.floors[i], items));
    if (this.activeRing >= this.floors.length) {
      this.goToFloor(this.floors.length - 1);
    }
  }

  setActiveRing(index: number): void {
    if (index < 0 || index >= this.floors.length || index === this.activeRing) return;
    if (this.selectedIndex >= 0 || this.focusT > 0.001) {
      if (this.selectedIndex >= 0) {
        this.selectedIndex = -1;
        this.blurFocus();
      }
      this.queueFloor(index);
      return;
    }
    this.goToFloor(index);
  }

  setSettings(patch: Partial<GallerySettings>): void {
    const prevColor = this.ringColor(this.activeRing);
    const next = { ...this.settings, ...patch };
    if (patch.backgrounds) next.backgrounds = padBackgrounds(patch.backgrounds);
    const ratioChanged = next.ratio !== this.settings.ratio;
    const distributionChanged = next.distribution !== this.settings.distribution;
    const cornersChanged = next.cornerRadius !== this.settings.cornerRadius;
    this.settings = next;

    if (this.ringColor(this.activeRing) !== prevColor) {
      gsap.killTweensOf(this.bg);
      this.bg.set(this.ringColor(this.activeRing));
      this.paintBg();
    }
    if (patch.chromaticAberration != null) this.fisheye.setChroma(patch.chromaticAberration);
    if (patch.overscan != null) this.fisheye.setOverscan(patch.overscan);
    this.syncFisheyeCoverage();
    this.applyView();

    if (ratioChanged) {
      for (const floor of this.floors) {
        floor.targetRadius = ringRadius(floor.items.length, this.settings.ratio);
      }
      this.placeFloors();
      this.retargetFloorY();
      this.applyCorners();
      this.fitPanelTextures();
      for (const floor of this.floors) this.layoutPanels(floor, true);
    } else if (distributionChanged) {
      for (const floor of this.floors) this.layoutPanels(floor, true);
    } else if (cornersChanged) {
      this.applyCorners();
    }
  }

  setSelectedIndex(index: number, ring = this.activeRing): void {
    if (ring !== this.activeRing) {
      if (index < 0 && (this.selectedIndex >= 0 || this.focusT > 0.001)) {
        if (this.selectedIndex >= 0) {
          this.selectedIndex = -1;
          this.blurFocus();
        }
        this.queueFloor(ring);
        return;
      }
      this.goToFloor(ring, index < 0);
    }
    if (index === this.selectedIndex) return;
    this.selectedIndex = index;
    if (index < 0) this.blurFocus();
    else this.focusIndex(index);
  }

  setPreview(_preview: boolean): void {}

  setOnSelect(cb: ((index: number, ring?: number) => void) | null): void {
    this.onSelect = cb;
  }

  setAutoRotate(on: boolean): void {
    if (on === this.autoRotate) {
      if (on && this.selectedIndex >= 0) this.choose(-1);
      return;
    }
    this.autoRotate = on;
    if (!on) return;
    for (const floor of this.floors) floor.spinVel = 0;
    this.releaseSpin();
    if (this.selectedIndex >= 0) this.choose(-1);
  }

  toggleAutoRotate(): void {
    this.setAutoRotate(!this.autoRotate);
  }

  isAutoRotate(): boolean {
    return this.autoRotate;
  }

  setAutoSpeed(level: number): void {
    this.autoSpeed = Math.max(1, Math.min(AUTO_SPEEDS.length, Math.round(level)));
  }

  getAutoSpeed(): number {
    return this.autoSpeed;
  }

  /** Pause the live loop. Keep the same retina buffer as `F` preview. */
  beginCapture(): {
    width: number;
    height: number;
    canvas: HTMLCanvasElement;
  } {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.snapHome();
    this.autoRotate = true;
    for (const floor of this.floors) floor.spinVel = 0;
    this.resize();
    this.capturing = true;
    this.fisheye.setMaxTextureSize(this.renderer.capabilities.maxTextureSize);
    this.fisheye.setCaptureQuality(true);
    this.fisheye.setSamples(
      Math.min(4, this.renderer.capabilities.maxSamples),
    );
    this.advance(0);
    const canvas = this.renderer.domElement;
    return {
      width: canvas.width,
      height: canvas.height,
      canvas,
    };
  }

  endCapture(): void {
    if (this.disposed) return;
    this.capturing = false;
    this.fisheye.setCaptureQuality(false);
    this.fisheye.setSamples(0);
    this.resize();
    if (!this.raf) {
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  /** Advance simulation by `dt` seconds and draw one frame. */
  advance(dt: number): void {
    if (this.disposed) return;
    const k = 1 - Math.exp(-dt * 7);
    for (let i = 0; i < this.floors.length; i++) {
      const floor = this.floors[i];
      floor.radius += (floor.targetRadius - floor.radius) * k;
      if (Math.abs(floor.targetRadius - floor.radius) > 0.0008) {
        this.layoutPanels(floor, false);
      }
      for (const panel of floor.panels) {
        panel.angle += (panel.targetAngle - panel.angle) * k;
        panel.group.rotation.y = panel.angle;
        panel.media?.tick?.(dt);
      }
      this.spinFloor(floor, i, dt);
    }

    this.applyView();
    this.applyCamera();
    this.paintBg();
    this.fisheye.render(this.renderer, this.scene, this.camera);
  }

  destroy(): void {
    this.disposed = true;
    this.capturing = false;
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.bg);
    gsap.killTweensOf(this.stepBlend);
    for (const floor of this.floors) {
      gsap.killTweensOf(floor);
      for (const panel of floor.panels) gsap.killTweensOf(panel);
    }
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.clearKeyHold();
    this.clearFloors();
    this.fisheye.dispose();
    this.renderer.dispose();
    canvas.remove();
  }

  private active(): Floor {
    return this.floors[this.activeRing] ?? this.floors[0];
  }

  private addFloor(items: GalleryItem[]): Floor {
    const group = new Group();
    this.axis.add(group);
    const count = Math.min(items.length, MAX_ITEMS);
    const radius = ringRadius(count, this.settings.ratio);
    const floor: Floor = {
      group,
      items: items.slice(0, MAX_ITEMS),
      panels: [],
      radius,
      targetRadius: radius,
      spin: 0,
      spinVel: 0,
    };
    this.floors.push(floor);
    this.syncFloorPanels(floor);
    return floor;
  }

  private removeLastFloor(): void {
    const floor = this.floors.pop();
    if (!floor) return;
    gsap.killTweensOf(floor);
    for (const panel of floor.panels) disposePanel(panel, floor.group);
    this.axis.remove(floor.group);
  }

  private placeFloors(): void {
    for (let i = 0; i < this.floors.length; i++) {
      this.floors[i].group.position.y = floorY(i, this.settings.ratio);
    }
  }

  private retargetFloorY(): void {
    const y = floorY(this.activeRing, this.settings.ratio);
    gsap.killTweensOf(this, "floorY");
    this.floorY = y;
  }

  private goToFloor(index: number, face = true): void {
    if (index < 0 || index >= this.floors.length) return;
    this.releaseSpin();
    this.activeRing = index;
    const duration = this.motionDuration(ZOOM_IN);
    gsap.to(this, {
      floorY: floorY(index, this.settings.ratio),
      duration,
      ease: MOTION_EASE,
      overwrite: "auto",
    });
    const target = new Color(this.ringColor(index));
    gsap.killTweensOf(this.bg);
    gsap.to(this.bg, {
      r: target.r,
      g: target.g,
      b: target.b,
      duration,
      ease: MOTION_EASE,
      overwrite: "auto",
    });
    if (face) {
      const front = this.frontIndex();
      if (front >= 0) this.faceIndex(front, false);
    }
  }

  private setFloorItems(floor: Floor, items: GalleryItem[]): void {
    const next = items.slice(0, MAX_ITEMS);
    const unchanged =
      next.length === floor.items.length &&
      next.every((item, i) => item.src === floor.items[i]?.src);
    floor.items = next;
    floor.targetRadius = ringRadius(next.length, this.settings.ratio);
    if (floor === this.active() && this.selectedIndex >= next.length) {
      this.selectedIndex = next.length - 1;
      if (this.selectedIndex < 0) this.blurFocus();
    }
    if (unchanged) return;
    this.syncFloorPanels(floor);
  }

  private applyCorners(): void {
    const { width, height } = itemSize(this.settings.ratio);
    const aspect = width / height;
    const radius = this.settings.cornerRadius;
    for (const floor of this.floors) {
      for (const panel of floor.panels) {
        setPanelCorners(panel.mesh.material, radius, aspect);
      }
    }
  }

  private fitPanelTextures(): void {
    const { width, height } = itemSize(this.settings.ratio);
    const aspect = width / height;
    for (const floor of this.floors) {
      for (const panel of floor.panels) {
        panel.media?.applyFit(aspect);
      }
    }
  }

  private syncFloorPanels(floor: Floor): void {
    const count = floor.items.length;
    while (floor.panels.length > count) {
      const panel = floor.panels.pop();
      if (panel) disposePanel(panel, floor.group);
    }
    while (floor.panels.length < count) {
      floor.panels.push(this.makePanel(floor));
    }
    this.layoutPanels(floor, true);
    floor.items.forEach((item, i) => {
      const panel = floor.panels[i];
      if (!panel || panel.src === item.src) return;
      panel.src = item.src;
      panel.loadGen += 1;
      void this.loadPanel(floor, i, item, panel.loadGen);
    });
  }

  private makePanel(floor: Floor): Panel {
    const { width, height } = itemSize(this.settings.ratio);
    const geo = createBentPanel(width, height, floor.radius, SEGMENTS);
    const aspect = width / height;
    const material = createPanelMaterial(
      { color: 0x141414 },
      this.settings.cornerRadius,
      aspect,
    );
    const saturation = 1;
    setPanelSaturation(material, saturation);

    const mesh = new Mesh(geo, material);
    const group = new Group();
    group.add(mesh);
    floor.group.add(group);

    return {
      group,
      mesh,
      angle: 0,
      targetAngle: 0,
      flatten: 0,
      saturation,
      src: "",
      loadGen: 0,
      media: null,
    };
  }

  private layoutPanels(floor: Floor, snap: boolean): void {
    const angles = slotAngles(
      floor.panels.length,
      this.settings.ratio,
      floor.radius,
      this.settings.distribution,
    );
    for (let i = 0; i < floor.panels.length; i++) {
      const panel = floor.panels[i];
      panel.targetAngle = angles[i] ?? 0;
      if (snap) panel.angle = panel.targetAngle;
      this.applyPanelShape(panel, floor.radius);
      panel.group.rotation.y = panel.angle;
    }
  }

  private async loadPanel(
    floor: Floor,
    index: number,
    item: GalleryItem,
    gen: number,
  ): Promise<void> {
    try {
      const kind = kindFromSrc(item.src, item.kind);
      const media = await loadMedia(item.src, kind);
      const panel = floor.panels[index];
      if (this.disposed || !panel || panel.loadGen !== gen) {
        media.dispose();
        return;
      }
      panel.media?.dispose();
      panel.media = media;
      media.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      panel.mesh.material.map = media.texture;
      panel.mesh.material.color.set(0xffffff);
      panel.mesh.material.needsUpdate = true;
      const { width, height } = itemSize(this.settings.ratio);
      media.applyFit(width / height);
    } catch {
      /* keep empty plate */
    }
  }

  private clearFloors(): void {
    while (this.floors.length) this.removeLastFloor();
  }

  private resize(): void {
    if (this.capturing) return;
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.fisheye.setOutputSize(Math.round(w * dpr), Math.round(h * dpr));
    this.syncFisheyeCoverage();
    this.applyView();
  }

  private loop(now: number): void {
    if (this.disposed || this.capturing) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.advance(dt);
    this.raf = requestAnimationFrame(this.loop);
  }

  private spinFloor(floor: Floor, index: number, dt: number): void {
    const dir = index % 2 === 0 ? 1 : -1;
    const isActive = index === this.activeRing;
    const grabbing = this.dragging && isActive && this.dragAxis === "x";
    const focused = isActive && this.selectedIndex >= 0;
    const leaving = isActive && this.focusT > 0.001;
    const cruising = isActive && this.keySpin !== 0 && !focused && !grabbing;
    const autoSpin = this.autoRotate && !grabbing && !focused && !leaving && !cruising;

    if (cruising) {
      floor.spin += KEY_SPIN * dt * this.keySpin;
      floor.spinVel = 0;
    } else if (autoSpin) {
      floor.spin += AUTO_SPEEDS[this.autoSpeed - 1] * dt * dir;
      floor.spinVel = 0;
    } else if (!grabbing && !focused && !(this.aligning && isActive)) {
      floor.spin += floor.spinVel * dt;
      const speed = Math.abs(floor.spinVel);
      if (speed > 0) {
        const linear = 1.05 + this.settings.spinFriction * 3.75;
        const drop = linear * (0.7 + 0.3 * (speed / (speed + 0.45))) * dt;
        floor.spinVel = speed <= drop ? 0 : floor.spinVel - Math.sign(floor.spinVel) * drop;
      }
    }
    floor.group.rotation.y = floor.spin;
  }

  private applyView(): void {
    const t = this.worldT;
    const axisX = this.settings.axisTilt * (1 - t);
    const axisZ = this.settings.ringTilt * (1 - t);
    this.axis.rotation.x = (axisX * Math.PI) / 180;
    this.axis.rotation.z = (axisZ * Math.PI) / 180;

    this.camera.fov = BASE_FOV / safeZoom(this.settings.cameraZoom);
    this.fisheye.setStrength(this.settings.distortion * (1 - t));
    this.fisheye.setChroma(this.settings.chromaticAberration * (1 - t));
    this.fisheye.applyCameraCoverage(this.camera);
  }

  /** Distance from panel that fills the viewport at the current lens. */
  private focusDistance(): number {
    const { width, height } = itemSize(this.settings.ratio);
    const aspect =
      Math.max(1, this.el.clientWidth) / Math.max(1, this.el.clientHeight);
    const half = (this.camera.fov * Math.PI) / 360;
    const span = Math.max(0.05, this.fisheye.coverageSpan().y);
    const tan = Math.tan(half) * span;
    const byHeight = height / (2 * tan * FILL);
    const byWidth = width / (2 * tan * aspect * FILL);
    const fill =
      RATIO_VALUE[this.settings.ratio] > 1
        ? Math.min(byHeight, byWidth)
        : byHeight;
    return Math.max(0.12, fill / safeZoom(this.settings.focusZoom));
  }

  private syncFisheyeCoverage(): void {
    this.fisheye.setCoverage(
      this.settings.overscan,
      this.settings.chromaticAberration,
    );
  }

  private applyCamera(): void {
    const t = this.focusT;
    this.homePos.set(0, HOME_Y * (1 - t) + this.floorY, 0);
    this.homeLook.set(0, this.floorY, -1);
    this.axis.localToWorld(this.homePos);
    this.axis.localToWorld(this.homeLook);
    if (this.focusT > 0.001) {
      const floor = this.active();
      this.focusPoint.set(0, floor.group.position.y, -floor.radius);
      this.axis.localToWorld(this.focusPoint);
      this.zoomPos.copy(this.homePos).sub(this.focusPoint);
      const away = this.zoomPos.length();
      if (away < 1e-5) this.zoomPos.set(0, 0, 1);
      else this.zoomPos.multiplyScalar(1 / away);
      this.zoomPos.multiplyScalar(this.focusDistance()).add(this.focusPoint);
      this.camPos.copy(this.homePos).lerp(this.zoomPos, t);
      this.camLook.copy(this.homeLook).lerp(this.focusPoint, t);
    } else {
      this.camPos.copy(this.homePos);
      this.camLook.copy(this.homeLook);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private ringColor(index: number): string {
    return this.settings.backgrounds[index] ?? this.settings.backgrounds[0];
  }

  private paintBg(): void {
    this.renderer.setClearColor(this.bg, 1);
    this.fisheye.setBackground(this.bg.r, this.bg.g, this.bg.b);
  }

  private motionDuration(seconds: number): number {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : seconds;
  }

  private applyPanelShape(panel: Panel, radius: number): void {
    const { width, height } = itemSize(this.settings.ratio);
    bendExisting(panel.mesh.geometry, width, height, radius, panel.flatten);
  }

  private applyFocusPresentation(): void {
    const focusing = this.selectedIndex >= 0;
    const duration = this.motionDuration(focusing ? ZOOM_IN : WORLD_OUT);
    const ease = focusing ? FOCUS_EASE : MOTION_EASE;
    const active = this.active();

    for (const floor of this.floors) {
      for (let i = 0; i < floor.panels.length; i++) {
        const panel = floor.panels[i];
        const flatten = floor === active && i === this.selectedIndex ? 1 : 0;
        gsap.to(panel, {
          flatten,
          saturation: 1,
          duration,
          ease,
          overwrite: "auto",
          onUpdate: () => this.applyPanelPresentation(panel, floor),
          onComplete: () => this.applyPanelPresentation(panel, floor),
        });
      }
    }
  }

  private applyPanelPresentation(panel: Panel, floor: Floor): void {
    this.applyPanelShape(panel, floor.radius);
    setPanelSaturation(panel.mesh.material, panel.saturation);
  }

  private focusIndex(index: number): void {
    this.pendingFloor = -1;
    this.pendingIndex = -1;
    this.faceIndex(index, true);
    this.applyFocusPresentation();
  }

  private faceIndex(index: number, focus: boolean): void {
    const floor = this.active();
    const panel = floor.panels[index];
    if (!panel) return;
    floor.spinVel = 0;
    this.aligning = true;
    this.facedIndex = index;
    const facing = shortestSpin(floor.spin, -panel.angle);
    const duration = this.motionDuration(ZOOM_IN);
    gsap.killTweensOf(floor, "spin");
    gsap.killTweensOf(this.stepBlend);

    if (!focus && this.autoRotate && duration > 0 && !this.dragging) {
      const dir = this.activeRing % 2 === 0 ? 1 : -1;
      const cruise = AUTO_SPEEDS[this.autoSpeed - 1] * dir;
      const extra = facing - floor.spin - cruise * duration;
      this.stepBlend.t = 0;
      let last = 0;
      gsap.to(this.stepBlend, {
        t: 1,
        duration,
        ease: MOTION_EASE,
        overwrite: true,
        onUpdate: () => {
          floor.spin += extra * (this.stepBlend.t - last);
          last = this.stepBlend.t;
        },
        onComplete: () => {
          this.aligning = false;
        },
      });
    } else {
      gsap.to(floor, {
        spin: facing,
        duration,
        ease: focus ? FOCUS_EASE : MOTION_EASE,
        overwrite: "auto",
        onComplete: () => {
          this.aligning = false;
        },
      });
    }

    if (focus) {
      gsap.to(this, {
        focusT: 1,
        worldT: 1,
        duration,
        ease: FOCUS_EASE,
        overwrite: "auto",
      });
    }
  }

  private blurFocus(): void {
    this.releaseSpin();
    this.active().spinVel = 0;
    gsap.killTweensOf(this, "focusT");
    gsap.killTweensOf(this, "worldT");
    const out = this.motionDuration(ZOOM_OUT);
    const world = this.motionDuration(WORLD_OUT);
    gsap.to(this, {
      focusT: 0,
      duration: out,
      ease: FOCUS_EASE,
      overwrite: "auto",
      onComplete: () => this.flushPendingFloor(),
    });
    gsap.to(this, {
      worldT: 0,
      duration: world,
      ease: MOTION_EASE,
      overwrite: "auto",
    });
    this.applyFocusPresentation();
    this.syncCursor();
  }

  private queueFloor(index: number, item = -1): void {
    if (index < 0 || index >= this.floors.length) return;
    if (index === this.activeRing && item < 0) return;
    this.pendingFloor = index;
    this.pendingIndex = item;
    if (this.focusT <= 0.001) this.flushPendingFloor();
  }

  private flushPendingFloor(): void {
    const next = this.pendingFloor;
    const item = this.pendingIndex;
    this.pendingFloor = -1;
    this.pendingIndex = -1;
    if (next < 0 || this.selectedIndex >= 0) return;
    if (next === this.activeRing) {
      if (item >= 0) this.choose(item, next);
      return;
    }
    this.choose(item, next);
  }

  private choose(index: number, ring = this.activeRing): void {
    if (ring !== this.activeRing) this.goToFloor(ring, index < 0);
    this.selectedIndex = index;
    if (index < 0) this.blurFocus();
    else this.focusIndex(index);
    this.onSelect?.(index, ring);
    this.syncCursor();
  }

  private frontIndex(): number {
    const floor = this.active();
    const n = floor.panels.length;
    if (n === 0) return -1;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(shortestSpin(0, floor.panels[i].angle + floor.spin));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  private currentItem(): number {
    if (this.selectedIndex >= 0) return this.selectedIndex;
    if (this.aligning && this.facedIndex >= 0) return this.facedIndex;
    return this.frontIndex();
  }

  private step(delta: number): void {
    const n = this.active().panels.length;
    if (n <= 1) return;
    const current = this.currentItem();
    if (current < 0) return;
    this.faceIndex((current + delta + n) % n, false);
  }

  /** stepDir = index step; spinDir = constant spin sign (left is −1). */
  private handleSpinKey(stepDir: number, spinDir: number, repeat: boolean): void {
    if (this.keySpin !== 0) {
      this.keySpin = spinDir;
      return;
    }
    if (repeat) {
      this.startKeySpin(spinDir);
      return;
    }
    this.step(stepDir);
    this.armKeySpin(spinDir);
  }

  private armKeySpin(spinDir: number): void {
    this.clearKeyHold();
    this.keyHoldTimer = window.setTimeout(() => this.startKeySpin(spinDir), KEY_HOLD * 1000);
  }

  private clearKeyHold(): void {
    if (!this.keyHoldTimer) return;
    window.clearTimeout(this.keyHoldTimer);
    this.keyHoldTimer = 0;
  }

  private startKeySpin(spinDir: number): void {
    this.clearKeyHold();
    if (this.selectedIndex >= 0) return;
    if (this.active().panels.length <= 1) return;
    this.releaseSpin();
    this.keySpin = spinDir;
  }

  private stopKeySpin(): void {
    this.clearKeyHold();
    if (this.keySpin === 0) return;
    const dir = this.keySpin;
    this.keySpin = 0;
    if (this.selectedIndex >= 0) return;
    const index = this.aheadIndex(dir);
    if (index >= 0) this.faceIndex(index, false);
  }

  /** Panel we'd hit next if we keep spinning in `spinDir`. */
  private aheadIndex(spinDir: number): number {
    const floor = this.active();
    const n = floor.panels.length;
    if (n === 0) return -1;
    let best = 0;
    let bestTravel = Infinity;
    for (let i = 0; i < n; i++) {
      let travel = shortestSpin(floor.spin, -floor.panels[i].angle) - floor.spin;
      if (spinDir < 0) travel = -travel;
      if (travel < -1e-4) travel += Math.PI * 2;
      if (travel < bestTravel) {
        bestTravel = travel;
        best = i;
      }
    }
    return best;
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") this.stopKeySpin();
  }

  private onBlur(): void {
    this.stopKeySpin();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.capturing) return;
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (this.floors.length === 0) return;

    if (event.key === "Escape") {
      if (this.selectedIndex < 0) return;
      event.preventDefault();
      this.choose(-1);
      return;
    }

    if (event.key === "1" || event.key === "2" || event.key === "3") {
      const floor = Number(event.key) - 1;
      if (floor >= this.floors.length) return;
      if (floor === this.activeRing && this.selectedIndex < 0) return;
      event.preventDefault();
      if (this.selectedIndex >= 0) this.choose(-1);
      this.queueFloor(floor);
      return;
    }

    switch (event.key) {
      case " ":
        if (event.repeat) return;
        if (isActivateTarget(event.target)) return;
        event.preventDefault();
        this.toggleAutoRotate();
        break;
      case "PageUp":
        event.preventDefault();
        this.nudgeAutoSpeed(1);
        break;
      case "PageDown":
        event.preventDefault();
        this.nudgeAutoSpeed(-1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (this.selectedIndex < 0) this.choose(this.currentItem());
        break;
      case "ArrowDown":
        event.preventDefault();
        if (this.selectedIndex >= 0) this.choose(-1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (this.selectedIndex >= 0) {
          if (!event.repeat) this.choose(-1);
        } else {
          this.handleSpinKey(1, -1, event.repeat);
        }
        break;
      case "ArrowRight":
        event.preventDefault();
        if (this.selectedIndex >= 0) {
          if (!event.repeat) this.choose(-1);
        } else {
          this.handleSpinKey(-1, 1, event.repeat);
        }
        break;
    }
  }

  private snapHome(): void {
    this.selectedIndex = -1;
    this.facedIndex = -1;
    this.pendingFloor = -1;
    this.pendingIndex = -1;
    this.aligning = false;
    this.keySpin = 0;
    this.clearKeyHold();
    this.dragging = false;
    this.releaseSpin();
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.bg);
    this.focusT = 0;
    this.worldT = 0;
    this.floorY = floorY(this.activeRing, this.settings.ratio);
    this.bg.set(this.ringColor(this.activeRing));
    for (const floor of this.floors) {
      gsap.killTweensOf(floor);
      floor.spinVel = 0;
      for (const panel of floor.panels) {
        gsap.killTweensOf(panel);
        panel.flatten = 0;
        panel.saturation = 1;
        this.applyPanelPresentation(panel, floor);
      }
    }
  }

  private nudgeAutoSpeed(delta: number): void {
    this.autoSpeed = Math.max(1, Math.min(AUTO_SPEEDS.length, this.autoSpeed + delta));
  }

  private releaseSpin(): void {
    this.aligning = false;
    gsap.killTweensOf(this.active(), "spin");
    gsap.killTweensOf(this.stepBlend);
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.capturing) return;
    this.dragging = true;
    this.moved = false;
    this.dragAxis = null;
    this.dragY = 0;
    this.dragVx = 0;
    this.dragFromFocus = this.selectedIndex >= 0;
    this.dragCommitted = false;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.lastDragT = performance.now();
    this.active().spinVel = 0;
    this.syncCursor();
    this.renderer.domElement.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    this.hoverX = event.clientX;
    this.hoverY = event.clientY;
    if (!this.dragging) {
      this.syncCursor();
      return;
    }
    const now = performance.now();
    const dt = Math.max(0.001, (now - this.lastDragT) / 1000);
    const dx = event.clientX - this.lastX;
    let dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.lastDragT = now;
    this.dragVx = dx / dt;

    if (!this.dragAxis) {
      const fromX = event.clientX - this.dragStartX;
      const fromY = event.clientY - this.dragStartY;
      if (Math.abs(fromX) < AXIS_LOCK && Math.abs(fromY) < AXIS_LOCK) return;
      this.dragAxis =
        this.floors.length > 1 && Math.abs(fromY) > Math.abs(fromX) ? "y" : "x";
      dy = fromY;
    }
    this.moved = true;
    if (this.selectedIndex >= 0) this.choose(-1);
    if (this.dragFromFocus) {
      if (this.dragAxis === "y") this.commitFocusFloor(event.clientY - this.dragStartY);
      return;
    }
    if (this.dragAxis === "y") this.dragFloors(dy);
    else this.swipeStep(event.clientX);
  }

  private commitFocusFloor(fromY: number): void {
    if (this.dragCommitted) return;
    this.dragCommitted = true;
    this.queueFloor(this.activeRing + (fromY > 0 ? 1 : -1));
  }

  private swipeStep(clientX: number): void {
    if (this.dragCommitted || this.dragFromFocus) return;
    const dx = clientX - this.dragStartX;
    const flicked =
      performance.now() - this.lastDragT < 80 &&
      Math.abs(this.dragVx) >= SWIPE_FLICK;
    if (Math.abs(dx) < SWIPE && !flicked) return;
    this.dragCommitted = true;
    // Finger-follow: drag left brings the right-hand item forward.
    const dir =
      Math.abs(dx) >= 8 ? (dx < 0 ? -1 : 1) : this.dragVx < 0 ? -1 : 1;
    this.step(dir);
  }

  private dragFloors(dy: number): void {
    if (this.dragCommitted) return;
    this.dragY += dy;
    const top = this.floors.length - 1;
    if (this.activeRing >= top && this.dragY > 0) this.dragY = 0;
    if (this.activeRing <= 0 && this.dragY < 0) this.dragY = 0;
    if (this.dragY <= -FLOOR_DRAG) {
      this.dragCommitted = true;
      this.choose(-1, this.activeRing - 1);
    } else if (this.dragY >= FLOOR_DRAG) {
      this.dragCommitted = true;
      this.choose(-1, this.activeRing + 1);
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    this.active().spinVel = 0;
    if (!this.moved) {
      if (this.floors.every((ring) => ring.panels.length === 0)) {
        this.syncCursor();
        return;
      }
      this.pick(event.clientX, event.clientY);
    } else if (this.dragFromFocus && this.dragAxis === "y") {
      this.commitFocusFloor(event.clientY - this.dragStartY);
    } else if (this.dragAxis === "x") {
      this.swipeStep(event.clientX);
    }
    this.syncCursor();
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (this.capturing) return;
    if (this.selectedIndex >= 0) {
      this.choose(-1);
      this.wheelLockUntil =
        performance.now() + (this.motionDuration(ZOOM_OUT) + WHEEL_FOCUS_LOCK) * 1000;
      return;
    }
    if (this.focusT > 0.001 || performance.now() < this.wheelLockUntil) return;
    this.releaseSpin();
    const raw = event.deltaY + event.deltaX;
    const px =
      event.deltaMode === 1 ? raw * 16 : event.deltaMode === 2 ? raw * 400 : raw;
    const tick = Math.max(-40, Math.min(40, px));
    const floor = this.active();
    floor.spin += tick * 0.0005;
    floor.spinVel += tick * 0.0009;
    if (floor.spinVel > WHEEL_MAX) floor.spinVel = WHEEL_MAX;
    else if (floor.spinVel < -WHEEL_MAX) floor.spinVel = -WHEEL_MAX;
  }

  private pointerNdc(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return this.fisheye.screenToNdc(x, y, this.pointer);
  }

  private hitFromClient(
    clientX: number,
    clientY: number,
  ): { ring: number; index: number } | null {
    if (!this.pointerNdc(clientX, clientY)) return null;
    this.fisheye.applyCameraCoverage(this.camera);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this.floors.flatMap((floor) => floor.panels.map((p) => p.mesh));
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    for (let r = 0; r < this.floors.length; r++) {
      const index = this.floors[r].panels.findIndex((p) => p.mesh === hit.object);
      if (index >= 0) return { ring: r, index };
    }
    return null;
  }

  private syncCursor(): void {
    const canvas = this.renderer.domElement;
    if (this.dragging) {
      canvas.style.cursor = "grabbing";
      return;
    }
    if (this.selectedIndex >= 0) {
      canvas.style.cursor = "zoom-out";
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const { hoverX, hoverY } = this;
    if (
      hoverX < rect.left ||
      hoverX > rect.right ||
      hoverY < rect.top ||
      hoverY > rect.bottom
    ) {
      canvas.style.cursor = "grab";
      return;
    }
    canvas.style.cursor = this.hitFromClient(hoverX, hoverY) ? "pointer" : "grab";
  }

  private pick(clientX: number, clientY: number): void {
    const hit = this.hitFromClient(clientX, clientY);
    if (!hit) {
      if (this.selectedIndex >= 0) this.choose(-1);
      return;
    }
    const { ring, index } = hit;
    if ((this.selectedIndex >= 0 || this.focusT > 0.001) && ring !== this.activeRing) {
      if (this.selectedIndex >= 0) this.choose(-1);
      this.queueFloor(ring, index);
      return;
    }
    const same = ring === this.activeRing && index === this.selectedIndex;
    this.choose(same ? -1 : index, ring);
  }
}

function evenSize(n: number): number {
  return Math.max(2, n & ~1);
}

export function captureFrameSize(
  cssWidth: number,
  cssHeight: number,
  dpr = Math.min(window.devicePixelRatio || 1, 2),
): { width: number; height: number } {
  return {
    width: evenSize(Math.round(Math.max(2, cssWidth) * dpr)),
    height: evenSize(Math.round(Math.max(2, cssHeight) * dpr)),
  };
}

function initialRings(options: GalleryOptions): GalleryItem[][] {
  if (options.rings && options.rings.length > 0) {
    const fromRings = options.rings.slice(0, MAX_RINGS).map((items) => items.slice(0, MAX_ITEMS));
    if (options.items?.length && fromRings[0].length === 0) {
      fromRings[0] = options.items.slice(0, MAX_ITEMS);
    }
    return fromRings;
  }
  return [options.items?.slice(0, MAX_ITEMS) ?? []];
}

function normalizeRings(rings: GalleryItem[][] | undefined): GalleryItem[][] {
  const next = (rings ?? [])
    .slice(0, MAX_RINGS)
    .map((items) => (items ?? []).slice(0, MAX_ITEMS));
  return next.length > 0 ? next : [[]];
}

function clampRing(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, index));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function isActivateTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "BUTTON" || tag === "A" || tag === "SUMMARY";
}

function safeZoom(zoom: number): number {
  const safe = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return Math.max(0.4, safe);
}

function shortestSpin(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta;
}

function pickSettings(options: GalleryOptions): Partial<GallerySettings> {
  const patch: Partial<GallerySettings> = {};
  if (options.ratio != null) patch.ratio = options.ratio;
  if (options.distribution != null) patch.distribution = options.distribution;
  if (options.backgrounds != null || options.background != null) {
    const fill =
      options.background != null
        ? Array.from({ length: MAX_RINGS }, () => options.background as string)
        : undefined;
    patch.backgrounds = padBackgrounds(options.backgrounds, fill);
  }
  if (options.distortion != null) patch.distortion = options.distortion;
  if (options.chromaticAberration != null) {
    patch.chromaticAberration = options.chromaticAberration;
  }
  if (options.overscan != null) patch.overscan = options.overscan;
  if (options.cameraZoom != null) patch.cameraZoom = options.cameraZoom;
  if (options.focusZoom != null) patch.focusZoom = options.focusZoom;
  if (options.spinFriction != null) patch.spinFriction = options.spinFriction;
  if (options.cornerRadius != null) patch.cornerRadius = options.cornerRadius;
  if (options.axisTilt != null) patch.axisTilt = options.axisTilt;
  if (options.ringTilt != null) patch.ringTilt = options.ringTilt;
  return patch;
}

function disposePanel(panel: Panel, ring: Group): void {
  gsap.killTweensOf(panel);
  gsap.killTweensOf(panel.mesh.material);
  panel.media?.dispose();
  panel.mesh.geometry.dispose();
  panel.mesh.material.dispose();
  ring.remove(panel.group);
}
