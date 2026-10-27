// Conversores binarios reales de la Protomolécula: PCM Float32LE → WAV y OBJ → glTF 2.0.
// Módulo puro: sin red, sin disco, sin `node:*` y sin dependencias (base64 propio).
// Lo que el OBJ no soporta (materiales, texturas, grupos…) se IGNORA: no se inventa.
import type { ConversorDef } from "./convertidores";
type Opciones = Record<string, number | string> | undefined;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Base64 estándar de bytes (vale en navegador: no usa Buffer). */
function aBase64(bytes: Uint8Array): string {
  let salida = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    salida += BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63];
    salida += i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : "=";
    salida += i + 2 < bytes.length ? BASE64[n & 63] : "=";
  }
  return salida;
}

/** PCM Float32 little-endian crudo → WAV PCM de 16 bits con cabecera RIFF de 44 bytes. */
export function pcmAWav(entrada: Uint8Array, opciones?: Opciones): Uint8Array {
  if (entrada.byteLength % 4 !== 0) {
    throw new Error(`Las muestras PCM deben ocupar 4 bytes cada una (Float32); la entrada tiene ${entrada.byteLength} bytes.`);
  }
  const frecuencia = Number(opciones?.frecuencia ?? 44100), canales = Number(opciones?.canales ?? 1);
  const muestras = entrada.byteLength / 4, datos = muestras * 2;
  const salida = new Uint8Array(44 + datos);
  const vista = new DataView(salida.buffer);
  for (const [pos, txt] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]] as const) {
    for (let i = 0; i < txt.length; i++) salida[pos + i] = txt.charCodeAt(i);
  }
  vista.setUint32(4, 36 + datos, true);
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true);
  vista.setUint16(22, canales, true); vista.setUint32(24, frecuencia, true);
  vista.setUint32(28, frecuencia * canales * 2, true); vista.setUint16(32, canales * 2, true);
  vista.setUint16(34, 16, true); vista.setUint32(40, datos, true);
  const origen = new DataView(entrada.buffer, entrada.byteOffset, entrada.byteLength);
  for (let i = 0; i < muestras; i++) {
    const v = Math.max(-1, Math.min(1, origen.getFloat32(i * 4, true)));
    vista.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return salida;
}
/** Índice OBJ (base 1; negativo = relativo al final) validado contra el total actual. */
function indiceObj(token: string | undefined, total: number, que: string): number {
  const n = Number.parseInt(token ?? "", 10);
  const i = n < 0 ? total + n : n - 1;
  if (!Number.isInteger(n) || n === 0 || i < 0 || i >= total) throw new Error(`Índice ${que} no válido en OBJ: «${token ?? ""}».`);
  return i;
}
/** OBJ (v, vn, f con índices positivos o negativos) → glTF 2.0 JSON con UN buffer en base64. */
export function objAGltf(entrada: Uint8Array | string): string {
  const texto = typeof entrada === "string" ? entrada : new TextDecoder("utf-8").decode(entrada);
  const posiciones: number[][] = [], normales: number[][] = [], usados = new Map<string, number>();
  const vertices: { p: number; n: number }[] = [], indices: number[] = [];
  let conNormales = false;
  for (const linea of texto.split(/\r?\n/)) {
    const partes = linea.trim().split(/\s+/);
    const tipo = partes[0];
    if (tipo === "v" && partes.length >= 4) posiciones.push(partes.slice(1, 4).map(Number));
    else if (tipo === "vn" && partes.length >= 4) normales.push(partes.slice(1, 4).map(Number));
    else if (tipo === "f" && partes.length >= 4) {
      const cara = partes.slice(1).map((token) => {
        const [p, , n] = token.split("/");
        const pi = indiceObj(p, posiciones.length, "de posición");
        const ni = n ? indiceObj(n, normales.length, "de normal") : -1;
        if (ni >= 0) conNormales = true;
        const clave = `${pi}/${ni}`;
        let k = usados.get(clave);
        if (k === undefined) { k = vertices.length; usados.set(clave, k); vertices.push({ p: pi, n: ni }); }
        return k;
      });
      for (let i = 1; i + 1 < cara.length; i++) indices.push(cara[0], cara[i], cara[i + 1]);
    }
  }
  if (vertices.length === 0) throw new Error("El OBJ no tiene caras con las que construir una malla.");
  const pos = new Float32Array(vertices.length * 3), nor = conNormales ? new Float32Array(vertices.length * 3) : null;
  const minimo = [Infinity, Infinity, Infinity], maximo = [-Infinity, -Infinity, -Infinity];
  vertices.forEach((v, i) => {
    const p = posiciones[v.p];
    for (let eje = 0; eje < 3; eje++) {
      pos[i * 3 + eje] = p[eje];
      minimo[eje] = Math.min(minimo[eje], p[eje]);
      maximo[eje] = Math.max(maximo[eje], p[eje]);
    }
    if (nor && v.n >= 0) nor.set(normales[v.n], i * 3);
  });
  const bytesPos = new Uint8Array(pos.buffer), bytesNor = nor ? new Uint8Array(nor.buffer) : null;
  const bytesInd = new Uint8Array(new Uint32Array(indices).buffer);
  const offsetNor = bytesPos.byteLength, offsetInd = offsetNor + (bytesNor?.byteLength ?? 0);
  const bytes = new Uint8Array(offsetInd + bytesInd.byteLength);
  bytes.set(bytesPos); if (bytesNor) bytes.set(bytesNor, offsetNor); bytes.set(bytesInd, offsetInd);
  const bufferViews = [
    { buffer: 0, byteOffset: 0, byteLength: bytesPos.byteLength, target: 34962 },
    ...(bytesNor ? [{ buffer: 0, byteOffset: offsetNor, byteLength: bytesNor.byteLength, target: 34962 }] : []),
    { buffer: 0, byteOffset: offsetInd, byteLength: bytesInd.byteLength, target: 34963 },
  ];
  const accessors = [
    { bufferView: 0, componentType: 5126, count: vertices.length, type: "VEC3", min: minimo, max: maximo },
    ...(bytesNor ? [{ bufferView: 1, componentType: 5126, count: vertices.length, type: "VEC3" }] : []),
    { bufferView: bufferViews.length - 1, componentType: 5125, count: indices.length, type: "SCALAR" },
  ];
  return JSON.stringify({
    asset: { version: "2.0", generator: "StarSeed OS · Protomolécula" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: bytesNor ? { POSITION: 0, NORMAL: 1 } : { POSITION: 0 }, indices: accessors.length - 1, mode: 4 }] }],
    buffers: [{ uri: `data:application/octet-stream;base64,${aBase64(bytes)}`, byteLength: bytes.byteLength }],
    bufferViews, accessors,
  });
}
const def = (de: string, a: string, convertir: (e: Uint8Array | string, o?: Opciones) => Uint8Array | string): ConversorDef =>
  ({ de, a, via: "js", costo: 1, nombre: `${de}-a-${a}`, convertir });
/** Conversores binarios listos para `registrarConversor` (los registra `convertidores-base.ts`). */
export const CONVERSORES_BINARIOS: ConversorDef[] = [
  def("pcm", "wav", (e, o) => pcmAWav(typeof e === "string" ? new TextEncoder().encode(e) : e, o)),
  def("obj", "gltf", (e) => objAGltf(e)),
];
