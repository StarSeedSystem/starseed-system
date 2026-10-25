import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// El motor 3D no corre en jsdom; la página raíz tiene que redirigir sin esperarlo.
const crear = vi.hoisted(() => vi.fn((..._a: unknown[]): unknown => null));
vi.mock("@/lib/protomolecula/orbe4d/motor", () => ({ crearMotor: crear }));
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import Home from "../page";
import { CLAVE_PANTALLA_INICIAL } from "@/lib/inicio/pantalla-inicial";

describe("página raíz · «Abriendo StarSeed…»", () => {
  beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); });
  afterEach(() => { cleanup(); window.localStorage.clear(); });

  it("redirige a la pantalla inicial EN EL MISMO MOMENTO de montar, sin esperar a la animación 3D", () => {
    render(<Home />);
    // Nada de esperas: el efecto de montaje ya ha pedido la ruta y el motor 3D aún no se ha tocado.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(crear).not.toHaveBeenCalled();
  });

  it("respeta la pantalla inicial elegida (escritorios)", () => {
    window.localStorage.setItem(CLAVE_PANTALLA_INICIAL, JSON.stringify({ v: 1, perfiles: { local: { tipo: "escritorios" } }, neuronas: {} }));
    render(<Home />);
    expect(replace).toHaveBeenCalledWith("/escritorios");
  });

  it("mientras tanto pinta la carga nueva: el símbolo de StarSeed en su esfera, no la bola de degradado", () => {
    const { container } = render(<Home />);
    expect(screen.getByRole("status", { name: "Abriendo StarSeed" })).toBeTruthy();
    expect(screen.getByText("Abriendo StarSeed…")).toBeTruthy();
    expect(screen.getByAltText("StarSeed")).toBeTruthy();
    expect(screen.getByTestId("carga-respaldo")).toBeTruthy();
    expect(screen.getByTestId("carga-esfera")).toBeTruthy();
    // La bola de antes (un `span` con degradado radial y `ss-respirar` de 5rem) ya no está.
    expect(container.querySelector("span.size-20")).toBeNull();
    expect(container.querySelector("[style*='radial-gradient(circle at 35% 30%, #ffffffaa']")).toBeNull();
  });
});
