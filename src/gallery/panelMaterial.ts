import {
  MeshBasicMaterial,
  type IUniform,
  type MeshBasicMaterialParameters,
} from "three";

type CornerUniforms = {
  uRadius: IUniform<number>;
  uAspect: IUniform<number>;
  uSaturation: IUniform<number>;
};

const CORNER_VERT = /* glsl */ `
varying vec2 vCornerUv;
`;

const CORNER_FRAG = /* glsl */ `
uniform float uRadius;
uniform float uAspect;
uniform float uSaturation;
varying vec2 vCornerUv;

void applyPanelFinish() {
  float luma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor.rgb = mix(vec3(luma), gl_FragColor.rgb, clamp(uSaturation, 0.0, 1.0));

  vec2 rs = vec2(max(uAspect, 0.001), 1.0);
  vec2 uv = vCornerUv * rs;
  vec2 halfSize = 0.5 * rs;
  float rad = clamp(uRadius, 0.0, 0.49) * min(rs.x, rs.y);
  vec2 q = abs(uv - halfSize) - halfSize + rad;
  float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rad;
  float aa = max(fwidth(d), 0.0015);
  float coverage = 1.0 - smoothstep(-aa, aa, d);
  gl_FragColor.a *= coverage;
  gl_FragColor.rgb *= coverage;
}
`;

export function createPanelMaterial(
  params: MeshBasicMaterialParameters,
  radius: number,
  aspect: number,
): MeshBasicMaterial {
  const uniforms: CornerUniforms = {
    uRadius: { value: radius },
    uAspect: { value: aspect },
    uSaturation: { value: 1 },
  };

  const material = new MeshBasicMaterial({
    ...params,
    toneMapped: false,
    transparent: true,
    premultipliedAlpha: true,
  });
  material.userData.corners = uniforms;
  material.customProgramCacheKey = () => "ring-panel-round-v6";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRadius = uniforms.uRadius;
    shader.uniforms.uAspect = uniforms.uAspect;
    shader.uniforms.uSaturation = uniforms.uSaturation;
    shader.vertexShader =
      CORNER_VERT +
      shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
vCornerUv = uv;`,
      );
    shader.fragmentShader = (
      CORNER_FRAG + shader.fragmentShader
    ).replace(
      "#include <dithering_fragment>",
      `applyPanelFinish();
#include <dithering_fragment>`,
    );
  };
  return material;
}

export function setPanelCorners(
  material: MeshBasicMaterial,
  radius: number,
  aspect: number,
): void {
  const uniforms = material.userData.corners as CornerUniforms | undefined;
  if (!uniforms) return;
  uniforms.uRadius.value = radius;
  uniforms.uAspect.value = aspect;
}

export function setPanelSaturation(
  material: MeshBasicMaterial,
  saturation: number,
): void {
  const uniforms = material.userData.corners as CornerUniforms | undefined;
  if (!uniforms) return;
  uniforms.uSaturation.value = saturation;
}
