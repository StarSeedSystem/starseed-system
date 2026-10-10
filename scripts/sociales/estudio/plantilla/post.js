/*
 * post.js — postprocesado propio del Estudio MetaGeminis (sin addons de three).
 * Escena → textura de media precisión → resplandor (bloom) en tres niveles con desenfoque gaussiano separable →
 * composición con aberración cromática sutil, tonemapping filmico, viñeta y grano determinista → sRGB.
 *
 * Todo es función pura de (escena, t, semilla): el grano usa el número de fotograma, no el reloj, así que
 * dos renders del mismo instante dan los mismos píxeles.
 */

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG_BRIGHT = `
precision highp float; varying vec2 vUv; uniform sampler2D tColor; uniform float uUmbral; uniform float uRodilla;
void main(){
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uUmbral - uRodilla, uUmbral + uRodilla, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const FRAG_BLUR = `
precision highp float; varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uDir;
void main(){
  vec3 s = texture2D(tColor, vUv).rgb * 0.2270270270;
  s += texture2D(tColor, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tColor, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tColor, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(tColor, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`;

const FRAG_COMPONER = `
precision highp float; varying vec2 vUv;
uniform sampler2D tColor, tB1, tB2, tB3;
uniform vec3 uPesos; uniform float uExposicion, uAberracion, uVineta, uGrano, uSemilla, uFundido;
uniform vec3 uFondoA, uFondoB;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
vec3 aSrgb(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
void main(){
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec2 off = d * r2 * uAberracion;
  vec3 c;
  c.r = texture2D(tColor, vUv + off).r;
  c.g = texture2D(tColor, vUv).g;
  c.b = texture2D(tColor, vUv - off).b;
  vec3 bloom = texture2D(tB1, vUv).rgb * uPesos.x + texture2D(tB2, vUv).rgb * uPesos.y + texture2D(tB3, vUv).rgb * uPesos.z;
  c += bloom;
  c *= uExposicion;
  c = aces(c);
  float v = 1.0 - uVineta * smoothstep(0.18, 0.95, r2 * 2.2);
  c *= v;
  c = aSrgb(c);
  float g = hash(gl_FragCoord.xy + uSemilla) - 0.5;
  c += g * uGrano;
  c = mix(vec3(0.0), c, uFundido);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export function crearPost(THREE, renderer, ancho, alto, opciones = {}) {
  const o = Object.assign({ umbral: 0.62, rodilla: 0.35, pesos: [0.55, 0.42, 0.34], exposicion: 1.0, aberracion: 0.012, vineta: 0.42, grano: 0.018 }, opciones);
  const tipo = THREE.HalfFloatType;
  const opt = { type: tipo, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const rtEscena = new THREE.WebGLRenderTarget(ancho, alto, { ...opt, depthBuffer: true, samples: o.msaa === undefined ? 4 : o.msaa });
  const niveles = [2, 4, 8].map((f) => {
    const w = Math.max(2, Math.floor(ancho / f));
    const h = Math.max(2, Math.floor(alto / f));
    return { w, h, a: new THREE.WebGLRenderTarget(w, h, opt), b: new THREE.WebGLRenderTarget(w, h, opt) };
  });

  const geo = new THREE.PlaneGeometry(2, 2);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const mBright = mat(FRAG_BRIGHT, { tColor: { value: null }, uUmbral: { value: o.umbral }, uRodilla: { value: o.rodilla } });
  const mBlur = mat(FRAG_BLUR, { tColor: { value: null }, uDir: { value: new THREE.Vector2() } });
  const mComp = mat(FRAG_COMPONER, {
    tColor: { value: rtEscena.texture }, tB1: { value: niveles[0].a.texture }, tB2: { value: niveles[1].a.texture }, tB3: { value: niveles[2].a.texture },
    uPesos: { value: new THREE.Vector3(...o.pesos) }, uExposicion: { value: o.exposicion }, uAberracion: { value: o.aberracion },
    uVineta: { value: o.vineta }, uGrano: { value: o.grano }, uSemilla: { value: 0 }, uFundido: { value: 1 },
    uFondoA: { value: new THREE.Vector3() }, uFondoB: { value: new THREE.Vector3() },
  });
  const quad = new THREE.Mesh(geo, mBright);
  const sc = new THREE.Scene();
  sc.add(quad);

  function pasar(material, destino) {
    quad.material = material;
    renderer.setRenderTarget(destino);
    renderer.render(sc, cam);
  }

  return {
    ajustes: o,
    uniformes: mComp.uniforms,
    rtEscena,
    /** Dibuja `escena` con `camara` y compone el resultado en el lienzo. `fotograma` fija el grano. */
    render(escena, camara, fotograma, fundido = 1) {
      renderer.setRenderTarget(rtEscena);
      renderer.clear();
      renderer.render(escena, camara);
      mBright.uniforms.uUmbral.value = o.umbral;
      mBright.uniforms.tColor.value = rtEscena.texture;
      pasar(mBright, niveles[0].a);
      for (let i = 0; i < niveles.length; i++) {
        const n = niveles[i];
        if (i > 0) {
          mBlur.uniforms.tColor.value = niveles[i - 1].a.texture;
          mBlur.uniforms.uDir.value.set(0, 0);
          // Reducción: copia suave del nivel anterior al actual (la interpolación lineal hace de filtro).
          pasar(mBlur, n.a);
        }
        for (let k = 0; k < 2; k++) {
          mBlur.uniforms.tColor.value = n.a.texture;
          mBlur.uniforms.uDir.value.set(1 / n.w, 0);
          pasar(mBlur, n.b);
          mBlur.uniforms.tColor.value = n.b.texture;
          mBlur.uniforms.uDir.value.set(0, 1 / n.h);
          pasar(mBlur, n.a);
        }
      }
      mComp.uniforms.uSemilla.value = (fotograma * 7.31) % 997;
      mComp.uniforms.uFundido.value = fundido;
      pasar(mComp, null);
    },
    liberar() {
      rtEscena.dispose();
      niveles.forEach((n) => { n.a.dispose(); n.b.dispose(); });
      geo.dispose();
    },
  };
}
