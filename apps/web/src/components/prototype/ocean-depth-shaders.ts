export const depthVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const depthFragmentShader = `
  uniform float uTime;
  uniform float uDark;
  uniform vec2 uResolution;
  uniform vec3 uStartColor;
  uniform vec3 uFloorColor;
  varying vec2 vUv;

  void main() {
    float depth = 1.0 - vUv.y;
    float aspect = uResolution.x / uResolution.y;
    vec3 middle = mix(vec3(0.010, 0.032, 0.070), vec3(0.006, 0.014, 0.036), uDark);
    vec3 color = mix(uStartColor, middle, smoothstep(0.0, 0.78, depth));
    color = mix(color, uFloorColor * 0.74, smoothstep(0.68, 1.0, depth));

    float rays = 0.0;
    for (int i = 0; i < 4; i++) {
      float index = float(i);
      float origin = 0.12 + index * 0.27;
      float sway = sin(uTime * 0.11 + index * 1.9 + depth * 2.0) * 0.018;
      float center = origin + depth * (0.12 + index * 0.018) + sway;
      float width = 0.028 + depth * 0.034;
      float beam = exp(-pow((vUv.x - center) * max(aspect, 0.5) / width, 2.0));
      rays += beam * (0.55 + 0.25 * sin(index * 2.3 + uTime * 0.08));
    }
    float attenuation = exp(-depth * 3.9) * smoothstep(0.0, 0.10, depth);
    color += vec3(0.030, 0.100, 0.125) * rays * attenuation * mix(0.65, 0.32, uDark);

    float drift = sin(vUv.x * 5.0 + uTime * 0.045) * 0.018;
    float haze = exp(-pow((depth - 0.84 + drift) / 0.16, 2.0));
    float pockets = 0.5 + 0.5 * sin(vUv.x * 7.0 - uTime * 0.035);
    color += vec3(0.005, 0.013, 0.019) * haze * pockets * smoothstep(0.1, 0.4, depth);
    float vignette = smoothstep(0.22, 0.72, abs(vUv.x - 0.5));
    color *= 1.0 - vignette * 0.24 * smoothstep(0.0, 0.3, depth);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const particleVertexShader = `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vOpacity;

  void main() {
    float y = mod(position.y + 1.0 + uTime * (0.008 + aSeed * 0.006), 2.0) - 1.0;
    float x = position.x + sin(uTime * 0.09 + aSeed * 14.0 + y) * 0.024;
    float depth = (1.0 - y) * 0.5;
    vOpacity = (0.05 + aSeed * 0.13) * smoothstep(0.03, 0.18, depth);
    vOpacity *= 1.0 - smoothstep(0.75, 1.0, depth) * 0.65;
    gl_Position = vec4(x, y, 0.0, 1.0);
    gl_PointSize = (1.0 + aSeed * 1.8) * uPixelRatio;
  }
`;

export const particleFragmentShader = `
  varying float vOpacity;

  void main() {
    float distanceToCenter = length(gl_PointCoord - vec2(0.5));
    float glow = 1.0 - smoothstep(0.1, 0.5, distanceToCenter);
    gl_FragColor = vec4(vec3(0.40, 0.66, 0.74), glow * vOpacity);
    #include <colorspace_fragment>
  }
`;

export const bubbleVertexShader = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2 uBubbleOrigins[3];
  uniform vec2 uViewport;
  attribute float aSeed;
  attribute float aDelay;
  attribute float aSize;
  varying float vOpacity;
  varying float vSeed;

  void main() {
    float cycle = mod(uTime - aDelay, 10.0);
    float lifetime = 4.0 + aSeed * 2.0;
    float visibilityGate = 1.0 - step(lifetime, cycle);
    float progress = clamp(cycle / lifetime, 0.0, 1.0);
    float fadeIn = smoothstep(0.0, 0.10, cycle);
    float fadeOut = 1.0 - smoothstep(lifetime * 0.72, lifetime, cycle);
    float burst = floor((uTime - aDelay) / 10.0);
    float source = mod(burst, 3.0);
    vec2 origin = uBubbleOrigins[0];
    if (source > 0.5) origin = uBubbleOrigins[1];
    if (source > 1.5) origin = uBubbleOrigins[2];
    float spread = (aSeed - 0.5) * 18.0 * smoothstep(0.0, 0.16, progress);
    float drift = (sin(progress * 3.6 + aSeed * 12.0) - sin(aSeed * 12.0)) * 4.0;
    drift += (aSeed - 0.5) * progress * 4.0;
    float rise = 110.0 + sin(aSeed * 17.0) * 45.0 + aSeed * 50.0;
    float ascentExponent = 0.72 + 0.56 * (0.5 + 0.5 * sin(aSeed * 23.0));
    float ascent = pow(progress, ascentExponent);
    float x = origin.x + spread + drift;
    float y = origin.y + aSize * 0.43 + ascent * rise;

    vOpacity = visibilityGate * fadeIn * fadeOut;
    vSeed = aSeed;
    gl_Position = vec4(
      x / uViewport.x * 2.0 - 1.0,
      y / uViewport.y * 2.0 - 1.0,
      0.0,
      1.0
    );
    gl_PointSize = aSize * uPixelRatio * visibilityGate;
  }
`;

export const bubbleFragmentShader = `
  varying float vOpacity;
  varying float vSeed;

  void main() {
    float distanceToCenter = length(gl_PointCoord - vec2(0.5));
    float ring = (1.0 - smoothstep(0.39, 0.47, distanceToCenter))
      * smoothstep(0.25, 0.32, distanceToCenter);
    float highlight = smoothstep(0.48, 0.72, gl_PointCoord.y);
    vec3 color = mix(vec3(0.38, 0.74, 0.79), vec3(0.88, 0.98, 0.96), highlight);
    float alpha = ring * vOpacity * (0.34 + vSeed * 0.10 + highlight * 0.26);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;
