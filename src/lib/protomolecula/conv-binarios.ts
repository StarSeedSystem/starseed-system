// Conversores binarios reales de la Protomolécula: PCM→WAV y OBJ→glTF 2.0.
// Módulo puro: sin red, sin disco ni `node:*`; el base64 se calcula aquí mismo.
// Lo que el OBJ no declara (materiales, texturas, grupos, tangentes) se IGNORA: no se inventa.
import type { ConversorDef } from "./convertidores";
type Entrada = Uint8Array | string;
type Opciones = Record<string, number | string>;
interface Esquina { pos: number; nor: number }
interface Accesor { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }
const ALFABETO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const comoBytes = (e: Entrada): Uint8Array => (typeof e === "string" ? new TextEncoder().encode(e) : e);
const comoTexto = (e: Entrada): string => (typeof e === "string" ? e : new TextDecoder("utf-8").decode(e));
function base64(datos: Uint8Array): string {
  let salida = "";
  for (let i = 0; i < datos.length; i += 3) {
    const a = datos[i], b = i + 1 < datos.length ? datos[i + 1] : 0, c = i + 2 < datos.length ? datos[i + 2] : 0;
    const t = (a << 16) | (b << 8) | c;
    salida += ALFABETO_B64[(t >> 18) & 63] + ALFABETO_B64[(t >> 12) & 63];
    salida += (i + 1 < datos.length ? ALFABETO_B64[(t >> 6) & 63] : "=") + (i + 2 < datos.length ? ALFABETO_B64[t & 63] : "=");
  }
  return salida;
}

/** PCM float32 crudo (little-endian) → WAV PCM 16 bits con cabecera RIFF de 44 bytes. */
export function pcmAWav(entrada: Entrada, opciones: Opciones = {}): Uint8Array {
  const crudo = comoBytes(entrada);
  if (crudo.length % 4 !== 0) throw new Error(`El PCM debe ser Float32 little-endian: ${crudo.length} bytes no es múltiplo de 4.`);
  const entero = (v: number | string | undefined, porDefecto: number, nombre: string): number => {
    const n = v === undefined ? porDefecto : Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`La opción «${nombre}» debe ser un entero positivo.`);
    return n;
  };
  const frecuencia = entero(opciones.frecuencia, 44100, "frecuencia"), canales = entero(opciones.canales, 1, "canales");
  const datos = crudo.length / 2, salida = new Uint8Array(44 + datos);
  const escribir = (p: number, t: string): void => { for (let i = 0; i < t.length; i++) salida[p + i] = t.charCodeAt(i); };
  const u16 = (p: number, v: number): void => { salida[p] = v & 255; salida[p + 1] = (v >> 8) & 255; };
  const u32 = (p: number, v: number): void => { u16(p, v & 0xffff); u16(p + 2, (v >>> 16) & 0xffff); };
  escribir(0, "RIFF"); u32(4, 36 + datos); escribir(8, "WAVE"); escribir(12, "fmt "); u32(16, 16);
  u16(20, 1); u16(22, canales); u32(24, frecuencia); u32(28, frecuencia * canales * 2);
  u16(32, canales * 2); u16(34, 16); escribir(36, "data"); u32(40, datos);
  const vista = new DataView(crudo.buffer, crudo.byteOffset, crudo.byteLength);
  for (let i = 0; i < crudo.length / 4; i++) {
    const acotada = Math.max(-1, Math.min(1, vista.getFloat32(i * 4, true)));
    u16(44 + i * 2, Math.round(acotada * 32767));
  }
  return salida;
}

function indice(token: string | undefined, total: number, que: string, linea: number): number {
  const n = Number(token), i = n > 0 ? n - 1 : total + n;
  if (!Number.isInteger(n) || n === 0) throw new Error(`OBJ: índice de ${que} no válido en la línea ${linea} («${token}»).`);
  if (i < 0 || i >= total) throw new Error(`OBJ: índice de ${que} fuera de rango en la línea ${linea} («${token}»).`);
  return i;
}

