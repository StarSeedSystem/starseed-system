import { describe, it, expect } from "vitest";
import { almacenamientoEnMemoria } from "@/lib/astraura/capas/almacen";
import { crearCacheBandas, esShaValido } from "../cache-bandas";

/** Digesto real de prueba (puro: `crypto.subtle`, sin red ni disco). */
const shaDe = async (datos: ArrayBuffer): Promise<string> => {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const datosDe = (semilla: number, bytes: number): ArrayBuffer =>
  new Uint8Array(bytes).map((_, i) => (i * semilla + 1) % 256).buffer;

describe("cache-bandas", () => {
  describe("esShaValido", () => {
    it("acepta solo hex minúsculas de 64", () => {
      const sha = "a".repeat(64);
      expect(esShaValido(sha)).toBe(true);
      expect(esShaValido("b".repeat(63))).toBe(false);
      expect(esShaValido("c".repeat(65))).toBe(false);
      expect(esShaValido("A".repeat(64))).toBe(false);
    });
  });

  describe("guardar", () => {
    it("guarda una banda cuyo SHA coincide y la lee de vuelta", async () => {
      const datos = datosDe(7, 100);
      const sha = await shaDe(datos);
      const cache = crearCacheBandas({
        almacen: almacenamientoEnMemoria(),
        presupuestoBytes: 1_000,
      });
      expect(await cache.guardar(sha, datos)).toBe(true);
      expect(await cache.tener(sha)).toBe(true);
      expect(await cache.leer(sha)).toEqual(datos);
      expect(cache.bytesUsados()).toBe(100);
    });

    it("rechaza un SHA con formato inválido sin escribir nada", async () => {
      const datos = datosDe(1, 8);
      const cache = crearCacheBandas({
        almacen: almacenamientoEnMemoria(),
        presupuestoBytes: 1_000,
      });
      expect(await cache.guardar("no-es-hex", datos)).toBe(false);
      expect(cache.bytesUsados()).toBe(0);
    });

    it("rechaza un SHA que no coincide con el digesto de los datos", async () => {
      const datos = datosDe(2, 64);
      const otros = await shaDe(datosDe(3, 64));
      const cache = crearCacheBandas({
        almacen: almacenamientoEnMemoria(),
        presupuestoBytes: 1_000,
      });
      expect(await cache.guardar(otros, datos)).toBe(false);
      expect(await cache.tener(otros)).toBe(false);
      expect(cache.bytesUsados()).toBe(0);
    });
  });

  describe("leer", () => {
    it("devuelve null para una banda desconocida", async () => {
      const cache = crearCacheBandas({
        almacen: almacenamientoEnMemoria(),
        presupuestoBytes: 1_000,
      });
      expect(await cache.leer("f".repeat(64))).toBeNull();
    });
  });

  describe("expulsión al pasarse del presupuesto", () => {
    it("expulsa lo menos usado (LRU) hasta caber", async () => {
      let tic = 0;
      const cache = crearCacheBandas({
        almacen: almacenamientoEnMemoria(),
        presupuestoBytes: 100,
        ahora: () => ++tic,
      });
      const guardados = await Promise.all(
        [30, 40, 45].map(async (n) => {
          const d = datosDe(n, 40);
          return { sha: await shaDe(d), datos: d };
        }),
      );
      for (const g of guardados) {
        await cache.guardar(g.sha, g.datos);
      }
      // 40 + 40 + 40 = 120 > 100: expulsa la primera (la menos usada).
      expect(await cache.tener(guardados[0].sha)).toBe(false);
      expect(await cache.tener(guardados[1].sha)).toBe(true);
      expect(await cache.tener(guardados[2].sha)).toBe(true);
    });

    it("nunca expulsa una banda fijada como en uso", async () => {
      let tic = 0;
      const cache = crearCacheBandas({
        almacen: almacenamientoEnMemoria(),
        presupuestoBytes: 50,
        ahora: () => ++tic,
      });
      const vieja = datosDe(5, 40);
      const nueva = datosDe(6, 40);
      const shaVieja = await shaDe(vieja);
      const shaNueva = await shaDe(nueva);
      await cache.guardar(shaVieja, vieja);
      expect(await cache.fijar(shaVieja, true)).toBe(true);
      await cache.guardar(shaNueva, nueva);
      // La vieja (menos usada) está en uso: se expulsa la nueva.
      expect(await cache.tener(shaVieja)).toBe(true);
      expect(await cache.tener(shaNueva)).toBe(false);
      // Al soltarla, la expulsión vuelve a tocarla.
      expect(await cache.fijar(shaVieja, false)).toBe(true);
      const tercia = datosDe(8, 40);
      await cache.guardar(await shaDe(tercia), tercia);
      expect(await cache.tener(shaVieja)).toBe(false);
    });

    it("fijar devuelve false para un SHA desconocido", async () => {
      const cache = crearCacheBandas({
        almacen: almacenamientoEnMemoria(),
        presupuestoBytes: 50,
      });
      expect(await cache.fijar("e".repeat(64), true)).toBe(false);
    });
  });

  describe("resumen inyectable", () => {
    it("usa el digesto inyectado en lugar de crypto.subtle", async () => {
      const datos = datosDe(9, 12);
      const cache = crearCacheBandas({
        almacen: almacenamientoEnMemoria(),
        presupuestoBytes: 100,
        resumen: async (d) => (d.byteLength === 12 ? "1".repeat(64) : "2".repeat(64)),
      });
      expect(await cache.guardar("1".repeat(64), datos)).toBe(true);
      // El digesto inyectado no cuadra con el SHA pedido: se rechaza.
      expect(await cache.guardar("2".repeat(64), datos)).toBe(false);
      expect(await cache.tener("1".repeat(64))).toBe(true);
      expect(await cache.tener("2".repeat(64))).toBe(false);
    });
  });

  describe("uso acumulado", () => {
    it("bytesUsados cuenta solo lo presente tras la expulsión", async () => {
      let tic = 0;
      const cache = crearCacheBandas({
        almacen: almacenamientoEnMemoria(),
        presupuestoBytes: 60,
        ahora: () => ++tic,
      });
      const a = datosDe(11, 40);
      const b = datosDe(12, 40);
      await cache.guardar(await shaDe(a), a);
      await cache.guardar(await shaDe(b), b);
      expect(cache.bytesUsados()).toBe(40);
    });
  });
});
