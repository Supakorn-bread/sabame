import type { Texture } from "three";

type ThreeModule = typeof import("three");

const logoVertexShader = `
  uniform float uTime;
  uniform float uSeed;
  uniform float uSize;
  uniform float uFacing;
  uniform float uAngle;
  uniform vec2 uCenter;
  uniform vec2 uViewport;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec2 point = position.xy;
    float tailUv = uFacing < 0.0 ? 1.0 - uv.x : uv.x;
    float tail = (1.0 - smoothstep(0.08, 0.39, tailUv)) * smoothstep(0.10, 0.58, abs(uFacing));
    float beat = sin(uTime * 3.6 + uSeed * 15.0 - tailUv * 5.0);
    point.y += beat * tail * tail * 0.040;
    point.x += cos(uTime * 3.6 + uSeed * 15.0) * tail * 0.009;
    float projection = sqrt(uFacing * uFacing + 0.1444 * (1.0 - uFacing * uFacing));
    point.x *= projection;
    float c = cos(uAngle);
    float s = sin(uAngle);
    point = mat2(c, s, -s, c) * point;
    vec2 screen = (uCenter + point * uSize) / uViewport;
    gl_Position = vec4(screen * 2.0 - 1.0, 0.0, 1.0);
  }
`;

const logoFragmentShader = `
  uniform sampler2D uLogo;
  uniform float uOpacity;
  uniform float uDark;
  uniform float uHaze;
  uniform float uFacing;
  varying vec2 vUv;

  void main() {
    float facing = abs(uFacing);
    float projection = sqrt(facing * facing + 0.1444 * (1.0 - facing * facing));
    vec2 sideUv = vec2(0.5 + (vUv.x - 0.5) * projection / max(facing, 0.025), vUv.y);
    if (uFacing < 0.0) sideUv.x = 1.0 - sideUv.x;
    vec4 side = texture2D(uLogo, clamp(sideUv, 0.0, 1.0));
    side.a *= step(0.0, sideUv.x) * step(sideUv.x, 1.0);
    side.a *= smoothstep(0.10, 0.58, facing);

    vec2 headPoint = (vUv - vec2(0.5, 0.49)) / vec2(0.43, 0.28);
    float headShape = 1.0 - smoothstep(0.93, 1.0, dot(headPoint, headPoint));
    vec4 headSample = texture2D(uLogo, vec2(0.75 + headPoint.x * 0.08, 0.49 + headPoint.y * 0.22));
    float roundedLight = 0.84 + 0.16 * sqrt(max(0.0, 1.0 - dot(headPoint, headPoint)));
    vec3 headColor = headSample.rgb * roundedLight;
    float eye = length((headPoint - vec2(0.59, 0.06)) / vec2(0.075, 0.19));
    eye = min(eye, length((headPoint - vec2(-0.59, 0.06)) / vec2(0.075, 0.19)));
    headColor = mix(headColor, vec3(0.035, 0.11, 0.20), (1.0 - smoothstep(0.80, 1.0, eye)) * 0.85);
    float headAlpha = headShape * (1.0 - smoothstep(0.18, 0.65, facing));
    float alpha = side.a + headAlpha * (1.0 - side.a);
    vec4 logo = vec4((side.rgb * side.a + headColor * headAlpha * (1.0 - side.a)) / max(alpha, 0.001), alpha);
    if (logo.a < 0.015) discard;
    vec3 color = logo.rgb * mix(1.0, 0.70, uDark);
    color = mix(color, vec3(0.025, 0.12, 0.19), uHaze);
    gl_FragColor = vec4(color, logo.a * uOpacity);
    #include <colorspace_fragment>
  }
`;

export function createLogoFish(THREE: ThreeModule, texture: Texture) {
  const uniforms = {
    uLogo: { value: texture },
    uTime: { value: 0 },
    uSeed: { value: 0 },
    uSize: { value: 100 },
    uFacing: { value: 1 },
    uAngle: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uOpacity: { value: 1 },
    uDark: { value: 0 },
    uHaze: { value: 0 },
  };
  const geometry = new THREE.PlaneGeometry(1, 1, 40, 8);
  const material = new THREE.ShaderMaterial({
    vertexShader: logoVertexShader,
    fragmentShader: logoFragmentShader,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, geometry, material, uniforms };
}

export type LogoFish = ReturnType<typeof createLogoFish>;
