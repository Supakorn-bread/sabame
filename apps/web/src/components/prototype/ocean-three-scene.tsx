"use client";

import { useEffect, useRef, useState } from "react";
import type {
  BufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
  WebGLRenderer,
} from "three";

import {
  bubbleFragmentShader,
  bubbleVertexShader,
  depthFragmentShader,
  depthVertexShader,
  particleFragmentShader,
  particleVertexShader,
} from "./ocean-depth-shaders";
import {
  getFishVerticalPosition,
  sampleFishTrack,
} from "./ocean-fish-motion";
import { createLogoFish, type LogoFish } from "./ocean-logo-fish";
import { createSeabedScene, type SeabedScene } from "./ocean-seabed-scene";

const FRAME_INTERVAL = 1000 / 30;
const FAR_EDGE_Z = -190;

type FishActor = {
  fish: LogoFish;
  seed: number;
  lane: number;
  depth: number;
  size: number;
  speed: number;
};

type BubbleActor = {
  seed: number;
  delay: number;
  size: number;
};

const BUBBLES: BubbleActor[] = [
  { seed: 0.13, delay: 0.3, size: 8 },
  { seed: 0.27, delay: 0.48, size: 12 },
  { seed: 0.41, delay: 0.66, size: 15 },
  { seed: 0.56, delay: 0.84, size: 18 },
  { seed: 0.69, delay: 1.02, size: 10 },
  { seed: 0.82, delay: 1.2, size: 14 },
  { seed: 0.95, delay: 1.38, size: 16 },
];

type OceanThreeSceneProps = {
  mode: "surface" | "depth";
  paused: boolean;
  dark: boolean;
  onReady: (ready: boolean) => void;
  seabedHeight?: number;
};

