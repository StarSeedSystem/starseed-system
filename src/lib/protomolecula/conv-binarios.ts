// Protomolécula · Conversores binarios reales (PM1010F2D): PCM→WAV y OBJ→glTF.
// Módulo puro: sin red, sin disco y sin `node:*`. Lo que un formato no soporta se
// IGNORA, no se inventa: este OBJ→glTF no escribe materiales ni texturas.
import type { ConversorDef } from "./convertidores";
type Entrada = Uint8Array | string;
const TEXTO = new TextDecoder("utf-8"), aTexto = (e: Entrada): string => (typeof e === "string" ? e : TEXTO.decode(e));
/** Opción numérica positiva con valor por defecto; un texto numérico también vale. */
const opcion = (v: number | string | undefined, porDefecto: number): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : porDefecto;
};
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Base64 sin `Buffer` ni `btoa`: sirve igual en el navegador y en las pruebas. */
function base64(bytes: Uint8Array): string {
  let salida = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    salida += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return salida;
}
/** PCM Float32 little-endian → WAV PCM de 16 bits con cabecera RIFF de 44 bytes. */
export function pcmAWav(e: Entrada, o?: Record<string, number | string>): Uint8Array {
  if (typeof e === "string") throw new Error("PCM→WAV necesita bytes de muestras, no texto.");
  if (e.byteLength % 4 !== 0) throw new Error(`PCM inválido: ${e.byteLength} bytes no es múltiplo de 4 (muestras Float32).`);
  const canales = opcion(o?.canales, 1), frecuencia = opcion(o?.frecuencia, 44100);
  const n = e.byteLength / 4, datos = new Uint8Array(n * 2);
  const origen = new DataView(e.buffer, e.byteOffset, e.byteLength), destino = new DataView(datos.buffer);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, origen.getFloat32(i * 4, true)));
    destino.setInt16(i * 2, Math.round(v * 32767), true);
  }
  const wav = new Uint8Array(44 + datos.byteLength), h = new DataView(wav.buffer);
  const texto = (p: number, s: string): void => { for (let i = 0; i < s.length; i++) h.setUint8(p + i, s.charCodeAt(i)); };
  texto(0, "RIFF"); h.setUint32(4, 36 + datos.byteLength, true); texto(8, "WAVE"); texto(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, canales, true);
  h.setUint32(24, frecuencia, true); h.setUint32(28, frecuencia * canales * 2, true);
  h.setUint16(32, canales * 2, true); h.setUint16(34, 16, true);
  texto(36, "data"); h.setUint32(40, datos.byteLength, true); wav.set(datos, 44);
  return wav;
}
/** Índice OBJ: 1-based si es positivo, relativo al final si es negativo; 0 y fuera de rango fallan. */
const indiceObj = (t: string, total: number, que: string): number => {
  const v = Number(t), i = Number.isInteger(v) && v !== 0 ? (v > 0 ? v - 1 : total + v) : NaN;
  if (!Number.isInteger(i) || i < 0 || i >= total) throw new Error(`Índice ${que} fuera de rango en OBJ: «${t}».`);
  return i;
};
/** OBJ (v, vn, f) → glTF 2.0 con un único buffer incrustado en base64. */
export function objAGltf(entrada: Entrada): string {
  const pos: number[] = [], nor: number[] = [], caras: { p: number[]; n: number[] }[] = [];
  for (const linea of aTexto(entrada).split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const [clave, ...resto] = limpia.split(/\s+/);
    if (clave === "v" || clave === "vn") {
      if (resto.length < 3) throw new Error(`«${clave}» OBJ con menos de tres coordenadas.`);
      (clave === "v" ? pos : nor).push(Number(resto[0]), Number(resto[1]), Number(resto[2]));
    } else if (clave === "f") {
      if (resto.length < 3) throw new Error("Cara OBJ con menos de tres vértices.");
      const p: number[] = [], n: number[] = [];
      for (const t of resto) {
        const trozos = t.split("/");
        p.push(indiceObj(trozos[0], pos.length / 3, "de posición"));
        n.push(trozos[2] ? indiceObj(trozos[2], nor.length / 3, "de normal") : -1);
      }
      caras.push({ p, n });
    }
  }
  if (!caras.length) throw new Error("El OBJ no tiene caras (f) que convertir a glTF.");
  const conNormales = caras.every((c) => c.n.every((n) => n >= 0));
  const mapa = new Map<string, number>(), vert: { p: number; n: number }[] = [], ind: number[] = [];
  for (const c of caras) {
    const v = (k: number): number => {
      const clave = `${c.p[k]}/${conNormales ? c.n[k] : ""}`;
      let i = mapa.get(clave);
      if (i === undefined) { i = vert.length; mapa.set(clave, i); vert.push({ p: c.p[k], n: conNormales ? c.n[k] : -1 }); }
      return i;
    };
    for (let k = 1; k + 1 < c.p.length; k++) ind.push(v(0), v(k), v(k + 1));
  }
  const posF = new Float32Array(vert.length * 3), norF = conNormales ? new Float32Array(vert.length * 3) : null;
  vert.forEach((v, i) => {
    posF.set(pos.slice(v.p * 3, v.p * 3 + 3), i * 3);
    if (norF) norF.set(nor.slice(v.n * 3, v.n * 3 + 3), i * 3);
  });
  const indF = new Uint32Array(ind), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < posF.length; i += 3) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], posF[i + a]); max[a] = Math.max(max[a], posF[i + a]);
  }
  const partes = norF
    ? [new Uint8Array(posF.buffer), new Uint8Array(norF.buffer), new Uint8Array(indF.buffer)]
    : [new Uint8Array(posF.buffer), new Uint8Array(indF.buffer)];
  const buffer = new Uint8Array(partes.reduce((s, p) => s + p.byteLength, 0));
  let offset = 0;
  const vistas = partes.map((p) => { const v = { buffer: 0, byteOffset: offset, byteLength: p.byteLength }; buffer.set(p, offset); offset += p.byteLength; return v; });
  const attrs: Record<string, number> = { POSITION: 0 }; if (conNormales) attrs.NORMAL = 1;
  const accPos = { bufferView: 0, componentType: 5126, count: vert.length, type: "VEC3", min, max };
  const accNor = { bufferView: 1, componentType: 5126, count: vert.length, type: "VEC3" };
  const accInd = { bufferView: conNormales ? 2 : 1, componentType: 5125, count: ind.length, type: "SCALAR" };
  const ultima = vistas.length - 1;
  return JSON.stringify({
    asset: { version: "2.0", generator: "StarSeed OS · Protomolécula" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: attrs, indices: ultima, mode: 4 }] }],
    accessors: conNormales ? [accPos, accNor, accInd] : [accPos, accInd],
    bufferViews: [
      { ...vistas[0], target: 34962 },
      ...(conNormales ? [{ ...vistas[1], target: 34962 }] : []),
      { ...vistas[ultima], target: 34963 },
    ],
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(buffer)}`, byteLength: buffer.byteLength }],
  });
}
const def = (de: string, a: string, convertir: ConversorDef["convertir"]): ConversorDef => ({ de, a, via: "js", costo: 2, nombre: `${de}-a-${a}`, convertir });
/** Conversores binarios listos para `registrarConversor` (los registra `convertidores-base.ts`). */
export const CONVERSORES_BINARIOS: ConversorDef[] = [
  def("pcm", "wav", (e, o) => pcmAWav(e, o)),
  def("obj", "gltf", (e) => objAGltf(e)),
];
