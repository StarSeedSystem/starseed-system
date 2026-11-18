import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TAURI_CONFIG_PATH = resolve("native/src-tauri/tauri.conf.json");

describe("paquete-linux-webrtc: dependencias WebRTC en .deb", () => {
  it("tauri.conf.json es JSON válido", () => {
    const contenido = readFileSync(TAURI_CONFIG_PATH, "utf-8");
    expect(() => JSON.parse(contenido)).not.toThrow();
  });

  it("bundle.linux.deb.depends existe y es un array", () => {
    const config = JSON.parse(readFileSync(TAURI_CONFIG_PATH, "utf-8"));
    const depends = config.bundle?.linux?.deb?.depends;
    expect(Array.isArray(depends)).toBe(true);
  });

  it("contiene gstreamer1.0-nice para ICE/WebRTC", () => {
    const config = JSON.parse(readFileSync(TAURI_CONFIG_PATH, "utf-8"));
    const depends = config.bundle?.linux?.deb?.depends ?? [];
    expect(depends).toContain("gstreamer1.0-nice");
  });

  it("contiene gstreamer1.0-plugins-bad para codecs WebRTC", () => {
    const config = JSON.parse(readFileSync(TAURI_CONFIG_PATH, "utf-8"));
    const depends = config.bundle?.linux?.deb?.depends ?? [];
    expect(depends).toContain("gstreamer1.0-plugins-bad");
  });
});