/**
 * Orbe 4D de la Protomolécula · MOTOR three.js (solo navegador; se carga a demanda desde la orbe).
 *
 * Dibuja lo que decide `coreografia.ts` con las formas de `geometria.ts`, en un único lienzo pequeño:
 *   1. halo de acento (gradiente radial del registro, radio φ) y la flor de la vida en el plano;
 *   2. la estructura de la forma con líneas gruesas (dos capas para fundir la saliente y la entrante);
 *   3. caras de cristal líquido iridiscente (fresnel + película delgada), translúcidas;
 *   4. 144 partículas (según estilo) que fluyen por las aristas y viajan de una forma a otra;
 *   5. el cubo de Metatrón que se dibuja con la carga y el modelo 3D generado, muestreado y en cristal.
 *
 * Reglas de la casa: nada de `node:*`; three.js entra por import dinámico desde la orbe (el layout raíz no
 * carga motores pesados); sin red; con movimiento reducido no gira (se funde); con cuadros lentos baja la
 * calidad sola; con la pestaña oculta no dibuja.
 */
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import {
  ESTILOS,
  PALETAS,
  avanceParticula,
  calidadPorRendimiento,
  clamp01,
  colorEnPaleta,
  curvaOrganica,
  energia as calcularEnergia,
  formaParaModo,
  hexARgb,
  periodos,
  registroParaModo,
  respiracionDelOrbe,
  type Estilo,
  type IdForma,
  type Modo,
  type Paleta,
  type Registro,
} from "./coreografia";
import {
  PHI,
  aristasEmergentes,
  centrosFlorDeLaVida,
  cuboDeMetatron,
  dodecaedro,
  esferaFibonacci,
  icosaedro,
  jitterbug,
  matrizIsotropica,
  merkaba,
  posicionEnArista,
  teseracto,
  type Arista,
  type FormaGeometrica,
  type Vec3,
} from "./geometria";

export interface OpcionesMotor {
  estilo: Estilo;
  registro: Registro;
  reducido: boolean;
  /** Tamaño del lienzo en píxeles CSS (cuadrado). */
  tamano: number;
  /** `false` fija la calidad completa (vistas de presentación, XR): no baja aunque los cuadros vayan lentos. */
  adaptarCalidad?: boolean;
  /**
   * `carga`: acabado de la pantalla de carga («Abriendo StarSeed…», CAR1025A), que lleva el símbolo oficial en el
   * centro. El motor dibuja solo lo que es 3D —la esfera de puntos y el cubo de Metatrón, este a media intensidad
   * para que no tape el símbolo—; la flor de la vida y el halo los pone la página en SVG, que gira por CSS sin
   * costar nada y se queda aunque la calidad baje. Con `orbe` (por defecto) todo queda como siempre.
   */
  acabado?: "orbe" | "carga";
}

export interface MotorOrbe {
  fijarEstilo(e: Estilo): void;
  fijarRegistro(r: Registro): void;
  fijarModo(m: Modo): void;
  /** Forma elegida a mano (panel o Astraura); `null` vuelve a la secuencia del estilo. */
  fijarForma(id: IdForma | null): void;
  /** Avance de una carga 0..1 (`null` = sin carga). */
  fijarProgreso(p: number | null): void;
  /** Toma la forma de un modelo 3D (GLB por URL o Blob) o de una nube de puntos (x,y,z…). */
  transformarEn(fuente: string | Blob | Float32Array): Promise<boolean>;
  /** Puntero: cercanía 0..1 y dirección (−1..1) respecto al centro de la orbe. */
  fijarAtencion(cercania: number, x: number, y: number): void;
  /** Velocidad del arrastre en px/s. */
  fijarArrastre(vx: number, vy: number): void;
  /** Un pulso de voz de Astraura (0..1). */
  voz(nivel: number): void;
  /** Un pulso de creación (la Protomolécula cambió algo). */
  pulso(): void;
  /** Se pliega en un punto (siembra inversa) y resuelve al terminar. */
  apagar(): Promise<void>;
  redimensionar(tamano: number): void;
  formaActual(): IdForma;
  destruir(): void;
}

const CAP_ARISTAS = 420;
const CAP_CARAS = 160;
const CAP_PUNTOS = 377;
const CIRCULO_SEGMENTOS = 48;

