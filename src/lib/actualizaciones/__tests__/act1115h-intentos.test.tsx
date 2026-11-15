/**
 * (ACT1115H) Tres aparatos del canal de pruebas no se actualizaron desde dentro (prueba.43/.44 → .45) y los registros no
 * decían por qué. Se fija: la comparación entre dos pruebas, el caso «los archivos de la misma prerelease se
 * reemplazan» (cada lectura trae lo vigente, sin caché), la cadencia de la búsqueda y la línea del registro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inst = vi.hoisted(() => ({ medio: "android" as string, version: "0.5.1-prueba.44" }));
vi.mock("../version-por-medio", () => ({
  leerInstalada: async () => ({ medio: inst.medio, version: inst.version, fuente: "info_neurona", info: null }),
}));
vi.mock("@/lib/nativa/info-neurona", () => ({ buscarActualizacionNativa: async () => ({ estado: "ok", busqueda: { disponible: null, notas: null, fecha: null } }) }));

import { comprobarActualizacion } from "../comprobar";
import { leerPublicadas } from "../leer-publicadas";
import { elegirPublicada, sanearApkPruebas } from "../canal-pruebas";
import { anotarIntento, fijarSumideroIntentos, lineaIntento } from "../registro-intento";
import { CADA_MS, CADA_PRUEBAS_MS, esperaHastaProxima, INICIO_AUTO_MS } from "../planificador-auto";
import { compararVersiones, esVersionMasNueva } from "@/lib/version/os-release";

const BASE = "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas";
const apk = (n: number) =>
  sanearApkPruebas({ version: `0.5.1-prueba.${n}`, versionCode: 5_000_000 + n, apk: `${BASE}/StarSeed-os-0.5.1-prueba.${n}.apk`, sha256: "ab".repeat(32), bytes: 10, notas: "n" });
const pruebas = (n: number) => ({ version: `0.5.1-prueba.${n}`, fecha: "2026-11-15", notas: "n", android: apk(n) });
const publicadas = (n: number) => async () => ({
  ok: true as const,
  datos: { versiones: [{ version: "0.5.0", fecha: "2026-11-01", notas: "", url: "u", archivos: { os: { android: [] } } }] as never, canalPruebas: pruebas(n), canalPruebasError: null, via: "servidor" as const },
});

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
  fijarSumideroIntentos(null);
});

describe("comparación entre dos pruebas", () => {
  it("prueba.44 < prueba.45 < 0.5.1; prueba.9 < prueba.45 (números como números)", () => {
    expect(esVersionMasNueva("0.5.1-prueba.45", "0.5.1-prueba.44")).toBe(true);
    expect(esVersionMasNueva("0.5.1-prueba.44", "0.5.1-prueba.45")).toBe(false);
    expect(esVersionMasNueva("0.5.1-prueba.45", "0.5.1-prueba.9")).toBe(true);
    expect(compararVersiones("0.5.1-prueba.45", "0.5.1-prueba.45")).toBe(0);
    expect(esVersionMasNueva("0.5.1", "0.5.1-prueba.45")).toBe(true);
  });
  it("una app .44 elige la .45 del canal frente a la oficial 0.5.0, en Android y escritorio", () => {
    const a = elegirPublicada({ medio: "android", instalada: "0.5.1-prueba.44", oficial: { version: "0.5.0", fecha: "", notas: "", apk: null }, pruebas: pruebas(45) });
    expect(a).toMatchObject({ version: "0.5.1-prueba.45", canal: "pruebas" });
    const e = elegirPublicada({ medio: "escritorio", instalada: "0.5.1-prueba.44", oficial: { version: "0.5.0", fecha: "", notas: "", apk: null }, pruebas: { ...pruebas(45), version: "0.5.1-prueba.45" } });
    expect(e).toMatchObject({ version: "0.5.1-prueba.45", canal: "pruebas" });
  });
});

describe("los archivos de la misma prerelease se reemplazan", () => {
  it("cada lectura pide el manifiesto sin caché y ve el vigente (prueba.44 y, al reemplazarlo, prueba.45)", async () => {
    let vigente = 44;
    const llamadas: Array<RequestInit | undefined> = [];
    const f = (async (url: string, init?: RequestInit) => {
      llamadas.push(init);
      if (String(url).endsWith("latest-prueba.json")) return { ok: true, status: 200, json: async () => ({ version: `0.5.1-prueba.${vigente}`, pub_date: "2026-11-15T08:35:00Z", notes: "n" }) };
      if (String(url).endsWith("latest-prueba-android.json")) return { ok: true, status: 200, json: async () => ({ version: `0.5.1-prueba.${vigente}`, versionCode: 5_000_000 + vigente, apk: `${BASE}/StarSeed-os-0.5.1-prueba.${vigente}.apk`, sha256: "ab".repeat(32), bytes: 10, notas: "n" }) };
      return { ok: true, status: 200, json: async () => [] };
    }) as unknown as typeof fetch;
    // La ruta del servidor falla: se lee GitHub directo (la que usa la app nativa).
    const sinServidor = (async (url: string, init?: RequestInit) => (String(url).startsWith("/api") ? ({ ok: false, status: 404 } as Response) : f(url, init))) as typeof fetch;
    const a = await leerPublicadas({ fetch: sinServidor, esperar: async () => undefined });
    expect(a.ok && a.datos.canalPruebas?.android?.version).toBe("0.5.1-prueba.44");
    vigente = 45;
    const b = await leerPublicadas({ fetch: sinServidor, esperar: async () => undefined });
    expect(b.ok && b.datos.canalPruebas?.android?.version).toBe("0.5.1-prueba.45");
    expect(b.ok && b.datos.canalPruebas?.version).toBe("0.5.1-prueba.45");
    expect(llamadas.filter((i) => i?.cache === "no-store").length).toBe(llamadas.length);
  });

  it("la app .44 ve la .45 aunque ya viera la .44, y una vista de la .45 solo la oculta si no se fuerza", async () => {
    inst.version = "0.5.1-prueba.44";
    const r = await comprobarActualizacion({ vistas: { "0.5.1-prueba.44": 1 }, leer: publicadas(45) });
    expect(r?.decision).toMatchObject({ tipo: "ventana", version: "0.5.1-prueba.45" });
    const oculta = await comprobarActualizacion({ vistas: { "0.5.1-prueba.45": 1 }, leer: publicadas(45) });
    expect(oculta?.decision.tipo).toBe("nada");
    const forzada = await comprobarActualizacion({ forzar: true, vistas: { "0.5.1-prueba.45": 1 }, leer: publicadas(45) });
    expect(forzada?.decision.tipo).toBe("ventana");
  });
});

describe("la línea de cada intento", () => {
  it("formato fijo y una línea por salida de la búsqueda, con el motivo", async () => {
    const lineas: string[] = [];
    fijarSumideroIntentos((l) => lineas.push(l));
    inst.version = "0.5.1-prueba.44";
    await comprobarActualizacion({ leer: publicadas(45) });
    await comprobarActualizacion({ leer: publicadas(44) });
    await comprobarActualizacion({ vistas: { "0.5.1-prueba.45": 1 }, leer: publicadas(45) });
    await comprobarActualizacion({ leer: async () => ({ ok: false as const, motivo: "HTTP 504" }) });
    expect(lineas).toHaveLength(4);
    expect(lineas[0]).toBe("actualizacion canal=pruebas instalada=0.5.1-prueba.44 ofrecida=0.5.1-prueba.45 paso=buscar resultado=ofrecida motivo=lista para instalar (origen lista)");
    expect(lineas[1]).toMatch(/ofrecida=0\.5\.1-prueba\.44 paso=buscar resultado=al-dia motivo=/);
    expect(lineas[2]).toMatch(/resultado=ya-vista motivo=la 0\.5\.1-prueba\.45 ya se enseñó/);
    expect(lineas[3]).toMatch(/ofrecida=- paso=buscar resultado=error motivo=.*HTTP 504/);
    for (const l of lineas) expect(l).not.toContain("\n");
  });
  it("limpia saltos de línea y recorta; anotarIntento nunca lanza", () => {
    const l = lineaIntento({ canal: "oficial", instalada: "0.5.0", ofrecida: null, paso: "verificar", resultado: "error", motivo: "a\nb\u0000" + "x".repeat(400) });
    expect(l.split("\n")).toHaveLength(1);
    expect(l.length).toBeLessThan(300);
    fijarSumideroIntentos(() => {
      throw new Error("x");
    });
    expect(() => anotarIntento({ canal: "pruebas", instalada: null, ofrecida: null, paso: "buscar", resultado: "ok", motivo: "" })).not.toThrow();
  });
});

describe("cadencia de la búsqueda", () => {
  it("canal de pruebas: cada 45 min (antes 6 h); al arrancar, 20 s o lo que falte", () => {
    expect(CADA_PRUEBAS_MS).toBeLessThan(CADA_MS);
    expect(esperaHastaProxima({ ahora: 1e9, ultimaEn: null, alArrancar: false, cadaMs: CADA_PRUEBAS_MS })).toBe(CADA_PRUEBAS_MS);
    expect(esperaHastaProxima({ ahora: 1e9, ultimaEn: 1e9 - 10 * 60_000, alArrancar: true, cadaMs: CADA_PRUEBAS_MS })).toBe(CADA_PRUEBAS_MS - 10 * 60_000);
    expect(esperaHastaProxima({ ahora: 1e9, ultimaEn: 1e9 - 40 * 60_000, alArrancar: true, cadaMs: CADA_PRUEBAS_MS })).toBe(INICIO_AUTO_MS);
    expect(esperaHastaProxima({ ahora: 1e9, ultimaEn: null, alArrancar: false })).toBe(CADA_MS);
  });
});
