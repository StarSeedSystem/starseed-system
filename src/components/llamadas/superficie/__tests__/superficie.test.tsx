// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SuperficieLlamada } from "../superficie-llamada";
import type { AccionesLlamada, VistaLlamada } from "@/lib/llamadas/superficie/vista";
import { aplicarAviso, GRABACION_INICIAL } from "@/lib/llamadas/superficie/grabacion";

vi.mock("@/lib/nativa/puente", () => ({ esAppNativa: () => false, puenteNativo: () => ({ llamar: vi.fn() }) }));
afterEach(cleanup);

const base = (o: Partial<VistaLlamada> = {}): VistaLlamada => ({
  estado: "entrante", tipo: "voz", nombre: "Ana Pérez", yo: "yo", desde: null, local: null, remoto: null, micro: true, camara: false, compartiendoPantalla: false, ...o,
});

describe("SuperficieLlamada (LLA1108C)", () => {
  it("entrante: alertdialog con Contestar y Rechazar que llaman al motor", () => {
    const a: AccionesLlamada = { contestar: vi.fn(), rechazar: vi.fn() };
    render(<SuperficieLlamada vista={base()} acciones={a} />);
    expect(screen.getByRole("alertdialog", { name: /Ana Pérez te llama/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Contestar" }));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(a.contestar).toHaveBeenCalled();
    expect(a.rechazar).toHaveBeenCalled();
  });
  it("conectada: burbuja ↔ panel ↔ pantalla completa, y Esc sale", () => {
    const a: AccionesLlamada = { colgar: vi.fn(), alternarMicro: vi.fn() };
    const v = base({ estado: "conectada", desde: Date.now() });
    const { rerender } = render(<SuperficieLlamada vista={base()} acciones={a} />);
    rerender(<SuperficieLlamada vista={v} acciones={a} />);
    const sec = () => screen.getByTestId("superficie-llamada");
    expect(sec().dataset.tamano).toBe("burbuja");
    fireEvent.keyDown(sec(), { key: "Enter" });
    expect(sec().dataset.tamano).toBe("panel");
    fireEvent.click(screen.getByRole("button", { name: "Pantalla completa" }));
    expect(sec().dataset.tamano).toBe("pantalla-completa");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(sec().dataset.tamano).toBe("panel");
    fireEvent.click(screen.getByRole("button", { name: "Colgar" }));
    expect(a.colgar).toHaveBeenCalled();
  });
  it("sin acción el botón queda desactivado (no hay botones muertos)", () => {
    const { rerender } = render(<SuperficieLlamada vista={base()} acciones={{}} />);
    rerender(<SuperficieLlamada vista={base({ estado: "conectada", desde: Date.now() })} acciones={{ colgar: vi.fn() }} />);
    fireEvent.keyDown(screen.getByTestId("superficie-llamada"), { key: "Enter" });
    expect((screen.getByRole("button", { name: "Poner en espera" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("radio", { name: "Vídeo" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("indicador rojo «Grabando» visible en cualquier tamaño cuando graba otro", () => {
    const g = aplicarAviso(GRABACION_INICIAL, { k: "grabacion", id: "1", de: "tablet", nombre: "Tablet", activa: true, en: 1 });
    const { rerender } = render(<SuperficieLlamada vista={base()} acciones={{}} />);
    rerender(<SuperficieLlamada vista={base({ estado: "conectada", desde: 1, grabacion: g })} acciones={{ colgar: vi.fn() }} />);
    expect(screen.getByTestId("indicador-grabando").textContent).toContain("Grabando");
    expect(screen.getByTestId("indicador-grabando").textContent).toContain("Tablet está grabando");
  });
  it("terminada: resumen con duración y medio, y Cerrar descarta", () => {
    const { rerender } = render(<SuperficieLlamada vista={base({ estado: "saliente" })} acciones={{}} />);
    rerender(<SuperficieLlamada vista={base({ estado: "conectada", desde: Date.now() - 5000 })} acciones={{}} />);
    rerender(<SuperficieLlamada vista={base({ estado: "terminada", fin: "colgada", medioUsado: "enlace local" })} acciones={{}} />);
    expect(screen.getByText(/por enlace local/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByTestId("superficie-llamada")).toBeNull();
  });
});
