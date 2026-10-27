// Conversores reales de binarios para la Protomolécula: PCM Float32 crudo → WAV PCM 16 bits
// y OBJ → glTF 2.0 (JSON con un buffer incrustado en base64). Módulo puro: sin red, sin disco,
// sin node:*. Lo que el OBJ trae de más (vt, materiales, texturas) se IGNORA, no se inventa.
import type { ConversorDef } from "./convertidores";

type Entrada = Uint8Array | string;
type Opciones = Record<string, number | string> | undefined;

/** Número tolerante a cadenas; si no es finito, el defecto. */
const numero = (v: unknown, defecto: number): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : defecto;
};

const ALFABETO64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 estándar con relleno, sin depender del entorno. */
export function aBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += ALFABETO64[n >> 18] + ALFABETO64[(n >> 12) & 63];
    s += i + 1 < b.length ? ALFABETO64[(n >> 6) & 63] : "=";
    s += i + 2 < b.length ? ALFABETO64[n & 63] : "=";
  }
  return s;
}

/** Float32/Uint32 little-endian en un Uint8Array, con la función que fija cada valor. */
const le32 = (a: number[], fija: (v: DataView, o: number, x: number) => void): Uint8Array => {
  const b = new Uint8Array(a.length * 4);
  const v = new DataView(b.buffer);
  a.forEach((x, i) => fija(v, i * 4, x));
  return b;
};
const f32 = (a: number[]): Uint8Array => le32(a, (v, o, x) => v.setFloat32(o, x, true));
const u32 = (a: number[]): Uint8Array => le32(a, (v, o, x) => v.setUint32(o, x, true));

/** PCM crudo Float32 LE → WAV PCM 16 bits: cabecera RIFF de 44 bytes, muestras acotadas a [−1, 1] y redondeadas. */
export function pcmAWav(entrada: Entrada, opciones?: Opciones): Uint8Array {
  if (typeof entrada === "string") throw new Error("El PCM de entrada son muestras crudas en bytes, no texto.");
  if (entrada.length === 0 || entrada.length % 4 !== 0)
    throw new Error(`El PCM crudo deben ser Float32 (4 bytes por muestra); vinieron ${entrada.length} bytes, que no son un múltiplo de 4.`);
  const deFloat = new DataView(entrada.buffer, entrada.byteOffset, entrada.length);
  const nMuestras = entrada.length / 4;
  const frecuencia = Math.round(numero(opciones?.["frecuencia"], 44100));
  const canales = Math.max(1, Math.round(numero(opciones?.["canales"], 1)));
  const w = new Uint8Array(44 + nMuestras * 2);
  const v = new DataView(w.buffer);
  const letras = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  letras(0, "RIFF"); letras(8, "WAVE"); letras(12, "fmt "); letras(36, "data");
  v.setUint32(4, 36 + nMuestras * 2, true);
  v.setUint32(16, 16, true); // formato PCM
  v.setUint32(24, frecuencia, true);
  v.setUint32(28, frecuencia * canales * 2, true); // byteRate
  v.setUint32(40, nMuestras * 2, true);
  v.setUint16(20, 1, true); v.setUint16(22, canales, true); // formato y canales
  v.setUint16(32, canales * 2, true); v.setUint16(34, 16, true); // blockAlign y bits
  for (let i = 0; i < nMuestras; i++) {
    const m = Math.min(1, Math.max(-1, deFloat.getFloat32(i * 4, true)));
    v.setInt16(44 + i * 2, Math.round(m * 32767), true);
  }
  return w;
}

