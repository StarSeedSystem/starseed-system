// Conversores reales de binarios para la Protomolécula: PCM→WAV y OBJ→glTF 2.0.
// Módulo puro: sin red, sin disco, sin Node ni navegador.
import type { ConversorDef } from "./convertidores";
import { comoTexto } from "./conv-texto";

type Entrada = Uint8Array | string;
type Opciones = Record<string, number | string>;

/** Entero positivo de las opciones, con el valor por defecto si falta o es inválido. */
function opcionEntera(opciones: Opciones, clave: string, defecto: number): number {
  const v = opciones[clave];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : defecto;
}

/** PCM float32 little-endian crudo (bytes) → WAV PCM de 16 bits (RIFF de 44 bytes). */
export function pcmAWav(entrada: Entrada, opciones: Opciones = {}): Uint8Array {
  if (typeof entrada === "string") throw new Error("El PCM de entrada debe venir como bytes (Uint8Array), no como texto.");
  if (entrada.length % 4 !== 0) throw new Error(`El PCM debe venir en muestras de 4 bytes (float32); sobran ${entrada.length % 4} bytes al final.`);
  const canales = opcionEntera(opciones, "canales", 1);
  const frecuencia = opcionEntera(opciones, "frecuencia", 44100);
  const muestras = entrada.length / 4;
  const datos = muestras * 2;
  const salida = new Uint8Array(44 + datos);
  const vista = new DataView(salida.buffer);
  const marca = (i: number, s: string) => { for (let k = 0; k < s.length; k++) vista.setUint8(i + k, s.charCodeAt(k)); };
  marca(0, "RIFF"); vista.setUint32(4, 36 + datos, true); marca(8, "WAVE");
  marca(12, "fmt "); vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true); vista.setUint16(22, canales, true); // PCM sin comprimir
  vista.setUint32(24, frecuencia, true); vista.setUint32(28, frecuencia * canales * 2, true);
  vista.setUint16(32, canales * 2, true); vista.setUint16(34, 16, true);
  marca(36, "data"); vista.setUint32(40, datos, true);
  const leidos = new DataView(entrada.buffer, entrada.byteOffset, entrada.byteLength);
  for (let i = 0; i < muestras; i++) {
    const bruto = leidos.getFloat32(i * 4, true);
    const acotado = bruto < -1 ? -1 : bruto > 1 ? 1 : bruto; // saturación a [−1, 1]
    vista.setInt16(44 + i * 2, Math.round(acotado < 0 ? acotado * 32768 : acotado * 32767), true);
  }
  return salida;
}

