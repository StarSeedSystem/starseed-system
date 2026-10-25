// Conversores binarios reales de la Protomolécula (F2C): PCM→WAV y OBJ→glTF.
// Módulo puro: sin red, sin disco, sin `node:*` ni librerías; el navegador lo ejecuta tal cual.
// Lo que el formato no soporta se IGNORA, no se inventa: OBJ→glTF no lleva materiales ni texturas.
import type { ConversorDef } from "./convertidores";

type Opciones = Record<string, number | string>;
type Bytes = Uint8Array | string;
const positivo = (v: unknown, pordefecto: number): number => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : pordefecto);

/** PCM Float32 crudo (little-endian) → WAV PCM 16 bits con cabecera RIFF, acotando a [−1, 1]. */
export function pcmAWav(entrada: Uint8Array, opciones: Opciones = {}): Uint8Array {
  if (entrada.byteLength % 4 !== 0) throw new Error(`Las muestras PCM deben ser Float32 little-endian: ${entrada.byteLength} bytes no es múltiplo de 4.`);
  const canales = Math.max(1, Math.round(positivo(opciones.canales, 1)));
  const frecuencia = Math.round(positivo(opciones.frecuencia, 44100));
  const muestras = entrada.byteLength / 4, datos = muestras * 2;
  const salida = new Uint8Array(44 + datos), dv = new DataView(salida.buffer);
  const texto = (pos: number, s: string): void => { for (let i = 0; i < s.length; i++) dv.setUint8(pos + i, s.charCodeAt(i)); };
  texto(0, "RIFF"); dv.setUint32(4, 36 + datos, true); texto(8, "WAVE"); texto(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, canales, true);
  dv.setUint32(24, frecuencia, true); dv.setUint32(28, frecuencia * canales * 2, true);
  dv.setUint16(32, canales * 2, true); dv.setUint16(34, 16, true);
  texto(36, "data"); dv.setUint32(40, datos, true);
  const lee = new DataView(entrada.buffer, entrada.byteOffset, entrada.byteLength);
  for (let i = 0; i < muestras; i++) {
    const x = Math.max(-1, Math.min(1, lee.getFloat32(i * 4, true)));
    dv.setInt16(44 + i * 2, Math.round(x * 32767), true);
  }
  return salida;
}

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const t = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += ALFABETO[(t >> 18) & 63] + ALFABETO[(t >> 12) & 63];
    s += i + 1 < b.length ? ALFABETO[(t >> 6) & 63] : "=";
    s += i + 2 < b.length ? ALFABETO[t & 63] : "=";
  }
  return s;
}

interface ObjLeido { pos: number[][]; nor: number[][]; tris: [number, number][][] }
function leerObj(texto: string): ObjLeido {
  const pos: number[][] = [], nor: number[][] = [], tris: [number, number][][] = [];
  const indice = (tok: string, total: number): number => {
    const n = Number.parseInt(tok, 10), i = n > 0 ? n - 1 : total + n;
    if (!Number.isFinite(n) || n === 0 || i < 0 || i >= total) throw new Error(`Índice OBJ no válido: «${tok}».`);
    return i;
  };
  for (const linea of texto.split(/\r?\n/)) {
    const partes = linea.trim().split(/\s+/), tipo = partes[0];
    if (tipo === "v" && partes.length >= 4) pos.push(partes.slice(1, 4).map(Number));
    else if (tipo === "vn" && partes.length >= 4) nor.push(partes.slice(1, 4).map(Number));
    else if (tipo === "f" && partes.length >= 4) {
      const esquinas = partes.slice(1).map((tok) => {
        const [a, , c] = tok.split("/");
        return [indice(a, pos.length), c ? indice(c, nor.length) : -1] as [number, number];
      });
      // Abanico desde la primera esquina: un polígono de n lados da n − 2 triángulos.
      for (let i = 1; i + 1 < esquinas.length; i++) tris.push([esquinas[0], esquinas[i], esquinas[i + 1]]);
    }
  }
  return { pos, nor, tris };
}

/** Texto OBJ (v, vn, f) → JSON glTF 2.0 con un buffer base64; posiciones, normales e índices. */
export function objAGltf(entrada: Bytes): string {
  const texto = typeof entrada === "string" ? entrada : new TextDecoder("utf-8").decode(entrada);
  const { pos, nor, tris } = leerObj(texto);
  if (pos.length === 0) throw new Error("El OBJ no tiene vértices (líneas «v»).");
  if (tris.length === 0) throw new Error("El OBJ no tiene caras (líneas «f»).");
  const conNor = nor.length > 0 && tris.every((t) => t.every(([, ni]) => ni >= 0 && ni < nor.length));
  const P: number[][] = [], N: number[][] = [], I: number[] = [];
  for (const t of tris) for (const [vi, ni] of t) {
    I.push(P.length); P.push(pos[vi]); if (conNor) N.push(nor[ni]);
  }
  const pb = P.length * 12, nb = conNor ? P.length * 12 : 0, ib = I.length * 4;
  const bytes = new Uint8Array(pb + nb + ib), dv = new DataView(bytes.buffer);
  let o = 0;
  for (const p of P) for (let e = 0; e < 3; e++) { dv.setFloat32(o, p[e], true); o += 4; }
  if (conNor) for (const n of N) for (let e = 0; e < 3; e++) { dv.setFloat32(o, n[e], true); o += 4; }
  for (const i of I) { dv.setUint32(o, i, true); o += 4; }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of P) for (let e = 0; e < 3; e++) { min[e] = Math.min(min[e], p[e]); max[e] = Math.max(max[e], p[e]); }
  const vistas = [{ buffer: 0, byteOffset: 0, byteLength: pb, target: 34962 }];
  if (conNor) vistas.push({ buffer: 0, byteOffset: pb, byteLength: nb, target: 34962 });
  vistas.push({ buffer: 0, byteOffset: pb + nb, byteLength: ib, target: 34963 });
  const accesores: Record<string, unknown>[] = [
    { bufferView: 0, componentType: 5126, count: P.length, type: "VEC3", min, max },
  ];
  if (conNor) accesores.push({ bufferView: 1, componentType: 5126, count: P.length, type: "VEC3" });
  accesores.push({ bufferView: conNor ? 2 : 1, componentType: 5125, count: I.length, type: "SCALAR" });
  const atributos: Record<string, number> = { POSITION: 0 };
  if (conNor) atributos.NORMAL = 1;
  const gltf = {
    asset: { version: "2.0", generator: "StarSeed OS · Protomolécula" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: atributos, indices: accesores.length - 1, mode: 4 }] }],
    accessors: accesores, bufferViews: vistas,
    buffers: [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${base64(bytes)}` }],
  };
  return JSON.stringify(gltf);
}

const def = (de: string, a: string, convertir: (e: Bytes, o?: Opciones) => Bytes): ConversorDef =>
  ({ de, a, via: "js", costo: 1, nombre: `${de}-a-${a}`, convertir });

/** Conversores binarios listos para `registrarConversor` (los registra `convertidores-base.ts`). */
export const CONVERSORES_BINARIOS: ConversorDef[] = [
  def("pcm", "wav", (e, o) => pcmAWav(typeof e === "string" ? new TextEncoder().encode(e) : e, o)),
  def("obj", "gltf", (e) => objAGltf(e)),
];
