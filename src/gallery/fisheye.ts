import {
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Pincushion: edges enlarge toward the camera, center stays readable. */
const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uStrength;
uniform float uChroma;
uniform float uOverscan;
uniform float uAA;
uniform vec2 uRtScale;
uniform vec2 uTexel;
uniform vec3 uBg;
varying vec2 vUv;

vec2 toRt(vec2 src) {
  return (src - vec2(0.5)) * uRtScale + vec2(0.5);
}

vec4 tap(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    return vec4(uBg, 1.0);
  }
  return texture2D(tDiffuse, uv);
}

vec4 sampleScene(vec2 uv) {
  if (uAA < 0.01) return tap(uv);
  vec2 t = uTexel * uAA;
  vec4 s = tap(uv + vec2(-t.x, -t.y));
  s += tap(uv + vec2(t.x, -t.y));
  s += tap(uv + vec2(-t.x, t.y));
  s += tap(uv + vec2(t.x, t.y));
  return s * 0.25;
}

void main() {
  vec2 c = vec2(0.5);
  vec2 d = vUv - c;
  float r2 = dot(d, d);
  float k = uStrength * 2.2;
  float scale = 1.0 / max(uOverscan, 0.05);
  vec2 src = c + d * max(1.0 - k * r2, 0.0) * scale;

  if (uChroma < 0.001) {
    gl_FragColor = sampleScene(toRt(src));
  } else {
    float ca = uChroma * r2 * 3.4 * scale;
    vec2 dir = length(d) > 0.0001 ? normalize(d) : vec2(0.0);
    vec4 cr = sampleScene(toRt(src + dir * ca));
    vec4 cg = sampleScene(toRt(src));
    vec4 cb = sampleScene(toRt(src - dir * ca));
    gl_FragColor = vec4(cr.r, cg.g, cb.b, 1.0);
  }
  gl_FragColor = linearToOutputTexel(gl_FragColor);
}
`;

function makeTarget(
  width: number,
  height: number,
  samples: number,
): WebGLRenderTarget {
  return new WebGLRenderTarget(width, height, {
    format: RGBAFormat,
    type: UnsignedByteType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    colorSpace: LinearSRGBColorSpace,
    samples,
  });
}

export class FisheyePass {
  private target: WebGLRenderTarget;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: ShaderMaterial;
  private quad: Mesh<PlaneGeometry, ShaderMaterial>;
  private outputW = 1;
  private outputH = 1;
  private coverageOverscan = 1;
  private coverageChroma = 0;
  private samples = 0;
  private captureScale = 1;
  private cropW = 1;
  private cropH = 1;
  private maxTextureSize = 8192;

  constructor() {
    this.target = makeTarget(1, 1, 0);
    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uStrength: { value: 0.45 },
        uChroma: { value: 0.25 },
        uOverscan: { value: 1 },
        uAA: { value: 0 },
        uRtScale: { value: new Vector2(1, 1) },
        uTexel: { value: new Vector2(1, 1) },
        uBg: { value: [0, 0, 0] },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
  }

  setOutputSize(width: number, height: number): void {
    this.outputW = Math.max(1, width);
    this.outputH = Math.max(1, height);
    this.syncTarget();
  }

  setSamples(samples: number): void {
    const next = Math.max(0, Math.round(samples));
    if (next === this.samples) return;
    this.samples = next;
    this.rebuildTarget();
  }

  setMaxTextureSize(size: number): void {
    this.maxTextureSize = Math.max(1, size);
  }

  /** Keep the live crop/framing; render the film at 2× the output and 4-tap the warp. */
  setCaptureQuality(on: boolean): void {
    const next = on ? 2 : 1;
    if (next === this.captureScale) return;
    this.captureScale = next;
    this.syncTarget();
  }

  /** Size the scene target so focus (distortion faded out) stays in-bounds. */
  setCoverage(overscan: number, chroma: number): void {
    this.coverageOverscan = overscan;
    this.coverageChroma = chroma;
    this.syncTarget();
  }

  setStrength(value: number): void {
    this.material.uniforms.uStrength.value = value;
  }

  setChroma(value: number): void {
    this.material.uniforms.uChroma.value = value;
  }

  setOverscan(value: number): void {
    this.material.uniforms.uOverscan.value = value;
  }

  setBackground(r: number, g: number, b: number): void {
    this.material.uniforms.uBg.value = [r, g, b];
  }

  /** Scene-target coverage as a fraction of the output film (not RT pixels). */
  coverageSpan(): { x: number; y: number } {
    return {
      x: this.cropW / this.outputW,
      y: this.cropH / this.outputH,
    };
  }

  /**
   * Map a canvas NDC click through the pincushion / overscan crop
   * to NDC for the scene camera (view offset applied).
   */
  screenToNdc(x: number, y: number, out: Vector2): boolean {
    const dx = x * 0.5;
    const dy = y * 0.5;
    const r2 = dx * dx + dy * dy;
    const k = this.material.uniforms.uStrength.value * 2.2;
    const scale = 1 / Math.max(this.material.uniforms.uOverscan.value, 0.05);
    const pinch = Math.max(1 - k * r2, 0);
    const srcx = 0.5 + dx * pinch * scale;
    const srcy = 0.5 + dy * pinch * scale;
    const rt = this.material.uniforms.uRtScale.value as Vector2;
    const rtx = 0.5 + (srcx - 0.5) * rt.x;
    const rty = 0.5 + (srcy - 0.5) * rt.y;
    if (rtx < 0 || rtx > 1 || rty < 0 || rty > 1) return false;
    out.set(rtx * 2 - 1, rty * 2 - 1);
    return true;
  }

  applyCameraCoverage(camera: PerspectiveCamera): void {
    const fullW = this.outputW;
    const fullH = this.outputH;
    if (this.cropW >= fullW && this.cropH >= fullH) {
      camera.clearViewOffset();
      camera.aspect = fullW / fullH;
      camera.updateProjectionMatrix();
      return;
    }
    camera.setViewOffset(
      fullW,
      fullH,
      (fullW - this.cropW) / 2,
      (fullH - this.cropH) / 2,
      this.cropW,
      this.cropH,
    );
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }

  private rebuildTarget(): void {
    const { width, height } = this.target;
    this.target.dispose();
    this.target = makeTarget(width, height, this.samples);
    this.material.uniforms.tDiffuse.value = this.target.texture;
  }

  private syncTarget(): void {
    const scale = 1 / Math.max(this.coverageOverscan, 0.05);
    const chroma = Math.max(0, this.coverageChroma);
    const half = scale * (0.5 + chroma * 0.5 * 3.4);
    const spanU = Math.min(1, 2 * half + 4 / this.outputW);
    const spanV = Math.min(1, 2 * half + 4 / this.outputH);
    this.cropW = Math.max(
      1,
      Math.min(this.outputW, Math.round(spanU * this.outputW)),
    );
    this.cropH = Math.max(
      1,
      Math.min(this.outputH, Math.round(spanV * this.outputH)),
    );
    const rtW = Math.max(
      1,
      Math.min(
        this.maxTextureSize,
        Math.round(
          this.captureScale > 1
            ? this.outputW * this.captureScale
            : this.cropW,
        ),
      ),
    );
    const rtH = Math.max(
      1,
      Math.min(
        this.maxTextureSize,
        Math.round(
          this.captureScale > 1
            ? this.outputH * this.captureScale
            : this.cropH,
        ),
      ),
    );
    this.target.setSize(rtW, rtH);
    this.material.uniforms.uRtScale.value.set(
      this.outputW / this.cropW,
      this.outputH / this.cropH,
    );
    this.material.uniforms.uTexel.value.set(1 / rtW, 1 / rtH);
    this.material.uniforms.uAA.value =
      this.captureScale > 1
        ? (0.6 * rtW) / Math.max(1, this.outputW)
        : 0;
  }
}
