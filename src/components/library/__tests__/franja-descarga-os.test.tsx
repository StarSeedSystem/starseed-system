import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Sin red en las pruebas: la versión viva de GitHub se sustituye por el respaldo.
vi.mock("@/lib/apps-oficiales/ultima-version", async () => {
  const real = await vi.importActual<typeof import("@/lib/apps-oficiales/apps-oficiales")>(
    "@/lib/apps-oficiales/apps-oficiales",
  );
  return {
    useUltimaVersion: (id: string) => {
      const app = real.APPS_OFICIALES[id];
      return app
        ? { release: app.respaldo, instalables: real.instalablesDeApp(id, app.respaldo.assets), origen: "respaldo", cargando: false }
        : { release: null, instalables: [], origen: "respaldo", cargando: false };
    },
    obtenerUltimaVersion: async () => null,
  };
});

import { FranjaDescargaOs } from "../franja-descarga-os";
import { AppearanceProvider } from "@/context/appearance-context";
import {
  OS_FECHA,
  OS_VERSION,
  formatearFechaBuild,
} from "@/lib/version/os-release";

describe("FranjaDescargaOs", () => {
  it("muestra la versión canónica y abre Información y versiones", () => {
    let aperturas = 0;
    const vista = render(
      <AppearanceProvider>
        <FranjaDescargaOs onAbrirFicha={() => { aperturas += 1; }} />
      </AppearanceProvider>,
    );
    const franja = screen.getByTestId("franja-descarga-os");

    expect(franja.textContent).toContain(OS_VERSION);
    expect(franja.textContent).toContain(formatearFechaBuild(OS_FECHA));
    expect(franja.textContent).not.toContain("2026.07.01");

    const boton = screen.getByRole("button", {
      name: "Información y versiones",
    });
    fireEvent.click(boton);
    expect(aperturas).toBe(1);

    vista.unmount();
  });

  it("enlaza los archivos nativos del release (solo del OS) y todas las versiones", () => {
    const vista = render(
      <AppearanceProvider>
        <FranjaDescargaOs onAbrirFicha={() => {}} />
      </AppearanceProvider>,
    );
    const franja = screen.getByTestId("franja-descarga-os");
    const hrefs = Array.from(franja.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => /StarSeed\.OS_.*_universal\.dmg$/.test(h))).toBe(true);
    expect(hrefs.some((h) => /StarSeed-os-.*\.apk$/.test(h))).toBe(true);
    expect(hrefs.some((h) => /Nexus|Cafe|nexus|cafe/.test(h))).toBe(false);
    expect(hrefs).toContain("https://github.com/StarSeedSystem/starseed-system/releases/latest");
    // El botón de un toque vive en la franja.
    expect(screen.getByTestId("boton-instalar-os")).toBeTruthy();
    vista.unmount();
  });
});