interface Instantanea {
  id: IdForma;
  forma: FormaGeometrica;
  emergentes: { arista: Arista; peso: number }[];
  w: number[] | null;
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function hayWebGL(canvas: HTMLCanvasElement): boolean {
  try {
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Crea el motor sobre `canvas`. Devuelve `null` si el aparato no tiene WebGL (la orbe pinta su versión plana). */
export function crearMotor(canvas: HTMLCanvasElement, op: OpcionesMotor): MotorOrbe | null {
  if (typeof window === "undefined" || !hayWebGL(canvas)) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power", premultipliedAlpha: true });
  } catch {
    return null;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  // Los colores de la marca se escriben tal cual (sRGB) en todos los sombreadores: sin conversión de salida.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  camara.position.set(0, 0, 5.9);
  camara.lookAt(0, 0, 0);

  // ── estado ──────────────────────────────────────────────────────────────────
  let estilo: Estilo = op.estilo;
  let registroBase: Registro = op.registro;
  let modo: Modo = "encendiendo";
  let fijada: IdForma | null = null;
  let progreso: number | null = null;
  let atencion = 0, atencionObj = 0, mirarX = 0, mirarY = 0;
  let arrastre = 0, arrastreX = 0, arrastreY = 0;
  let vozNivel = 0, pulsoCrear = 0;
  let indiceSecuencia = 0, tEnForma = 0;
  let reducido = op.reducido;
  let respiracion = respiracionDelOrbe(estilo, registroBase, reducido);
  let tamano = op.tamano;
  let destruido = false;
  let modelo: { puntos: Vec3[]; aristas: Arista[]; malla: THREE.Mesh | null } | null = null;
  let apagado: { t0: number; resolver: () => void } | null = null;
  /** Tras la siembra inversa queda plegada en nada hasta que se vuelva a encender. */
  let plegada = false;
  let encendidoT = 0;
  // Fases integradas (así un cambio de energía no hace saltar los giros).
  const fase = { global: 0, jitterbug: 0, merkaba: 0, xw: 0, yw: 0, zw: 0, halo: 0, flujo: 0, tiempo: 0 };
  let paleta: Paleta = PALETAS[registroBase];
  let paletaPrev: Paleta = paleta;
  let mezclaPaleta = 1;
  let calidad = calidadPorRendimiento(16, ESTILOS[estilo].particulas);
  const intervalos: number[] = [];
  let ultimoCambioCalidad = 0;
  let ultimoPintado = 0;
  let pintadoVivo = false;

  // ── capas ───────────────────────────────────────────────────────────────────
  const raiz = new THREE.Group();
  escena.add(raiz);

  // 1 · halo de acento
  const haloMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color() }, uOpacidad: { value: 0.2 }, uEnergia: { value: 1 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `
      varying vec2 vUv; uniform vec3 uColor; uniform float uOpacidad; uniform float uEnergia;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        float nube = pow(clamp(1.0 - r, 0.0, 1.0), 2.2);
        float anillo = exp(-pow((r - 0.618) * 18.0, 2.0)) * 0.35;
        float a = (nube + anillo) * uOpacidad * (0.75 + 0.25 * uEnergia);
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2 * PHI * 1.05, 2 * PHI * 1.05), haloMat);
  halo.renderOrder = 0;
  escena.add(halo);

  const lineaMat = (ancho: number) => {
    const m = new LineMaterial({ linewidth: ancho, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.resolution.set(tamano, tamano);
    return m;
  };
  const crearLineas = (cap: number, ancho: number) => {
    const g = new LineSegmentsGeometry();
    g.setPositions(new Float32Array(cap * 6));
    g.setColors(new Float32Array(cap * 6));
    const l = new LineSegments2(g, lineaMat(ancho));
    l.frustumCulled = false;
    return l;
  };
  const buffers = (l: LineSegments2) => {
    const g = l.geometry as LineSegmentsGeometry;
    const pos = (g.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
    const col = (g.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data;
    return { g, pos, col };
  };

  // 2 · flor de la vida (19 círculos) y cubo de Metatrón (carga), en el plano de la cámara
  const plano = new THREE.Group();
  escena.add(plano);
  const centros = centrosFlorDeLaVida(2, 1);
  const flor = crearLineas(centros.length * CIRCULO_SEGMENTOS + 2 * CIRCULO_SEGMENTOS, 1);
  plano.add(flor);
  const metatron = cuboDeMetatron(1);
  const lineasMetatron = crearLineas(metatron.lineas.length, 1.2);
  plano.add(lineasMetatron);

  // 3 · estructura: dos capas para la transformación
  const capaA = crearLineas(CAP_ARISTAS, tamano < 200 ? 1.7 : 1.5);
  const capaB = crearLineas(CAP_ARISTAS, tamano < 200 ? 1.7 : 1.5);
  raiz.add(capaA, capaB);
  // El núcleo: la forma dual en el centro, a escala 1/φ², girando en sentido contrario (como el cubo
  // interior del teseracto): profundidad, otra figura y otra rotación dentro de la misma orbe.
  const nucleo = new THREE.Group();
  const capaNucleo = crearLineas(64, 1.1);
  nucleo.add(capaNucleo);
  raiz.add(nucleo);

  // 4 · caras de cristal iridiscente
  const carasGeo = new THREE.BufferGeometry();
  const carasPos = new Float32Array(CAP_CARAS * 9);
  const carasNor = new Float32Array(CAP_CARAS * 9);
  const carasU = new Float32Array(CAP_CARAS * 3);
  const carasAlfa = new Float32Array(CAP_CARAS * 3);
  carasGeo.setAttribute("position", new THREE.BufferAttribute(carasPos, 3).setUsage(THREE.DynamicDrawUsage));
  carasGeo.setAttribute("normal", new THREE.BufferAttribute(carasNor, 3).setUsage(THREE.DynamicDrawUsage));
  carasGeo.setAttribute("aU", new THREE.BufferAttribute(carasU, 1).setUsage(THREE.DynamicDrawUsage));
  carasGeo.setAttribute("aAlfa", new THREE.BufferAttribute(carasAlfa, 1).setUsage(THREE.DynamicDrawUsage));
  const cristal = (opacidad: number) =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() },
        uBrillo: { value: new THREE.Color(1, 1, 1) }, uTiempo: { value: 0 }, uOpacidad: { value: opacidad },
      },
      vertexShader: `
        attribute float aU; attribute float aAlfa;
        varying vec3 vN; varying vec3 vV; varying float vU; varying float vAlfa;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vU = aU; vAlfa = aAlfa;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vN; varying vec3 vV; varying float vU; varying float vAlfa;
        uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uBrillo; uniform float uTiempo; uniform float uOpacidad;
        void main(){
          vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
          float fres = pow(1.0 - abs(dot(n, normalize(vV))), 2.0);
          float h = vU + uTiempo * 0.04 + dot(n, vec3(0.31, 0.53, 0.19));
          vec3 pelicula = 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
          float s = 0.5 + 0.5 * sin(6.28318 * (vU + uTiempo * 0.027));
          vec3 base = mix(mix(uA, uB, s), uC, 0.25 + 0.25 * sin(6.28318 * (h * 0.618)));
          // Barrido de cristal líquido: una banda de luz que recorre las facetas cada 8 s (Fibonacci).
          float barrido = smoothstep(0.92, 1.0, sin(6.28318 * (uTiempo / 8.0) + dot(vV, vec3(2.2, 1.4, 0.6))));
          vec3 col = mix(base, pelicula, 0.42) * 1.12 + uBrillo * (fres * 0.5 + barrido * 0.35);
          float a = uOpacidad * (0.32 + 0.68 * fres) * vAlfa;
          gl_FragColor = vec4(col, a);
        }`,
    });
  const carasMat = cristal(ESTILOS[estilo].opacidadCaras);
  const caras = new THREE.Mesh(carasGeo, carasMat);
  caras.frustumCulled = false;
  raiz.add(caras);

  // 5 · partículas
  const puntosGeo = new THREE.BufferGeometry();
  const ptsPos = new Float32Array(CAP_PUNTOS * 3);
  const ptsCol = new Float32Array(CAP_PUNTOS * 3);
  const ptsTam = new Float32Array(CAP_PUNTOS);
  puntosGeo.setAttribute("position", new THREE.BufferAttribute(ptsPos, 3).setUsage(THREE.DynamicDrawUsage));
  puntosGeo.setAttribute("color", new THREE.BufferAttribute(ptsCol, 3).setUsage(THREE.DynamicDrawUsage));
  puntosGeo.setAttribute("aTam", new THREE.BufferAttribute(ptsTam, 1).setUsage(THREE.DynamicDrawUsage));
  const puntosMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uEscala: { value: tamano * dpr * 0.05 } },
    vertexShader: `
      attribute float aTam; attribute vec3 color; varying vec3 vCol; uniform float uEscala;
      void main(){ vCol = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aTam * uEscala * (5.9 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      varying vec3 vCol;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
        float a = pow(1.0 - d, 1.6); float nucleo = smoothstep(0.35, 0.0, d);
        gl_FragColor = vec4(vCol * a + vec3(nucleo) * 0.35, a); }`,
  });
  const puntos = new THREE.Points(puntosGeo, puntosMat);
  puntos.frustumCulled = false;
  raiz.add(puntos);

  // ── formas ──────────────────────────────────────────────────────────────────
  const esferas = new Map<number, Vec3[]>();
  const esfera = (n: number): Vec3[] => {
    let e = esferas.get(n);
    if (!e) { e = esferaFibonacci(n); esferas.set(n, e); }
    return e;
  };
  const estaticas: Record<string, FormaGeometrica> = {};
  const estatica = (id: string, f: () => FormaGeometrica) => (estaticas[id] ??= f());

  function instantanea(id: IdForma): Instantanea {
    switch (id) {
      case "merkaba":
        return { id, forma: merkaba(fase.merkaba), emergentes: [], w: null };
      case "jitterbug": {
        const r = Math.cos(fase.jitterbug);
        const f = jitterbug(r);
        const n = normalizarForma(f);
        return { id, forma: n.forma, emergentes: aristasEmergentes(f, 1, 0.1).map((e) => ({ ...e })), w: null };
      }
      case "teseracto": {
        const t = teseracto({ xw: fase.xw, yw: fase.yw, zw: fase.zw, xy: fase.global * 0.2 });
        return { id, forma: t, emergentes: [], w: t.w };
      }
      case "dodecaedro":
        return { id, forma: estatica(id, dodecaedro), emergentes: [], w: null };
      case "icosaedro":
        return { id, forma: estatica(id, icosaedro), emergentes: [], w: null };
      case "matriz":
        return { id, forma: estatica(id, () => matrizIsotropica(2)), emergentes: [], w: null };
      case "modelo":
        if (modelo) return { id, forma: { vertices: modelo.puntos, aristas: modelo.aristas, caras: [] }, emergentes: [], w: null };
        return { id: "semilla", forma: semilla(), emergentes: [], w: null };
      case "semilla":
      default:
        return { id: "semilla", forma: semilla(), emergentes: [], w: null };
    }
  }

  /** La semilla: la esfera de Fibonacci que respira; con carga, crece con el avance. */
  function semilla(): FormaGeometrica {
    const p = progreso ?? 1;
    const r = 0.38 + 0.5 * clamp01(p) + 0.04 * Math.sin(fase.tiempo * ((2 * Math.PI) / 5));
    return { vertices: esfera(Math.max(21, calidad.particulas)).map((v) => [v[0] * r, v[1] * r, v[2] * r] as Vec3), aristas: [], caras: [] };
  }

  /** El jitterbug encoge al plegarse: se reescala al radio 1 para que la orbe no mengüe. */
  function normalizarForma(f: FormaGeometrica): { forma: FormaGeometrica } {
    const max = f.vertices.reduce((m, v) => Math.max(m, Math.hypot(v[0], v[1], v[2])), 0) || 1;
    const k = 1 / max;
    return { forma: { ...f, vertices: f.vertices.map((v) => [v[0] * k, v[1] * k, v[2] * k] as Vec3) } };
  }

  const DUALES: Partial<Record<IdForma, () => FormaGeometrica>> = {
    merkaba: () => estatica("octaedro-nucleo", octaedroNucleo),
    jitterbug: () => estatica("octaedro-nucleo", octaedroNucleo),
    dodecaedro: () => estatica("icosaedro", icosaedro),
    icosaedro: () => estatica("dodecaedro", dodecaedro),
  };
  function octaedroNucleo(): FormaGeometrica { return jitterbug(0); }

  let actual: IdForma = "semilla";
  let anterior: IdForma = "semilla";
  let transicion = 1; // 0..1

  function formaDeseada(): IdForma {
    const params = ESTILOS[estilo];
    if (fijada && (modo === "reposo" || modo === "atento" || modo === "arrastre")) return fijada;
    return formaParaModo(modo, params.secuencia, indiceSecuencia, !!modelo);
  }

  // ── escritura de capas ─────────────────────────────────────────────────────
  const tmpColor: [number, number, number] = [1, 1, 1];
  function colorVertice(i: number, n: number, w: number | null, z: number, out: [number, number, number]) {
    const deriva = ESTILOS[estilo].derivaTono * fase.tiempo * 0.1;
    const u = (w !== null ? (w + 1) * 0.5 * 0.9 : i / Math.max(1, n)) + deriva;
    const c = colorEnPaleta(paleta, u);
    if (mezclaPaleta < 1) {
      const cp = colorEnPaleta(paletaPrev, u);
      c[0] = cp[0] + (c[0] - cp[0]) * mezclaPaleta; c[1] = cp[1] + (c[1] - cp[1]) * mezclaPaleta; c[2] = cp[2] + (c[2] - cp[2]) * mezclaPaleta;
    }
    const profundidad = 0.55 + 0.45 * clamp01((z + 1) / 2);
    out[0] = c[0] * profundidad; out[1] = c[1] * profundidad; out[2] = c[2] * profundidad;
  }

  function escribirAristas(capa: LineSegments2, s: Instantanea, escala: number, opacidad: number, brillo: number) {
    const { g, pos, col } = buffers(capa);
    const arr = pos.array as Float32Array, carr = col.array as Float32Array;
    const v = s.forma.vertices;
    const lista: { arista: Arista; peso: number }[] = s.forma.aristas.map((a) => ({ arista: a, peso: 1 }));
    for (const e of s.emergentes) lista.push(e);
    let n = 0;
    const cuantos = Math.min(CAP_ARISTAS, lista.length);
    for (let k = 0; k < cuantos; k++) {
      const { arista: [a, b], peso } = lista[k];
      const pa = v[a], pb = v[b];
      if (!pa || !pb) continue;
      const o = n * 6;
      arr[o] = pa[0] * escala; arr[o + 1] = pa[1] * escala; arr[o + 2] = pa[2] * escala;
      arr[o + 3] = pb[0] * escala; arr[o + 4] = pb[1] * escala; arr[o + 5] = pb[2] * escala;
      colorVertice(a, v.length, s.w ? s.w[a] : null, pa[2], tmpColor);
      const k1 = peso * brillo;
      carr[o] = tmpColor[0] * k1; carr[o + 1] = tmpColor[1] * k1; carr[o + 2] = tmpColor[2] * k1;
      colorVertice(b, v.length, s.w ? s.w[b] : null, pb[2], tmpColor);
      carr[o + 3] = tmpColor[0] * k1; carr[o + 4] = tmpColor[1] * k1; carr[o + 5] = tmpColor[2] * k1;
      n++;
    }
    g.instanceCount = n;
    pos.needsUpdate = true;
    col.needsUpdate = true;
    (capa.material as LineMaterial).opacity = opacidad;
    capa.visible = n > 0 && opacidad > 0.003;
  }

  let nCaras = 0;
  function escribirCaras(s: Instantanea, escala: number, alfa: number, desde: number): number {
    if (!calidad.caras) return desde;
    const v = s.forma.vertices;
    let n = desde;
    for (let k = 0; k < s.forma.caras.length && n < CAP_CARAS; k++) {
      const [a, b, c] = s.forma.caras[k];
      const pa = v[a], pb = v[b], pc = v[c];
      if (!pa || !pb || !pc) continue;
      const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
      const wx = pc[0] - pa[0], wy = pc[1] - pa[1], wz = pc[2] - pa[2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const ln = Math.hypot(nx, ny, nz) || 1;
      nx /= ln; ny /= ln; nz /= ln;
      const o = n * 9;
      for (const [j, p] of [pa, pb, pc].entries()) {
        carasPos[o + j * 3] = p[0] * escala; carasPos[o + j * 3 + 1] = p[1] * escala; carasPos[o + j * 3 + 2] = p[2] * escala;
        carasNor[o + j * 3] = nx; carasNor[o + j * 3 + 1] = ny; carasNor[o + j * 3 + 2] = nz;
        carasU[n * 3 + j] = (k * (PHI - 1)) % 1;
        carasAlfa[n * 3 + j] = alfa;
      }
      n++;
    }
    return n;
  }

  // Asignación de cada partícula a una arista con su fase (proporción áurea).
  const asignacion = Array.from({ length: CAP_PUNTOS }, (_, i) => ({ fase: (i * (PHI - 1)) % 1, vel: 0.6 + ((i * 0.37) % 1) * 0.8 }));
  const desfaseArrastre: Vec3[] = Array.from({ length: CAP_PUNTOS }, () => [0, 0, 0]);
  function posicionParticula(s: Instantanea, i: number): Vec3 {
    const f = s.forma;
    if (s.id === "semilla" || !f.aristas.length) {
      const v = f.vertices[i % Math.max(1, f.vertices.length)] ?? [0, 0, 0];
      // En la semilla y en el modelo, los puntos tiemblan un poco sobre su sitio (vivos, no quietos).
      const t = fase.tiempo * 0.9 + i;
      const k = s.id === "semilla" ? 0.025 : 0.012;
      return [v[0] + Math.sin(t) * k, v[1] + Math.cos(t * 1.3) * k, v[2] + Math.sin(t * 0.7) * k];
    }
    const a = asignacion[i];
    return posicionEnArista(f, i % f.aristas.length, a.fase + fase.flujo * a.vel, i);
  }

  // ── bucle ───────────────────────────────────────────────────────────────────
  let raf = 0;
  let ultimo = performance.now();
  let acumulado = 0;
  let prevSnap: Instantanea = instantanea("semilla");

  function cuadro(ahora: number) {
    if (destruido) return;
    // Con movimiento reducido no hay bucle: se pinta solo cuando algo cambia (`repintarSiReducido`).
    if (reducido) return;
    raf = requestAnimationFrame(cuadro);
    const dtReal = Math.min(0.1, (ahora - ultimo) / 1000);
    // Ritmo: 60 cps con interacción, transición o voz; 30 en reposo; nada con la pestaña oculta.
    const vivo = atencion > 0.05 || arrastre > 0.05 || transicion < 1 || vozNivel > 0.02 || modo !== "reposo";
    acumulado += dtReal;
    ultimo = ahora;
    if (document.hidden) return;
    if (!vivo && acumulado < 1 / 30) return;
    const dt = reducido ? 0 : acumulado;
    acumulado = 0;
    // Rendimiento: solo cuenta el intervalo entre cuadros PINTADOS seguidos a 60 cps (con interacción);
    // los de reposo (30 cps a propósito) no dicen nada del aparato.
    if (vivo && pintadoVivo) intervalos.push(ahora - ultimoPintado);
    pintadoVivo = vivo;
    ultimoPintado = ahora;
    if (intervalos.length > 90) {
      intervalos.shift();
      // Histéresis: como mucho un cambio cada 8 s, y para subir hace falta ir holgado (≤ 18 ms).
      if (op.adaptarCalidad !== false && ahora - ultimoCambioCalidad > 8000) {
        const media = intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
        const propuesta = calidadPorRendimiento(media, ESTILOS[estilo].particulas);
        const sube = propuesta.particulas > calidad.particulas;
        if (propuesta.particulas !== calidad.particulas && (!sube || media <= 18)) { calidad = propuesta; ultimoCambioCalidad = ahora; }
      }
    }
    pintar(dt, ahora);
  }

  function pintar(dt: number, ahora: number) {
    const params = ESTILOS[estilo];
    atencion += (atencionObj - atencion) * Math.min(1, dt * 6 || 1);
    arrastre *= Math.exp(-dt * 3);
    vozNivel *= Math.exp(-dt * 4);
    pulsoCrear *= Math.exp(-dt * 1.2);
    const e = calcularEnergia(modo, atencion, vozNivel, arrastre) + pulsoCrear * 0.6;
    const per = periodos(e, params.velocidad);
    const dosPi = Math.PI * 2;
    fase.tiempo += dt;
    fase.global += (dt * dosPi) / per.giroGlobal;
    fase.jitterbug += (dt * dosPi) / per.jitterbug;
    fase.merkaba += (dt * dosPi) / per.merkaba;
    fase.xw += (dt * dosPi) / per.teseractoXW;
    fase.yw += (dt * dosPi) / per.teseractoYW;
    fase.zw += (dt * dosPi) / per.teseractoZW;
    fase.halo += (dt * dosPi) / per.halo;
    fase.flujo += dt / per.flujo;

    // Paleta del registro (con fundido de 1 s al cambiar de contexto o de modo).
    const reg = registroParaModo(modo, registroBase);
    if (PALETAS[reg] !== paleta) { paletaPrev = paleta; paleta = PALETAS[reg]; mezclaPaleta = 0; }
    mezclaPaleta = reducido ? 1 : Math.min(1, mezclaPaleta + dt);

    // Secuencia en reposo: cada forma dura lo que dice el estilo (Fibonacci).
    if (modo === "reposo" || modo === "atento" || modo === "arrastre") {
      tEnForma += dt;
      if (!fijada && tEnForma > params.permanenciaS) { tEnForma = 0; indiceSecuencia++; }
    }
    const deseada = formaDeseada();
    if (deseada !== actual) {
      prevSnap = instantanea(actual);
      anterior = actual;
      actual = deseada;
      transicion = reducido ? 0.999 : 0;
    }
    if (transicion < 1) transicion = reducido ? 1 : Math.min(1, transicion + dt / params.transicionS);
    const k = curvaOrganica(transicion);

    // Siembra (encender) y siembra inversa (apagar).
    let semillaEscala = 1;
    if (modo === "encendiendo") {
      encendidoT += dt || 1 / 60;
      semillaEscala = curvaOrganica(encendidoT / 1.6);
      if (encendidoT > 1.6) modo = "reposo";
    }
    if (apagado) {
      const t = (ahora - apagado.t0) / 900;
      semillaEscala = 1 - curvaOrganica(Math.min(1, t));
      if (t >= 1) { const r = apagado.resolver; apagado = null; plegada = true; r(); }
    }
    if (plegada) semillaEscala = 0;
    // Plegada en nada no deja ni un punto: si no, las partículas juntas en el centro brillan como una estrella.
    const visible = semillaEscala > 0.015;
    raiz.visible = visible; plano.visible = visible; halo.visible = visible;

    const nueva = instantanea(actual);
    const vieja = transicion < 1 ? (anterior === actual ? nueva : instantanearAnterior()) : null;
    const respira = 1 + (respiracion.escala - 1) * Math.sin(fase.tiempo * (dosPi / (respiracion.periodoMs / 1000))) + vozNivel * 0.08 + pulsoCrear * 0.05;
    const escalaNueva = semillaEscala * respira * (vieja ? 0.62 + 0.38 * k : 1);
    const escalaVieja = semillaEscala * respira * (1 + 0.15 * k);
    // En lienzos pequeños (la orbe flotante) un punto más de luz para que se lea sobre cualquier fondo.
    const brillo = (tamano < 200 ? 0.84 : 0.72) + 0.25 * atencion + 0.3 * vozNivel;

    escribirAristas(capaB, nueva, escalaNueva, vieja ? k : 1, brillo);
    if (vieja) escribirAristas(capaA, vieja, escalaVieja, 1 - k, brillo);
    else capaA.visible = false;

    const dual = DUALES[actual];
    if (dual && calidad.halo) {
      escribirAristas(capaNucleo, { id: actual, forma: dual(), emergentes: [], w: null }, escalaNueva / (PHI * PHI) * 1.08, (vieja ? k : 1) * 0.85, brillo * 1.1);
      nucleo.rotation.set(fase.global * -PHI * 0.5, fase.global * -PHI, 0);
    } else capaNucleo.visible = false;

    nCaras = 0;
    nCaras = escribirCaras(nueva, escalaNueva, vieja ? k : 1, nCaras);
    if (vieja) nCaras = escribirCaras(vieja, escalaVieja, 1 - k, nCaras);
    carasGeo.setDrawRange(0, nCaras * 3);
    for (const nombre of ["position", "normal", "aU", "aAlfa"]) (carasGeo.attributes[nombre] as THREE.BufferAttribute).needsUpdate = true;
    caras.visible = nCaras > 0 && calidad.caras;
    const [ca, cb, cc] = [paleta.colores[0], paleta.colores[1 % paleta.colores.length], paleta.colores[2 % paleta.colores.length]];
    carasMat.uniforms.uA.value.setRGB(...hexARgb(ca));
    carasMat.uniforms.uB.value.setRGB(...hexARgb(cb));
    carasMat.uniforms.uC.value.setRGB(...hexARgb(cc));
    carasMat.uniforms.uTiempo.value = fase.tiempo;
    carasMat.uniforms.uOpacidad.value = params.opacidadCaras * (0.85 + 0.3 * atencion) * semillaEscala;

    // Partículas: fluyen por la forma y viajan de la vieja a la nueva, escalonadas.
    const nPts = Math.min(CAP_PUNTOS, actual === "modelo" ? CAP_PUNTOS : calidad.particulas);
    const arrX = -arrastreX * 0.00035, arrY = arrastreY * 0.00035;
    for (let i = 0; i < CAP_PUNTOS; i++) {
      const o = i * 3;
      if (i >= nPts) { ptsTam[i] = 0; continue; }
      let p = posicionParticula(nueva, i);
      p = [p[0] * escalaNueva, p[1] * escalaNueva, p[2] * escalaNueva];
      if (vieja) {
        const q = posicionParticula(vieja, i);
        p = lerp3([q[0] * escalaVieja, q[1] * escalaVieja, q[2] * escalaVieja], p, avanceParticula(transicion, i));
      }
      // Arrastre líquido: las partículas se quedan atrás y vuelven con un muelle amortiguado.
      const d = desfaseArrastre[i];
      const rigidez = 0.06 + ((i * 0.618) % 1) * 0.05;
      d[0] += (arrX * arrastre - d[0]) * rigidez; d[1] += (arrY * arrastre - d[1]) * rigidez;
      ptsPos[o] = p[0] + d[0]; ptsPos[o + 1] = p[1] + d[1]; ptsPos[o + 2] = p[2];
      colorVertice(i, nPts, null, p[2], tmpColor);
      const chispa = 0.8 + 0.2 * Math.sin(fase.tiempo * 3 + i);
      ptsCol[o] = tmpColor[0] * chispa; ptsCol[o + 1] = tmpColor[1] * chispa; ptsCol[o + 2] = tmpColor[2] * chispa;
      ptsTam[i] = (actual === "semilla" ? 1.15 : 0.95) * (0.7 + 0.6 * ((i * 0.381) % 1)) * (1 + 0.5 * vozNivel);
    }
    for (const nombre of ["position", "color", "aTam"]) (puntosGeo.attributes[nombre] as THREE.BufferAttribute).needsUpdate = true;

    // Giro global, mirada hacia el puntero e inclinación por el arrastre.
    mirarX += ((atencion > 0.05 ? mirarX0 : 0) - mirarX) * Math.min(1, dt * 4 || 1);
    mirarY += ((atencion > 0.05 ? mirarY0 : 0) - mirarY) * Math.min(1, dt * 4 || 1);
    raiz.rotation.set(
      0.32 + Math.sin(fase.global * 0.618) * 0.18 - mirarY * 0.35 + arrY * arrastre * 0.6,
      fase.global + mirarX * 0.45,
      Math.sin(fase.global * 0.382) * 0.08 + arrX * arrastre * 0.6,
    );
    if (modelo?.malla) {
      modelo.malla.visible = actual === "modelo" && calidad.caras;
      (modelo.malla.material as THREE.ShaderMaterial).uniforms.uOpacidad.value = 0.55 * (actual === "modelo" ? k : 0) * semillaEscala;
      (modelo.malla.material as THREE.ShaderMaterial).uniforms.uTiempo.value = fase.tiempo;
    }

    // Flor de la vida (siembra al encender) y Metatrón (con la carga).
    pintarPlano(semillaEscala);
    haloMat.uniforms.uColor.value.setRGB(...hexARgb(paleta.halo));
    haloMat.uniforms.uOpacidad.value = calidad.halo && op.acabado !== "carga" ? params.opacidadHalo * (0.7 + 0.5 * atencion) * semillaEscala : 0;
    haloMat.uniforms.uEnergia.value = e;
    renderer.render(escena, camara);
  }

  let mirarX0 = 0, mirarY0 = 0;
  /** La forma saliente se sigue animando con sus fases durante la transformación. */
  function instantanearAnterior(): Instantanea {
    return anterior === "semilla" || anterior === "modelo" ? prevSnap : instantanea(anterior);
  }

  function pintarPlano(semillaEscala: number) {
    const params = ESTILOS[estilo];
    plano.rotation.set(0, 0, fase.halo);
    // Flor: 19 círculos de radio r con la envolvente en 3r ≈ 0,95·φ (la forma mide 1).
    const r = (PHI * 0.95) / 3;
    const { g, pos, col } = buffers(flor);
    const arr = pos.array as Float32Array, carr = col.array as Float32Array;
    const encendidos = modo === "encendiendo" ? Math.max(1, Math.floor(semillaEscala * centros.length)) : centros.length;
    const c = hexARgb(paleta.halo);
    const carga = op.acabado === "carga";
    const intensidad = carga ? 0 : (calidad.halo ? 0.16 + params.opacidadHalo * 0.6 : 0) * (0.7 + 0.5 * atencion) * semillaEscala;
    let n = 0;
    // En la carga la flor la pone la página (SVG): aquí no se escribe ni un segmento.
    const circulos: [number, number, number][] = carga ? [] : centros.slice(0, encendidos).map(([x, y]) => [x * r, y * r, r]);
    if (!carga) circulos.push([0, 0, 3 * r], [0, 0, 3 * r * 1.04]);
    for (const [cx, cy, rr] of circulos) {
      for (let s = 0; s < CIRCULO_SEGMENTOS; s++) {
        const a0 = (s / CIRCULO_SEGMENTOS) * Math.PI * 2, a1 = ((s + 1) / CIRCULO_SEGMENTOS) * Math.PI * 2;
        const o = n * 6;
        arr[o] = cx + Math.cos(a0) * rr; arr[o + 1] = cy + Math.sin(a0) * rr; arr[o + 2] = -0.4;
        arr[o + 3] = cx + Math.cos(a1) * rr; arr[o + 4] = cy + Math.sin(a1) * rr; arr[o + 5] = -0.4;
        for (let j = 0; j < 6; j += 3) { carr[o + j] = c[0] * intensidad; carr[o + j + 1] = c[1] * intensidad; carr[o + j + 2] = c[2] * intensidad; }
        n++;
      }
    }
    g.instanceCount = n;
    pos.needsUpdate = true; col.needsUpdate = true;
    flor.visible = intensidad > 0.002;

    // Metatrón: sus 78 líneas se dibujan con el avance de la carga.
    const mt = buffers(lineasMetatron);
    const ma = mt.pos.array as Float32Array, mc = mt.col.array as Float32Array;
    const total = metatron.lineas.length;
    // Sin avance conocido (p. ej. un Space remoto que no informa), Metatrón se dibuja en bucle cada 8 s.
    const avance = progreso === null ? (modo === "cargando" ? (fase.tiempo / 8) % 1 : 0) : clamp01(progreso);
    const visibles = modo === "cargando" ? avance * total : 0;
    const escala = 0.62;
    let m = 0;
    for (let i = 0; i < total && i < visibles; i++) {
      const [a, b] = metatron.lineas[i];
      const pa = metatron.centros[a], pb = metatron.centros[b];
      const o = m * 6;
      ma[o] = pa[0] * escala; ma[o + 1] = pa[1] * escala; ma[o + 2] = 0;
      ma[o + 3] = pb[0] * escala; ma[o + 4] = pb[1] * escala; ma[o + 5] = 0;
      const lc = colorEnPaleta(paleta, i / total);
      const alfa = Math.min(1, visibles - i) * 0.9 * (carga ? 0.5 : 1);
      mc[o] = lc[0] * alfa; mc[o + 1] = lc[1] * alfa; mc[o + 2] = lc[2] * alfa;
      mc[o + 3] = lc[0] * alfa; mc[o + 4] = lc[1] * alfa; mc[o + 5] = lc[2] * alfa;
      m++;
    }
    mt.g.instanceCount = m;
    mt.pos.needsUpdate = true; mt.col.needsUpdate = true;
    lineasMetatron.visible = m > 0;
  }

  // ── transformación hacia un modelo 3D ──────────────────────────────────────
  async function transformarEn(fuente: string | Blob | Float32Array): Promise<boolean> {
    try {
      let puntosModelo: Vec3[] = [];
      let malla: THREE.Mesh | null = null;
      if (fuente instanceof Float32Array) {
        for (let i = 0; i + 2 < fuente.length && puntosModelo.length < CAP_PUNTOS; i += 3) puntosModelo.push([fuente[i], fuente[i + 1], fuente[i + 2]]);
      } else {
        const url = typeof fuente === "string" ? fuente : URL.createObjectURL(fuente);
        const [{ GLTFLoader }, { MeshSurfaceSampler }, { mergeGeometries }] = await Promise.all([
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/math/MeshSurfaceSampler.js"),
          import("three/examples/jsm/utils/BufferGeometryUtils.js"),
        ]);
        const gltf = await new GLTFLoader().loadAsync(url);
        if (typeof fuente !== "string") URL.revokeObjectURL(url);
        const geos: THREE.BufferGeometry[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.geometry) {
            const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
            for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
            if (!g.attributes.normal) g.computeVertexNormals();
            geos.push(g.index ? g.toNonIndexed() : g);
          }
        });
        if (!geos.length) return false;
        const unida = mergeGeometries(geos, false);
        if (!unida) return false;
        unida.computeBoundingSphere();
        const bs = unida.boundingSphere;
        if (!bs || !bs.radius) return false;
        unida.translate(-bs.center.x, -bs.center.y, -bs.center.z);
        unida.scale(1 / bs.radius, 1 / bs.radius, 1 / bs.radius);
        const muestreador = new MeshSurfaceSampler(new THREE.Mesh(unida)).build();
        const p = new THREE.Vector3();
        for (let i = 0; i < CAP_PUNTOS; i++) { muestreador.sample(p); puntosModelo.push([p.x, p.y, p.z]); }
        const triangulos = (unida.attributes.position.count / 3) | 0;
        if (triangulos <= 60000) {
          const mat = cristal(0);
          mat.uniforms.uA.value.setRGB(...hexARgb(paleta.colores[0]));
          mat.uniforms.uB.value.setRGB(...hexARgb(paleta.colores[1 % paleta.colores.length]));
          mat.uniforms.uC.value.setRGB(...hexARgb(paleta.colores[2 % paleta.colores.length]));
          unida.setAttribute("aU", new THREE.BufferAttribute(new Float32Array(unida.attributes.position.count).fill(0.3), 1));
          unida.setAttribute("aAlfa", new THREE.BufferAttribute(new Float32Array(unida.attributes.position.count).fill(1), 1));
          malla = new THREE.Mesh(unida, mat);
          malla.visible = false;
        }
      }
      if (puntosModelo.length < 4) return false;
      // Red cristalina sobre la superficie: cada punto de los 144 primeros con sus 2 vecinos más cercanos.
      const red = puntosModelo.slice(0, 144);
      const aristas: Arista[] = [];
      const vistas = new Set<string>();
      red.forEach((a, i) => {
        const vecinos = red.map((b, j) => ({ j, d: j === i ? Infinity : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) })).sort((x, y) => x.d - y.d).slice(0, 2);
        for (const { j } of vecinos) {
          const c = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (!vistas.has(c)) { vistas.add(c); aristas.push(i < j ? [i, j] : [j, i]); }
        }
      });
      if (modelo?.malla) { raiz.remove(modelo.malla); modelo.malla.geometry.dispose(); (modelo.malla.material as THREE.Material).dispose(); }
      if (malla) raiz.add(malla);
      modelo = { puntos: puntosModelo, aristas, malla };
      modo = "transformando";
      return true;
    } catch {
      return false;
    }
  }

  function redimensionar(t: number) {
    tamano = t;
    renderer.setSize(t, t, false);
    camara.aspect = 1;
    camara.updateProjectionMatrix();
    for (const l of [capaA, capaB, flor, lineasMetatron]) (l.material as LineMaterial).resolution.set(t, t);
    puntosMat.uniforms.uEscala.value = t * dpr * 0.05;
  }
  redimensionar(tamano);
  raf = requestAnimationFrame(cuadro);
  if (reducido) { modo = "reposo"; actual = formaDeseada(); transicion = 1; pintar(0, performance.now()); }

  const repintarSiReducido = () => { if (reducido && !destruido) pintar(0, performance.now()); };

  return {
    fijarEstilo(e) { estilo = e; respiracion = respiracionDelOrbe(estilo, registroBase, reducido); carasMat.uniforms.uOpacidad.value = ESTILOS[e].opacidadCaras; tEnForma = 0; repintarSiReducido(); },
    fijarRegistro(r) { registroBase = r; respiracion = respiracionDelOrbe(estilo, registroBase, reducido); repintarSiReducido(); },
    fijarModo(m) {
      if (modo === "encendiendo" && m === "reposo") return;
      if (apagado) return;
      if (plegada) { if (m !== "encendiendo") return; plegada = false; encendidoT = 0; }
      modo = m;
      if (m === "transformando" && !modelo) modo = "reposo";
      repintarSiReducido();
    },
    fijarForma(id) { fijada = id; tEnForma = 0; repintarSiReducido(); },
    fijarProgreso(p) { progreso = p === null ? null : clamp01(p); },
    transformarEn,
    fijarAtencion(c, x, y) { atencionObj = clamp01(c); mirarX0 = Math.max(-1, Math.min(1, x)); mirarY0 = Math.max(-1, Math.min(1, y)); },
    fijarArrastre(vx, vy) { arrastreX = vx; arrastreY = vy; arrastre = clamp01(Math.hypot(vx, vy) / 1600); },
    voz(nivel) { vozNivel = Math.max(vozNivel, clamp01(nivel)); },
    pulso() { pulsoCrear = 1; },
    apagar() {
      if (reducido) return Promise.resolve();
      return new Promise<void>((resolver) => { apagado = { t0: performance.now(), resolver }; modo = "apagando"; });
    },
    // `setSize` vacía el lienzo: con movimiento reducido (sin bucle) hay que repintar a mano.
    redimensionar: (t) => { redimensionar(t); repintarSiReducido(); },
    formaActual: () => actual,
    destruir() {
      destruido = true;
      cancelAnimationFrame(raf);
      escena.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
    },
  };
}
