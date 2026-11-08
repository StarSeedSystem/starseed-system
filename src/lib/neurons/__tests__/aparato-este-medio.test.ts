// @vitest-environment jsdom
/**
 * (NEU1108A) El bloque `aparato` que escribe este medio (con la app nativa: `info_neurona` + huella) y la pista
 * de la app de Android (`pista_neurona_leer`), que se deja donde la escritorio deja la suya.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/aparato-este-medio.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _olvidarAparatoParaPruebas, aparatoDeEsteMedio, traerPistaNativa } from "../aparato-este-medio";
import { olvidarInfoNativa } from "@/lib/nativa/info-neurona";
import { CLAVE_NEURONA_ANTERIOR } from "@/lib/nativa/migracion-origen";

const BOARD = "e0b9faf2-0000-4000-8000-000000000001";
const AHORA = Date.parse("2026-11-08T01:20:00Z");

function ponerTauri(invoke: (cmd: string) => Promise<unknown>) {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: vi.fn(invoke) } };
}

beforeEach(() => {
  localStorage.clear();
  _olvidarAparatoParaPruebas();
  olvidarInfoNativa();
});
afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
});

describe("aparatoDeEsteMedio", () => {
  it("en la app de Android: medio, app, sistema, modelo, versión y una huella (hash)", async () => {
    ponerTauri(async (cmd) =>
      cmd === "info_neurona"
        ? { app_version: "0.5.0", app_nombre: "StarSeed OS", identificador: "app.starseed.os", sistema: "os", plataforma: "android", so_version: "14", arquitectura: "aarch64", equipo: null, modelo: "Samsung SM-X205", tauri_version: "2.11.1", escritorio: false, actualizador: false }
        : null,
    );
    const a = await aparatoDeEsteMedio({ platform: "Android", cores: 8, gpuRenderer: "Mali-G57 MC2", pantalla: "800x1340@1.5" }, AHORA);
    expect(a).toMatchObject({ v: 1, medio: "android", app: "os", so: "android", soV: "14", arq: "aarch64", equipo: "Samsung SM-X205", version: "0.5.0", ultimoMedio: "android" });
    expect(a?.huella).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(a)).not.toContain("Mali");
  });

  it("en un navegador: solo el medio, la hora y el sistema (sin equipo ni huella)", async () => {
    const a = await aparatoDeEsteMedio({ platform: "macOS" }, AHORA);
    expect(a).toEqual({ v: 1, so: "macos", ultimoMedio: "web", visto: "2026-11-08T01:20:00.000Z" });
  });
});

describe("traerPistaNativa", () => {
  it("trae la pista de la app de Android al localStorage de este origen (una vez)", async () => {
    ponerTauri(async (cmd) => (cmd === "pista_neurona_leer" ? BOARD : null));
    expect(await traerPistaNativa()).toBe(BOARD);
    expect(localStorage.getItem(CLAVE_NEURONA_ANTERIOR)).toBe(BOARD);
    // Ya está aquí: no se vuelve a pedir.
    ponerTauri(async () => {
      throw new Error("no debería pedirse");
    });
    expect(await traerPistaNativa()).toBe(BOARD);
  });

  it("sin app nativa, sin comando (app anterior) o con un id raro: nada", async () => {
    expect(await traerPistaNativa()).toBeNull();
    ponerTauri(async () => {
      throw new Error("not allowed by ACL");
    });
    expect(await traerPistaNativa()).toBeNull();
    ponerTauri(async () => "<script>");
    expect(await traerPistaNativa()).toBeNull();
    expect(localStorage.getItem(CLAVE_NEURONA_ANTERIOR)).toBeNull();
  });
});
