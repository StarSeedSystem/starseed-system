/**
 * Caché de promesas de carga (IMG-agentes-reimaginada): una promesa rechazada NUNCA se queda
 * en caché, los intentos están limitados y, agotados, se corta en seco para no gastar créditos.
 */
import { describe, it, expect } from "vitest";
import { crearCachePromesas, LimiteIntentosError } from "../cache-promesas";

function diferido<T>(): { promesa: Promise<T>; resolver: (v: T) => void } {
  let resolver: (v: T) => void = () => {};
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

describe("crearCachePromesas · carga de modelos", () => {
  it("comparte la misma carga en vuelo: dos llamadas, un solo trabajo", async () => {
    const cache = crearCachePromesas<number>();
    let llamadas = 0;
    const d = diferido<number>();
    const cargar = () => {
      llamadas += 1;
      return d.promesa;
    };
    const a = cache.obtener("glb:a", cargar);
    const b = cache.obtener("glb:a", cargar);
    expect(llamadas).toBe(1);
    expect(a).toBe(b);
    d.resolver(7);
    await expect(a).resolves.toBe(7);
  });

  it("un fallo no se queda en caché: el siguiente intento vuelve a cargar", async () => {
    const cache = crearCachePromesas<number>({ maxIntentos: 3, enfriamientoMs: 1000, ahora: () => 0 });
    let llamadas = 0;
    const cargar = async () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error("timeout");
      return 42;
    };
    await expect(cache.obtener("glb:a", cargar)).rejects.toThrow("timeout");
    await expect(cache.obtener("glb:a", cargar)).resolves.toBe(42);
    expect(llamadas).toBe(2);
  });

  it("reintentos limitados: agotados, no se llama más al cargador (sin agotar créditos)", async () => {
    const cache = crearCachePromesas<number>({ maxIntentos: 2, enfriamientoMs: 1000, ahora: () => 0 });
    let llamadas = 0;
    const cargar = async () => {
      llamadas += 1;
      throw new Error("429");
    };
    await expect(cache.obtener("glb:a", cargar)).rejects.toThrow("429");
    await expect(cache.obtener("glb:a", cargar)).rejects.toThrow("429");
    expect(llamadas).toBe(2);
    const error = await cache.obtener("glb:a", cargar).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LimiteIntentosError);
    expect(llamadas).toBe(2);
  });

  it("tras el enfriamiento vuelve a intentar y el éxito limpia los fallos", async () => {
    let t = 0;
    const cache = crearCachePromesas<number>({ maxIntentos: 1, enfriamientoMs: 500, ahora: () => t });
    let llamadas = 0;
    const cargar = async () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error("red");
      return 9;
    };
    await expect(cache.obtener("glb:a", cargar)).rejects.toThrow("red");
    await expect(cache.obtener("glb:a", cargar)).rejects.toBeInstanceOf(LimiteIntentosError);
    t = 500;
    await expect(cache.obtener("glb:a", cargar)).resolves.toBe(9);
    expect(llamadas).toBe(2);
    expect(cache.estado("glb:a")).toBeNull();
  });

  it("el éxito se reutiliza: una sola carga para muchas llamadas", async () => {
    const cache = crearCachePromesas<number>();
    let llamadas = 0;
    const cargar = async () => {
      llamadas += 1;
      return 5;
    };
    await cache.obtener("glb:a", cargar);
    await cache.obtener("glb:a", cargar);
    expect(llamadas).toBe(1);
    expect(cache.tamano()).toBe(1);
  });

  it("un fallo de una clave no contamina otra", async () => {
    const cache = crearCachePromesas<number>({ ahora: () => 0 });
    await expect(
      cache.obtener("a", async () => {
        throw new Error("a falla");
      }),
    ).rejects.toThrow("a falla");
    await expect(cache.obtener("b", async () => 2)).resolves.toBe(2);
  });

  it("una excepción síncrona del cargador también se limpia y reintenta", async () => {
    const cache = crearCachePromesas<number>({ ahora: () => 0 });
    let llamadas = 0;
    const cargar = () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error("boom");
      return Promise.resolve(3);
    };
    await expect(cache.obtener("a", cargar)).rejects.toThrow("boom");
    await expect(cache.obtener("a", cargar)).resolves.toBe(3);
  });

  it("olvidar una clave permite reintentar de inmediato", async () => {
    const cache = crearCachePromesas<number>({ maxIntentos: 1, enfriamientoMs: 10_000, ahora: () => 0 });
    let llamadas = 0;
    const cargar = async () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error("x");
      return 1;
    };
    await expect(cache.obtener("a", cargar)).rejects.toThrow("x");
    await expect(cache.obtener("a", cargar)).rejects.toBeInstanceOf(LimiteIntentosError);
    cache.olvidar("a");
    await expect(cache.obtener("a", cargar)).resolves.toBe(1);
    expect(llamadas).toBe(2);
  });
});
