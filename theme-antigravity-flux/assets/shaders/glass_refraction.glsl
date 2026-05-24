// ─────────────────────────────────────────────────────────────────────────────
// glass_refraction.glsl — Antigravity Flux
// Chromatic-aberration glass refraction with depth-dependent distortion.
// Designed for overlay on frosted-glass panels (backdrop-filter pipeline).
// ─────────────────────────────────────────────────────────────────────────────
#ifdef GL_ES
precision highp float;
#endif

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;          // normalised 0-1 pointer position
uniform float u_refraction;     // IOR offset, default 1.45 from motion_physics
uniform float u_distortion;     // distortion scale, default 0.015
uniform float u_aberration;     // chromatic aberration strength, default 0.012
uniform float u_depth;          // panel depth 0-1 (0 = flush, 1 = deep)

// ── Simplex 2D ───────────────────────────────────────────────────────────────
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187,
                      0.366025403784439,
                     -0.577350269189626,
                      0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
           + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// ── Fractional Brownian Motion ───────────────────────────────────────────────
float fbm(vec2 st) {
  float v = 0.0;
  float amp = 0.6;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 4; i++) {
    v += amp * snoise(st);
    st = rot * st * 2.0 + shift;
    amp *= 0.5;
  }
  return v;
}

// ── Refraction offset per channel ────────────────────────────────────────────
vec2 refract_offset(vec2 uv, float freq, float phase, float strength) {
  float nx = snoise(vec2(uv.x * freq + phase, uv.y * freq - phase * 0.7));
  float ny = snoise(vec2(uv.y * freq - phase * 0.5, uv.x * freq + phase * 1.1));
  return vec2(nx, ny) * strength;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  uv.x *= aspect;

  float time = u_time * 0.3;

  // Mouse-reactive softening — distortion weakens near pointer
  float mouseD = length(uv - u_mouse * vec2(aspect, 1.0));
  float mouseMask = smoothstep(0.0, 0.5, mouseD);

  // Depth-dependent distortion intensity
  float depthScale = mix(0.4, 1.0, u_depth);
  float dist = u_distortion * depthScale * mouseMask;

  // ── Refraction map ─────────────────────────────────────────────────────────
  vec2 baseOffset = refract_offset(uv, 3.0, time, dist);

  // Chromatic aberration: split RGB channels slightly
  float ab = u_aberration * depthScale;
  vec2 rOff = baseOffset + refract_offset(uv, 4.2, time * 0.8, ab);
  vec2 gOff = baseOffset;
  vec2 bOff = baseOffset - refract_offset(uv, 3.8, time * 1.2, ab);

  // Normalise back from aspect-corrected space
  rOff.x /= aspect; gOff.x /= aspect; bOff.x /= aspect;

  // ── Distorted UV per channel ───────────────────────────────────────────────
  vec2 uvR = (gl_FragCoord.xy / u_resolution.xy) + rOff;
  vec2 uvG = (gl_FragCoord.xy / u_resolution.xy) + gOff;
  vec2 uvB = (gl_FragCoord.xy / u_resolution.xy) + bOff;

  // ── Fresnel-like edge brightening ──────────────────────────────────────────
  float edgeDist = min(min(uv.x / aspect, 1.0 - uv.x / aspect), min(uv.y, 1.0 - uv.y));
  float fresnel = pow(1.0 - smoothstep(0.0, 0.15, edgeDist), 2.0) * 0.25;

  // ── Specular highlight ─────────────────────────────────────────────────────
  float fbmVal = fbm(uv * 2.5 + time * 0.2);
  float specular = pow(max(0.0, fbmVal), 4.0) * 0.15 * depthScale;

  // ── Compose output ─────────────────────────────────────────────────────────
  // The shader outputs a distortion + tint overlay; the host composites it
  // on top of a backdrop-blurred surface.
  float r = fresnel + specular * 1.1;
  float g = fresnel + specular;
  float b = fresnel + specular * 0.9;

  // Alpha encodes distortion strength for the host compositor
  float alpha = length(baseOffset) * 30.0 + fresnel + specular;
  alpha = clamp(alpha, 0.0, 0.85);

  gl_FragColor = vec4(r, g, b, alpha);
}
