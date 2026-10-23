import { describe, it, expect } from "vitest";
import { crearCacheBandas, type Resumidor } from "../cache-bandas";
import { almacenamientoEnMemoria } from "@/lib/astraura/capas/almacen";

const shaHex = async (datos: ArrayBuffer): Promise<string> => {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const bytes = (texto: string): ArrayBuffer => new TextEncoder().encode(texto).buffer;

/** Resumidor real que cuenta cuántas veces se le llama (prueba de inyección). */
const observarResumidor = (llamadas: string[]): Resumidor => ({
  digest: async (algoritmo, datos) => {
    llamadas.push(algoritmo);
    return globalThis.crypto.subtle.digest(algoritmo, datos);
  },
});

const reloj = (): { ahora: () => number; minutos: () => void } => {
  let t = 0;
  return {
    ahora: () => t,
    minutos: () => {
      t += 1;
    },
  };
};

describe("crearCacheBandas", () => {
  it("guarda una banda verificando su SHA y la lee con su marca de uso", async () => {
    const llamado: string[] = [];
    const cache = crearCacheBandas({
      almacen: almacenamientoEnMemoria(),
      presupuestoBytes: 4096,
      resumidor: observarResumidor(llamado),
    });
    const datos = bytes("banda-prueba");
    const sha = await shaHex(datos);
    expect(await cache.guardar(sha, datos)).toBe(true);
    expect(llamado).toEqual(["SHA-256"]);
    expect(await cache.tener(sha)).toBe(true);
    const leida = await cache.leer(sha);
    expect(new TextDecoder().decode(leida!)).toBe("banda-prueba");
    expect((await cache.estado()).bandas[0]?.enUso).toBe(true);
    cache.soltar(sha);
    expect((await cache.estado()).bandas[0]?.enUso).toBe(false);
  });

  it("rechaza guardar si el SHA no cuadra o es inválido", async () => {
    const cache = crearCacheBandas({
      almacen: almacenamientoEnMemoria(),
      presupuestoBytes: 4096,
    });
    const datos = bytes("banda");
    expect(await cache.guardar("f".repeat(64), datos)).toBe(false);
    expect(await cache.guardar("no-es-sha", datos)).toBe(false);
    const estado = await cache.estado();
    expect(estado.bandas).toHaveLength(0);
    expect(estado.usadosBytes).toBe(0);
    expect(await cache.tener(await shaHex(datos))).toBe(false);
    expect(await cache.leer("a".repeat(64))).toBeNull();
  });

  it("expulsa lo menos usado al pasarse del presupuesto", async () => {
    const { ahora, minutos } = reloj();
    const cache = crearCacheBandas({
      almacen: almacenamientoEnMemoria(),
      presupuestoBytes: 10,
      ahora,
    });
    const vieja = bytes("aaaaaa"); // 6 bytes
    const nueva = bytes("bbbbbb"); // 6 bytes
    const shaVieja = await shaHex(vieja);
    const shaNueva = await shaHex(nueva);
    expect(await cache.guardar(shaVieja, vieja)).toBe(true);
    minutos();
    expect(await cache.guardar(shaNueva, nueva)).toBe(true);
    // La recién guardada no se expulsa por su propio guardado: cayó la vieja.
    expect(await cache.tener(shaVieja)).toBe(false);
    expect(await cache.tener(shaNueva)).toBe(true);
    expect((await cache.estado()).usadosBytes).toBe(6);
  });

  it("nunca expulsa una banda en uso", async () => {
    const { ahora, minutos } = reloj();
    const cache = crearCacheBandas({
      almacen: almacenamientoEnMemoria(),
      presupuestoBytes: 10,
      ahora,
    });
    const primera = bytes("cccccc");
    const segunda = bytes("dddddd");
    const tercera = bytes("eeeeee");
    const cuarta = bytes("ffffff");
    const shaPrimera = await shaHex(primera);
    const shaSegunda = await shaHex(segunda);
    const shaTercera = await shaHex(tercera);
    expect(await cache.guardar(shaPrimera, primera)).toBe(true);
    minutos(); // t = 1
    expect(await cache.guardar(shaSegunda, segunda)).toBe(true);
    minutos(); // t = 2
    // La segunda (viejísima entre las no protegidas) queda en uso: al guardar
    // la tercera cae la primera y, aunque hace falta más sitio, no la segunda.
    expect(await cache.leer(shaSegunda)).not.toBeNull();
    expect(await cache.guardar(shaTercera, tercera)).toBe(true);
    expect(await cache.tener(shaPrimera)).toBe(false);
    expect(await cache.tener(shaSegunda)).toBe(true);
    expect((await cache.estado()).usadosBytes).toBe(12);
    // Al soltarla, el guardado siguiente ya la puede expulsar.
    cache.soltar(shaSegunda);
    minutos(); // t = 3
    expect(await cache.guardar(await shaHex(cuarta), cuarta)).toBe(true);
    expect(await cache.tener(shaSegunda)).toBe(false);
  });

  it("reconcilia bandas guardadas por una sesión anterior del mismo almacén", async () => {
    const almacen = almacenamientoEnMemoria();
    const datos = bytes("persistida");
    const sha = await shaHex(datos);
    await almacen.escribir(`banda/${sha}`, datos);
    const nueva = crearCacheBandas({ almacen, presupuestoBytes: 1024 });
    expect(await nueva.tener(sha)).toBe(true);
    const estado = await nueva.estado();
    expect(estado.bandas[0]?.bytes).toBe(datos.byteLength);
    expect((await nueva.leer(sha)) !== null).toBe(true);
  });
});
