import { beforeEach, describe, expect, it } from "vitest";
import { CONVERSORES_BINARIOS, objAGltf, pcmAWav } from "../conv-binarios";
import { registrarConvertidoresBase } from "../convertidores-base";
import { limpiarConversores, listarConversores, rutaDeConversion } from "../convertidores";

type Accesor = { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] };
type Gltf = { asset: { version: string }; meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[]; accessors: Accesor[]; bufferViews: { byteOffset: number }[]; buffers: { uri: string; byteLength: number }[] };

const pcm = (...muestras: number[]): Uint8Array => new Uint8Array(new Float32Array(muestras).buffer);
const leer = (texto: string): Gltf => JSON.parse(texto) as Gltf;
const bytesDe = (g: Gltf): Uint8Array => {
  const b64 = g.buffers[0].uri.split(",")[1] ?? "";
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const indicesDe = (g: Gltf): number[] => {
  const acc = g.accessors[g.meshes[0].primitives[0].indices];
  const bytes = bytesDe(g);
  return Array.from(new Uint32Array(bytes.buffer, g.bufferViews[acc.bufferView].byteOffset, acc.count));
};
const flotantesDe = (g: Gltf, n: number): number[] => {
  const acc = g.accessors[n];
  const bytes = bytesDe(g);
  return Array.from(new Float32Array(bytes.buffer, g.bufferViews[acc.bufferView].byteOffset, acc.count * 3));
};
const textoWav = (b: Uint8Array, i: number, n: number): string => new TextDecoder().decode(b.subarray(i, i + n));
const u16 = (b: Uint8Array, i: number): number => new DataView(b.buffer, b.byteOffset).getUint16(i, true);
const u32 = (b: Uint8Array, i: number): number => new DataView(b.buffer, b.byteOffset).getUint32(i, true);

beforeEach(() => limpiarConversores());

describe("PCM → WAV", () => {
  it("escribe la cabecera RIFF de 44 bytes, campo a campo", () => {
    const w = pcmAWav(pcm(0));
    expect(w.byteLength).toBe(46);
    expect([textoWav(w, 0, 4), textoWav(w, 8, 4), textoWav(w, 12, 4), textoWav(w, 36, 4)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect([u32(w, 4), u32(w, 16), u16(w, 20), u16(w, 22), u32(w, 24), u32(w, 28), u16(w, 32), u16(w, 34), u32(w, 40)]).toEqual([38, 16, 1, 1, 44100, 88200, 2, 16, 2]);
  });

  it("acota a [-1, 1] y redondea las muestras a 16 bits", () => {
    const w = pcmAWav(pcm(2, -2, 0.5, -0.5));
    const v = new DataView(w.buffer);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)]).toEqual([32767, -32767, 16384, -16383]);
  });

  it("respeta la frecuencia y los canales pedidos", () => {
    const w = pcmAWav(pcm(0, 0), { frecuencia: 48000, canales: 2 });
    expect([u32(w, 24), u16(w, 22), u32(w, 28), u16(w, 32), u32(w, 40)]).toEqual([48000, 2, 192000, 4, 4]);
  });

  it("rechaza una longitud que no es múltiplo de 4 con un motivo claro", () => {
    expect(() => pcmAWav(new Uint8Array(6))).toThrow(/4 bytes cada una \(Float32\).*6 bytes/);
  });
});

describe("OBJ → glTF", () => {
  const TRIANGULO = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";

  it("un triángulo da POSITION con min/max, índices UNSIGNED_INT y buffer base64", () => {
    const g = leer(objAGltf(TRIANGULO));
    expect(g.asset.version).toBe("2.0");
    expect(g.accessors[0]).toMatchObject({ componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] });
    expect(g.accessors[g.meshes[0].primitives[0].indices]).toMatchObject({ componentType: 5125, count: 3, type: "SCALAR" });
    expect(indicesDe(g)).toEqual([0, 1, 2]);
    expect(bytesDe(g)).toHaveLength(36 + 12);
  });

  it("triangula un cuadrado en abanico (2 triángulos)", () => {
    const g = leer(objAGltf("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n"));
    expect(g.accessors[0].count).toBe(4);
    expect(indicesDe(g)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(bytesDe(g)).toHaveLength(48 + 24);
  });

  it("resuelve índices negativos relativos al final", () => {
    const g = leer(objAGltf("v 0 0 0\nv 1 0 0\nv 0 1 0\nv 2 2 2\nf -3 -2 -1\n"));
    expect(flotantesDe(g, 0)).toEqual([1, 0, 0, 0, 1, 0, 2, 2, 2]);
    expect(g.accessors[0].count).toBe(3);
  });

  it("incluye NORMAL si el OBJ trae v//vn", () => {
    const g = leer(objAGltf("v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//1 3//1\n"));
    expect(g.meshes[0].primitives[0].attributes.NORMAL).toBe(1);
    expect(g.accessors[1]).toMatchObject({ componentType: 5126, count: 3, type: "VEC3" });
    expect(flotantesDe(g, 1)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it("acepta v/vt y v/vt/vn e ignora las texturas (sin materiales)", () => {
    const g = leer(objAGltf("v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvn 0 0 1\nf 1/1 2/1/1 3/1/1\n"));
    expect(indicesDe(g)).toEqual([0, 1, 2]);
    expect(g.meshes[0].primitives[0].attributes.NORMAL).toBe(1);
  });

  it("calcula min/max también con coordenadas negativas", () => {
    const g = leer(objAGltf("v -2 0 0\nv 1 0 0\nv 0 -3 0\nf 1 2 3\n"));
    expect(g.accessors[0].min).toEqual([-2, -3, 0]);
    expect(g.accessors[0].max).toEqual([1, 0, 0]);
  });

  it("explica un OBJ sin caras o con un índice fuera de rango", () => {
    expect(() => objAGltf("v 0 0 0\nv 1 0 0\n")).toThrow(/no tiene caras/);
    expect(() => objAGltf("v 0 0 0\nf 1 2 3\n")).toThrow(/Índice de posición no válido/);
  });
});

describe("registrarConvertidoresBase", () => {
  it("deja pcm→wav y obj→gltf, vía js, y es idempotente", () => {
    registrarConvertidoresBase();
    const n = listarConversores().length;
    registrarConvertidoresBase();
    expect(listarConversores()).toHaveLength(n);
    expect(rutaDeConversion("pcm", "wav")?.pasos.map((p) => p.via)).toEqual(["js"]);
    expect(rutaDeConversion("obj", "gltf")?.pasos).toHaveLength(1);
    expect(CONVERSORES_BINARIOS.every((c) => c.via === "js" && typeof c.convertir === "function")).toBe(true);
  });
});
