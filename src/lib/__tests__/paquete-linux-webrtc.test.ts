// StarSeed OS — Prueba de dependencias WebRTC en el paquete .deb de Linux.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RUTA_TAURI_CONF = resolve("native/src-tauri/tauri.conf.json");

function leerConfiguracionTauri(): unknown {
  const contenido = readFileSync(RUTA_TAURI_CONF, "utf-8");
  return JSON.parse(contenido);
}

describe("paquete .deb de Linux — dependencias WebRTC", () => {
  it("el JSON de configuración de Tauri es válido y se puede leer", () => {
    const config = leerConfiguracionTauri();
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  it("bundle.linux.deb.depends existe y es un array", () => {
    const config = leerConfiguracionTauri() as Record<string, unknown>;
    const bundle = config.bundle as Record<string, unknown> | undefined;
    expect(bundle).toBeDefined();

    const linux = bundle?.linux as Record<string, unknown> | undefined;
    expect(linux).toBeDefined();

    const deb = linux?.deb as Record<string, unknown> | undefined;
    expect(deb).toBeDefined();

    const depends = deb?.depends;
    expect(Array.isArray(depends)).toBe(true);
  });

  it("contiene gstreamer1.0-nice para ICE/WebRTC", () => {
    const config = leerConfiguracionTauri() as Record<string, unknown>;
    const bundle = config.bundle as Record<string, unknown> | undefined;
    const linux = bundle?.linux as Record<string, unknown> | undefined;
    const deb = linux?.deb as Record<string, unknown> | undefined;
    const depends = deb?.depends as string[] | undefined;
    expect(depends).toContain("gstreamer1.0-nice");
  });

  it("contiene gstreamer1.0-plugins-bad para codecs WebRTC", () => {
    const config = leerConfiguracionTauri() as Record<string, unknown>;
    const bundle = config.bundle as Record<string, unknown> | undefined;
    const linux = bundle?.linux as Record<string, unknown> | undefined;
    const deb = linux?.deb as Record<string, unknown> | undefined;
    const depends = deb?.depends as string[] | undefined;
    expect(depends).toContain("gstreamer1.0-plugins-bad");
  });
});