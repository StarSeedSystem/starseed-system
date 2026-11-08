/**
 * (ACT1108A) Canal de pruebas en la web: qué versión cuenta para cada app instalada y qué decide
 * `comprobarActualizacion` (escritorio y Android). Contrato: architecture/centro-versiones-1105.md §9.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canalDe,
  canalPruebasDesdeApi,
  elegirPublicada,
  esVersionDePrueba,
  etiquetaCanal,
  sanearApkPruebas,
  sanearCanalPruebas,
  type CanalPruebas,
} from "../canal-pruebas";
import { compararVersiones, esVersionMasNueva } from "@/lib/version/os-release";

const APK = "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed-os-0.5.1-prueba.24.apk";
const SHA = "ab".repeat(32);
const manifiestoApk = { version: "0.5.1-prueba.24", versionCode: 5_000_002, apk: APK, sha256: SHA.toUpperCase(), bytes: 1234, notas: "Notas APK", pub_date: "x", canal: "pruebas" };
const pruebas: CanalPruebas = {
  version: "0.5.1-prueba.24",
  fecha: "2026-11-08",
  notas: "Notas escritorio",
  android: { version: "0.5.1-prueba.24", versionCode: 5_000_002, apk: APK, sha256: SHA, bytes: 1234, notas: "Notas APK" },
};
const oficial = { version: "v0.5.0", fecha: "2026-11-01", notas: "Oficial", apk: null };

describe("versiones del canal de pruebas", () => {
  it("se reconocen por «-prueba.» y la etiqueta lo dice", () => {
    expect(esVersionDePrueba("0.5.1-prueba.23")).toBe(true);
    expect(esVersionDePrueba("v0.5.1-prueba.23")).toBe(true);
    expect(esVersionDePrueba("0.5.1")).toBe(false);
    expect(esVersionDePrueba("0.6.0-beta.1")).toBe(false);
    expect(esVersionDePrueba(null)).toBe(false);
    expect(canalDe("0.5.1-prueba.23")).toBe("pruebas");
    expect(canalDe("0.5.0")).toBe("oficial");
    expect(etiquetaCanal("0.5.1-prueba.23")).toBe("Canal de pruebas · 0.5.1-prueba.23");
    expect(etiquetaCanal("0.5.0")).toBeNull();
  });

  it("comparar (semver, como el updater): 0.5.0 < 0.5.1-prueba.9 < 0.5.1-prueba.23 < 0.5.1", () => {
    const orden = ["0.5.0", "0.5.1-prueba.9", "0.5.1-prueba.23", "0.5.1-prueba.100", "0.5.1", "v0.5.2-prueba.1"];
    for (let i = 1; i < orden.length; i++) {
      expect(compararVersiones(orden[i], orden[i - 1]), `${orden[i]} > ${orden[i - 1]}`).toBe(1);
      expect(compararVersiones(orden[i - 1], orden[i])).toBe(-1);
    }
    expect(compararVersiones("0.5.1-prueba.23", "v0.5.1-prueba.23")).toBe(0);
    expect(compararVersiones("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compararVersiones("1.0.0-alpha.beta", "1.0.0-alpha.1")).toBe(1);
    expect(compararVersiones("1.0.0+build.5", "1.0.0")).toBe(0);
    // Lo de antes sigue igual.
    expect(compararVersiones("v1.1", "1.0.9")).toBe(1);
    expect(compararVersiones("", "0.0.1")).toBe(-1);
    expect(esVersionMasNueva("0.5.1-prueba.23", "0.5.1")).toBe(false);
  });

  it("manifiesto del APK: solo de los Releases del repositorio y con SHA-256", () => {
    expect(sanearApkPruebas(manifiestoApk)).toEqual(pruebas.android);
    expect(sanearApkPruebas({ ...manifiestoApk, apk: "https://evil.example/x.apk" })).toBeNull();
    expect(sanearApkPruebas({ ...manifiestoApk, sha256: "nope" })).toBeNull();
    expect(sanearApkPruebas({ ...manifiestoApk, versionCode: 0 })).toBeNull();
    expect(sanearApkPruebas({ ...manifiestoApk, version: "build-x" })).toBeNull();
    expect(sanearApkPruebas([manifiestoApk])).toBeNull();
  });

  it("canal completo desde los manifiestos y desde /api/os/versiones", () => {
    const c = sanearCanalPruebas({ version: "0.5.1-prueba.24", pub_date: "2026-11-08T10:00:00Z", notes: "Notas escritorio", platforms: {} }, manifiestoApk);
    expect(c).toEqual(pruebas);
    expect(canalPruebasDesdeApi(c)).toEqual(pruebas);
    // Solo Android (el escritorio de esa prueba falló): vale igual.
    expect(sanearCanalPruebas(null, manifiestoApk)).toMatchObject({ version: null, android: { version: "0.5.1-prueba.24" }, notas: "Notas APK" });
    expect(sanearCanalPruebas([1, 2], null)).toBeNull();
    expect(canalPruebasDesdeApi(null)).toBeNull();
  });
});

describe("elegirPublicada", () => {
  it("una app oficial nunca ve el canal de pruebas", () => {
    const e = elegirPublicada({ medio: "escritorio", instalada: "0.5.0", oficial, pruebas });
    expect(e).toMatchObject({ version: "0.5.0", canal: "oficial" });
  });

  it("una app de pruebas ve su canal si es más nuevo (escritorio y Android)", () => {
    expect(elegirPublicada({ medio: "escritorio", instalada: "0.5.1-prueba.23", oficial, pruebas })).toEqual({
      version: "0.5.1-prueba.24",
      canal: "pruebas",
      fecha: "2026-11-08",
      notas: "Notas escritorio",
      apk: null,
    });
    expect(elegirPublicada({ medio: "android", instalada: "0.5.1-prueba.23", oficial, pruebas })).toEqual({
      version: "0.5.1-prueba.24",
      canal: "pruebas",
      fecha: "2026-11-08",
      notas: "Notas APK",
      apk: APK,
    });
  });

  it("…y la oficial gana cuando sale (0.5.1 > 0.5.1-prueba.N)", () => {
    const of = { version: "v0.5.1", fecha: "2026-12-01", notas: "Oficial 0.5.1", apk: "https://x/StarSeed-os-0.5.1.apk" };
    expect(elegirPublicada({ medio: "android", instalada: "0.5.1-prueba.23", oficial: of, pruebas })).toMatchObject({ version: "0.5.1", canal: "oficial", apk: of.apk });
  });

  it("sin lista oficial (sin red) la app de pruebas sigue viendo su canal", () => {
    expect(elegirPublicada({ medio: "escritorio", instalada: "0.5.1-prueba.23", oficial: null, pruebas }).version).toBe("0.5.1-prueba.24");
    expect(elegirPublicada({ medio: "escritorio", instalada: "0.5.1-prueba.23", oficial: null, pruebas: null }).version).toBeNull();
    // En Android, sin APK de pruebas, cuenta lo oficial.
    expect(elegirPublicada({ medio: "android", instalada: "0.5.1-prueba.23", oficial, pruebas: { ...pruebas, android: null } }).canal).toBe("oficial");
  });
});

// ─── comprobarActualizacion con el canal de pruebas (lo que usan la ventana y «Esta neurona») ───

const instalada = vi.hoisted(() => ({ medio: "escritorio" as "escritorio" | "android", version: "0.5.1-prueba.23" }));
const busqueda = vi.hoisted(() => ({ disponible: null as string | null }));

vi.mock("../version-por-medio", () => ({
  leerInstalada: async () => ({ medio: instalada.medio, version: instalada.version, fuente: "info_neurona", info: null }),
}));
vi.mock("@/lib/nativa/info-neurona", () => ({
  buscarActualizacionNativa: async () => ({ estado: "ok", busqueda: { actual: instalada.version, disponible: busqueda.disponible, notas: "Del updater", fecha: "2026-11-08T10:00:00Z" } }),
}));
vi.mock("../ultima-comprobacion", () => ({ guardarUltimaComprobacion: () => undefined }));

const RELEASE_OFICIAL = {
  version: "v0.5.0",
  fecha: "2026-11-01",
  notas: "Oficial",
  url: "https://github.com/x",
  archivos: { os: { macos: [], windows: [], linux: [], android: [{ nombre: "StarSeed-os-0.5.0.apk", bytes: 10, href: "https://x/StarSeed-os-0.5.0.apk" }], ios: [] } },
};

describe("comprobarActualizacion · canal de pruebas", () => {
  const original = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ versiones: [RELEASE_OFICIAL], canalPruebas: pruebas }) })) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
    busqueda.disponible = null;
  });

  it("escritorio de pruebas: el updater ofrece la prueba siguiente → ventana del canal de pruebas", async () => {
    const { comprobarActualizacion } = await import("../comprobar");
    instalada.medio = "escritorio";
    instalada.version = "0.5.1-prueba.23";
    busqueda.disponible = "0.5.1-prueba.24";
    const r = await comprobarActualizacion({ forzar: true });
    expect(r?.decision).toEqual({ tipo: "ventana", version: "0.5.1-prueba.24", origen: "updater", apk: null });
    expect(r?.canal).toBe("pruebas");
  });

  it("Android de pruebas: ventana con el APK de latest-prueba-android.json", async () => {
    const { comprobarActualizacion } = await import("../comprobar");
    instalada.medio = "android";
    instalada.version = "0.5.1-prueba.23";
    const r = await comprobarActualizacion({ forzar: true });
    expect(r?.decision).toEqual({ tipo: "ventana", version: "0.5.1-prueba.24", origen: "lista", apk: APK });
    expect(r?.canal).toBe("pruebas");
    expect(r?.notas).toBe("Notas APK");
  });

  it("Android oficial (0.5.0): el canal de pruebas no existe para ella", async () => {
    const { comprobarActualizacion } = await import("../comprobar");
    instalada.medio = "android";
    instalada.version = "0.5.0";
    const r = await comprobarActualizacion({ forzar: true });
    expect(r?.decision.tipo).toBe("nada");
  });

  it("Android de pruebas al día con su canal: nada", async () => {
    const { comprobarActualizacion } = await import("../comprobar");
    instalada.medio = "android";
    instalada.version = "0.5.1-prueba.24";
    const r = await comprobarActualizacion({ forzar: true });
    expect(r?.decision.tipo).toBe("nada");
  });
});
