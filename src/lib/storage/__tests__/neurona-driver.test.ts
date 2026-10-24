// Pruebas del driver «neurona» (tarea K): puro, transporte falso en memoria, sin red/disco/procesos.
import { describe, it, expect } from "vitest";
import { TAMANO_BANDA, type Manifiesto } from "@/lib/recursos/volumen";
import { trocear, manifiestoDe, sha256Hex, crearDriverNeurona, type TransporteNeurona } from "../neurona-driver";
/** Digesto determinista de pruebas: marca-tamaño-suma (nada de webcrypto). */
const digerirPrueba = (datos: Uint8Array): Promise<string> =>
  Promise.resolve(`sha${datos.byteLength}-${[...datos].reduce((s, b) => (s + b) % 65536, 0)}`);
const verificarPrueba = async (datos: Uint8Array, banda: { sha256: string }): Promise<boolean> => (await digerirPrueba(datos)) === banda.sha256;
/** Anfitrión en memoria: guarda manifiestos, bandas y el orden de las órdenes. */
function anfitrionFalso() {
  const manifiestos = new Map<string, Manifiesto>();
  const bandas = new Map<string, Uint8Array>();
  const orden: string[] = [];
  const t: TransporteNeurona & { manifiestos: typeof manifiestos; bandas: typeof bandas; orden: string[] } = {
    manifiestos,
    bandas,
    orden,
    vivo: () => { orden.push("vivo"); return Promise.resolve(true); },
    guardarBanda: (ruta, indice, banda) => {
      orden.push(`banda ${indice} de ${ruta}`);
      bandas.set(`${ruta}#${indice}`, new Uint8Array(banda));
      return Promise.resolve(true);
    },
    guardarManifiesto: (ruta, m) => {
      orden.push(`manifiesto ${ruta}`);
      manifiestos.set(ruta, m);
      return Promise.resolve(true);
    },
    leerManifiesto: (ruta) => Promise.resolve(manifiestos.get(ruta) ?? null),
    leerBanda: (ruta, indice) => Promise.resolve(bandas.get(`${ruta}#${indice}`) ?? null),
    borrar: (ruta) => {
      orden.push(`borrar ${ruta}`);
      manifiestos.delete(ruta);
      for (const k of [...bandas.keys()]) if (k.startsWith(`${ruta}#`)) bandas.delete(k);
      return Promise.resolve(true);
    },
  };
  return t;
}
const declarar = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, k) => (k * 7 + 3) % 251);
describe("trocear y manifiestoDe (puros)", () => {
  it("parte en bandas exactas y deja la última con lo que sobre", () => {
    expect(trocear(declarar(10), 4).map((t) => t.byteLength)).toEqual([4, 4, 2]);
  });
  it("bytes vacíos ⇒ ninguna banda; por defecto banda de 4 MiB", () => {
    expect(trocear(new Uint8Array(0), 4)).toEqual([]);
    expect(trocear(declarar(TAMANO_BANDA + 1))).toHaveLength(2);
  });
  it("manifiestoDe lleva índices, SHAs, tamaño total y privacidad", () => {
    const m = manifiestoDe("cerebro/app.img", trocear(declarar(6), 4), ["a1", "a2"], { tamanoBanda: 4, importancia: 2 });
    expect(m.id).toBe("volumen/cerebro/app.img");
    expect(m.tamano).toBe(6);
    expect(m.banda).toBe(4);
    expect(m.bandas.map((b) => b.indice)).toEqual([0, 1]);
    expect(m.bandas.map((b) => b.sha256)).toEqual(["a1", "a2"]);
    expect(m.bandas[1].bytes).toBe(2);
    expect(m.privado).toBe(true);
    expect(m.importancia).toBe(2);
  });
});
describe("sha256Hex", () => {
  it("aplica SHA-256 real con webcrypto del medio", async () => {
    const vacio = await sha256Hex(new Uint8Array(0));
    expect(vacio).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
describe("crearDriverNeurona (transporte falso)", () => {
  it("probar consulta al anfitrión; false si no responde", async () => {
    const t = anfitrionFalso();
    expect(await crearDriverNeurona(t).probar()).toBe(true);
    expect(t.orden).toEqual(["vivo"]);
    const moldes: TransporteNeurona = { ...t, vivo: () => Promise.reject(new Error("caído")) };
    expect(await crearDriverNeurona(moldes).probar()).toBe(false);
  });
  it("poner trocea, guarda bandas ANTES del manifiesto y devuelve el resumen", async () => {
    const t = anfitrionFalso();
    const r = await crearDriverNeurona(t, { digerir: digerirPrueba, tamanoBanda: 4 }).poner("cerebro/datos.bin", declarar(10));
    expect(r.ok).toBe(true);
    expect(r.bandas).toBe(3);
    expect(r.bytes).toBe(10);
    expect(t.bandas.size).toBe(3);
    expect(t.orden[t.orden.length - 1]).toBe("manifiesto cerebro/datos.bin");
  });
  it("poner sin ruta falla y no escribe nada", async () => {
    const t = anfitrionFalso();
    expect((await crearDriverNeurona(t, { digerir: digerirPrueba }).poner("", declarar(5))).ok).toBe(false);
    expect(t.orden).toEqual([]);
  });
  it("obtener reconstruye el objeto completo y verificado", async () => {
    const t = anfitrionFalso();
    const d = crearDriverNeurona(t, { digerir: digerirPrueba, verificar: verificarPrueba, tamanoBanda: 4 });
    const original = declarar(10);
    expect((await d.poner("cerebro/datos.bin", original)).ok).toBe(true);
    const r = await d.obtener("cerebro/datos.bin");
    expect(r.ok).toBe(true);
    expect([...(r.bytes ?? [])]).toEqual([...original]);
  });
  it("obtener sin manifiesto dice que no hay volumen", async () => {
    const r = await crearDriverNeurona(anfitrionFalso()).obtener("cerebro/ausente.bin");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No hay volumen");
  });
  it("obtener con una banda corrompida falla honestamente", async () => {
    const t = anfitrionFalso();
    const d = crearDriverNeurona(t, { digerir: digerirPrueba, verificar: verificarPrueba, tamanoBanda: 4 });
    expect((await d.poner("cerebro/datos.bin", declarar(10))).ok).toBe(true);
    t.bandas.set("cerebro/datos.bin#1", new Uint8Array([1, 2, 3, 4]));
    const r = await d.obtener("cerebro/datos.bin");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("sin fuente verificable");
  });
  it("borrar quita manifiesto y bandas; luego obtener ya no da nada", async () => {
    const t = anfitrionFalso();
    const d = crearDriverNeurona(t, { digerir: digerirPrueba, verificar: verificarPrueba });
    expect((await d.poner("cerebro/datos.bin", declarar(10))).ok).toBe(true);
    expect(await d.borrar("cerebro/datos.bin")).toBe(true);
    expect(t.bandas.size).toBe(0);
    expect((await d.obtener("cerebro/datos.bin")).ok).toBe(false);
  });
});
