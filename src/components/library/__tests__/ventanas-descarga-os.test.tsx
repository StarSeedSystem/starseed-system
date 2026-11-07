import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DispositivoParaInstalar, ReleaseOficial } from "@/lib/apps-oficiales/apps-oficiales";

const BASE = "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0";
const asset = (nombre: string, mb: number) => ({ nombre, url: `${BASE}/${nombre}`, bytes: mb * 1024 * 1024 });

const est = vi.hoisted(() => ({
  dispositivo: { sistema: "macos", arquitectura: "arm64" } as DispositivoParaInstalar,
  release: null as unknown as ReleaseOficial | null,
  cargando: false,
  origen: "github" as "github" | "cache" | "respaldo",
}));

vi.mock("@/lib/apps-oficiales/ultima-version", () => ({
  useUltimaVersion: (id: string) =>
    id
      ? { release: est.release, instalables: [], origen: est.origen, cargando: est.cargando }
      : { release: null, instalables: [], origen: "respaldo", cargando: false },
  obtenerUltimaVersion: async () => null,
}));

vi.mock("@/lib/apps-oficiales/dispositivo-actual", () => ({
  useDispositivoActual: () => est.dispositivo,
  esAppNativa: () => false,
}));

import { VentanasDescargaOS, extensionDe } from "../ventanas-descarga-os";
import { SimboloStarSeed } from "../simbolo-starseed";

beforeEach(() => {
  est.release = {
    tag: "v0.3.0",
    publicado: "2026-10-01T10:00:00Z",
    url: "",
    assets: [
      asset("StarSeed.OS_0.3.0_universal.dmg", 30),
      asset("StarSeed.OS_0.3.0_x64-setup.exe", 8),
      asset("StarSeed.OS_0.3.0_x64_en-US.msi", 9),
      asset("StarSeed.OS_0.3.0_amd64.AppImage", 80),
      asset("StarSeed.OS_0.3.0_amd64.deb", 4),
      asset("StarSeed-os-0.3.0.apk", 12),
      asset("StarSeed.Nexus_0.3.0_universal.dmg", 30),
      asset("StarSeed-nexus-0.3.0.apk", 12),
    ],
  };
  est.dispositivo = { sistema: "macos", arquitectura: "arm64" };
  est.cargando = false;
  est.origen = "github";
});

afterEach(() => cleanup());