const vertexShader = `
  uniform float uTime;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vDistance;

  vec3 swell(vec2 point, vec2 direction, float frequency, float amplitude, float speed) {
    float phase = dot(point, direction) * frequency + uTime * speed;
    float slope = cos(phase) * amplitude * frequency;
    return vec3(sin(phase) * amplitude, direction * slope);
  }

  void main() {
    vec3 wave = swell(position.xz, vec2(0.92, 0.39), 0.11, 0.52, 0.34);
    wave += swell(position.xz, vec2(-0.62, 0.78), 0.19, 0.24, -0.27);
    wave += swell(position.xz, vec2(0.28, 0.96), 0.34, 0.11, 0.43);
    wave += swell(position.xz, vec2(0.97, -0.24), 0.67, 0.035, -0.54);
    vec3 displaced = position + vec3(0.0, wave.x, 0.0);
    vNormal = normalize(vec3(-wave.y, 1.0, -wave.z));
    vPosition = displaced;
    vDistance = length(cameraPosition - displaced);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uDark;
  uniform float uWaterline;
  uniform vec2 uResolution;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vDistance;

  float skyNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 blend = fract(point);
    blend = blend * blend * (3.0 - 2.0 * blend);
    vec4 corners = fract(sin(vec4(
      dot(cell, vec2(127.1, 311.7)),
      dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7)),
      dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7)),
      dot(cell + vec2(1.0), vec2(127.1, 311.7))
    )) * 43758.5453);
    return mix(mix(corners.x, corners.y, blend.x), mix(corners.z, corners.w, blend.x), blend.y);
  }

  vec2 rippleSlope(vec2 point, vec2 direction, float frequency, float slope, float speed) {
    float phase = dot(point, direction) * frequency + uTime * speed;
    phase += sin(dot(point, vec2(-direction.y, direction.x)) * 0.18 + uTime * 0.08) * 0.7;
    return direction * cos(phase) * slope;
  }

  void main() {
    vec2 screen = gl_FragCoord.xy / uResolution;
    float depth = clamp((1.0 - screen.y - uWaterline) / max(1.0 - uWaterline, 0.01), 0.0, 1.0);
    vec2 point = vPosition.xz;
    vec2 detail = rippleSlope(point, vec2(0.84, 0.54), 1.27, 0.058, -0.63);
    detail += rippleSlope(point, vec2(-0.46, 0.89), 1.83, 0.046, 0.48);
    detail += rippleSlope(point, vec2(0.98, -0.20), 2.47, 0.032, -0.72);
    detail += rippleSlope(point, vec2(0.26, 0.97), 3.31, 0.021, 0.81);
    detail += rippleSlope(point, vec2(-0.79, 0.61), 4.63, 0.014, -0.91);
    detail += rippleSlope(point, vec2(0.60, -0.80), 6.19, 0.009, 1.02);
    detail *= 1.0 - smoothstep(50.0, 190.0, vDistance) * 0.88;
    vec3 normal = normalize(vNormal + vec3(-detail.x, 0.0, -detail.y));
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    vec3 reflected = reflect(-viewDirection, normal);
    vec3 lightDirection = normalize(vec3(-0.38, 0.72, 0.56));
    float fresnel = 0.035 + 0.965 * pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.0);

    vec3 shallow = mix(vec3(0.075, 0.39, 0.47), vec3(0.033, 0.19, 0.28), uDark);
    vec3 deep = mix(vec3(0.017, 0.13, 0.22), vec3(0.008, 0.046, 0.095), uDark);
    vec3 horizon = mix(vec3(0.49, 0.69, 0.75), vec3(0.13, 0.24, 0.35), uDark);
    vec3 zenith = mix(vec3(0.24, 0.47, 0.63), vec3(0.045, 0.10, 0.19), uDark);
    vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.85, reflected.y));
    vec2 skyPoint = reflected.xz / max(0.35, abs(reflected.y)) * 1.4;
    skyPoint += vec2(uTime * 0.009, uTime * 0.003);
    float clouds = skyNoise(skyPoint) * 0.62 + skyNoise(skyPoint * 2.13 + 7.4) * 0.26;
    clouds += skyNoise(skyPoint * 4.27 - 3.7) * 0.12;
    sky = mix(sky, mix(vec3(0.70, 0.79, 0.80), vec3(0.20, 0.28, 0.35), uDark), smoothstep(0.38, 0.76, clouds) * 0.48);
    vec3 color = mix(shallow, deep, pow(depth, 0.68));
    color *= 0.88 + max(dot(normal, lightDirection), 0.0) * 0.16;
    color = mix(color, sky, fresnel * (0.55 - depth * 0.12));

    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float roughness = 0.28 + skyNoise(point * 0.09 + 2.0) * 0.14;
    float specular = pow(max(dot(normal, halfDirection), 0.0), mix(70.0, 24.0, roughness));
    vec3 lightColor = mix(vec3(0.90, 0.94, 0.86), vec3(0.43, 0.59, 0.72), uDark);
    color += lightColor * specular * mix(0.16, 0.065, uDark) * (1.0 - depth * 0.50);
    float crest = smoothstep(0.018, 0.09, normal.z - vNormal.z);
    color += horizon * crest * 0.018 * (1.0 - depth * 0.40);
    float haze = smoothstep(65.0, 195.0, vDistance) * 0.17;
    color = mix(color, horizon, haze);
    float edge = exp(-max(vPosition.z + 190.0, 0.0) * 0.60);
    color += lightColor * edge * 0.12;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function OceanThreeScene({
  mode,
  paused,
  dark,
  onReady,
  seabedHeight = 0,
}: OceanThreeSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waterlineRef = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(true);
  const motionPaused = paused || !inView;
  const settingsRef = useRef({
    paused: motionPaused,
    dark,
    onReady,
    seabedHeight,
  });
  const updateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    settingsRef.current = { paused: motionPaused, dark, onReady, seabedHeight };
    updateRef.current?.();
  }, [motionPaused, dark, onReady, seabedHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const marker = waterlineRef.current;
    if (!canvas || (mode === "surface" && !marker)) return;

    let status: "loading" | "active" | "disposed" = "loading";
    let renderer: WebGLRenderer | null = null;
    let geometry: PlaneGeometry | null = null;
    let material: ShaderMaterial | null = null;
    let particleGeometry: BufferGeometry | null = null;
    let particleMaterial: ShaderMaterial | null = null;
    let bubbleGeometry: BufferGeometry | null = null;
    let bubbleMaterial: ShaderMaterial | null = null;
    let seabed: SeabedScene | null = null;
    const textures = new Set<Texture>();
    const school: FishActor[] = [];
    let observer: ResizeObserver | null = null;
    let visibilityObserver: IntersectionObserver | null = null;
    let frame = 0;
    let lastFrame: number | null = null;
    let phase = 0;
    let ready = false;
    let shaderFailed = false;
    let removeResizeListener: (() => void) | null = null;

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = null;
    };
    const dispose = () => {
      if (status === "disposed") return;
      status = "disposed";
      stop();
      observer?.disconnect();
      visibilityObserver?.disconnect();
      removeResizeListener?.();
      canvas.removeEventListener("webglcontextlost", handleContextLoss);
      updateRef.current = null;
      geometry?.dispose();
      material?.dispose();
      particleGeometry?.dispose();
      particleMaterial?.dispose();
      bubbleGeometry?.dispose();
      bubbleMaterial?.dispose();
      seabed?.dispose();
      school.forEach(({ fish }) => {
        fish.geometry.dispose();
        fish.material.dispose();
      });
      textures.forEach((texture) => texture.dispose());
      renderer?.dispose();
      renderer?.forceContextLoss();
    };
    const fail = () => {
      if (status === "disposed") return;
      canvas.style.visibility = "hidden";
      settingsRef.current.onReady(false);
      dispose();
    };
    function handleContextLoss(event: Event) {
      event.preventDefault();
      fail();
    }

    canvas.addEventListener("webglcontextlost", handleContextLoss);
    if (typeof IntersectionObserver !== "undefined") {
      visibilityObserver = new IntersectionObserver(
        ([entry]) => setInView(entry?.isIntersecting ?? false),
        { threshold: 0 },
      );
      visibilityObserver.observe(canvas);
    }

    const initialize = async () => {
      try {
        const THREE = await import("three");
        if (status === "disposed") return;

        const loadTexture = (path: string) =>
          new Promise<Texture<HTMLImageElement>>((resolve, reject) => {
            const texture = new THREE.TextureLoader().load(
              path,
              (loaded) => {
                if (status === "disposed") loaded.dispose();
                resolve(loaded);
              },
              undefined,
              reject,
            );
            texture.colorSpace = THREE.SRGBColorSpace;
            textures.add(texture);
          });
        const logo =
          mode === "depth"
            ? await loadTexture("/sabame-mark.webp")
            : null;
        if (status !== "loading") return;

        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        });
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.debug.onShaderError = () => {
          shaderFailed = true;
        };
        const scene = new THREE.Scene();
        const bubbleScene = new THREE.Scene();
        const surfaceCamera =
          mode === "surface"
            ? new THREE.PerspectiveCamera(42, 1, 0.1, 500)
            : null;
        const camera =
          surfaceCamera ?? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        if (surfaceCamera) {
          surfaceCamera.position.set(0, 11, 25);
          surfaceCamera.lookAt(0, 0, -45);
        } else {
          camera.position.z = 1;
        }
        camera.updateMatrixWorld();

        const uniforms = {
          uTime: { value: 0 },
          uDark: { value: settingsRef.current.dark ? 1 : 0 },
          uWaterline: { value: 0.66 },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uViewport: { value: new THREE.Vector2(1, 1) },
          uBubbleOrigins: {
            value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()],
          },
          uStartColor: {
            value: new THREE.Color(
              settingsRef.current.dark ? "#081e38" : "#0b3d68",
            ),
          },
          uFloorColor: { value: new THREE.Color("#061625") },
          uPixelRatio: { value: 1 },
        };
        geometry =
          mode === "surface"
            ? new THREE.PlaneGeometry(420, 250, 120, 84)
            : new THREE.PlaneGeometry(2, 2);
        if (mode === "surface") {
          geometry.rotateX(-Math.PI / 2);
          geometry.translate(0, 0, -65);
        }
        material = new THREE.ShaderMaterial({
          vertexShader: mode === "surface" ? vertexShader : depthVertexShader,
          fragmentShader:
            mode === "surface" ? fragmentShader : depthFragmentShader,
          uniforms,
          side: THREE.DoubleSide,
          depthTest: mode === "surface",
          depthWrite: mode === "surface",
        });
        const ocean = new THREE.Mesh(geometry, material);
        ocean.frustumCulled = false;
        scene.add(ocean);
        if (logo) {
          for (let index = 0; index < 14; index++) {
            const seed = (index * 0.61803398875 + 0.19) % 1;
            const depth = index % 3;
            const fish = createLogoFish(THREE, logo);
            fish.mesh.renderOrder = 4 - depth;
            fish.uniforms.uSeed.value = seed;
            fish.uniforms.uHaze.value = 0.12 + depth * 0.17;
            fish.uniforms.uOpacity.value = 0.72 - depth * 0.15;
            school.push({
              fish,
              seed,
              lane: (index + 0.55) / 14,
              depth,
              size: 114 - depth * 18 + seed * 14,
              speed: 19 + seed * 16,
            });
            scene.add(fish.mesh);
          }
        }
        if (mode === "depth") {
          seabed = createSeabedScene(THREE);
          uniforms.uBubbleOrigins.value = seabed.bubbleOrigins;
          const count = 76;
          const positions = new Float32Array(count * 3);
          const seeds = new Float32Array(count);
          for (let index = 0; index < count; index++) {
            positions[index * 3] = ((index * 0.61803398875 + 0.17) % 1) * 2 - 1;
            positions[index * 3 + 1] =
              ((index * 0.754877666 + 0.31) % 1) * 2 - 1;
            seeds[index] = (index * 0.414213562 + 0.23) % 1;
          }
          particleGeometry = new THREE.BufferGeometry();
          particleGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3),
          );
          particleGeometry.setAttribute(
            "aSeed",
            new THREE.BufferAttribute(seeds, 1),
          );
          particleMaterial = new THREE.ShaderMaterial({
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            uniforms,
            transparent: true,
            depthTest: false,
            depthWrite: false,
          });
          const particles = new THREE.Points(
            particleGeometry,
            particleMaterial,
          );
          particles.frustumCulled = false;
          particles.renderOrder = 1;
          scene.add(particles);

          const bubblePositions = new Float32Array(BUBBLES.length * 3);
          const bubbleSeeds = new Float32Array(BUBBLES.length);
          const bubbleDelays = new Float32Array(BUBBLES.length);
          const bubbleSizes = new Float32Array(BUBBLES.length);
          BUBBLES.forEach(({ seed, delay, size }, index) => {
            bubbleSeeds[index] = seed;
            bubbleDelays[index] = delay;
            bubbleSizes[index] = size;
          });
          bubbleGeometry = new THREE.BufferGeometry();
          bubbleGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(bubblePositions, 3),
          );
          bubbleGeometry.setAttribute(
            "aSeed",
            new THREE.BufferAttribute(bubbleSeeds, 1),
          );
          bubbleGeometry.setAttribute(
            "aDelay",
            new THREE.BufferAttribute(bubbleDelays, 1),
          );
          bubbleGeometry.setAttribute(
            "aSize",
            new THREE.BufferAttribute(bubbleSizes, 1),
          );
          bubbleMaterial = new THREE.ShaderMaterial({
            vertexShader: bubbleVertexShader,
            fragmentShader: bubbleFragmentShader,
            uniforms,
            transparent: true,
            depthTest: false,
            depthWrite: false,
          });
          const bubblePoints = new THREE.Points(bubbleGeometry, bubbleMaterial);
          bubblePoints.frustumCulled = false;
          bubblePoints.renderOrder = 2;
          bubbleScene.add(bubblePoints);
        }
        const edge = new THREE.Vector3(0, 0, FAR_EDGE_Z);
        let planeWidth = 420;
        let width = 0;
        let height = 0;
        let seabedWidth = 0;
        let seabedViewportHeight = 0;
        let seabedPixelRatio = 0;
        const savedViewport = new THREE.Vector4();
        const savedScissor = new THREE.Vector4();
        status = "active";

        const draw = () => {
          if (status !== "active" || !renderer || !width || !height) return;
          try {
            uniforms.uTime.value = phase;
            uniforms.uViewport.value.set(width, height);
            uniforms.uDark.value = settingsRef.current.dark ? 1 : 0;
            uniforms.uStartColor.value.set(
              settingsRef.current.dark ? "#081e38" : "#0b3d68",
            );
            school.forEach(({ fish, seed, lane, depth, size, speed }) => {
              const travelWidth = Math.max(
                width * 0.12,
                Math.min(
                  width * (0.38 + seed * 0.08),
                  width * 0.5 - size * 0.62 - 24,
                ),
              );
              const turnRadius = Math.min(
                size * 0.30 + depth * 7,
                travelWidth * 0.8,
              );
              const pathLength =
                (travelWidth - turnRadius) * 4 + Math.PI * turnRadius * 2;
              const pose = sampleFishTrack(
                phase * speed + seed * pathLength,
                travelWidth,
                turnRadius,
              );
              const driftPhase = phase * 0.19 + seed * 8;
              const x = width * 0.5 + pose.x;
              const y = getFishVerticalPosition({
                height,
                seabedHeight: settingsRef.current.seabedHeight,
                lane,
                turnRadius,
                size,
                pathOffsetY: pose.y,
                driftPhase,
              });
              const velocityX = pose.velocityX * speed;
              const velocityY =
                pose.velocityY * speed + Math.cos(driftPhase) * 1.33;
              const facing = pose.velocityX;
              const pitch = Math.atan2(
                velocityY,
                Math.hypot(velocityX, speed * 0.28),
              );
              const bank = -pose.velocityY * (1 - facing * facing) * 0.12;
              fish.uniforms.uTime.value = phase;
              fish.uniforms.uDark.value = settingsRef.current.dark ? 1 : 0;
              fish.uniforms.uViewport.value.set(width, height);
              fish.uniforms.uCenter.value.set(x, y);
              fish.uniforms.uSize.value = size;
              fish.uniforms.uFacing.value = facing;
              fish.uniforms.uAngle.value =
                Math.max(-0.28, Math.min(0.28, pitch)) * facing + bank;
            });
            renderer.render(scene, camera);
            const stripHeight = Math.max(
              0,
              Math.min(height, settingsRef.current.seabedHeight),
            );
            if (seabed && stripHeight > 0) {
              const pixelRatio = uniforms.uPixelRatio.value;
              if (
                seabedWidth !== width ||
                seabedViewportHeight !== stripHeight ||
                seabedPixelRatio !== pixelRatio
              ) {
                seabed.resize(width, stripHeight, pixelRatio);
                seabedWidth = width;
                seabedViewportHeight = stripHeight;
                seabedPixelRatio = pixelRatio;
              }
              seabed.update(phase, settingsRef.current.dark);
              renderer.getViewport(savedViewport);
              renderer.getScissor(savedScissor);
              const savedScissorTest = renderer.getScissorTest();
              const savedAutoClear = renderer.autoClear;
              try {
                renderer.autoClear = false;
                renderer.setViewport(0, 0, width, stripHeight);
                renderer.setScissor(0, 0, width, stripHeight);
                renderer.setScissorTest(true);
                renderer.clearDepth();
                renderer.render(seabed.scene, seabed.camera);
                renderer.setViewport(0, 0, width, height);
                renderer.setScissorTest(false);
                renderer.clearDepth();
                renderer.render(bubbleScene, camera);
              } finally {
                renderer.setViewport(savedViewport);
                renderer.setScissor(savedScissor);
                renderer.setScissorTest(savedScissorTest);
                renderer.autoClear = savedAutoClear;
              }
            }
            if (shaderFailed || renderer.getContext().isContextLost()) {
              fail();
              return;
            }
            if (!ready) {
              ready = true;
              canvas.style.visibility = "visible";
              settingsRef.current.onReady(true);
            }
          } catch {
            fail();
          }
        };
        const resize = () => {
          if (status !== "active" || !renderer) return;
          const bounds = canvas.getBoundingClientRect();
          width = bounds.width;
          height = bounds.height;
          if (!width || !height) return;
          const pixelRatio = Math.min(
            window.devicePixelRatio || 1,
            1.5,
            1920 / width,
            1440 / height,
          );
          renderer.setPixelRatio(pixelRatio);
          renderer.setSize(width, height, false);
          renderer.getDrawingBufferSize(uniforms.uResolution.value);
          uniforms.uPixelRatio.value = pixelRatio;
          if (surfaceCamera && marker) {
            const waterline = Math.max(
              0,
              Math.min(height, marker.getBoundingClientRect().top - bounds.top),
            );
            uniforms.uWaterline.value = waterline / height;
            surfaceCamera.aspect = width / height;
            const nextPlaneWidth = Math.max(
              420,
              2 *
                surfaceCamera.position.distanceTo(edge) *
                Math.tan((surfaceCamera.fov * Math.PI) / 360) *
                surfaceCamera.aspect *
                1.2,
            );
            geometry?.scale(nextPlaneWidth / planeWidth, 1, 1);
            planeWidth = nextPlaneWidth;
            surfaceCamera.updateProjectionMatrix();
            const projectedEdge = edge.clone().project(surfaceCamera);
            const waterlineNdc = 1 - (2 * waterline) / height;
            const projectionOffset = projectedEdge.y - waterlineNdc;
            surfaceCamera.projectionMatrix.elements[9] += projectionOffset;
            surfaceCamera.projectionMatrixInverse
              .copy(surfaceCamera.projectionMatrix)
              .invert();
          }
          draw();
        };
        const animate = (now: number) => {
          frame = 0;
          if (status !== "active" || settingsRef.current.paused) return;
          if (lastFrame === null) lastFrame = now;
          const elapsed = now - lastFrame;
          if (elapsed >= FRAME_INTERVAL) {
            phase += Math.min(elapsed - (elapsed % FRAME_INTERVAL), 100) / 1000;
            lastFrame = now - (elapsed % FRAME_INTERVAL);
            draw();
          }
          if (status === "active") frame = requestAnimationFrame(animate);
        };
        const update = () => {
          if (status !== "active") return;
          if (settingsRef.current.paused) stop();
          draw();
          if (!settingsRef.current.paused && !frame && status === "active") {
            frame = requestAnimationFrame(animate);
          }
        };
        updateRef.current = update;
        resize();
        if (status !== "active") return;
        observer =
          typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(resize);
        observer?.observe(canvas);
        if (!observer) {
          window.addEventListener("resize", resize);
          removeResizeListener = () =>
            window.removeEventListener("resize", resize);
        }
        update();
      } catch {
        if (status !== "disposed") fail();
      }
    };

    void initialize();
    return dispose;
  }, [mode]);

  return (
    <div
      data-testid={
        mode === "surface" ? "ocean-three-scene" : "ocean-depth-scene"
      }
      data-paused={motionPaused ? "true" : "false"}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      {mode === "surface" ? (
        <span
          ref={waterlineRef}
          data-testid="ocean-three-waterline-marker"
          style={{
            position: "absolute",
            top: "var(--ocean-waterline)",
            left: 0,
            width: 0,
            height: 0,
          }}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        data-testid={
          mode === "surface" ? "ocean-three-canvas" : "ocean-depth-canvas"
        }
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          visibility: "hidden",
        }}
      />
    </div>
  );
}
