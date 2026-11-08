/**
 * (ACT1108B) Actualización robusta: mapa de errores, política de reintentos, ruta alternativa por la API de
 * GitHub (504 en la descarga directa → API), comparación de versiones/canales y calendario de la búsqueda
 * automática. Contrato: architecture/centro-versiones-1105.md §9.
 */
import { describe, expect, it, vi } from "vitest";
import { describirError, httpDeTexto, textoReintento } from "../errores";
import {
  analizarUrlRelease,
  esReintentable,
  leerJsonConRutas,
  pausaAntes,
  PAUSAS_MS,
  secuenciaRutas,
  urlApiDelArchivo,
  urlListaApi,
} from "../rutas-github";
import { buscarAlVolverLaRed, CADA_MS, crearPlanificador, esperaHastaProxima, INICIO_AUTO_MS } from "../planificador-auto";
import { canalDe, elegirPublicada } from "../canal-pruebas";
import { compararVersiones, esVersionMasNueva } from "@/lib/version/os-release";
import { leerPublicadas } from "../leer-publicadas";

const URL_PRUEBAS = "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/latest-prueba.json";
const MANIFIESTO = { version: "0.5.1-prueba.23", pub_date: "2026-11-08T09:00:00Z", notes: "n" };

const respuesta = (estado: number, cuerpo: unknown = {}): Response =>
  ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo }) as unknown as Response;

const sinEsperar = async () => undefined;

describe("errores en español claro", () => {
  it("traduce el error real del Mac del 08/11", () => {
    const d = describirError("No se pudo comprobar actualizaciones: Could not fetch a valid release JSON from the remote");
    expect(d.codigo).toBe("github");
    expect(d.texto).toMatch(/^GitHub no respondió/);
    expect(d.reintentable).toBe(true);
  });
  it("504 explícito, sin conexión, tiempo, firma y 404", () => {
    expect(describirError("HTTP status server error (504 Gateway Timeout)").texto).toContain("(504)");
    expect(describirError("TypeError: Failed to fetch").texto).toBe("Sin conexión: lo intentaré cuando vuelva la red.");
    expect(describirError("x", { enLinea: false }).esperarRed).toBe(true);
    expect(describirError("operation timed out").codigo).toBe("tiempo");
    expect(describirError("The signature could not be verified").codigo).toBe("firma");
    expect(describirError("HTTP 404").codigo).toBe("no-existe");
    expect(describirError("").texto).toBe("No se pudo comprobar actualizaciones.");
  });
  it("httpDeTexto no confunde números sueltos", () => {
    expect(httpDeTexto("HTTP 504 en https://x")).toBe(504);
    expect(httpDeTexto("pesa 500 MB")).toBeNull();
  });
  it("el aviso mientras se reintenta cuenta el cambio de ruta", () => {
    expect(textoReintento("HTTP 504", "api")).toBe("GitHub no respondió (504). Lo intento por otra ruta (la API de GitHub)…");
  });
});

describe("política de reintentos", () => {
  it("pausas 0, 0, 15 s y 40 s (≈ 1 min) y alternan directa y API", () => {
    expect(PAUSAS_MS).toEqual([0, 0, 15_000, 40_000]);
    expect(pausaAntes(99)).toBe(40_000);
    expect(secuenciaRutas().map((r) => r.tipo)).toEqual(["directa", "api", "directa", "api"]);
    // F7: un espejo (neurona cercana) va primero.
    expect(secuenciaRutas(["http://192.168.1.5:8765/x"])[0].tipo).toBe("espejo");
  });
  it("solo reintenta red, 5xx y 429", () => {
    expect(esReintentable({ estado: 504 })).toBe(true);
    expect(esReintentable({ estado: 429 })).toBe(true);
    expect(esReintentable({ estado: null, red: true })).toBe(true);
    expect(esReintentable({ estado: 404 })).toBe(false);
    expect(esReintentable({ estado: 403 })).toBe(false);
  });
});

