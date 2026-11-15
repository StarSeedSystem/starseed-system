/**
 * (CAN1115A) «Recibir versiones de prueba en este aparato»: una app oficial entra al canal de pruebas solo si su
 * dueño lo activó en ese aparato. Lo primero que se prueba: sin activarlo, nunca ve una versión de prueba.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inst = vi.hoisted(() => ({ medio: "android" as string, version: "0.5.0" }));
vi.mock("../version-por-medio", () => ({
  leerInstalada: async () => ({ medio: inst.medio, version: inst.version, fuente: "info_neurona", info: null }),
}));
vi.mock("@/lib/nativa/info-neurona", () => ({ buscarActualizacionNativa: async () => ({ estado: "sin-comando" }) }));
vi.mock("../ultima-comprobacion", () => ({ guardarUltimaComprobacion: () => undefined }));

import { comprobarActualizacion } from "../comprobar";
import { CLAVE_OPTA_PRUEBAS, guardarOptaPruebas, leerOptaPruebas, medioPuedeOptarPruebas } from "../optar-pruebas";
import { bloquePruebas, CONFIRMAR_PRUEBAS } from "@/components/actualizaciones/seccion-version";
import { sanearApkPruebas } from "../canal-pruebas";

const APK = "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed-os-0.5.1-prueba.24.apk";
const apkPruebas = sanearApkPruebas({ version: "0.5.1-prueba.24", versionCode: 5_000_002, apk: APK, sha256: "ab".repeat(32), bytes: 10, notas: "n" });
const publicadas = (oficial: string) => async () => ({
  ok: true as const,
  datos: {
    versiones: [{ version: oficial, fecha: "2026-11-01", notas: "", url: "u", archivos: { os: { android: [] } } }] as never,
    canalPruebas: { version: null, fecha: "", notas: "", android: apkPruebas },
    canalPruebasError: null,
    via: "servidor" as const,
  },
});

beforeEach(() => {
  inst.medio = "android";
  inst.version = "0.5.0";
  window.localStorage.clear();
});
afterEach(() => window.localStorage.clear());

describe("app oficial sin activar el interruptor", () => {
  it("nunca ve una versión de prueba (comprobarActualizacion, Android y escritorio, forzada o no)", async () => {
    for (const medio of ["android", "escritorio"]) {
      inst.medio = medio;
      for (const forzar of [false, true]) {
        const r = await comprobarActualizacion({ forzar, leer: publicadas("0.5.0") });
        expect(r?.publicada).toBe("0.5.0");
        expect(r?.decision.tipo).toBe("nada");
        expect(JSON.stringify(r)).not.toContain("prueba");
      }
    }
    expect(leerOptaPruebas()).toBe(false);
  });
});

describe("con el interruptor activado", () => {
  it("Android oficial ve la de pruebas, con su APK de los Releases", async () => {
    guardarOptaPruebas(true);
    const r = await comprobarActualizacion({ forzar: true, leer: publicadas("0.5.0") });
    expect(r?.publicada).toBe("0.5.1-prueba.24");
    expect(r?.canal).toBe("pruebas");
    expect(r?.decision).toMatchObject({ tipo: "ventana", apk: APK });
  });

  it("escritorio no cambia aunque el interruptor esté a 1", async () => {
    inst.medio = "escritorio";
    window.localStorage.setItem(CLAVE_OPTA_PRUEBAS, "1");
    const r = await comprobarActualizacion({ forzar: true, leer: publicadas("0.5.0") });
    expect(r?.publicada).toBe("0.5.0");
  });

  it("apagarlo vuelve a solo lo oficial", async () => {
    guardarOptaPruebas(true);
    guardarOptaPruebas(false);
    expect(leerOptaPruebas()).toBe(false);
    const r = await comprobarActualizacion({ forzar: true, leer: publicadas("0.5.0") });
    expect(r?.publicada).toBe("0.5.0");
  });

  it("es por aparato: vive en el almacenamiento de este aparato, no en la cuenta", () => {
    guardarOptaPruebas(true);
    expect(window.localStorage.getItem(CLAVE_OPTA_PRUEBAS)).toBe("1");
    window.localStorage.clear(); // otro aparato = otro almacenamiento
    expect(leerOptaPruebas()).toBe(false);
  });

  it("sin almacenamiento no lanza y se queda en oficial", () => {
    const g = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(leerOptaPruebas()).toBe(false);
    g.mockRestore();
  });
});

describe("la interfaz", () => {
  it("el interruptor solo está en Android oficial; escritorio dice por qué no; una app de pruebas lo dice", () => {
    const i = (medio: string, version: string) => ({ medio, version, fuente: "info_neurona" }) as never;
    expect(bloquePruebas(i("android", "0.5.0"))).toBe("interruptor");
    expect(bloquePruebas(i("escritorio", "0.5.0"))).toBe("sin-escritorio");
    expect(bloquePruebas(i("android", "0.5.1-prueba.3"))).toBe("ya-pruebas");
    expect(bloquePruebas(i("web", "0.5.0"))).toBeNull();
    expect(bloquePruebas(null)).toBeNull();
    expect(medioPuedeOptarPruebas("android")).toBe(true);
    expect(medioPuedeOptarPruebas("escritorio")).toBe(false);
  });

  it("la confirmación dice la verdad: puede fallar, se instala encima, pide iniciar sesión, sigue el canal", () => {
    const t = CONFIRMAR_PRUEBAS.description;
    expect(t).toMatch(/puede fallar/);
    expect(t).toMatch(/encima de la oficial/);
    expect(t).toMatch(/iniciar sesión de nuevo/);
    expect(t).toMatch(/sigue el canal de pruebas aunque apagues/);
  });
});
