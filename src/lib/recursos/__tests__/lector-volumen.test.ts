import { describe, it, expect } from "vitest";
import { crearLector, verificarPorSha256, type CacheVolumen, type FuenteBanda } from "../lector-volumen";
import { TAMANO_BANDA, type Manifiesto } from "../volumen";
const sha = async (d: Uint8Array): Promise<string> =>
  [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(d)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
const bytesDe = (n: number, s = 1): Uint8Array =>
  new Uint8Array(n).map((_, i) => (i * s + n) % 256);
const manifiestoDe = async (bandas: Uint8Array[]): Promise<Manifiesto> => ({
  id: "app", version: "1", tamano: bandas.reduce((s, b) => s + b.byteLength, 0),
  banda: TAMANO_BANDA, privado: false, importancia: 1,
  bandas: await Promise.all(bandas.map(async (b, indice) => ({
    indice, sha256: await sha(b), bytes: b.byteLength,
  }))),
});
interface CacheFalsa extends CacheVolumen { mapa: Map<string, ArrayBuffer>; }
const cacheFalsa = (): CacheFalsa => {
  const mapa = new Map<string, ArrayBuffer>();
  return {
    mapa, leer: async (s) => mapa.get(s)?.slice(0) ?? null,
    guardar: async (s, d) => { mapa.set(s, d.slice(0)); return true; },
  };
};
const fuente = (
  id: string,
  datos: Uint8Array[],
  opciones: { velocidad?: number; falla?: boolean; miente?: boolean } = {},
): FuenteBanda & { llamadas: number[] } => {
  const llamadas: number[] = [];
  return {
    id, velocidad: opciones.velocidad, llamadas,
    async pedirBanda(indice) {
      llamadas.push(indice);
      if (opciones.falla) throw new Error("fuente rota");
      return opciones.miente ? new Uint8Array(datos[indice].byteLength).fill(9) : datos[indice];
    },
  };
};

const montar = async (bandas: Uint8Array[], fuentes: FuenteBanda[], paralelo?: number) => {
  const manifiesto = await manifiestoDe(bandas);
  const cache = cacheFalsa();
  const lector = crearLector({ manifiesto, cache, fuentes, verificar: verificarPorSha256, paralelo });
  return { cache, lector };
};

describe("lector-volumen", () => {
  it("concatena el rango y lo guarda en caché", async () => {
    const bandas = [bytesDe(4, 1), bytesDe(5, 2), bytesDe(6, 3)];
    const f = fuente("a", bandas);
    const { cache, lector } = await montar(bandas, [f]);
    const r = await lector.leer(0, 2);
    expect([...r.bytes]).toEqual([...bandas[0], ...bandas[1], ...bandas[2]]);
    expect(cache.mapa.size).toBe(3);
    await lector.leer(0, 2);
    expect([...f.llamadas].sort()).toEqual([0, 1, 2]);
  });
  it("pide primero a la fuente más rápida", async () => {
    const bandas = [bytesDe(8)];
    const lenta = fuente("lenta", bandas, { velocidad: 1 });
    const rapida = fuente("rapida", bandas, { velocidad: 9 });
    const { lector } = await montar(bandas, [lenta, rapida]);
    await lector.leer(0, 0);
    expect(rapida.llamadas).toEqual([0]);
    expect(lenta.llamadas).toEqual([]);
  });
  it("elige la fuente más rápida para cada banda del rango", async () => {
    const bandas = [bytesDe(7, 1), bytesDe(8, 2), bytesDe(9, 3)];
    const lenta = fuente("lenta", bandas, { velocidad: 1 });
    const rapida = fuente("rapida", bandas, { velocidad: 99 });
    const { lector } = await montar(bandas, [lenta, rapida]);
    const r = await lector.leer(0, 2);
    expect([...r.bytes]).toEqual([...bandas[0], ...bandas[1], ...bandas[2]]);
    expect([...lenta.llamadas].sort()).toEqual([]);
    expect([...rapida.llamadas].sort()).toEqual([0, 1, 2]);
  });
  it("reintenta si una fuente falla y la anota", async () => {
    const bandas = [bytesDe(7, 4)];
    const rota = fuente("rota", bandas, { velocidad: 9, falla: true });
    const { lector } = await montar(bandas, [rota, fuente("buena", bandas, { velocidad: 1 })]);
    const r = await lector.leer(0, 0);
    expect([...r.bytes]).toEqual([...bandas[0]]);
    expect(r.malas).toEqual([{ fuente: "rota", banda: 0, motivo: "fallo" }]);
    expect(lector.fuentesMalas()).toEqual(r.malas);
  });
  it("descarta una fuente mentirosa cuyo SHA no cuadra", async () => {
    const bandas = [bytesDe(9, 5)];
    const mala = fuente("mentirosa", bandas, { velocidad: 9, miente: true });
    const { lector } = await montar(bandas, [mala, fuente("buena", bandas)]);
    const r = await lector.leer(0, 0);
    expect([...r.bytes]).toEqual([...bandas[0]]);
    expect(r.malas).toEqual([{ fuente: "mentirosa", banda: 0, motivo: "sha" }]);
  });
  it("falla con motivo legible si ninguna fuente sirve", async () => {
    const bandas = [bytesDe(6, 6)];
    const { lector } = await montar(bandas, [fuente("rota", bandas, { falla: true })]);
    await expect(lector.leer(0, 0)).rejects.toThrow("banda 0 sin fuente verificable");
  });
  it("respeta el límite de bandas en paralelo", async () => {
    const bandas = Array.from({ length: 6 }, (_, i) => bytesDe(3, i + 1));
    let activas = 0;
    let pico = 0;
    const f: FuenteBanda = {
      id: "red",
      async pedirBanda(i) {
        activas += 1; pico = Math.max(pico, activas);
        await new Promise((r) => setTimeout(r, 5));
        activas -= 1; return bandas[i];
      },
    };
    const { lector } = await montar(bandas, [f], 2);
    await lector.leer(0, 5);
    expect(pico).toBe(2);
  });
  it("prebuscar deja las bandas en caché y evita pedirlas después", async () => {
    const bandas = [bytesDe(4, 1), bytesDe(5, 2), bytesDe(6, 3)];
    const f = fuente("a", bandas);
    const { lector } = await montar(bandas, [f]);
    expect(await lector.prebuscar({ desde: 1, hasta: 2 })).toBe(2);
    await lector.leer(1, 2);
    expect([...f.llamadas].sort()).toEqual([1, 2]);
  });
  it("prebuscar no lanza si la fuente falla y deja la banda fuera de la caché", async () => {
    const bandas = [bytesDe(4)];
    const rota = fuente("rota", bandas, { falla: true });
    const { cache, lector } = await montar(bandas, [rota]);
    await expect(lector.prebuscar({ desde: 0, hasta: 0 })).resolves.toBe(0);
    expect(cache.mapa.size).toBe(0);
    expect(lector.fuentesMalas()).toEqual([{ fuente: "rota", banda: 0, motivo: "fallo" }]);
  });
  it("devuelve un rango vacío sin tocar las fuentes", async () => {
    const bandas = [bytesDe(4)];
    const f = fuente("a", bandas);
    const { lector } = await montar(bandas, [f]);
    expect((await lector.leer(2, 1)).bytes.byteLength).toBe(0);
    expect(f.llamadas).toEqual([]);
  });
});