describe("ruta alternativa por la API de GitHub", () => {
  it("separa la URL del Release y arma la de la API", () => {
    const a = analizarUrlRelease(URL_PRUEBAS)!;
    expect(a.etiqueta).toBe("canal-pruebas");
    expect(urlListaApi(a)).toBe("https://api.github.com/repos/StarSeedSystem/starseed-system/releases/tags/canal-pruebas");
    const l = analizarUrlRelease("https://github.com/StarSeedSystem/starseed-system/releases/latest/download/latest.json")!;
    expect(urlListaApi(l)).toMatch(/releases\/latest$/);
    expect(analizarUrlRelease("https://evil.example/o/r/releases/download/t/f")).toBeNull();
    expect(analizarUrlRelease("https://github.com/o/r/releases/download/t/../f")).toBeNull();
  });
  it("el id del asset sale de la lista y no acepta URLs ajenas", () => {
    const a = analizarUrlRelease(URL_PRUEBAS)!;
    expect(urlApiDelArchivo({ assets: [{ name: "latest-prueba.json", id: 77 }] }, a)).toBe("https://api.github.com/repos/StarSeedSystem/starseed-system/releases/assets/77");
    expect(urlApiDelArchivo({ assets: [{ name: "latest-prueba.json", url: "https://evil.example/x/assets/1" }] }, a)).toBeNull();
    expect(urlApiDelArchivo({ assets: [] }, a)).toBeNull();
  });

  it("504 en la descarga directa → lee por la API y avisa del cambio de ruta", async () => {
    const llamadas: string[] = [];
    const f = vi.fn(async (url: string) => {
      llamadas.push(url);
      if (url === URL_PRUEBAS) return respuesta(504);
      if (url.endsWith("/releases/tags/canal-pruebas")) return respuesta(200, { assets: [{ name: "latest-prueba.json", id: 55 }] });
      if (url.endsWith("/releases/assets/55")) return respuesta(200, MANIFIESTO);
      return respuesta(500);
    }) as unknown as typeof fetch;
    const avisos: string[] = [];
    const r = await leerJsonConRutas(URL_PRUEBAS, { fetch: f, esperar: sinEsperar, aviso: (t) => avisos.push(t) });
    expect(r).toMatchObject({ ok: true, ruta: "api", intentos: 2 });
    expect(r.ok && r.valor).toEqual(MANIFIESTO);
    expect(avisos[0]).toBe("GitHub no respondió (504). Lo intento por otra ruta (la API de GitHub)…");
    expect(llamadas[0]).toBe(URL_PRUEBAS);
    expect(llamadas.at(-1)).toMatch(/releases\/assets\/55$/);
  });

  it("la API pide el contenido binario del asset (Accept: application/octet-stream)", async () => {
    const aceptados: Record<string, string> = {};
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      aceptados[url] = String((init?.headers as Record<string, string>)?.Accept);
      if (url === URL_PRUEBAS) return respuesta(504);
      if (url.includes("/releases/tags/")) return respuesta(200, { assets: [{ name: "latest-prueba.json", id: 9 }] });
      return respuesta(200, MANIFIESTO);
    }) as unknown as typeof fetch;
    await leerJsonConRutas(URL_PRUEBAS, { fetch: f, esperar: sinEsperar });
    expect(aceptados["https://api.github.com/repos/StarSeedSystem/starseed-system/releases/assets/9"]).toBe("application/octet-stream");
  });

  it("funciona a la primera por la ruta directa sin tocar la API", async () => {
    const f = vi.fn(async () => respuesta(200, MANIFIESTO)) as unknown as typeof fetch;
    const r = await leerJsonConRutas(URL_PRUEBAS, { fetch: f, esperar: sinEsperar });
    expect(r).toMatchObject({ ok: true, ruta: "directa", intentos: 1 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("todo caído: 4 intentos con las pausas y un motivo que se entiende", async () => {
    const f = vi.fn(async () => respuesta(504)) as unknown as typeof fetch;
    const pausas: number[] = [];
    const r = await leerJsonConRutas(URL_PRUEBAS, { fetch: f, esperar: async (ms) => void pausas.push(ms) });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.noExiste).toBe(false);
    expect(r.intentos).toBe(4);
    expect(pausas).toEqual([0, 0, 15_000, 40_000]);
    expect(describirError(!r.ok ? r.motivo : "").codigo).toBe("github");
  });

  it("sin red: reintenta y dice «Sin conexión»", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const r = await leerJsonConRutas(URL_PRUEBAS, { fetch: f, esperar: sinEsperar, maxIntentos: 2 });
    expect(r.ok).toBe(false);
    expect(r.intentos).toBe(2);
    expect(describirError(!r.ok ? r.motivo : "").codigo).toBe("sin-conexion");
  });

  it("un manifiesto que no existe (404 directo y API sin ese archivo) no es un fallo de GitHub", async () => {
    const f = vi.fn(async (url: string) => (url === URL_PRUEBAS ? respuesta(404) : respuesta(200, { assets: [{ name: "otro", id: 1 }] }))) as unknown as typeof fetch;
    const r = await leerJsonConRutas(URL_PRUEBAS, { fetch: f, esperar: sinEsperar });
    expect(r).toMatchObject({ ok: false, noExiste: true });
  });

  it("un 403 no se reintenta (no lo arregla otra ruta)", async () => {
    const f = vi.fn(async () => respuesta(403)) as unknown as typeof fetch;
    const r = await leerJsonConRutas(URL_PRUEBAS, { fetch: f, esperar: sinEsperar });
    expect(r).toMatchObject({ ok: false, noExiste: false, intentos: 1 });
  });
});

