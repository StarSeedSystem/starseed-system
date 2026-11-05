import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

describe("VersionesOs - fetch mock", () => {
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

  it("muestra la versión instalada y la nueva disponible con Actualizar", async () => {
    const vista = render(<VersionesOs />);
    const instalada = screen.getByText("2026.10.09");
    expect(instalada).toBeInTheDocument();

    const versionNueva = screen.getByText("2026.11.05");
    expect(versionNueva).toBeInTheDocument();

    const botonActualizar = screen.getByRole("button", {
      name: "Actualizar",
    });
    expect(botonActualizar).toBeInTheDocument();

    vista.unmount();
  });

  it("muestra el historial de versiones", async () => {
    const vista = render(<VersionesOs />);
    const historial = screen.getByText("Historial de versiones");
    expect(historial).toBeInTheDocument();

    const notaActualizacion = screen.getByText("Actualización de seguridad");
    expect(notaActualizacion).toBeInTheDocument();

    vista.unmount();
  });

  it("muestra los archivos por sistema con tamaño y enlace", async () => {
    const vista = render(<VersionesOs />);

    const dmgLink = screen.getByRole("link", {
      name: /StarSeed\.OS_2026\.11\.05_universal\.dmg/,
    });
    expect(dmgLink).toBeInTheDocument();

    const exeLink = screen.getByRole("link", {
      name: /StarSeed\.OS_2026\.11\.05_x64-setup\.exe/,
    });
    expect(exeLink).toBeInTheDocument();

    const tamanoKB = screen.getByText("7.0 MB");
    expect(tamanoKB).toBeInTheDocument();

    vista.unmount();
  });

  it("muestra estado mientras fetch resuelve", async () => {
    const vista = render(<VersionesOs />);
    const glassCards = screen.getAllByRole("article");
    expect(glassCards.length).toBeGreaterThan(0);
    vista.unmount();
  });
});