describe("VentanasDescargaOS", () => {
  it("una ventana por sistema, cada una con el símbolo de StarSeed, versión, tamaño y su botón", () => {
    render(<VentanasDescargaOS />);
    for (const s of ["macos", "windows", "linux", "android", "ios"]) {
      const v = screen.getByTestId(`ventana-os-${s}`);
      expect(within(v).getByTestId("simbolo-starseed")).toBeInTheDocument();
    }
    expect(screen.getByText("StarSeed OS v0.3.0 · publicada el 1 de octubre de 2026")).toBeInTheDocument();

    const mac = screen.getByTestId("ventana-os-macos");
    expect(within(mac).getByRole("heading", { name: "macOS" })).toBeInTheDocument();
    expect(mac.textContent).toContain("30 MB");
    expect(mac.textContent).toContain("Universal (Apple Silicon e Intel)");
    const descargar = within(mac).getByRole("link", { name: "Descargar .dmg para macOS" });
    expect(descargar.getAttribute("href")).toBe(`${BASE}/StarSeed.OS_0.3.0_universal.dmg`);
    expect(descargar.getAttribute("download")).toBe("StarSeed.OS_0.3.0_universal.dmg");

    // Nunca los archivos de Nexus ni de Café.
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => /Nexus|nexus/.test(h))).toBe(false);
    expect(hrefs).toContain("https://github.com/StarSeedSystem/starseed-system/releases/latest");
  });

  it("destaca como recomendado el sistema de este dispositivo (y solo ese)", () => {
    render(<VentanasDescargaOS />);
    const recomendadas = document.querySelectorAll('[data-recomendada="si"]');
    expect(recomendadas).toHaveLength(1);
    expect(recomendadas[0].getAttribute("data-testid")).toBe("ventana-os-macos");
    expect(within(recomendadas[0] as HTMLElement).getByText("Recomendada para este dispositivo")).toBeInTheDocument();
  });

  it("el sistema de este dispositivo va primero y los demás conservan su orden", () => {
    est.dispositivo = { sistema: "linux", arquitectura: "x64" };
    render(<VentanasDescargaOS />);
    const orden = Array.from(document.querySelectorAll('[data-testid^="ventana-os-"]')).map((n) => n.getAttribute("data-testid"));
    expect(orden).toEqual(["ventana-os-linux", "ventana-os-macos", "ventana-os-windows", "ventana-os-android", "ventana-os-ios"]);
  });

  it("en un iPhone la ventana de iOS va primero", () => {
    est.dispositivo = { sistema: "ios", arquitectura: "arm64" };
    render(<VentanasDescargaOS />);
    const primera = document.querySelector('[data-testid^="ventana-os-"]');
    expect(primera?.getAttribute("data-testid")).toBe("ventana-os-ios");
  });

  it("en un iPhone recomienda la web instalable con los pasos de Safari", () => {
    est.dispositivo = { sistema: "ios", arquitectura: "arm64" };
    render(<VentanasDescargaOS />);
    const ios = screen.getByTestId("ventana-os-ios");
    expect(ios.getAttribute("data-recomendada")).toBe("si");
    expect(ios.textContent).toContain("Añadir a pantalla de inicio");
    expect(within(ios).getByRole("link", { name: /Abrir la web oficial/ }).getAttribute("href")).toBe("https://starseed-os.vercel.app");
  });

  it("las alternativas de cada sistema quedan en segundo plano bajo el botón principal", () => {
    render(<VentanasDescargaOS />);
    const win = screen.getByTestId("ventana-os-windows");
    expect(within(win).getByRole("link", { name: "Descargar .exe para Windows" })).toBeInTheDocument();
    const msi = within(win).getByRole("link", { name: /\.msi · 9 MB/ });
    expect(msi.getAttribute("href")).toBe(`${BASE}/StarSeed.OS_0.3.0_x64_en-US.msi`);
    const linux = screen.getByTestId("ventana-os-linux");
    expect(within(linux).getByRole("link", { name: "Descargar AppImage para Linux" })).toBeInTheDocument();
    expect(linux.textContent).toContain("También:");
  });

  it("mientras busca la versión enseña el esqueleto con la forma final", () => {
    est.release = null;
    est.cargando = true;
    render(<VentanasDescargaOS />);
    const seccion = screen.getByTestId("ventanas-descarga-os");
    expect(seccion.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Buscando la última versión publicada…")).toBeInTheDocument();
    expect(screen.queryByTestId("ventana-os-macos")).toBeNull();
  });

  it("sin archivos publicados lo dice y ofrece la web y GitHub", () => {
    render(<VentanasDescargaOS release={null} />);
    const vacio = screen.getByTestId("ventanas-descarga-vacias");
    expect(vacio.textContent).toContain("Aún no hay archivos publicados");
    expect(within(vacio).getByRole("link", { name: /Abrir la web oficial/ })).toBeInTheDocument();
    expect(within(vacio).getByRole("link", { name: /Ver versiones en GitHub/ })).toBeInTheDocument();
  });

  it("sin conexión con GitHub avisa de que es la última versión conocida", () => {
    est.origen = "respaldo";
    render(<VentanasDescargaOS />);
    expect(screen.getByRole("note").textContent).toContain("última versión conocida");
  });

  it("extensionDe nombra los formatos como la gente", () => {
    expect(extensionDe("a_universal.dmg")).toBe(".dmg");
    expect(extensionDe("a_amd64.AppImage")).toBe("AppImage");
    expect(extensionDe("a.tar.gz")).toBe(".tar.gz");
    expect(extensionDe("sin-extension")).toBe("archivo");
  });
});

describe("SimboloStarSeed", () => {
  it("usa la versión cuadrada en tamaños pequeños, con texto alternativo «StarSeed»", () => {
    render(<SimboloStarSeed size={40} />);
    const img = screen.getByAltText("StarSeed");
    expect(img.getAttribute("src")).toMatch(/starseed-symbol-square\.png/);
    expect(img.getAttribute("width")).toBe("40");
    expect(img.getAttribute("height")).toBe("40");
  });

  it("en grande usa el original vertical sin deformarlo (proporción 1000×1497)", () => {
    render(<SimboloStarSeed size={300} />);
    const img = screen.getByAltText("StarSeed");
    expect(img.getAttribute("src")).toMatch(/starseed-symbol\.png/);
    expect(img.getAttribute("width")).toBe(String(Math.round((300 * 1000) / 1497)));
    expect(img.getAttribute("height")).toBe("300");
  });

  it("decorativo: el lector de pantalla no lo repite", () => {
    render(<SimboloStarSeed decorativo />);
    expect(screen.queryByAltText("StarSeed")).toBeNull();
    expect(screen.getByTestId("simbolo-starseed").querySelector("img")?.getAttribute("alt")).toBe("");
  });
});
