import { describe, it, expect } from "vitest";
import { almacenamientoEnMemoria } from "@/lib/astraura/capas/almacen";
import {
  crearCacheBandas,
  type CryptoBandas,
  type OpcionesCacheBandas,
} from "../cache-bandas";
const bytes = (texto: string): ArrayBuffer => new TextEncoder().encode(texto).buffer;
const shaHex = async (datos: ArrayBuffer): Promise<string> => {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
async function banda(texto: string): Promise<{ sha: string; datos: ArrayBuffer }> {
  const datos = bytes(texto);
  return { sha: await shaHex(datos), datos };
}
const texto = (datos: ArrayBuffer | null): string | null =>
  datos === null ? null : new TextDecoder().decode(datos);
const nueva = (opciones: Partial<OpcionesCacheBandas> = {}) =>
  crearCacheBandas({ almacen: almacenamientoEnMemoria(), presupuestoBytes: 1024, ...opciones });
describe("caché de bandas · guardar y leer", () => {
  it("guarda una banda con su SHA y la devuelve al leerla", async () => {
    const cache = nueva();
    const { sha, datos } = await banda("banda-uno");
    expect(await cache.guardar(sha, datos)).toEqual({ ok: true, expulsadas: [] });
    expect(await cache.tener(sha)).toBe(true);
    expect(texto(await cache.leer(sha))).toBe("banda-uno");
  });
  it("rechaza una banda cuyo contenido no corresponde al SHA", async () => {
    const cache = nueva();
    const { sha } = await banda("esperada");
    expect(await cache.guardar(sha, bytes("intrusa"))).toEqual({
      ok: false,
      motivo: "sha-no-coincide",
    });
    expect(await cache.tener(sha)).toBe(false);
  });
  it("rechaza SHA inválidos sin tocar el almacén", async () => {
    const cache = nueva();
    expect(await cache.guardar("no-es-un-sha", bytes("x"))).toEqual({
      ok: false,
      motivo: "sha-invalido",
    });
    expect(await cache.tener("no-es-un-sha")).toBe(false);
    expect(await cache.leer("no-es-un-sha")).toBeNull();
  });
  it("no guarda una banda que no cabe entera en el presupuesto", async () => {
    const cache = nueva({ presupuestoBytes: 3 });
    const { sha, datos } = await banda("demasiado");
    expect(await cache.guardar(sha, datos)).toEqual({ ok: false, motivo: "no-cabe" });
    expect(await cache.tener(sha)).toBe(false);
  });
});

describe("caché de bandas · expulsión LRU", () => {
  it("expulsa la banda usada hace más tiempo al pasarse del presupuesto", async () => {
    let reloj = 0;
    const cache = nueva({ presupuestoBytes: 8, ahora: () => ++reloj });
    const a = await banda("aaaa");
    const b = await banda("bbbb");
    const c = await banda("cccc");
    await cache.guardar(a.sha, a.datos);
    await cache.guardar(b.sha, b.datos);
    await cache.leer(a.sha);
    const res = await cache.guardar(c.sha, c.datos);
    expect(res).toEqual({ ok: true, expulsadas: [b.sha] });
    expect(await cache.tener(a.sha)).toBe(true);
    expect(await cache.tener(b.sha)).toBe(false);
    expect(await cache.tener(c.sha)).toBe(true);
  });

  it("nunca expulsa una banda marcada en uso, aunque sea la más antigua", async () => {
    let reloj = 0;
    const cache = nueva({ presupuestoBytes: 8, ahora: () => ++reloj });
    const a = await banda("aaaa");
    const b = await banda("bbbb");
    const c = await banda("cccc");
    await cache.guardar(a.sha, a.datos);
    await cache.guardar(b.sha, b.datos);
    cache.marcarEnUso(b.sha);
    const res = await cache.guardar(c.sha, c.datos);
    expect(res).toEqual({ ok: true, expulsadas: [a.sha] });
    expect(await cache.tener(b.sha)).toBe(true);
    expect(await cache.tener(c.sha)).toBe(true);
    cache.liberar(b.sha);
  });

  it("respeta el presupuesto y el orden de uso tras reabrir la caché", async () => {
    let reloj = 0;
    const almacen = almacenamientoEnMemoria();
    const primera = crearCacheBandas({ almacen, presupuestoBytes: 8, ahora: () => ++reloj });
    const a = await banda("aaaa");
    const b = await banda("bbbb");
    const c = await banda("cccc");
    await primera.guardar(a.sha, a.datos);
    await primera.guardar(b.sha, b.datos);
    const segunda = crearCacheBandas({ almacen, presupuestoBytes: 8, ahora: () => ++reloj });
    expect(await segunda.tener(b.sha)).toBe(true);
    const res = await segunda.guardar(c.sha, c.datos);
    expect(res).toEqual({ ok: true, expulsadas: [a.sha] });
    expect(await segunda.tener(a.sha)).toBe(false);
    expect(await segunda.tener(b.sha)).toBe(true);
  });
});

describe("caché de bandas · crypto inyectable", () => {
  it("usa el crypto.subtle recibido en vez del global", async () => {
    const digestoFalso: CryptoBandas = {
      subtle: { digest: async () => new Uint8Array(32).buffer },
    };
    const cache = nueva({ crypto: digestoFalso });
    const shaCero = "0".repeat(64);
    expect(await cache.guardar(shaCero, bytes("x"))).toEqual({ ok: true, expulsadas: [] });
    expect(texto(await cache.leer(shaCero))).toBe("x");
  });
});
