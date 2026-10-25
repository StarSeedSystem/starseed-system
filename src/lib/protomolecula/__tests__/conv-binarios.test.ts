import { beforeEach, describe, expect, it } from "vitest";
import { CONVERSORES_BINARIOS, objAGltf, pcmAWav } from "../conv-binarios";
import { CONVERSORES_TEXTO } from "../conv-texto";
import { ejecutarRuta, limpiarConversores, listarConversores, rutaDeConversion } from "../convertidores";
import { registrarConvertidoresBase } from "../convertidores-base";

const flotantes = (xs: number[]): Uint8Array => { const b = new Uint8Array(xs.length * 4), dv = new DataView(b.buffer); xs.forEach((x, i) => dv.setFloat32(i * 4, x, true)); return b; };
const ascii = (b: Uint8Array, d: number, n: number): string => new TextDecoder().decode(b.slice(d, d + n));
const dvDe = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);
const TRI = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";

interface Gltf {
  asset: { version: string };
  meshes: { primitives: { attributes: Record<string, number>; indices: number; mode: number }[] }[];
  accessors: { componentType: number; count: number; type: string; min?: number[]; max?: number[] }[];
  bufferViews: { byteOffset: number; byteLength: number }[];
  buffers: { byteLength: number; uri: string }[];
}
const gltfDe = (obj: string): Gltf => JSON.parse(objAGltf(obj)) as Gltf;
const bytesDe = (g: Gltf): Uint8Array => Buffer.from(g.buffers[0].uri.split(",")[1], "base64");

