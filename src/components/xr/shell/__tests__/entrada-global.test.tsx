import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { ResultadoCapacidadesXR } from "../use-capacidades-xr";
import type { DatosNavegador } from "@/lib/xr/capacidades";
import { evaluarCapacidades, planificarEntrada } from "@/lib/xr/capacidades";
import { useCapacidadesXR } from "../use-capacidades-xr";
import { DATOS_SIN_SONDEO } from "../sondeo-navegador";
import { EntradaGlobalXR } from "../entrada-global";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

vi.mock("../use-capacidades-xr");
const usarHook = vi.mocked(useCapacidadesXR);

function crearResultado(
  modos: { vr?: boolean; ar?: boolean; tieneXR?: boolean; webgl2?: boolean } = {}
): ResultadoCapacidadesXR {
  const datos: DatosNavegador = {
    ...DATOS_SIN_SONDEO,
    ua: "Mozilla/5.0 (X11; Linux x86_64) OculusBrowser/38.0 Chrome/134.0",
    seguro: true,
    tieneXR: true,
    webgl2: true,
    ...modos,
  };
  const capacidades = evaluarCapacidades(datos);
  return { estado: "listo", datos, capacidades, plan: planificarEntrada(capacidades, { instalada: false }) };
}

describe("EntradaGlobalXR", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("es invisible si no hay modos inmersivos disponibles", () => {
    pathname = "/";
    usarHook.mockReturnValue(crearResultado({ vr: false, ar: false }));
    render(<EntradaGlobalXR />);
    expect(screen.queryByTestId("boton-entrada-xr")).toBeNull();
  });

  it("es invisible en /genesis", () => {
    pathname = "/genesis";
    usarHook.mockReturnValue(crearResultado({ vr: true, ar: true }));
    render(<EntradaGlobalXR />);
    expect(screen.queryByTestId("boton-entrada-xr")).toBeNull();
  });

  it("es invisible en /xr/os", () => {
    pathname = "/xr/os";
    usarHook.mockReturnValue(crearResultado({ vr: true, ar: true }));
    render(<EntradaGlobalXR />);
    expect(screen.queryByTestId("boton-entrada-xr")).toBeNull();
  });

  it("es visible cuando hay modo inmersivo disponible", () => {
    pathname = "/";
    usarHook.mockReturnValue(crearResultado({ vr: true }));
    render(<EntradaGlobalXR />);
    expect(screen.getByTestId("boton-entrada-xr")).toBeTruthy();
  });

  it("oculta el botón al pulsar la X y persiste en localStorage", () => {
    pathname = "/";
    usarHook.mockReturnValue(crearResultado({ vr: true }));
    render(<EntradaGlobalXR />);
    const botonOcultar = screen.getByRole("button", { name: "Ocultar botón de XR" });
    expect(botonOcultar).toBeTruthy();
    botonOcultar.click();
    expect(localStorage.getItem("starseed.xr.boton.oculto.v1")).toBe("true");
  });

  it("no se muestra si está ocultado en localStorage", () => {
    pathname = "/";
    localStorage.setItem("starseed.xr.boton.oculto.v1", "true");
    usarHook.mockReturnValue(crearResultado({ vr: true }));
    render(<EntradaGlobalXR />);
    expect(screen.queryByTestId("boton-entrada-xr")).toBeNull();
  });

  it("el archivo no importa three ni uikit ni rapier", async () => {
    const fs = await import("node:fs");
    const codigoEntrada = fs.readFileSync("/home/runner/work/_temp/starseed-wt/XR1010F/src/components/xr/shell/entrada-global.tsx", "utf8");
    const codigoBoton = fs.readFileSync("/home/runner/work/_temp/starseed-wt/XR1010F/src/components/xr/shell/boton-entrada-xr.tsx", "utf8");
    for (const codigo of [codigoEntrada, codigoBoton]) {
      expect(codigo).not.toMatch(/from ["']three["']/);
      expect(codigo).not.toMatch(/from ["']@react-three\//);
      expect(codigo).not.toMatch(/from ["']@pmndrs\/uikit["']/);
      expect(codigo).not.toMatch(/from ["']@dimforge\//);
    }
  });
});