/** OBJ (v, vn, f con índices negativos relativos) → glTF 2.0 como texto JSON. */
export function objAGltf(entrada: Entrada): string {
  const texto = typeof entrada === "string" ? entrada : new TextDecoder("utf-8").decode(entrada);
  const posiciones: number[] = [];
  const normales: number[] = [];
  const indicesPos: number[] = [];
  const indicesNor: number[] = [];

  /** Índice 0-based resuelto; los NEGATIVOS son relativos a lo definido hasta ahora. */
  const resolver = (t: string, n: number, campo: string): number => {
    const idx = Number(t);
    if (!Number.isInteger(idx))
      throw new Error(`Índice de ${campo} no válido en el OBJ: «${t}».`);
    const r = idx > 0 ? idx - 1 : n + idx;
    if (r < 0 || r >= n)
      throw new Error(`La cara menciona el ${campo} ${idx} y solo hay ${n} definidos hasta esa línea.`);
    return r;
  };

  /** Triangula el polígono en abanico: (0,1,2), (0,2,3), … */
  const fan = (vs: number[], ns: number[]) => {
    for (let i = 1; i + 1 < vs.length; i++) {
      indicesPos.push(vs[0], vs[i], vs[i + 1]);
      indicesNor.push(ns[0], ns[i], ns[i + 1]);
    }
  };

  for (const linea of texto.split(/\r?\n/)) {
    const t = linea.trim().split(/\s+/);
    if (t[0] === "v") {
      if (t.length < 4) throw new Error("Un «v» del OBJ necesita tres coordenadas.");
      const xyz = t.slice(1, 4).map(Number);
      if (xyz.some((x) => !Number.isFinite(x))) throw new Error(`Coordenada no finita en «${linea.trim()}».`);
      posiciones.push(...xyz);
    } else if (t[0] === "vn") {
      const xyz = t.slice(1, 4).map(Number);
      normales.push(...xyz);
    } else if (t[0] === "f") {
      // Formas aceptadas: v · v/vt · v//vn · v/vt/vn. El «vt» (textura) se ignora.
      if (t.length < 4) throw new Error(`Cara degenerada en el OBJ: «${linea.trim()}».`);
      const vs: number[] = [], ns: number[] = [];
      let conN = true;
      for (const rama of t.slice(1)) {
        const p = rama.split("/");
        vs.push(resolver(p[0], Math.floor(posiciones.length / 3), "vértice"));
        const na = p[2] !== undefined ? resolver(p[2], Math.floor(normales.length / 3), "normal") : -1;
        if (na < 0) conN = false;
        ns.push(na);
      }
      for (let i = 1; i + 1 < vs.length; i++) {
        const nsT = conN ? [ns[0], ns[i], ns[i + 1]] : [-1, -1, -1];
        indicesPos.push(vs[0], vs[i], vs[i + 1]);
        indicesNor.push(...nsT);
      }
    }
    // Las demás líneas del OBJ (o, usemtl, mtllib, s…) se ignoran, igual que materiales y texturas.
  }
  if (posiciones.length === 0) throw new Error("El OBJ no trae ningún vértice «v».");
  return ensamblarGltf(posiciones, normales, indicesPos, indicesNor);
}

/** glTF 2.0: UN buffer en base64; accesores POSITION con min/max, NORMAL si el OBJ trae vn, índices UNSIGNED_INT. */
function ensamblarGltf(posiciones: number[], normales: number[], indicesPos: number[], indicesNor: number[]): string {
  const conN = indicesNor.length > 0 && !indicesNor.some((i) => i < 0);
  const bPos = f32(posiciones);
  const bNor = conN
    ? f32(indicesNor.flatMap((i) => [normales[i * 3], normales[i * 3 + 1], normales[i * 3 + 2]]))
    : new Uint8Array(0);
  const bIdx = u32(indicesPos);
  const datos = new Uint8Array(bPos.length + bNor.length + bIdx.length);
  datos.set(bPos, 0); datos.set(bNor, bPos.length); datos.set(bIdx, bPos.length + bNor.length);
  const minP = [posiciones[0], posiciones[1], posiciones[2]];
  const maxP = [...minP];
  for (let i = 0; i < posiciones.length; i += 3)
    for (let eje = 0; eje < 3; eje++) {
      minP[eje] = Math.min(minP[eje], posiciones[i + eje]);
      maxP[eje] = Math.max(maxP[eje], posiciones[i + eje]);
    }
  const vistas = [
    { buffer: 0, byteOffset: 0, byteLength: bPos.length, target: 34962 },
    ...(conN ? [{ buffer: 0, byteOffset: bPos.length, byteLength: bNor.length, target: 34962 }] : []),
    { buffer: 0, byteOffset: bPos.length + bNor.length, byteLength: bIdx.length, target: 34963 },
  ];
  const iIdx = conN ? 2 : 1;
  const atributos = conN ? { POSITION: 0, NORMAL: 1 } : { POSITION: 0 };
  return JSON.stringify({
    asset: { version: "2.0", generator: "StarSeed OS · Protomolécula (OBJ→glTF)" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: atributos, indices: iIdx, mode: 4 }] }],
    buffers: [{ uri: `data:application/octet-stream;base64,${aBase64(datos)}`, byteLength: datos.length }],
    bufferViews: vistas,
    accessors: [
      { bufferView: 0, componentType: 5126, count: posiciones.length / 3, type: "VEC3", min: minP, max: maxP },
      ...(conN ? [{ bufferView: 1, componentType: 5126, count: indicesNor.length, type: "VEC3" }] : []),
      { bufferView: iIdx, componentType: 5125, count: indicesPos.length, type: "SCALAR", min: [0], max: [Math.max(...indicesPos)] },
    ],
  });
}

const def = (de: string, a: string, nombre: string, convertir: ConversorDef["convertir"]): ConversorDef =>
  ({ de, a, via: "js", costo: 1, nombre, convertir });

/** Conversores de binarios listos para `registrarConversor` (los registra `convertidores-base.ts`). */
export const CONVERSORES_BINARIOS: ConversorDef[] = [
  def("pcm", "wav", "pcm-a-wav", pcmAWav),
  def("obj", "gltf", "obj-a-gltf", objAGltf),
];
