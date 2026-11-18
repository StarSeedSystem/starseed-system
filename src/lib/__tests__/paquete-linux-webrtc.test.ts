import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("paquete-linux-webrtc", () => {
  const tauriConfigPath = resolve(__dirname, "../../../native/src-tauri/tauri.conf.json");
  const config = JSON.parse(readFileSync(tauriConfigPath, "utf-8"));

  it("bundle.linux.deb.depends existe y es un array", () => {
    const depends = config.bundle?.linux?.deb?.depends;
    expect(Array.isArray(depends)).toBe(true);
  });

  it("contiene gstreamer1.0-nice", () => {
    const depends = config.bundle?.linux?.deb?.depends ?? [];
    expect(depends).toContain("gstreamer1.0-nice");
  });

  it("contiene gstreamer1.0-plugins-bad", () => {
    const depends = config.bundle?.linux?.deb?.depends ?? [];
    expect(depends).toContain("gstreamer1.0-plugins-bad");
  });

  it("el JSON completo sigue siendo válido", () => {
    expect(() => JSON.parse(readFileSync(tauriConfigPath, "utf-8"))).not.toThrow();
  });
});