describe("leer lo publicado sin depender de una sola ruta", () => {
  it("si el servidor falla, lee GitHub directo (lista por la API y manifiestos por directa → API)", async () => {
    const apk = {
      version: "0.5.1-prueba.23",
      versionCode: 5_000_001,
      apk: "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed.apk",
      sha256: "ab".repeat(32),
    };
    const f = vi.fn(async (url: string) => {
      if (url === "/api/os/versiones") return respuesta(502);
      if (url.startsWith("https://api.github.com/repos/StarSeedSystem/starseed-system/releases?per_page")) return respuesta(200, []);
      if (url.endsWith("latest-prueba.json")) return respuesta(504);
      if (url.endsWith("latest-prueba-android.json")) return respuesta(200, apk);
      if (url.includes("/releases/tags/canal-pruebas")) return respuesta(200, { assets: [{ name: "latest-prueba.json", id: 3 }] });
      if (url.endsWith("/releases/assets/3")) return respuesta(200, MANIFIESTO);
      return respuesta(404);
    }) as unknown as typeof fetch;
    const r = await leerPublicadas({ fetch: f, esperar: sinEsperar });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.via).toBe("github");
      expect(r.datos.canalPruebas?.version).toBe("0.5.1-prueba.23");
      expect(r.datos.canalPruebas?.android?.versionCode).toBe(5_000_001);
    }
  });
  it("todo caído: error con motivo (nunca «al día»)", async () => {
    const f = vi.fn(async () => respuesta(504)) as unknown as typeof fetch;
    const r = await leerPublicadas({ fetch: f, esperar: sinEsperar });
    expect(r.ok).toBe(false);
  });
});

describe("versión y canal", () => {
  it("0.5.1-prueba.23 < 0.5.1-prueba.24 < 0.5.1 y 0.5.0 < prueba", () => {
    expect(esVersionMasNueva("0.5.1-prueba.24", "0.5.1-prueba.23")).toBe(true);
    expect(esVersionMasNueva("0.5.1-prueba.23", "0.5.1-prueba.24")).toBe(false);
    expect(esVersionMasNueva("0.5.1-prueba.9", "0.5.1-prueba.10")).toBe(false);
    expect(compararVersiones("0.5.1", "0.5.1-prueba.24")).toBe(1);
    expect(esVersionMasNueva("0.5.1-prueba.22", "0.5.0")).toBe(true);
  });
  it("una app de pruebas ve la prueba .24 y la oficial 0.5.1; una oficial nunca ve pruebas", () => {
    const pruebas = { version: "0.5.1-prueba.24", fecha: "", notas: "", android: null };
    const oficial = { version: "0.5.0", fecha: "", notas: "", apk: null };
    expect(canalDe("0.5.1-prueba.22")).toBe("pruebas");
    expect(canalDe("0.5.0")).toBe("oficial");
    expect(elegirPublicada({ medio: "escritorio", instalada: "0.5.1-prueba.22", oficial, pruebas }).version).toBe("0.5.1-prueba.24");
    expect(elegirPublicada({ medio: "escritorio", instalada: "0.5.1-prueba.22", oficial: { ...oficial, version: "0.5.1" }, pruebas }).version).toBe("0.5.1");
    expect(elegirPublicada({ medio: "escritorio", instalada: "0.5.0", oficial, pruebas }).version).toBe("0.5.0");
  });
});

describe("búsqueda automática", () => {
  it("al arrancar espera ~20 s; después, 6 h", () => {
    const ahora = 1_000_000_000;
    expect(esperaHastaProxima({ ahora, ultimaEn: null, alArrancar: true })).toBe(INICIO_AUTO_MS);
    expect(esperaHastaProxima({ ahora, ultimaEn: ahora - 5 * 3600_000, alArrancar: true })).toBe(INICIO_AUTO_MS);
    expect(esperaHastaProxima({ ahora, ultimaEn: ahora, alArrancar: false })).toBe(CADA_MS);
  });
  it("una recarga a la hora de la última búsqueda no repite a los 20 s", () => {
    const ahora = 1_000_000_000;
    expect(esperaHastaProxima({ ahora, ultimaEn: ahora - 3600_000, alArrancar: true })).toBe(CADA_MS - 3600_000);
  });
  it("si la última falló por falta de red, al volver la red se busca", () => {
    expect(buscarAlVolverLaRed({ resultado: "error", texto: "Sin conexión: lo intentaré cuando vuelva la red." })).toBe(true);
    expect(buscarAlVolverLaRed({ resultado: "error", texto: "GitHub no respondió (504)." })).toBe(false);
    expect(buscarAlVolverLaRed({ resultado: "al-dia", texto: "Sin conexión" })).toBe(false);
    expect(buscarAlVolverLaRed(null)).toBe(false);
  });
  it("el planificador busca a los 20 s, luego cada 6 h, y respeta el interruptor", () => {
    const pendientes: Array<{ f: () => void; ms: number }> = [];
    const temporizadores = {
      set: (f: () => void, ms: number) => {
        pendientes.push({ f, ms });
        return pendientes.length - 1;
      },
      clear: () => undefined,
    };
    const buscar = vi.fn();
    let activa = true;
    const p = crearPlanificador({ buscar, activa: () => activa, ultimaEn: () => null, ahora: () => 1000, temporizadores });
    expect(pendientes[0].ms).toBe(20_000);
    pendientes[0].f();
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(pendientes[1].ms).toBe(CADA_MS);
    activa = false;
    pendientes[1].f();
    expect(buscar).toHaveBeenCalledTimes(1); // apagado: no busca, sigue vigilando
    expect(pendientes[2].ms).toBe(CADA_MS);
    p.parar();
  });
});
