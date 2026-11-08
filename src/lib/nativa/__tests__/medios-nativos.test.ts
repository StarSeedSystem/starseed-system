// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { crearPuente } from "@/lib/nativa/puente";
import {
  COMANDO_AJUSTES_MEDIOS,
  COMANDO_ESTADO_MEDIOS,
  abrirAjustesMedios,
  explicarFalloMedios,
  leerEntornoMedios,
  olvidarEntornoMedios,
  sanearEstadoMedios,
} from "@/lib/nativa/medios-nativos";

/*
 * MIC1108A · `medios_estado` distingue la app que ya declara micro y cámara de la anterior (que ni
 * tiene el comando: la ACL lo rechaza) y `medios_abrir_ajustes` abre los del sistema. Tauri falso.
 */

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const ESTADO_MAC = { version: 1, plataforma: "macos", declarados: true, abrir_ajustes: true };

function tauri(respuestas: Record<string, unknown>) {
  const invoke = vi.fn(async (cmd: string) => {
    if (!(cmd in respuestas)) throw `Command ${cmd} not allowed by ACL`;
    const r = respuestas[cmd];
    if (r instanceof Error) throw r;
    return r;
  });
  return { invoke, puente: crearPuente({ core: { invoke } }) };
}

const ventana = () => window as unknown as { __TAURI__?: unknown };

afterEach(() => {
  olvidarEntornoMedios();
  delete ventana().__TAURI__;
});

describe("entorno de medios", () => {
  it("web normal: no pregunta nada y la plataforma sale del agente", async () => {
    const e = await leerEntornoMedios(crearPuente(null), MAC);
    expect(e).toEqual({ nativa: false, plataforma: "macos", estado: null });
  });

  it("app con MIC1108A: lo que dice `medios_estado`", async () => {
    const { invoke, puente } = tauri({ [COMANDO_ESTADO_MEDIOS]: { ...ESTADO_MAC, plataforma: "windows" } });
    const e = await leerEntornoMedios(puente, MAC);
    expect(invoke).toHaveBeenCalledWith(COMANDO_ESTADO_MEDIOS, undefined);
    expect(e.nativa).toBe(true);
    expect(e.plataforma).toBe("windows");
    expect(e.estado).toMatchObject({ declarados: true, abrir_ajustes: true });
  });

  it("app anterior (sin el comando): nativa pero sin estado → «app sin permiso»", async () => {
    const { puente } = tauri({});
    const e = await leerEntornoMedios(puente, MAC);
    expect(e).toEqual({ nativa: true, plataforma: "macos", estado: null });
  });

  it("descarta respuestas que no son el estado", () => {
    expect(sanearEstadoMedios(ESTADO_MAC)).toEqual(ESTADO_MAC);
    expect(sanearEstadoMedios(null)).toBeNull();
    expect(sanearEstadoMedios({ ...ESTADO_MAC, version: 0 })).toBeNull();
    expect(sanearEstadoMedios({ ...ESTADO_MAC, declarados: "sí" })).toBeNull();
    expect(sanearEstadoMedios({ version: 1 })).toBeNull();
  });

  it("explicarFalloMedios usa la app de ESTA ventana (una vez)", async () => {
    const { invoke } = tauri({ [COMANDO_ESTADO_MEDIOS]: ESTADO_MAC });
    ventana().__TAURI__ = { core: { invoke } };
    const a = await explicarFalloMedios({ name: "NotAllowedError" }, { audio: true, video: false });
    expect(a.causa).toBe("denegado");
    expect(a.ajustes).toBe("microfono");
    const b = await explicarFalloMedios({ name: "NotAllowedError" }, { audio: false, video: true });
    expect(b.ajustes).toBe("camara");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("explicarFalloMedios en una app anterior: «instala la versión nueva»", async () => {
    const { invoke } = tauri({});
    ventana().__TAURI__ = { core: { invoke } };
    const d = await explicarFalloMedios({ name: "NoMediaDevices" }, { audio: true, video: false });
    expect(d.causa).toBe("app-sin-permiso");
    expect(d.mensaje).toMatch(/versión nueva/);
  });
});

describe("abrir ajustes", () => {
  it("pide a la app el ajuste del medio", async () => {
    const { invoke, puente } = tauri({ [COMANDO_AJUSTES_MEDIOS]: true });
    expect(await abrirAjustesMedios("microfono", puente)).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith(COMANDO_AJUSTES_MEDIOS, { tipo: "microfono" });
  });

  it("si la app no sabe (o no es la app), lo dice sin lanzar", async () => {
    const { puente } = tauri({ [COMANDO_AJUSTES_MEDIOS]: new Error("Este sistema no tiene una pantalla de ajustes que la app sepa abrir.") });
    const r = await abrirAjustesMedios("pantalla", puente);
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/no tiene una pantalla de ajustes/) });
    expect((await abrirAjustesMedios("microfono", crearPuente(null))).ok).toBe(false);
  });
});
