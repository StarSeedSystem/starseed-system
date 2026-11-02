/**
 * Pruebas PURAS de las órdenes de keepalive por sistema operativo
 * (KAL1101C). Sin red, sin disco y sin lanzar procesos.
 */

import { describe, expect, it } from "vitest";

import {
  argumentosKeepalive,
  comandoInstalarKeepalive,
  type OsId,
} from "@/lib/install/device-install";

describe("comandoInstalarKeepalive", () => {
  it("macOS instala por Homebrew", () => {
    const r = comandoInstalarKeepalive("macos");
    expect(r.comando).toBe("brew install --cask stigoleg/tap/keepalive");
    expect(r.nota).toContain("Homebrew");
  });

  it("Windows instala por Scoop", () => {
    const r = comandoInstalarKeepalive("windows");
    expect(r.comando).toBe("scoop install keepalive");
    expect(r.nota).toContain("Scoop");
  });

  it("Linux puede usar Go o los paquetes de las releases", () => {
    const r = comandoInstalarKeepalive("linux");
    expect(r.comando).toBe(
      "go install github.com/stigoleg/keep-alive/v2/cmd/keepalive@latest",
    );
    expect(r.nota).toContain(".deb");
    expect(r.nota).toContain(".rpm");
    expect(r.nota).toContain(".apk");
  });

  it("en móvil y sistemas desconocidos no inventa un comando", () => {
    for (const os of ["android", "ios", "unknown"] as OsId[]) {
      const r = comandoInstalarKeepalive(os);
      expect(r.comando).toBeNull();
      expect(r.nota.length).toBeGreaterThan(0);
    }
  });
});

describe("argumentosKeepalive", () => {
  it("con modo pantalla deja la pantalla encendida", () => {
    expect(argumentosKeepalive("pantalla", 42)).toEqual([
      "--plain",
      "--keep-display=true",
      "--pid",
      "42",
      "-b",
      "15",
    ]);
  });

  it("con modo sistema solo mantiene el sistema despierto", () => {
    expect(argumentosKeepalive("sistema", 7, 30)).toEqual([
      "--plain",
      "--keep-display=false",
      "--pid",
      "7",
      "-b",
      "30",
    ]);
  });

  it("sanea un pid inválido y un umbral negativo", () => {
    expect(argumentosKeepalive("sistema", Number.NaN, -3)).toEqual([
      "--plain",
      "--keep-display=false",
      "--pid",
      "0",
      "-b",
      "15",
    ]);
  });
});
