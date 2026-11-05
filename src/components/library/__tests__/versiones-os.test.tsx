import { render, screen, waitFor, act, RenderOptions } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import React, { ReactNode, useState } from "react";
import { ThemeProvider } from "next-themes";
import { AppearanceProvider } from "@/context/appearance-context";
import { defaultConfig } from "@/context/appearance-context";

// Mock next/navigation for useSearchParams y usePathname - MUST be before component import
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/" }));

// Mock window.matchMedia for next-themes
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Mock localStorage for AppearanceProvider
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock liquid-glass-react to avoid issues in test environment
vi.mock("liquid-glass-react", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="liquid-glass">{children}</div>,
}));

// Mock fetch global antes de cada test - MUST be before component import
const MOCK_VERSIONS_RESPONSE = {
  versiones: [
    {
      version: "v2026.11.05",
      fecha: "2026-11-05",
      notas: "Actualización de seguridad y nuevas features",
      url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v2026.11.05",
      archivos: {
        os: {
          macos: [
            {
              nombre: "StarSeed.OS_2026.11.05_universal.dmg",
              browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_universal.dmg",
              size: 7_025_536,
              href: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_universal.dmg",
              bytes: 7_025_536,
            },
          ],
          windows: [
            {
              nombre: "StarSeed.OS_2026.11.05_x64-setup.exe",
              browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_x64-setup.exe",
              size: 2_516_582,
              href: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_x64-setup.exe",
              bytes: 2_516_582,
            },
            {
              nombre: "StarSeed.OS_2026.11.05_x64_en-US.msi",
              browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_x64_en-US.msi",
              size: 3_460_352,
              href: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_x64_en-US.msi",
              bytes: 3_460_352,
            },
          ],
          linux: [
            {
              nombre: "StarSeed.OS_2026.11.05_amd64.AppImage",
              browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_amd64.AppImage",
              size: 81_800_000,
              href: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_amd64.AppImage",
              bytes: 81_800_000,
            },
            {
              nombre: "StarSeed.OS_2026.11.05_amd64.deb",
              browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_amd64.deb",
              size: 3_774_874,
              href: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05_amd64.deb",
              bytes: 3_774_874,
            },
            {
              nombre: "StarSeed.OS_2026.11.05-1.x86_64.rpm",
              browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05-1.x86_64.rpm",
              size: 3_774_874,
              href: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed.OS_2026.11.05-1.x86_64.rpm",
              bytes: 3_774_874,
            },
          ],
          android: [
            {
              nombre: "StarSeed-os-2026.11.05.apk",
              browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed-os-2026.11.05.apk",
              size: 28_665_472,
              href: "https://github.com/StarSeedSystem/starseed-system/releases/download/v2026.11.05/StarSeed-os-2026.11.05.apk",
              bytes: 28_665_472,
            },
          ],
          ios: [],
        },
      },
    },
  ],
  generadoEn: new Date().toISOString(),
};

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/os/versiones")) {
        return new Response(JSON.stringify(MOCK_VERSIONS_RESPONSE), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=600",
          },
        });
      }
      return new Response(null, { status: 404 });
    },
  );
});

afterAll(() => {
  vi.restoreAllMocks();
});

import { VersionesOs } from "../versiones-os";
import { formatearFechaISO, bytesAFormato, aplanarArchivosPorSO, procesarVersion } from "../versiones-os-logica";

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AppearanceProvider>{children}</AppearanceProvider>
    </ThemeProvider>
  );
}

function renderVersionesOs(options?: RenderOptions) {
  return render(<VersionesOs />, { wrapper: TestWrapper, ...options });
}

