import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const base = () => ({
  nativo: true,
  proxyLocal: 4000 as number | null,
  internetPor: { nombre: "Casa de Ana", enlace: "Bluetooth directo", saltos: 1 },
  puertas: [] as unknown[],
});
const puerta = vi.hoisted(() => ({ estado: {} as Record<string, unknown> }));
const nativo = vi.hoisted(() => ({ estado: null as unknown }));

vi.mock("@/lib/malla/puerta/servicio", () => ({
  estadoPuerta: () => puerta.estado,
  suscribirPuerta: () => () => undefined,
}));
vi.mock("@/lib/malla/puerta/proxy-nativo", async (orig) => {
  const m = await orig<typeof import("@/lib/malla/puerta/proxy-nativo")>();
  return { ...m, estadoProxyNativo: () => nativo.estado, suscribirProxyNativo: () => () => undefined };
});

import { IndicadorInternetMalla } from "../indicador-internet-malla";

afterEach(() => {
  cleanup();
  nativo.estado = null;
});

describe("IndicadorInternetMalla", () => {
  it("muestra «Internet por: …» mientras sale por una puerta", () => {
    puerta.estado = base();
    render(<IndicadorInternetMalla />);
    expect(screen.getByTestId("internet-por-navegador").textContent).toContain("Internet por: Casa de Ana (vía Bluetooth directo, 1 salto)");
  });

  it("no muestra nada sin proxy local", () => {
    puerta.estado = { ...base(), proxyLocal: null };
    render(<IndicadorInternetMalla />);
    expect(screen.queryByTestId("internet-por-navegador")).toBeNull();
  });

  it("muestra el motivo cuando la plataforma no puede", () => {
    puerta.estado = base();
    nativo.estado = { puerto: null, neurona: null, via: null, aplicado: false, soportado: false, plataforma: "windows", motivo: "Windows aún no admite proxy para el navegador de la app.", error: null, descargas: true };
    render(<IndicadorInternetMalla />);
    const t = screen.getByTestId("internet-por-navegador").textContent ?? "";
    expect(t).toContain("no puede salir por la malla");
    expect(t).toContain("Windows aún no admite");
  });
});
