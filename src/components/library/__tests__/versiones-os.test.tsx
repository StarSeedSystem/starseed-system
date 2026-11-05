import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Mock fetch global antes de cada test.
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/os/versiones")) {
        return new Response(
          JSON.stringify({
            version: "2026.11.05",
            fecha: "2026-11-05",
            notas: "Actualización de seguridad y nuevas features",
            url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v2026.11.05",
            archivos: {
              os: [
                {
                  nombre: "StarSeed.OS_2026.11.05_universal.dmg",
                  browser_download_url:
                    "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_universal.dmg",
                  size: 7_025_536,
                },
                {
                  nombre: "StarSeed.OS_2026.11.05_x64-setup.exe",
                  browser_download_url:
                    "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_x64-setup.exe",
                  size: 2_516_582,
                },
                {
                  nombre: "StarSeed.OS_2026.11.05_x64_en-US.msi",
                  browser_download_url:
                    "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_x64_en-US.msi",
                  size: 3_460_352,
                },
                {
                  nombre: "StarSeed.OS_2026.11.05_amd64.AppImage",
                  browser_download_url:
                    "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_amd64.AppImage",
                  size: 81_800_000,
                },
                {
                  nombre: "StarSeed.OS_2026.11.05_amd64.deb",
                  browser_download_url:
                    "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_amd64.deb",
                  size: 3_774_874,
                },
                {
                  nombre: "StarSeed.OS_2026.11.05-1.x86_64.rpm",
                  browser_download_url:
                    "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05-1.x86_64.rpm",
                  size: 3_774_874,
                },
                {
                  nombre: "StarSeed-os-2026.11.05.apk",
                  browser_download_url:
                    "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed-os-2026.11.05.apk",
                  size: 28_665_472,
                },
              ],
            },
          }),
          {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "public, max-age=600",
            },
          },
        );
      }
      return new Response(null, { status: 404 });
    },
  );
});

afterAll(() => {
  vi.restoreAllMocks();
});

import { VersionesOs } from "../versiones-os";
import { AppearanceProvider } from "@/context/appearance-context";

describe("VersionesOs - fetch mock", () => {
  it("muestra la versión instalada y la nueva disponible con Actualizar", async () => {
    const vista = render(
      <AppearanceProvider>
        <VersionesOs />
      </AppearanceProvider>
    );

    await waitFor(() => {
      const instalada = screen.getByText("2026.10.09");
      expect(instalada).toBeInTheDocument();
    });

    await waitFor(() => {
      const versionNueva = screen.getByText("2026.11.05");
      expect(versionNueva).toBeInTheDocument();
    });

    await waitFor(() => {
      const botonActualizar = screen.getByRole("button", {
        name: "Actualizar",
      });
      expect(botonActualizar).toBeInTheDocument();
    });

    vista.unmount();
  });

  it("muestra el historial de versiones", async () => {
    const vista = render(
      <AppearanceProvider>
        <VersionesOs />
      </AppearanceProvider>
    );

    await waitFor(() => {
      const historial = screen.getByText("Historial de versiones");
      expect(historial).toBeInTheDocument();
    });

    await waitFor(() => {
      const notaActualizacion = screen.getByText("Actualización de seguridad");
      expect(notaActualizacion).toBeInTheDocument();
    });

    vista.unmount();
  });

  it("muestra los archivos por sistema con tamaño y enlace", async () => {
    const vista = render(
      <AppearanceProvider>
        <VersionesOs />
      </AppearanceProvider>
    );

    await waitFor(() => {
      const dmgLink = screen.getByRole("link", {
        name: /StarSeed\.OS_2026\.11\.05_universal\.dmg/,
      });
      expect(dmgLink).toBeInTheDocument();
    });

    await waitFor(() => {
      const exeLink = screen.getByRole("link", {
        name: /StarSeed\.OS_2026\.11\.05_x64-setup\.exe/,
      });
      expect(exeLink).toBeInTheDocument();
    });

    await waitFor(() => {
      const tamanoKB = screen.getByText("7.0 MB");
      expect(tamanoKB).toBeInTheDocument();
    });

    vista.unmount();
  });

  it("muestra estado de carga inicialmente", async () => {
    const vista = render(
      <AppearanceProvider>
        <VersionesOs />
      </AppearanceProvider>
    );

    await waitFor(() => {
      const loadingText = screen.getByText("Cargando información de versiones…");
      expect(loadingText).toBeInTheDocument();
    });

    vista.unmount();
  });
});