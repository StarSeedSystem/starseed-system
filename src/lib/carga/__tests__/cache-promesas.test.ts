import { describe, expect, it } from "vitest";
import { crearCachePromesas } from "../cache-promesas";

function diferido<T>(): { promesa: Promise<T>; resolver: (valor: T) => void } {
  let resolver: (valor: T) => void = () => {};
  const promesa = new Promise<T>((fijar) => { resolver = fijar; });
  return { promesa, resolver };
}

describe("caché de promesas de carga", () => {
  it("una promesa rechazada sale de la caché: el siguiente intento vuelve a cargar y puede resolverse", async () => {
    const cache = crearCachePromesas<string>();
    let intentos = 0;
    const cargar = () => {
      intentos++;
      return intentos === 1 ? Promise.reject(new Error("timeout")) : Promise.resolve("ok");
    };

    await expect(cache.obtener("modelo", cargar)).rejects.toThrow("timeout");
    expect(cache.tiene("modelo")).toBe(false);

    await expect(cache.obtener("modelo", cargar)).resolves.toBe("ok");
    expect(intentos).toBe(2);
    expect(cache.tiene("modelo")).toBe(true);
  });

  it("las cargas simultáneas comparten la misma promesa: no se duplica la descarga", async () => {
    const cache = crearCachePromesas<number>();
    const d = diferido<number>();
    let intentos = 0;
    const cargar = () => { intentos++; return d.promesa; };

    const a = cache.obtener("modelo", cargar);
    const b = cache.obtener("modelo", cargar);
    expect(intentos).toBe(1);

    d.resolver(7);
    await expect(Promise.all([a, b])).resolves.toEqual([7, 7]);
  });

  it("una carga resuelta se reutiliza sin volver a pedirla", async () => {
    const cache = crearCachePromesas<string>();
    let intentos = 0;
    const cargar = () => { intentos++; return Promise.resolve("listo"); };

    await expect(cache.obtener("modelo", cargar)).resolves.toBe("listo");
    await expect(cache.obtener("modelo", cargar)).resolves.toBe("listo");
    expect(intentos).toBe(1);
  });

  it("tras N fallos consecutivos deja de reintentar para no agotar créditos; olvidar lo reabre", async () => {
    const cache = crearCachePromesas<string>({ maxFallos: 2 });
    let intentos = 0;
    const cargar = () => { intentos++; return Promise.reject(new Error(`fallo ${intentos}`)); };

    await expect(cache.obtener("modelo", cargar)).rejects.toThrow("fallo 1");
    await expect(cache.obtener("modelo", cargar)).rejects.toThrow("fallo 2");
    await expect(cache.obtener("modelo", cargar)).rejects.toThrow(/Demasiados fallos/);
    expect(intentos).toBe(2);
    expect(cache.fallosDe("modelo")).toBe(2);

    cache.olvidar("modelo");
    expect(cache.fallosDe("modelo")).toBe(0);
    await expect(cache.obtener("modelo", cargar)).rejects.toThrow("fallo 3");
    expect(intentos).toBe(3);
  });

  it("un éxito reinicia el contador de fallos", async () => {
    const cache = crearCachePromesas<string>({ maxFallos: 2 });
    const guion: Array<() => Promise<string>> = [
      () => Promise.reject(new Error("x")),
      () => Promise.resolve("ok"),
    ];
    let i = 0;
    const cargar = () => guion[i++]!();

    await expect(cache.obtener("modelo", cargar)).rejects.toThrow("x");
    expect(cache.fallosDe("modelo")).toBe(1);
    await expect(cache.obtener("modelo", cargar)).resolves.toBe("ok");
    expect(cache.fallosDe("modelo")).toBe(0);
    expect(i).toBe(2);
  });

  it("limpiar vacía la caché y los contadores de fallos", async () => {
    const cache = crearCachePromesas<string>({ maxFallos: 1 });
    await expect(cache.obtener("a", () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    expect(cache.fallosDe("a")).toBe(1);

    cache.limpiar();
    expect(cache.tiene("a")).toBe(false);
    expect(cache.fallosDe("a")).toBe(0);
    await expect(cache.obtener("a", () => Promise.resolve("sí"))).resolves.toBe("sí");
  });
});