/** OBJ (v, vn, f con índices NEGATIVOS relativos; f, f/vt, f//vn, f/vt/vn) → glTF 2.0 en texto. */
export function objAGltf(entrada: Entrada): string {
  const posiciones: number[] = [], normales: number[] = [];
  const vertsPos: number[] = [], vertsNor: number[] = [], indices: number[] = [];
  const claves = new Map<string, number>();
  let totalV = 0, totalN = 0, todasConNormal = true;
  const resolver = (v: number, n: number): number => {
    const ya = claves.get(`${v}|${n}`);
    if (ya !== undefined) return ya;
    const nuevo = vertsPos.length / 3;
    claves.set(`${v}|${n}`, nuevo);
    const p = (v - 1) * 3, q = (n - 1) * 3;
    vertsPos.push(posiciones[p], posiciones[p + 1], posiciones[p + 2]);
    vertsNor.push(q >= 0 ? normales[q] : 0, q >= 0 ? normales[q + 1] : 0, q >= 0 ? normales[q + 2] : 0);
    return nuevo;
  };
  for (const linea of comoTexto(entrada).split(/\r?\n/)) {
    const t = linea.trim().split(/\s+/);
    if (t[0] === "v" && t.length >= 4) { posiciones.push(Number(t[1]), Number(t[2]), Number(t[3])); totalV++; }
    else if (t[0] === "vn" && t.length >= 4) { normales.push(Number(t[1]), Number(t[2]), Number(t[3])); totalN++; }
    else if (t[0] === "f" && t.length >= 4) { // «vt» se ignora; los materiales (mtllib, usemtl, s) ni se leen
      const anillo: number[] = [];
      for (const token of t.slice(1)) {
        const [iv = "", , inr = ""] = token.split("/");
        const vi = Number(iv), ni = Number(inr);
        if (!Number.isInteger(vi) || vi === 0 || vi < -totalV) throw new Error(`Índice de vértice no válido en cara: «${token}».`);
        if ((inr !== "" && !Number.isInteger(ni)) || ni < -totalN) throw new Error(`Índice de normal no válido en cara: «${token}».`);
        if (ni === 0) todasConNormal = false;
        anillo.push(resolver(vi < 0 ? totalV + 1 + vi : vi, ni < 0 ? totalN + 1 + ni : ni));
      }
      for (let i = 1; i + 1 < anillo.length; i++) indices.push(anillo[0], anillo[i], anillo[i + 1]); // abanico
    }
  }
  if (indices.length === 0) throw new Error("El OBJ no trae caras usables: se necesitan «v» y «f» con al menos un triángulo.");
  const conNormal = todasConNormal && vertsNor.length > 0;
  const bytesPos = vertsPos.length * 4, bytesNor = conNormal ? vertsNor.length * 4 : 0, bytesIdx = indices.length * 4;
  const bruto = new Uint8Array(bytesPos + bytesNor + bytesIdx);
  const vista = new DataView(bruto.buffer);
  vertsPos.forEach((v, i) => vista.setFloat32(i * 4, v, true));
  if (conNormal) vertsNor.forEach((v, i) => vista.setFloat32(bytesPos + i * 4, v, true));
  indices.forEach((v, i) => vista.setUint32(bytesPos + bytesNor + i * 4, v, true));
  const extremos = [0, 1, 2].map((c) => {
    let min = Infinity, max = -Infinity;
    for (let i = c; i < vertsPos.length; i += 3) { min = Math.min(min, vertsPos[i]); max = Math.max(max, vertsPos[i]); }
    return [min, max] as [number, number];
  });
  // Sin materiales ni coordenadas de textura: lo que el OBJ trae y aquí no se soporta, se IGNORA, no se inventa.
  const gltf: Record<string, unknown> = {
    asset: { version: "2.0", generator: "Protomolécula (StarSeed OS)" },
    buffers: [{ uri: `data:application/octet-stream;base64,${base64De(bruto)}`, byteLength: bruto.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: bytesPos },
      { buffer: 0, byteOffset: bytesPos, byteLength: bytesIdx },
      ...(conNormal ? [{ buffer: 0, byteOffset: bytesPos + bytesNor, byteLength: bytesNor }] : []),
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertsPos.length / 3, type: "VEC3",
        min: extremos.map((e) => e[0]), max: extremos.map((e) => e[1]) },
      { bufferView: 1, componentType: 5125, count: indices.length, type: "SCALAR" }, // índices UNSIGNED_INT
      ...(conNormal ? [{ bufferView: 2, componentType: 5126, count: vertsNor.length / 3, type: "VEC3" }] : []),
    ],
    meshes: [{ primitives: [{ attributes: conNormal ? { POSITION: 0, NORMAL: 2 } : { POSITION: 0 }, indices: 1 }] }],
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  };
  return JSON.stringify(gltf);
}

function base64De(bytes: Uint8Array): string {
  let texto = "";
  for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(texto);
}

/** Conversores de binarios listos para `registrarConversor` (los registra `convertidores-base.ts`). */
export const CONVERSORES_BINARIOS: ConversorDef[] = [
  { de: "pcm", a: "wav", via: "js", costo: 1, nombre: "pcm-a-wav", convertir: pcmAWav },
  { de: "obj", a: "gltf", via: "js", costo: 1, nombre: "obj-a-gltf", convertir: objAGltf },
];