describe("VersionesOs - fetch mock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  it("muestra la versión instalada y la nueva disponible con Actualizar", async () => {
    const vista = renderVersionesOs();

    await waitFor(() => {
      const instalada = screen.getByText("2026.10.09");
      expect(instalada).toBeInTheDocument();
    });

    await waitFor(() => {
      const versionNueva = screen.getByText("v2026.11.05");
      expect(versionNueva).toBeInTheDocument();
    });

    await waitFor(() => {
      const botonActualizar = screen.getByRole("button", { name: "Actualizar" });
      expect(botonActualizar).toBeInTheDocument();
    });

    vista.unmount();
  });

  it("muestra el historial de versiones", async () => {
    const vista = renderVersionesOs();

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
    const vista = renderVersionesOs();

    await waitFor(() => {
      const dmgLink = screen.getByRole("link", { name: /StarSeed\.OS_2026\.11\.05_universal\.dmg/ });
      expect(dmgLink).toBeInTheDocument();
    });

    await waitFor(() => {
      const exeLink = screen.getByRole("link", { name: /StarSeed\.OS_2026\.11\.05_x64-setup\.exe/ });
      expect(exeLink).toBeInTheDocument();
    });

    await waitFor(() => {
      const tamanoMB = screen.getByText("7.0 MB");
      expect(tamanoMB).toBeInTheDocument();
    });

    vista.unmount();
  });

  it("muestra estado de carga inicialmente", async () => {
    const vista = renderVersionesOs();

    await waitFor(() => {
      const loadingText = screen.getByText("Cargando información de versiones…");
      expect(loadingText).toBeInTheDocument();
    });

    vista.unmount();
  });
});

describe("versiones-os-logica - funciones puras", () => {
  describe("formatearFechaISO", () => {
    it("formatea fecha ISO correctamente", () => {
      expect(formatearFechaISO("2026-11-05")).toBe("5 de nov de 2026");
      expect(formatearFechaISO("2026-01-15")).toBe("15 de ene de 2026");
      expect(formatearFechaISO("2026-12-31")).toBe("31 de dic de 2026");
    });

    it("maneja fechas inválidas", () => {
      expect(formatearFechaISO("")).toBe("—");
      expect(formatearFechaISO("invalida")).toBe("invalida");
      expect(formatearFechaISO("2026-13-45")).toBe("2026-13-45");
    });
  });

  describe("bytesAFormato", () => {
    it("convierte bytes a formato legible", () => {
      expect(bytesAFormato(500)).toBe("500 B");
      expect(bytesAFormato(1500)).toBe("1.5 KB");
      expect(bytesAFormato(2_500_000)).toBe("2.5 MB");
      expect(bytesAFormato(3_000_000_000)).toBe("3.0 GB");
    });
  });

  describe("aplanarArchivosPorSO", () => {
    it("aplana la estructura por SO a array plano con etiqueta de sistema", () => {
      const entrada = {
        macos: [{ nombre: "test.dmg", bytes: 1000, href: "http://test.dmg" }],
        windows: [{ nombre: "test.exe", bytes: 2000, href: "http://test.exe" }],
        linux: [{ nombre: "test.AppImage", bytes: 3000, href: "http://test.AppImage" }],
        android: [{ nombre: "test.apk", bytes: 4000, href: "http://test.apk" }],
        ios: [],
      };
      const resultado = aplanarArchivosPorSO(entrada);
      expect(resultado).toHaveLength(4);
      expect(resultado[0].sistema).toBe("macOS");
      expect(resultado[1].sistema).toBe("Windows");
      expect(resultado[2].sistema).toBe("Linux");
      expect(resultado[3].sistema).toBe("Android");
    });
  });

  describe("procesarVersion", () => {
    it("procesa una versión completa correctamente", () => {
      const version = {
        version: "v1.0.0",
        fecha: "2026-01-01",
        notas: "Notas de prueba",
        url: "http://example.com",
        archivos: {
          os: {
            macos: [{ nombre: "test.dmg", bytes: 1000, href: "http://test.dmg" }],
            windows: [],
            linux: [],
            android: [],
            ios: [],
          },
        },
      };
      const resultado = procesarVersion(version);
      expect(resultado.version).toBe("v1.0.0");
      expect(resultado.archivos).toHaveLength(1);
      expect(resultado.archivos[0].sistema).toBe("macOS");
    });
  });
});