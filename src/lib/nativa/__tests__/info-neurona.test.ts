// @vitest-environment jsdom
/**
 * (VER1107B) Leer la versión de la app nativa del objeto global de Tauri, con `__TAURI__` simulado:
 * app nueva (info_neurona), apps 0.4.x/0.5.0 (getVersion o plugin:app|version), sin nada, y buscar la
 * versión nueva sin instalar (también en una app que no tiene el comando).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buscarActualizacionNativa,
  esComandoAusente,
  leerInfoNativa,
  leerVersionNativa,
  limpiarVersionNativa,
  olvidarInfoNativa,
  sanearInfoNativa,
  type TauriConApp,
} from "../info-neurona";
import { leerInstalada } from "@/lib/actualizaciones/version-por-medio";

const INFO = {
  app_version: "0.5.1",
  app_nombre: "StarSeed OS",
  identificador: "app.starseed.os",
  sistema: "os",
  plataforma: "macos",
  so_version: "15.1.0",
  arquitectura: "aarch64",
  equipo: "MacBook-de-Alex",
  modelo: null,
  tauri_version: "2.12.5",
  escritorio: true,
  actualizador: true,
};

const ACL = (cmd: string) => `Command ${cmd} not allowed by ACL`;

function tauri(cmds: Record<string, () => unknown>, getVersion?: () => Promise<unknown>): TauriConApp {
  return {
    core: {
      invoke: vi.fn(async (cmd: string) => {
        const r = cmds[cmd];
        if (!r) throw ACL(cmd);
        return r();
      }),
    },
    ...(getVersion ? { app: { getVersion } } : {}),
  };
}

beforeEach(() => olvidarInfoNativa());
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
});

describe("limpiar y sanear (puro)", () => {
  it("solo semver", () => {
    expect(limpiarVersionNativa(" v0.5.0 ")).toBe("0.5.0");
    expect(limpiarVersionNativa("0.6.0-beta.1")).toBe("0.6.0-beta.1");
    expect(limpiarVersionNativa("mvq6sg7z-kt91hk")).toBeNull();
    expect(limpiarVersionNativa(5)).toBeNull();
  });
  it("info sin versión de verdad no vale; textos recortados y sin controles", () => {
    expect(sanearInfoNativa({ ...INFO, app_version: "build-1" })).toBeNull();
    expect(sanearInfoNativa(null)).toBeNull();
    const s = sanearInfoNativa({ ...INFO, equipo: "  Mac\u0007 ", modelo: 7 });
    expect(s?.equipo).toBe("Mac");
    expect(s?.modelo).toBeNull();
  });
  it("reconoce el error de un comando que la app no tiene", () => {
    expect(esComandoAusente(ACL("buscar_actualizacion"))).toBe(true);
    expect(esComandoAusente("command buscar_actualizacion not found")).toBe(true);
    expect(esComandoAusente("No se pudo comprobar actualizaciones: error de red")).toBe(false);
  });
});

describe("leerVersionNativa con __TAURI__ simulado", () => {
  it("app con VER1107B: info_neurona (y no hace falta más)", async () => {
    const getVersion = vi.fn(async () => "0.0.1");
    const t = tauri({ info_neurona: () => INFO }, getVersion);
    expect(await leerVersionNativa(t)).toEqual({ version: "0.5.1", fuente: "info_neurona", info: sanearInfoNativa(INFO) });
    expect(getVersion).not.toHaveBeenCalled();
  });

  it("app 0.4.x/0.5.0: sin info_neurona (ACL) → __TAURI__.app.getVersion()", async () => {
    const t = tauri({}, async () => "0.5.0");
    expect(await leerVersionNativa(t)).toEqual({ version: "0.5.0", fuente: "getVersion", info: null });
  });

  it("sin el módulo app en el global → invoke('plugin:app|version')", async () => {
    const t = tauri({ "plugin:app|version": () => "0.4.3" });
    expect(await leerVersionNativa(t)).toEqual({ version: "0.4.3", fuente: "plugin:app|version", info: null });
  });

  it("nada responde con semver → null (nunca el build de la web)", async () => {
    const t = tauri({ "plugin:app|version": () => "mvq6sg7z-kt91hk" }, async () => {
      throw new Error("not allowed");
    });
    expect(await leerVersionNativa(t)).toBeNull();
    expect(await leerVersionNativa(null)).toBeNull();
  });

  it("leerInstalada en la app nativa: medio por la plataforma de la app y SIN pedir /version.json", async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ build: "mvq6sg7z-kt91hk" })));
    vi.stubGlobal("fetch", fetchFalso);
    const android = tauri({ info_neurona: () => ({ ...INFO, plataforma: "android", escritorio: false, actualizador: false }) });
    expect(await leerInstalada(android)).toMatchObject({ medio: "android", version: "0.5.1", fuente: "info_neurona" });
    const vieja = tauri({});
    expect(await leerInstalada(vieja)).toMatchObject({ medio: "escritorio", version: null, fuente: null });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("con el global de la ventana, info_neurona se pide una vez (y se reintenta si falló)", async () => {
    const t = tauri({ info_neurona: () => INFO });
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = t;
    await leerInfoNativa();
    await leerInfoNativa();
    expect(t.core?.invoke).toHaveBeenCalledTimes(1);
  });
});

describe("buscarActualizacionNativa", () => {
  it("ok con y sin versión nueva", async () => {
    const con = tauri({ buscar_actualizacion: () => ({ actual: "0.5.0", disponible: "0.6.0", notas: "n", fecha: "2026-11-08T10:00:00Z" }) });
    expect(await buscarActualizacionNativa(con)).toEqual({
      estado: "ok",
      busqueda: { actual: "0.5.0", disponible: "0.6.0", notas: "n", fecha: "2026-11-08T10:00:00Z" },
    });
    const sin = tauri({ buscar_actualizacion: () => ({ actual: "0.5.0", disponible: null, notas: null, fecha: null }) });
    expect(await buscarActualizacionNativa(sin)).toEqual({ estado: "ok", busqueda: { actual: "0.5.0", disponible: null, notas: null, fecha: null } });
  });

  it("app anterior (ACL) → sin-comando; error de red → error; fuera de la app → error", async () => {
    expect((await buscarActualizacionNativa(tauri({}))).estado).toBe("sin-comando");
    const red = tauri({
      buscar_actualizacion: () => {
        throw new Error("No se pudo comprobar actualizaciones: error de red");
      },
    });
    expect(await buscarActualizacionNativa(red)).toEqual({ estado: "error", motivo: "No se pudo comprobar actualizaciones: error de red" });
    expect((await buscarActualizacionNativa(null)).estado).toBe("error");
  });
});
