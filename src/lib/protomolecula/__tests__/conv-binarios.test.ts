import { beforeEach, describe, expect, it } from "vitest";
import { CONVERSORES_BINARIOS, objAGltf, pcmAWav } from "../conv-binarios";
import { registrarConvertidoresBase } from "../convertidores-base";
import { ejecutarRuta, limpiarConversores, listarConversores, rutaDeConversion } from "../convertidores";

interface Accesor { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }
type Gltf = { asset: { version: string }; buffers: { uri: string; byteLength: number }[]; bufferViews: { byteOffset: number }[]; accessors: Accesor[]; meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[] };

const textoAscii = (b: Uint8Array, p: number, n: number): string => new TextDecoder().decode(b.slice(p, p + n));
const vistaDe = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);
const gltfDe = (obj: string): Gltf => JSON.parse(objAGltf(obj)) as Gltf;
const pcm = (valores: number[]): Uint8Array => {
  const b = new Uint8Array(valores.length * 4), d = new DataView(b.buffer);
  valores.forEach((v, i) => d.setFloat32(i * 4, v, true));
  return b;
};
const bytesBase64 = (uri: string): Uint8Array => Uint8Array.from(atob(uri.replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0));
const floats = (g: Gltf, accesor: number): number[] => {
  const a = g.accessors[accesor], bv = g.bufferViews[a.bufferView], datos = bytesBase64(g.buffers[0].uri);
  const d = new DataView(datos.buffer, bv.byteOffset, a.count * 12);
  return Array.from({ length: a.count * 3 }, (_, i) => d.getFloat32(i * 4, true));
};
describe("PCM → WAV", () => {
  it("escribe la cabecera RIFF de 44 bytes byte a byte", () => {
    const wav = pcmAWav(pcm([0, 0])), d = vistaDe(wav);
    expect(wav.length).toBe(48);
    expect([textoAscii(wav, 0, 4), textoAscii(wav, 8, 4), textoAscii(wav, 12, 4), textoAscii(wav, 36, 4)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect([d.getUint32(4, true), d.getUint32(16, true), d.getUint32(24, true), d.getUint32(28, true), d.getUint32(40, true)]).toEqual([40, 16, 44100, 88200, 4]);
    expect([d.getUint16(20, true), d.getUint16(22, true), d.getUint16(32, true), d.getUint16(34, true)]).toEqual([1, 1, 2, 16]);
  });

  it("convierte muestras y respeta frecuencia y canales", () => {
    const d = vistaDe(pcmAWav(pcm([0, 1]), { frecuencia: 8000, canales: 2 }));
    expect([d.getUint16(22, true), d.getUint32(24, true), d.getUint32(28, true), d.getUint16(32, true)]).toEqual([2, 8000, 32000, 4]);
    expect([d.getInt16(44, true), d.getInt16(46, true)]).toEqual([0, 32767]);
  });

  it("acota a [−1, 1] y redondea", () => {
    const d = vistaDe(pcmAWav(pcm([2, -2, 0.25])));
    expect([0, 2, 4].map((p) => d.getInt16(44 + p, true))).toEqual([32767, -32767, 8192]);
  });

  it("rechaza longitudes inválidas y opciones no positivas", () => {
    expect(() => pcmAWav(new Uint8Array(3))).toThrow(/múltiplo de 4/);
    expect(() => pcmAWav(pcm([0]), { frecuencia: 0 })).toThrow(/entero positivo/);
  });
});

describe("OBJ → glTF 2.0", () => {
  it("un triángulo: POSITION con min/max e índices UNSIGNED_INT", () => {
    const g = gltfDe("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"), prim = g.meshes[0].primitives[0];
    expect(g.asset.version).toBe("2.0");
    expect(prim.attributes).toEqual({ POSITION: 0 });
    expect(g.accessors[0]).toMatchObject({ type: "VEC3", componentType: 5126, count: 3, min: [0, 0, 0], max: [1, 1, 0] });
    expect(g.accessors[prim.indices]).toMatchObject({ type: "SCALAR", componentType: 5125, count: 3 });
  });

  it("un cuadrado se triangula en abanico", () => {
    const g = gltfDe("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n");
    expect(g.accessors[0].count).toBe(4);
    expect(g.accessors[g.meshes[0].primitives[0].indices].count).toBe(6);
  });

  it("entiende índices negativos relativos", () => {
    const g = gltfDe("v 0 0 0\nv 2 0 0\nv 0 2 0\nf -3 -2 -1\n");
    expect(g.accessors[0].min).toEqual([0, 0, 0]);
    expect(g.accessors[0].max).toEqual([2, 2, 0]);
    expect(floats(g, 0)).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0]);
  });

  it("v//vn añade NORMAL con sus valores reales", () => {
    const g = gltfDe("v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//1 3//1\n");
    expect(g.meshes[0].primitives[0].attributes.NORMAL).toBe(1);
    expect(g.accessors[1]).toMatchObject({ componentType: 5126, count: 3, type: "VEC3" });
    expect(floats(g, 1)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it("acepta v/vt y v/vt/vn e ignora las coordenadas de textura", () => {
    const soloVt = gltfDe("v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/1 2/1 3/1\n");
    expect(soloVt.meshes[0].primitives[0].attributes).toEqual({ POSITION: 0 });
    const conVn = gltfDe("v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvn 0 0 1\nf 1/1/1 2/1/1 3/1/1\n");
    expect(conVn.meshes[0].primitives[0].attributes.NORMAL).toBe(1);
  });

  it("el buffer en base64 se decodifica al tamaño declarado", () => {
    const g = gltfDe("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"), bytes = bytesBase64(g.buffers[0].uri);
    expect(g.buffers[0].uri.startsWith("data:application/octet-stream;base64,")).toBe(true);
    expect(bytes.length).toBe(g.buffers[0].byteLength);
    expect(bytes.length).toBe(3 * 12 + 3 * 4);
  });

  it("sin normales no inventa NORMAL y rechaza caras inválidas", () => {
    expect(gltfDe("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n").accessors).toHaveLength(2);
    expect(() => objAGltf("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2\n")).toThrow(/menos de 3 vértices/);
    expect(() => objAGltf("v 0 0 0\n")).toThrow(/no hay caras/);
  });
});
describe("registrarConvertidoresBase", () => {
  beforeEach(() => limpiarConversores());

  it("registra texto y binarios, y sus rutas existen", () => {
    expect(rutaDeConversion("pcm", "wav")).toBeNull();
    registrarConvertidoresBase();
    expect(rutaDeConversion("pcm", "wav")?.pasos.map((p) => p.nombre)).toEqual(["pcm-a-wav"]);
    expect(rutaDeConversion("obj", "gltf")?.pasos.map((p) => p.nombre)).toEqual(["obj-a-gltf"]);
    expect(rutaDeConversion("csv", "json")).not.toBeNull();
    expect(CONVERSORES_BINARIOS.map((c) => `${c.de}>${c.a}`)).toEqual(["pcm>wav", "obj>gltf"]);
    for (const c of CONVERSORES_BINARIOS) expect(c).toMatchObject({ via: "js", convertir: expect.any(Function) });
  });

  it("es idempotente y ejecuta una ruta real", () => {
    registrarConvertidoresBase();
    const total = listarConversores().length;
    registrarConvertidoresBase();
    expect(listarConversores()).toHaveLength(total);
    const ruta = rutaDeConversion("obj", "gltf"), salida = ruta ? ejecutarRuta(ruta, "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n") : null;
    expect(salida?.ok).toBe(true);
    if (salida?.ok) expect((JSON.parse(String(salida.salida)) as Gltf).asset.version).toBe("2.0");
  });
});