describe("pcmAWav", () => {
  it("escribe la cabecera RIFF/WAVE/fmt/data con los tamaños correctos", () => {
    const wav = pcmAWav(flotantes([0, 0]));
    expect([ascii(wav, 0, 4), ascii(wav, 8, 4), ascii(wav, 12, 4), ascii(wav, 36, 4)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(wav.length).toBe(48);
    expect(dvDe(wav).getUint32(4, true)).toBe(40);
    expect(dvDe(wav).getUint32(40, true)).toBe(4);
  });
  it("usa 44100 Hz, 1 canal y PCM de 16 bits por defecto", () => {
    const dv = dvDe(pcmAWav(flotantes([0])));
    expect([dv.getUint32(16, true), dv.getUint16(20, true), dv.getUint16(22, true), dv.getUint16(34, true)]).toEqual([16, 1, 1, 16]);
    expect([dv.getUint32(24, true), dv.getUint32(28, true), dv.getUint16(32, true)]).toEqual([44100, 44100 * 2, 2]);
  });
  it("respeta frecuencia y canales de las opciones", () => {
    const dv = dvDe(pcmAWav(flotantes([0, 0, 0, 0]), { frecuencia: 48000, canales: 2 }));
    expect([dv.getUint16(22, true), dv.getUint32(24, true), dv.getUint32(28, true), dv.getUint16(32, true)]).toEqual([2, 48000, 48000 * 4, 4]);
  });
  it("convierte las muestras a enteros de 16 bits redondeados y satura", () => {
    const dv = dvDe(pcmAWav(flotantes([0, 0.25, -0.25, 1, 2, -2, 1.5, -1.5])));
    expect([44, 46, 48, 50, 52, 54, 56, 58].map((o) => dv.getInt16(o, true))).toEqual([0, 8192, -8192, 32767, 32767, -32767, 32767, -32767]);
  });
  it("rechaza una entrada que no es múltiplo de 4 bytes", () => {
    expect(() => pcmAWav(new Uint8Array(3))).toThrow(/múltiplo de 4/);
    expect(() => pcmAWav(new Uint8Array(6))).toThrow(/Float32 little-endian/);
  });
});

describe("objAGltf", () => {
  it("convierte un triángulo en glTF 2.0 con posiciones e índices UNSIGNED_INT", () => {
    const g = gltfDe(TRI);
    expect(g.asset.version).toBe("2.0");
    expect(g.meshes[0].primitives[0]).toMatchObject({ attributes: { POSITION: 0 }, indices: 1, mode: 4 });
    expect(g.accessors[0]).toMatchObject({ componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] });
    expect(g.accessors[1]).toMatchObject({ componentType: 5125, count: 3, type: "SCALAR" });
  });
  it("triangula un cuadrado en abanico (2 triángulos, 6 índices)", () => {
    const g = gltfDe("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n");
    expect(g.accessors[0]).toMatchObject({ count: 6, min: [0, 0, 0], max: [1, 1, 0] });
    expect(g.accessors[1].count).toBe(6);
  });
  it("entiende los índices negativos relativos", () => {
    const positivo = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
    const negativo = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n";
    expect(objAGltf(negativo)).toBe(objAGltf(positivo));
  });
  it("añade NORMAL cuando la cara trae v//vn", () => {
    const g = gltfDe("v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//1 3//1\n");
    expect(g.meshes[0].primitives[0].attributes).toEqual({ POSITION: 0, NORMAL: 1 });
    expect(g.accessors[1]).toMatchObject({ componentType: 5126, count: 3, type: "VEC3" });
    const dv = dvDe(bytesDe(g));
    const base = g.bufferViews[1].byteOffset;
    expect([0, 4, 8].map((o) => dv.getFloat32(base + o, true))).toEqual([0, 0, 1]);
  });
  it("acepta caras v/vt e ignora las coordenadas de textura", () => {
    const g = gltfDe("v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/1 2/1 3/1\n");
    expect(g.meshes[0].primitives[0].attributes).toEqual({ POSITION: 0 });
    expect(g.accessors).toHaveLength(2);
  });
  it("incrusta un buffer base64 decodificable al tamaño declarado", () => {
    const g = gltfDe(TRI);
    expect(g.buffers[0].uri.startsWith("data:application/octet-stream;base64,")).toBe(true);
    const bytes = bytesDe(g);
    expect(bytes.length).toBe(g.buffers[0].byteLength);
    expect(bytes.length).toBe(3 * 12 + 3 * 4);
    const dv = dvDe(bytes);
    expect([0, 4, 8, 12, 16, 20, 24, 28, 32].map((o) => dv.getFloat32(o, true))).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });
  it("rechaza un OBJ sin vértices o sin caras", () => {
    expect(() => objAGltf("")).toThrow(/vértices/);
    expect(() => objAGltf("v 0 0 0\nv 1 0 0\n")).toThrow(/caras/);
  });
});

describe("registrarConvertidoresBase", () => {
  beforeEach(() => limpiarConversores());

  it("publica los conversores binarios con vía js y costo 1", () => {
    expect(CONVERSORES_BINARIOS.map((c) => `${c.de}>${c.a}`)).toEqual(["pcm>wav", "obj>gltf"]);
    for (const c of CONVERSORES_BINARIOS) expect(c).toMatchObject({ via: "js", costo: 1, convertir: expect.any(Function) });
  });
  it("hace existir las rutas pcm→wav, obj→gltf y las de texto", () => {
    expect(rutaDeConversion("pcm", "wav")).toBeNull();
    registrarConvertidoresBase();
    expect(rutaDeConversion("pcm", "wav")?.pasos.map((p) => p.nombre)).toEqual(["pcm-a-wav"]);
    expect(rutaDeConversion("obj", "gltf")?.pasos.map((p) => p.nombre)).toEqual(["obj-a-gltf"]);
    expect(rutaDeConversion("csv", "json")?.pasos.map((p) => p.nombre)).toEqual(["csv-a-json"]);
    expect(CONVERSORES_TEXTO).toHaveLength(4);
  });
  it("es idempotente y ejecuta la ruta PCM→WAV de verdad", () => {
    registrarConvertidoresBase();
    const antes = listarConversores().length;
    registrarConvertidoresBase();
    expect(listarConversores()).toHaveLength(antes);
    const r = ejecutarRuta(rutaDeConversion("pcm", "wav")!, flotantes([0, 0.5]));
    expect(r.ok).toBe(true);
    if (r.ok && r.salida instanceof Uint8Array) expect(ascii(r.salida, 0, 4)).toBe("RIFF");
  });
});
