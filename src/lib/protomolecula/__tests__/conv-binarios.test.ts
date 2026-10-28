import { beforeEach, describe, expect, it } from "vitest";
import { CONVERSORES_BINARIOS, objAGltf, pcmAWav } from "../conv-binarios";
import { registrarConvertidoresBase } from "../convertidores-base";
import { limpiarConversores, listarConversores, rutaDeConversion } from "../convertidores";

interface Accesor { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }
interface Gltf { accessors: Accesor[]; buffers: { uri: string; byteLength: number }[]; meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[] }
const leer = (t: string): Gltf => JSON.parse(t) as Gltf;
const pcm = (...m: number[]): Uint8Array => {
  const b = new Uint8Array(m.length * 4), v = new DataView(b.buffer);
  m.forEach((x, i) => v.setFloat32(i * 4, x, true));
  return b;
};
const trozo = (b: Uint8Array, p: number, n: number): string => String.fromCharCode(...b.slice(p, p + n));
const decodificar = (uri: string): Uint8Array => Uint8Array.from(atob(uri.split(",")[1]), (c) => c.charCodeAt(0));
const TRIANGULO = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
const CON_NORMAL = "v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//1 3//1\n";

describe("PCM → WAV", () => {
  it("escribe la cabecera RIFF de 44 bytes byte a byte", () => {
    const wav = pcmAWav(pcm(0, 0.5)), v = new DataView(wav.buffer);
    const cab = [
      trozo(wav, 0, 4), v.getUint32(4, true), trozo(wav, 8, 4), trozo(wav, 12, 4),
      v.getUint32(16, true), v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true),
      v.getUint32(28, true), v.getUint16(32, true), v.getUint16(34, true), trozo(wav, 36, 4),
      v.getUint32(40, true), wav.length,
    ];
    expect(cab).toEqual(["RIFF", 40, "WAVE", "fmt ", 16, 1, 1, 44100, 88200, 2, 16, "data", 4, 48]);
  });
  it("respeta frecuencia y canales en los tamaños derivados", () => {
    const wav = pcmAWav(pcm(0, 0, 0, 0), { frecuencia: 8000, canales: 2 }), v = new DataView(wav.buffer);
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint32(28, true), v.getUint16(32, true), v.getUint32(40, true), wav.length])
      .toEqual([2, 8000, 32000, 4, 8, 52]);
  });
  it("acota a [−1, 1] y redondea a 16 bits", () => {
    const wav = pcmAWav(pcm(2, -2, 0.25, -0.25)), v = new DataView(wav.buffer);
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([32767, -32767, 8192, -8192]);
  });
  it("una longitud que no es múltiplo de 4 da un error claro", () => {
    expect(() => pcmAWav(new Uint8Array(6))).toThrow(/múltiplo de 4/);
  });
  it("rechaza texto en vez de muestras", () => {
    expect(() => pcmAWav("hola")).toThrow(/bytes de muestras/);
  });
});

describe("OBJ → glTF", () => {
  it("un triángulo produce 3 vértices y 3 índices con min/max correctos", () => {
    const g = leer(objAGltf(TRIANGULO)), pos = g.accessors[0];
    expect(pos.count).toBe(3);
    expect(pos.min).toEqual([0, 0, 0]);
    expect(pos.max).toEqual([1, 1, 0]);
    expect(g.accessors[g.meshes[0].primitives[0].indices].count).toBe(3);
  });
  it("un cuadrado se triangula en abanico (2 triángulos, 6 índices)", () => {
    const cuadrado = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n";
    const g = leer(objAGltf(cuadrado));
    expect(g.accessors[g.meshes[0].primitives[0].indices].count).toBe(6);
    expect(g.accessors[0].count).toBe(4);
  });
  it("resuelve índices negativos relativos al final", () => {
    const g = leer(objAGltf("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n"));
    expect(g.accessors[0].min).toEqual([0, 0, 0]);
    expect(g.accessors[0].max).toEqual([1, 1, 0]);
  });
  it("con v//vn escribe el accesor NORMAL", () => {
    const g = leer(objAGltf(CON_NORMAL)), p = g.meshes[0].primitives[0];
    expect(p.attributes.NORMAL).toBe(1);
    expect(g.accessors[1]).toMatchObject({ componentType: 5126, count: 3, type: "VEC3" });
  });
  it("sin vn no inventa normales", () => {
    const g = leer(objAGltf(TRIANGULO));
    expect(g.meshes[0].primitives[0].attributes.NORMAL).toBeUndefined();
    expect(g.accessors.length).toBe(2);
  });
  it("el buffer base64 se decodifica al tamaño esperado", () => {
    const sin = leer(objAGltf(TRIANGULO)), con = leer(objAGltf(CON_NORMAL));
    expect(decodificar(sin.buffers[0].uri).length).toBe(48);
    expect(decodificar(con.buffers[0].uri).length).toBe(84);
    expect(con.buffers[0].byteLength).toBe(84);
  });
  it("acepta caras v/vt y v/vt/vn", () => {
    const conVt = leer(objAGltf("v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/1 2/1 3/1\n"));
    expect(conVt.accessors[0].count).toBe(3);
    expect(conVt.meshes[0].primitives[0].attributes.NORMAL).toBeUndefined();
    const conAmbos = leer(objAGltf("v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvn 0 0 1\nf 1/1/1 2/1/1 3/1/1\n"));
    expect(conAmbos.meshes[0].primitives[0].attributes.NORMAL).toBe(1);
  });
  it("un OBJ sin caras falla en español", () => {
    expect(() => objAGltf("v 0 0 0\n")).toThrow(/no tiene caras/);
  });
});

describe("registro base", () => {
  beforeEach(() => limpiarConversores());
  it("hace existir pcm→wav y obj→gltf", () => {
    registrarConvertidoresBase();
    expect(rutaDeConversion("pcm", "wav")).not.toBeNull();
    expect(rutaDeConversion("obj", "gltf")).not.toBeNull();
  });
  it("es idempotente", () => {
    registrarConvertidoresBase();
    const antes = listarConversores().length;
    registrarConvertidoresBase();
    expect(listarConversores().length).toBe(antes);
  });
  it("los binarios van por js", () => {
    expect(CONVERSORES_BINARIOS.length).toBe(2);
    expect(CONVERSORES_BINARIOS.every((c) => c.via === "js")).toBe(true);
  });
});