export function objAGltf(entrada: Entrada): string {
  const posiciones: number[][] = [], normales: number[][] = [], caras: Esquina[][] = [];
  comoTexto(entrada).replace(/^\uFEFF/, "").split(/\r?\n/).forEach((cruda, i) => {
    const linea = cruda.replace(/#.*$/, "").trim();
    if (linea === "") return;
    const partes = linea.split(/\s+/);
    if (partes[0] === "v" || partes[0] === "vn") {
      const fila = [1, 2, 3].map((k) => Number(partes[k]));
      if (fila.some((n) => !Number.isFinite(n))) throw new Error(`OBJ: valor de «${partes[0]}» no numérico en la línea ${i + 1}.`);
      (partes[0] === "v" ? posiciones : normales).push(fila);
    } else if (partes[0] === "f") {
      const cara = partes.slice(1).map((token): Esquina => {
        const t = token.split("/"), nor = t[2];
        return { pos: indice(t[0], posiciones.length, "v", i + 1), nor: nor ? indice(nor, normales.length, "vn", i + 1) : -1 };
      });
      if (cara.length < 3) throw new Error(`OBJ: la cara de la línea ${i + 1} tiene menos de 3 vértices.`);
      caras.push(cara);
    }
  });
  if (caras.length === 0) throw new Error("OBJ: no hay caras («f») que convertir.");
  const conNormales = caras.every((c) => c.every((e) => e.nor >= 0));
  const unicas = new Map<string, number>(), vertices: Esquina[] = [], indices: number[] = [];
  const indiceDe = (e: Esquina): number => {
    const clave = `${e.pos}:${conNormales ? e.nor : -1}`, previo = unicas.get(clave);
    if (previo !== undefined) return previo;
    unicas.set(clave, vertices.length); vertices.push(e); return vertices.length - 1;
  };
  for (const cara of caras) {
    const primero = indiceDe(cara[0]);
    for (let k = 1; k < cara.length - 1; k++) indices.push(primero, indiceDe(cara[k]), indiceDe(cara[k + 1]));
  }
  const planoPos = vertices.flatMap((v) => posiciones[v.pos]);
  const planoNor = conNormales ? vertices.flatMap((v) => normales[v.nor]) : [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < planoPos.length; i++) {
    min[i % 3] = Math.min(min[i % 3], planoPos[i]); max[i % 3] = Math.max(max[i % 3], planoPos[i]);
  }
  const flotantes = [...planoPos, ...planoNor];
  const bytesPos = planoPos.length * 4, bytesFlot = flotantes.length * 4, total = bytesFlot + indices.length * 4;
  const buffer = new Uint8Array(total), vista = new DataView(buffer.buffer);
  flotantes.forEach((v, i) => vista.setFloat32(i * 4, v, true)); indices.forEach((v, i) => vista.setUint32(bytesFlot + i * 4, v, true));
  const vistas = [{ buffer: 0, byteOffset: 0, byteLength: bytesPos, target: 34962 }];
  const accesores: Accesor[] = [{ bufferView: 0, componentType: 5126, count: vertices.length, type: "VEC3", min, max }];
  const atributos: Record<string, number> = { POSITION: 0 };
  if (conNormales) {
    vistas.push({ buffer: 0, byteOffset: bytesPos, byteLength: planoNor.length * 4, target: 34962 });
    accesores.push({ bufferView: 1, componentType: 5126, count: vertices.length, type: "VEC3" });
    atributos.NORMAL = 1;
  }
  vistas.push({ buffer: 0, byteOffset: bytesFlot, byteLength: indices.length * 4, target: 34963 });
  accesores.push({ bufferView: vistas.length - 1, componentType: 5125, count: indices.length, type: "SCALAR" });
  return JSON.stringify({
    asset: { version: "2.0", generator: "StarSeed OS · Protomolécula" }, scene: 0,
    scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: atributos, indices: accesores.length - 1, mode: 4 }] }],
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(buffer)}`, byteLength: total }],
    bufferViews: vistas, accessors: accesores,
  });
}
const def = (de: string, a: string, convertir: (e: Entrada, o?: Opciones) => Uint8Array | string): ConversorDef =>
  ({ de, a, via: "js", costo: 1, nombre: `${de}-a-${a}`, convertir });

export const CONVERSORES_BINARIOS: ConversorDef[] = [
  def("pcm", "wav", pcmAWav),
  def("obj", "gltf", (e) => objAGltf(e)),
];
