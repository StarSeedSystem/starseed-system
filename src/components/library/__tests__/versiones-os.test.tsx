import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VersionesOS } from "../versiones-os";

const DATOS_API = {
  generadoEn: "2026-10-31T00:00:00.000Z",
  versiones: [
    {
      version: "v0.3.0",
      fecha: "2026-10-09",
      notas: "Notas de la versión 0.3.0",
      url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.3.0",
      archivos: {
        os: {
          macos: [
            { nombre: "StarSeed.OS_0.3.0_universal.dmg", bytes: 7025536, href: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.OS_0.3.0_universal.dmg" },
          ],
          windows: [],
          linux: [],
          android: [
            { nombre: "StarSeed-os-0.3.0.apk", bytes: 28665472, href: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed-os-0.3.0.apk" },
          ],
          ios: [],
        },
      },
    },
    {
      version: "v0.2.0",
      fecha: "2026-09-24",
      notas: "Notas de la versión 0.2.0",
      url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.2.0",
      archivos: {
        os: {
          macos: [
            { nombre: "StarSeed.OS_0.2.0_universal.dmg", bytes: 6500000, href: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.2.0/StarSeed.OS_0.2.0_universal.dmg" },
          ],
          windows: [],
          linux: [],
          android: [],
          ios: [],
        },
      },
    },
  ],
};

const fetchSimulado = vi.fn();

beforeEach(() => {
  fetchSimulado.mockReset();
  fetchSimulado.mockResolvedValue({
    ok: true,
    json: async () => DATOS_API,
  } as Response);
  vi.stubGlobal("fetch", fetchSimulado);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VersionesOS", () => {
  it("se renderiza correctamente con datos del API", async () => {
    render(<VersionesOS />);

    expect(await screen.findByText("Versiones de StarSeed OS")).toBeTruthy();
    expect(screen.getByText("v0.3.0")).toBeTruthy();
    expect(screen.getByText("v0.2.0")).toBeTruthy();
    expect(fetchSimulado).toHaveBeenCalledWith("/api/os/versiones");
  });

  it("muestra la versión de OS_VERSION en el header", async () => {
    render(<VersionesOS />);

    const badge = await screen.findByText("2026.10.09");
    expect(badge).toBeTruthy();
  });

  it("muestra notas de cada versión", async () => {
    render(<VersionesOS />);

    expect(await screen.findByText("Notas de la versión 0.3.0")).toBeTruthy();
    expect(screen.getByText("Notas de la versión 0.2.0")).toBeTruthy();
  });

  it("muestra enlaces de descarga por sistema operativo", async () => {
    render(<VersionesOS />);

    const macosLinks = await screen.findAllByRole("link", { name: /macOS:/ });
    expect(macosLinks.length).toBe(2);
    const androidLinks = screen.getAllByRole("link", { name: /Android:/ });
    expect(androidLinks.length).toBe(1);
  });

  it("maneja error de fetch mostrando mensaje amable", async () => {
    fetchSimulado.mockRejectedValueOnce(new Error("sin red"));
    render(<VersionesOS />);

    expect(await screen.findByText(/Error al cargar versiones/)).toBeTruthy();
  });
});