// @vitest-environment jsdom
/**
 * PRM1109A · paso 4 del plan de permisos unificados: el motor de permisos es el
 * ÚNICO que habla con el navegador para abrir micrófono/cámara/pantalla.
 * Estos streams NO son «pedir permiso» (eso es `pedirPermiso`, que suelta las
 * pistas): son streams que el que llama va a USAR (las llamadas).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pedirPermiso, solicitarMedios, solicitarPantalla } from "../request-permission";

function flujo() {
  const pistas = [{ stop: vi.fn() }];
  const stream = { getTracks: () => pistas } as unknown as MediaStream;
  return { pistas, stream };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("solicitarMedios (el motor único de getUserMedia)", () => {
  it("devuelve el stream del navegador", async () => {
    const { stream } = flujo();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => Promise.resolve(stream) } });
    await expect(solicitarMedios({ audio: true })).resolves.toBe(stream);
  });

  it("usa el mediaDevices que le pasan (el que ya tiene el llamante)", async () => {
    const { stream } = flujo();
    const md = { getUserMedia: () => Promise.resolve(stream) } as unknown as MediaDevices;
    await expect(solicitarMedios({ audio: true }, md)).resolves.toBe(stream);
  });

  it("sin mediaDevices lanza NoMediaDevices", async () => {
    vi.stubGlobal("navigator", {});
    await expect(solicitarMedios({ audio: true })).rejects.toMatchObject({ name: "NoMediaDevices" });
  });

  it("no suelta las pistas: el que llama las usa", async () => {
    const { stream, pistas } = flujo();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => Promise.resolve(stream) } });
    await solicitarMedios({ audio: true });
    expect(pistas[0].stop).not.toHaveBeenCalled();
  });

  it("pedirPermiso sí las suelta (solo quiere el permiso)", async () => {
    const { stream, pistas } = flujo();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => Promise.resolve(stream) } });
    await pedirPermiso("microfono");
    expect(pistas[0].stop).toHaveBeenCalled();
  });
});

describe("solicitarPantalla (el motor único de getDisplayMedia)", () => {
  it("comparte la pantalla por el motor", async () => {
    const { stream } = flujo();
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: () => Promise.resolve(stream) } });
    await expect(solicitarPantalla({ video: true })).resolves.toBe(stream);
  });

  it("sin getDisplayMedia lanza NoMediaDevices", async () => {
    vi.stubGlobal("navigator", { mediaDevices: {} });
    await expect(solicitarPantalla()).rejects.toMatchObject({ name: "NoMediaDevices" });
  });
});

describe("un solo motor de permisos (guarda)", () => {
  it("el motor de llamadas no llama al navegador: pide los streams al motor", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../../../llamadas/medios.ts"), "utf8");
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/\.getUserMedia\s*\(/);
    expect(codigo).not.toMatch(/\.getDisplayMedia\s*\(/);
  });

  it("el catálogo de sentidos tampoco abre medios por su cuenta", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../../../senses/senses.ts"), "utf8");
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/\.getUserMedia\s*\(/);
    expect(codigo).not.toMatch(/\.getDisplayMedia\s*\(/);
  });
});
