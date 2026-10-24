import { describe, it, expect } from "vitest";
import { almacenamientoEnMemoria } from "@/lib/astraura/capas/almacen";
import { crearCacheBandas } from "../cache-bandas";
import { crearLector, type FuenteVolumen } from "../lector-volumen";
import type { Manifiesto } from "../volumen";

const BANDA = 4;
const pieza = (n: number): Uint8Array => Uint8Array.from({ length: BANDA }, (_, i) => (n * 10 + i) % 256);
const sha = async (d: Uint8Array): Promise<string> => {
  const exacto = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer;
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", exacto);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const manifiestoCon = async (datos: Uint8Array[]): Promise<Manifiesto> => ({
  id: "vol", version: "1", tamano: datos.length * BANDA, banda: BANDA,
  bandas: await Promise.all(datos.map(async (d, indice) => ({ indice, sha256: await sha(d), bytes: d.byteLength }))),
  privado: false, importancia: 1,
});
const cache = () => crearCacheBandas({ almacen: almacenamientoEnMemoria(), presupuestoBytes: 1_000_000 });
const fuente = (id: string, datos: Uint8Array[], velocidad = 10): FuenteVolumen => ({
  id, velocidad, pedirBanda: async (i) => datos[i],
});

describe("lector-volumen", () => {
  it("lee un rango que cruza bandas y lo deja verificado en la caché", async () => {
    const datos = [pieza(1), pieza(2), pieza(3)];
    const m = await manifiestoCon(datos);
    const c = cache();
    const lector = crearLector({ manifiesto: m, cache: c, fuentes: [fuente("a", datos)] });
    const salida = await lector.leer(2, 8);
    expect([...salida]).toEqual([...datos[0].slice(2, 4), ...datos[1]]);
    expect(await c.tener(m.bandas[0].sha256)).toBe(true);
    expect(await c.tener(m.bandas[1].sha256)).toBe(true);
  });

  it("primero mira la caché y no vuelve a pedir a la fuente", async () => {
    const datos = [pieza(4)];
    const m = await manifiestoCon(datos);
    let llamadas = 0;
    const f: FuenteVolumen = { id: "a", pedirBanda: async (i) => { llamadas++; return datos[i]; } };
    const lector = crearLector({ manifiesto: m, cache: cache(), fuentes: [f] });
    await lector.leer(0, 4);
    await lector.leer(0, 4);
    expect(llamadas).toBe(1);
  });

  it("reintenta con la siguiente fuente si una falla y anota la mala", async () => {
    const datos = [pieza(5)];
    const m = await manifiestoCon(datos);
    const rota: FuenteVolumen = { id: "rota", velocidad: 30, pedirBanda: async () => { throw new Error("sin red"); } };
    const lector = crearLector({ manifiesto: m, cache: cache(), fuentes: [rota, fuente("buena", datos)] });
    expect([...(await lector.leer(0, 4))]).toEqual([...datos[0]]);
    expect(lector.fuentesMalas()).toEqual([{ fuente: "rota", banda: 0, motivo: "fallo" }]);
  });

  it("rechaza una fuente mentirosa cuyo SHA no cuadra y usa la buena", async () => {
    const datos = [pieza(6)];
    const m = await manifiestoCon(datos);
    const mentirosa: FuenteVolumen = {
      id: "mentirosa", velocidad: 30,
      pedirBanda: async (i) => Uint8Array.from(datos[i], (b) => b ^ 0xff),
    };
    const lector = crearLector({ manifiesto: m, cache: cache(), fuentes: [mentirosa, fuente("buena", datos)] });
    expect([...(await lector.leer(0, 4))]).toEqual([...datos[0]]);
    expect(lector.fuentesMalas()[0]).toMatchObject({ fuente: "mentirosa", banda: 0, motivo: "sha" });
  });

  it("elige la fuente declarada más rápida para cada banda", async () => {
    const datos = [pieza(7), pieza(8), pieza(9)];
    const m = await manifiestoCon(datos);
    const usos: Record<string, number> = { lenta: 0, rapida: 0 };
    const lenta: FuenteVolumen = { id: "lenta", velocidad: 1, pedirBanda: async (i) => { usos.lenta++; return datos[i]; } };
    const rapida: FuenteVolumen = { id: "rapida", velocidad: 99, pedirBanda: async (i) => { usos.rapida++; return datos[i]; } };
    await crearLector({ manifiesto: m, cache: cache(), fuentes: [lenta, rapida] }).leer(0, BANDA * 3);
    expect(usos).toEqual({ lenta: 0, rapida: 3 });
  });

  it("pide varias bandas a la vez hasta el límite de paralelo", async () => {
    const datos = [pieza(10), pieza(11), pieza(12)];
    const m = await manifiestoCon(datos);
    let enCurso = 0, maximo = 0;
    const f: FuenteVolumen = {
      id: "lenta",
      pedirBanda: async (i) => {
        enCurso++; maximo = Math.max(maximo, enCurso);
        await new Promise((r) => setTimeout(r, 1));
        enCurso--; return datos[i];
      },
    };
    await crearLector({ manifiesto: m, cache: cache(), fuentes: [f], paralelo: 3 }).leer(0, BANDA * 3);
    expect(maximo).toBeGreaterThanOrEqual(2);
  });

  it("prebuscar deja la caché lista para lo que viene después", async () => {
    const datos = [pieza(13), pieza(14)];
    const m = await manifiestoCon(datos);
    const c = cache();
    let llamadas = 0;
    const f: FuenteVolumen = { id: "a", pedirBanda: async (i) => { llamadas++; return datos[i]; } };
    const lector = crearLector({ manifiesto: m, cache: c, fuentes: [f] });
    await lector.prebuscar([0, BANDA * 2]);
    expect(await c.tener(m.bandas[1].sha256)).toBe(true);
    await lector.leer(0, BANDA * 2);
    expect(llamadas).toBe(2);
  });

  it("prebuscar no lanza si la fuente falla y el rango vacío no pide nada", async () => {
    const datos = [pieza(15)];
    const m = await manifiestoCon(datos);
    const rota: FuenteVolumen = { id: "rota", pedirBanda: async () => { throw new Error("sin red"); } };
    const lector = crearLector({ manifiesto: m, cache: cache(), fuentes: [rota] });
    await expect(lector.prebuscar({ desde: 0, hasta: BANDA })).resolves.toBeUndefined();
    expect((await lector.leer(8, 8)).length).toBe(0);
    await expect(lector.leer(0, 4)).rejects.toThrow("Ninguna fuente");
  });
});
