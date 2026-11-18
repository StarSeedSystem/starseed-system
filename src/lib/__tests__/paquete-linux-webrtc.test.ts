import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("paquete-linux-webrtc", () => {
  it("tauri.conf.json contiene las dependencias WebRTC en bundle.linux.deb.depends", () => {
    const rutaConfig = resolve("native/src-tauri/tauri.conf.json");
    const contenido = readFileSync(rutaConfig, "utf-8");
    const config = JSON.parse(contenido);

    const depends = config.bundle?.linux?.deb?.depends;
    expect(Array.isArray(depends)).toBe(true);
    expect(depends).toContain("gstreamer1.0-nice");
    expect(depends).toContain("gstreamer1.0-plugins-bad");
  });

  it("tauri.conf.json sigue siendo JSON válido", () => {
    const rutaConfig = resolve("native/src-tauri/tauri.conf.json");
    const contenido = readFileSync(rutaConfig, "utf-8");
    expect(() => JSON.parse(contenido)).not.toThrow();
  });
});