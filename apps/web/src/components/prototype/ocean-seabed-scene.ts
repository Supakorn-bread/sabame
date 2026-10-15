import type {
  BufferGeometry,
  Group,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector2,
} from "three";

type ThreeModule = typeof import("three");

export type SeabedScene = {
  scene: Scene;
  camera: PerspectiveCamera;
  bubbleOrigins: [Vector2, Vector2, Vector2];
  resize: (width: number, height: number, pixelRatio: number) => void;
  update: (time: number, dark: boolean) => void;
  dispose: () => void;
};

type Plant = {
  group: Group;
  anchor: number;
  depth: number;
  seed: number;
};

type PlantSpec = {
  anchor: number;
  depth: number;
  scale: number;
  stalkCount: 3 | 4;
};

type BubbleAnchor = {
  anchor: number;
  depth: number;
  origin: Vector2;
};

function duneHeight(x: number, z: number) {
  return (
    Math.sin(x * 0.17 + z * 0.085) * 0.42 +
    Math.sin(x * 0.075 - z * 0.19) * 0.26 +
    Math.sin(x * 0.33 + z * 0.16) * 0.08
  );
}

export function createSeabedScene(THREE: ThreeModule): SeabedScene {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#153346", 0.023);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 160);
  camera.position.set(0, 10, 24);
  camera.lookAt(0, -1, -7);
  camera.updateMatrixWorld();
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshStandardMaterial>();
  const plants: Plant[] = [];
  const rocks: { mesh: import("three").Mesh; anchor: number; depth: number }[] = [];
  const bubbleAnchors: [BubbleAnchor, BubbleAnchor, BubbleAnchor] = [
    { anchor: -0.64, depth: -3, origin: new THREE.Vector2() },
    { anchor: 0, depth: 5, origin: new THREE.Vector2() },
    { anchor: 0.64, depth: 1, origin: new THREE.Vector2() },
  ];
  const bubbleOrigins: [Vector2, Vector2, Vector2] = [
    bubbleAnchors[0].origin,
    bubbleAnchors[1].origin,
    bubbleAnchors[2].origin,
  ];
  const bubbleProjectionPosition = new THREE.Vector3();
  const viewport = { value: new THREE.Vector2(1, 1) };
  const time = { value: 0 };
  const darkness = { value: 0 };

  scene.add(new THREE.HemisphereLight("#6896a4", "#233f43", 0.95));
  scene.add(new THREE.AmbientLight("#557f82", 0.28));
  const light = new THREE.DirectionalLight("#8aafbd", 1.4);
  light.position.set(-16, 30, 15);
  scene.add(light);
  const fill = new THREE.DirectionalLight("#236f83", 0.3);
  fill.position.set(20, 8, -20);
  scene.add(fill);

  const makeMaterial = (color: string, kind: "sand" | "plant" | "rock") => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      transparent: true,
      side: kind === "plant" ? THREE.DoubleSide : THREE.FrontSide,
      vertexColors: kind === "sand",
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBedViewport = viewport;
      shader.uniforms.uBedTime = time;
      shader.uniforms.uBedDark = darkness;
      shader.vertexShader = `uniform float uBedTime; varying vec3 vBedPosition;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        ${kind === "plant" ? "transformed.x += sin(uBedTime * 0.48 + position.y * 0.65) * position.y * position.y * 0.009;" : ""}
        vBedPosition = transformed;`,
      );
      shader.fragmentShader = `uniform vec2 uBedViewport; uniform float uBedTime; uniform float uBedDark; varying vec3 vBedPosition;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb *= mix(1.0, 0.72, uBedDark);
        ${kind === "sand" ? `
          float ripple = sin(vBedPosition.x * 4.6 + vBedPosition.z * 2.1 + sin(vBedPosition.z * 0.4));
          diffuseColor.rgb *= 0.94 + ripple * 0.045;
          float caustic = sin(vBedPosition.x * 0.9 + vBedPosition.z * 1.4 + uBedTime * 0.18);
          caustic *= sin(vBedPosition.x * 1.6 - vBedPosition.z * 0.7 - uBedTime * 0.14);
          diffuseColor.rgb += vec3(0.006, 0.012, 0.013) * smoothstep(0.62, 0.95, caustic);
        ` : ""}
        diffuseColor.a *= 1.0 - smoothstep(0.55, 0.85, gl_FragCoord.y / uBedViewport.y);`,
      );
    };
    material.customProgramCacheKey = () => `ocean-bed-${kind}`;
    materials.add(material);
    return material;
  };

  const sandMaterial = makeMaterial("#899180", "sand");
  const leafMaterial = makeMaterial("#34746a", "plant");
  const stemMaterial = makeMaterial("#2b6960", "plant");
  const rockMaterial = makeMaterial("#465955", "rock");
  const terrain = new THREE.PlaneGeometry(1, 100, 144, 100);
  terrain.rotateX(-Math.PI / 2);
  terrain.translate(0, -1, -24);
  const terrainColors = new THREE.BufferAttribute(
    new Float32Array(terrain.getAttribute("position").count * 3),
    3,
  );
  terrain.setAttribute("color", terrainColors);
  geometries.add(terrain);
  const ground = new THREE.Mesh(terrain, sandMaterial);
  scene.add(ground);
  const sandShadow = new THREE.Color("#758575");
  const sandLight = new THREE.Color("#a4a794");

  const mergeGeometry = (parts: BufferGeometry[]) => {
    const positions: number[] = [];
    const normals: number[] = [];
    parts.forEach((part) => {
      const source = part.index ? part.toNonIndexed() : part;
      const position = source.getAttribute("position");
      const normal = source.getAttribute("normal");
      for (let index = 0; index < position.count; index++) {
        positions.push(position.getX(index), position.getY(index), position.getZ(index));
        normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
      }
      if (source !== part) source.dispose();
      part.dispose();
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometries.add(geometry);
    return geometry;
  };

  const makeLeaf = (length: number, width: number) => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row <= 8; row++) {
      const progress = row / 8;
      const breadth = Math.sin(Math.PI * progress) * width;
      for (let column = -1; column <= 1; column++) {
        positions.push(
          column * breadth,
          progress * length,
          Math.sin(progress * Math.PI) * length * 0.14 + (1 - Math.abs(column)) * breadth * 0.25,
        );
      }
      if (row < 8) {
        for (let column = 0; column < 2; column++) {
          const start = row * 3 + column;
          indices.push(start, start + 1, start + 3, start + 1, start + 4, start + 3);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };

  const plantSpecs: PlantSpec[] = [
    { anchor: -0.92, depth: 4, scale: 0.8, stalkCount: 4 },
    { anchor: -0.78, depth: -11, scale: 0.68, stalkCount: 3 },
    { anchor: -0.86, depth: -24, scale: 0.58, stalkCount: 3 },
    { anchor: -0.43, depth: 1, scale: 0.86, stalkCount: 3 },
    { anchor: -0.34, depth: -19, scale: 0.62, stalkCount: 3 },
    { anchor: -0.23, depth: -5, scale: 0.74, stalkCount: 3 },
    { anchor: -0.39, depth: -29, scale: 0.56, stalkCount: 3 },
    { anchor: 0.17, depth: 4, scale: 0.82, stalkCount: 3 },
    { anchor: 0.28, depth: -13, scale: 0.7, stalkCount: 3 },
    { anchor: 0.43, depth: -3, scale: 0.78, stalkCount: 3 },
    { anchor: 0.47, depth: -25, scale: 0.6, stalkCount: 3 },
    { anchor: 0.83, depth: 2, scale: 0.8, stalkCount: 4 },
    { anchor: 0.91, depth: -10, scale: 0.68, stalkCount: 3 },
    { anchor: 0.78, depth: -23, scale: 0.61, stalkCount: 3 },
  ];
  plantSpecs.forEach(({ anchor, depth, scale, stalkCount }, index) => {
    const seed = (index * 0.61803398875 + 0.2) % 1;
    const group = new THREE.Group();
    const stems: BufferGeometry[] = [];
    const leaves: BufferGeometry[] = [];
    for (let stalk = 0; stalk < stalkCount; stalk++) {
      const height = 3.5 + seed * 2.7 + Math.sin(stalk * 2.1 + index) * 1.1;
      const bend = Math.sin(stalk * 2.7 + index) * 0.95;
      const origin = new THREE.Vector3((stalk - (stalkCount - 1) / 2) * 0.48, 0, Math.cos(stalk * 3) * 0.3);
      const curve = new THREE.CatmullRomCurve3([
        origin,
        new THREE.Vector3(origin.x + bend * 0.2, height * 0.3, origin.z - 0.12),
        new THREE.Vector3(origin.x + bend * 0.7, height * 0.7, origin.z + 0.25),
        new THREE.Vector3(origin.x + bend, height, origin.z + 0.4),
      ]);
      stems.push(new THREE.TubeGeometry(curve, 10, 0.045, 5, false));
      for (let leaf = 0; leaf < 7; leaf++) {
        const progress = 0.19 + leaf * 0.1;
        const side = leaf % 2 === 0 ? 1 : -1;
        const start = curve.getPoint(progress);
        const branchTip = start.clone().add(new THREE.Vector3(side * 0.44, 0.23, 0.1));
        const branch = new THREE.CatmullRomCurve3([
          start,
          start.clone().lerp(branchTip, 0.55).add(new THREE.Vector3(0, 0.12, 0)),
          branchTip,
        ]);
        stems.push(new THREE.TubeGeometry(branch, 4, 0.026, 4, false));
        const blade = makeLeaf(1.05 + seed * 0.6 + Math.sin(leaf + stalk) * 0.16, 0.23 + seed * 0.1);
        blade.rotateZ(-side * (0.85 + seed * 0.3));
        blade.rotateY(Math.sin(leaf * 2.5 + stalk) * 0.7);
        blade.translate(branchTip.x, branchTip.y, branchTip.z);
        leaves.push(blade);
      }
    }
    group.add(new THREE.Mesh(mergeGeometry(stems), stemMaterial));
    group.add(new THREE.Mesh(mergeGeometry(leaves), leafMaterial));
    group.rotation.y = seed * 0.7 - 0.35;
    group.scale.setScalar(scale);
    scene.add(group);
    plants.push({ group, anchor, depth, seed });
  });

  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  geometries.add(rockGeometry);
  for (let index = 0; index < 18; index++) {
    const seed = (index * 0.754877666 + 0.19) % 1;
    const mesh = new THREE.Mesh(rockGeometry, rockMaterial);
    const size = index < 7 ? 0.8 + seed * 1.1 : 0.2 + seed * 0.25;
    mesh.scale.set(size * (1.2 + seed), size * 0.62, size * 0.92);
    mesh.rotation.set(seed * 0.4, seed * 5, seed * 0.3);
    const anchor = ((index * 0.61803398875 + 0.14) % 1) * 1.9 - 0.95;
    const depth = index < 7 ? 5 - seed * 15 : 14 - seed * 25;
    scene.add(mesh);
    rocks.push({ mesh, anchor, depth });
  }

  const horizontalExtent = (z: number) => {
    const distance = direction.y * -10 + direction.z * (z - 24);
    return distance * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
  };

  return {
    scene,
    camera,
    bubbleOrigins,
    resize(width, height, pixelRatio) {
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      viewport.value.set(width * pixelRatio, height * pixelRatio);
      const position = terrain.getAttribute("position");
      const terrainWidth = Math.max(48, horizontalExtent(-74) * 2.3);
      for (let index = 0; index < position.count; index++) {
        const column = index % 145;
        const x = (column / 144 - 0.5) * terrainWidth;
        const z = position.getZ(index);
        const elevation = duneHeight(x, z);
        position.setXYZ(index, x, elevation - 1, z);
        const color = sandShadow.clone().lerp(sandLight, (elevation + 0.76) / 1.52);
        terrainColors.setXYZ(index, color.r, color.g, color.b);
      }
      position.needsUpdate = true;
      terrainColors.needsUpdate = true;
      terrain.computeVertexNormals();
      terrain.computeBoundingSphere();
      plants.forEach(({ group, anchor, depth }) => {
        const x = anchor * horizontalExtent(depth) * 0.92;
        group.position.set(x, duneHeight(x, depth) - 1, depth);
      });
      rocks.forEach(({ mesh, anchor, depth }) => {
        const x = anchor * horizontalExtent(depth);
        mesh.position.set(x, duneHeight(x, depth) - 1 + mesh.scale.y * 0.5, depth);
      });
      bubbleAnchors.forEach(({ anchor, depth, origin }) => {
        const x = anchor * horizontalExtent(depth) * 0.92;
        bubbleProjectionPosition
          .set(x, duneHeight(x, depth) - 1 + 0.03, depth)
          .project(camera);
        origin.set(
          ((bubbleProjectionPosition.x + 1) / 2) * width,
          ((bubbleProjectionPosition.y + 1) / 2) * height,
        );
      });
    },
    update(phase, dark) {
      time.value = phase;
      darkness.value = dark ? 1 : 0;
      plants.forEach(({ group, seed }) => {
        group.rotation.z = Math.sin(phase * 0.32 + seed * 8) * 0.025;
      });
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      scene.clear();
    },
  };
}
