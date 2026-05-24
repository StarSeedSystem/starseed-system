
export const vertexShader = `
  varying vec2 vUv;
  void main() {
    vec3 pos = position.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.);
    vUv = uv;
  }
`;

export const fragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  uniform vec3 uColor5;
  uniform vec3 uColor6;
  uniform float uSpeed;
  uniform float uIntensity;
  uniform sampler2D uTouchTexture;
  uniform float uGrainIntensity;
  uniform float uZoom;
  uniform vec3 uDarkNavy;
  uniform float uGradientSize;
  uniform float uGradientCount;
  uniform float uColor1Weight;
  uniform float uColor2Weight;
  
  varying vec2 vUv;
  
  // Grain function
  float grain(vec2 uv, float time) {
    vec2 grainUv = uv * uResolution * 0.5;
    float grainValue = fract(sin(dot(grainUv + time, vec2(12.9898, 78.233))) * 43758.5453);
    return grainValue * 2.0 - 1.0;
  }
  
  vec3 getGradientColor(vec2 uv, float time) {
    float gradientRadius = uGradientSize;
    
    // Multiple animated centers up to 12
    vec2 center1 = vec2(0.5 + sin(time * uSpeed * 0.4) * 0.4, 0.5 + cos(time * uSpeed * 0.5) * 0.4);
    vec2 center2 = vec2(0.5 + cos(time * uSpeed * 0.6) * 0.5, 0.5 + sin(time * uSpeed * 0.45) * 0.5);
    vec2 center3 = vec2(0.5 + sin(time * uSpeed * 0.35) * 0.45, 0.5 + cos(time * uSpeed * 0.55) * 0.45);
    vec2 center4 = vec2(0.5 + cos(time * uSpeed * 0.5) * 0.4, 0.5 + sin(time * uSpeed * 0.4) * 0.4);
    vec2 center5 = vec2(0.5 + sin(time * uSpeed * 0.7) * 0.35, 0.5 + cos(time * uSpeed * 0.6) * 0.35);
    vec2 center6 = vec2(0.5 + cos(time * uSpeed * 0.45) * 0.5, 0.5 + sin(time * uSpeed * 0.65) * 0.5);
    
    // Extra centers if gradient count permits
    vec2 center7 = vec2(0.5 + sin(time * uSpeed * 0.55) * 0.38, 0.5 + cos(time * uSpeed * 0.48) * 0.42);
    vec2 center8 = vec2(0.5 + cos(time * uSpeed * 0.65) * 0.36, 0.5 + sin(time * uSpeed * 0.52) * 0.44);
    vec2 center9 = vec2(0.5 + sin(time * uSpeed * 0.42) * 0.41, 0.5 + cos(time * uSpeed * 0.58) * 0.39);
    vec2 center10 = vec2(0.5 + cos(time * uSpeed * 0.48) * 0.37, 0.5 + sin(time * uSpeed * 0.62) * 0.43);
    vec2 center11 = vec2(0.5 + sin(time * uSpeed * 0.68) * 0.33, 0.5 + cos(time * uSpeed * 0.44) * 0.46);
    vec2 center12 = vec2(0.5 + cos(time * uSpeed * 0.38) * 0.39, 0.5 + sin(time * uSpeed * 0.56) * 0.41);
    
    float dist1 = length(uv - center1);
    float dist2 = length(uv - center2);
    float dist3 = length(uv - center3);
    float dist4 = length(uv - center4);
    float dist5 = length(uv - center5);
    float dist6 = length(uv - center6);
    float dist7 = length(uv - center7);
    float dist8 = length(uv - center8);
    float dist9 = length(uv - center9);
    float dist10 = length(uv - center10);
    float dist11 = length(uv - center11);
    float dist12 = length(uv - center12);
    
    float influence1 = 1.0 - smoothstep(0.0, gradientRadius, dist1);
    float influence2 = 1.0 - smoothstep(0.0, gradientRadius, dist2);
    float influence3 = 1.0 - smoothstep(0.0, gradientRadius, dist3);
    float influence4 = 1.0 - smoothstep(0.0, gradientRadius, dist4);
    float influence5 = 1.0 - smoothstep(0.0, gradientRadius, dist5);
    float influence6 = 1.0 - smoothstep(0.0, gradientRadius, dist6);
    float influence7 = 1.0 - smoothstep(0.0, gradientRadius, dist7);
    float influence8 = 1.0 - smoothstep(0.0, gradientRadius, dist8);
    float influence9 = 1.0 - smoothstep(0.0, gradientRadius, dist9);
    float influence10 = 1.0 - smoothstep(0.0, gradientRadius, dist10);
    float influence11 = 1.0 - smoothstep(0.0, gradientRadius, dist11);
    float influence12 = 1.0 - smoothstep(0.0, gradientRadius, dist12);
    
    vec3 color = vec3(0.0);
    color += uColor1 * influence1 * (0.55 + 0.45 * sin(time * uSpeed)) * uColor1Weight;
    color += uColor2 * influence2 * (0.55 + 0.45 * cos(time * uSpeed * 1.2)) * uColor2Weight;
    color += uColor3 * influence3 * (0.55 + 0.45 * sin(time * uSpeed * 0.8)) * uColor1Weight;
    color += uColor4 * influence4 * (0.55 + 0.45 * cos(time * uSpeed * 1.3)) * uColor2Weight;
    color += uColor5 * influence5 * (0.55 + 0.45 * sin(time * uSpeed * 1.1)) * uColor1Weight;
    color += uColor6 * influence6 * (0.55 + 0.45 * cos(time * uSpeed * 0.9)) * uColor2Weight;
    
    if (uGradientCount > 6.0) {
      color += uColor1 * influence7 * (0.55 + 0.45 * sin(time * uSpeed * 1.4)) * uColor1Weight;
      color += uColor2 * influence8 * (0.55 + 0.45 * cos(time * uSpeed * 1.5)) * uColor2Weight;
      color += uColor3 * influence9 * (0.55 + 0.45 * sin(time * uSpeed * 1.6)) * uColor1Weight;
      color += uColor4 * influence10 * (0.55 + 0.45 * cos(time * uSpeed * 1.7)) * uColor2Weight;
    }
    if (uGradientCount > 10.0) {
      color += uColor5 * influence11 * (0.55 + 0.45 * sin(time * uSpeed * 1.8)) * uColor1Weight;
      color += uColor6 * influence12 * (0.55 + 0.45 * cos(time * uSpeed * 1.9)) * uColor2Weight;
    }
    
    color = clamp(color, vec3(0.0), vec3(1.0)) * uIntensity;
    
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luminance), color, 1.35);
    color = pow(color, vec3(0.92)); 
    
    float brightness = length(color);
    float mixFactor = max(brightness * 1.2, 0.15);
    color = mix(uDarkNavy, color, mixFactor);
    
    float maxBrightness = 1.0;
    if (length(color) > maxBrightness) {
        color = color * (maxBrightness / length(color));
    }
    return color;
  }
  
  void main() {
    vec2 uv = vUv;
    vec4 touchTex = texture2D(uTouchTexture, uv);
    float vx = -(touchTex.r * 2.0 - 1.0);
    float vy = -(touchTex.g * 2.0 - 1.0);
    float intensity = touchTex.b;
    uv.x += vx * 0.8 * intensity;
    uv.y += vy * 0.8 * intensity;
    
    vec2 center = vec2(0.5);
    float dist = length(uv - center);
    float ripple = sin(dist * 20.0 - uTime * 3.0) * 0.04 * intensity;
    float wave = sin(dist * 15.0 - uTime * 2.0) * 0.03 * intensity;
    uv += vec2(ripple + wave);
    
    vec3 color = getGradientColor(uv, uTime);
    
    float grainValue = grain(uv, uTime);
    color += grainValue * uGrainIntensity;
    
    float timeShift = uTime * 0.5;
    color.r += sin(timeShift) * 0.02;
    color.g += cos(timeShift * 1.4) * 0.02;
    color.b += sin(timeShift * 1.2) * 0.02;
    
    color = clamp(color, vec3(0.0), vec3(1.0));
    gl_FragColor = vec4(color, 1.0);
  }
`;
