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

describe("SuperficieLlamada · LLA1111A (Puertos, estado una vez, carriles, alto máximo)", () => {
  const conectada = (o: Partial<VistaLlamada> = {}) => base({ estado: "conectada", desde: Date.now(), tipo: "video", textoMedio: "Voz por Bluetooth directo · cifrada", textoCarriles: "Voz: Bluetooth · Vídeo: Bluetooth", ...o });
  const abrir = (v: VistaLlamada, extra: Record<string, unknown> = {}) => {
    const a: AccionesLlamada = { colgar: vi.fn() };
    render(<SuperficieLlamada vista={v} acciones={a} tamanoInicial="panel" {...extra} />);
  };
  it("el botón se llama «Puertos» (y su panel también); ya no hay «Calidad»", () => {
    abrir(conectada());
    expect(screen.queryByRole("tab", { name: /Calidad/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Puertos/ }));
    expect(screen.getByRole("tabpanel", { name: "Puertos" })).toBeTruthy();
  });
  it("con «Medio» abierto la línea de estado sale una sola vez", () => {
    abrir(conectada());
    fireEvent.click(screen.getByRole("tab", { name: /Medio/ }));
    const sec = screen.getByTestId("superficie-llamada");
    expect(sec.textContent?.split("Voz por Bluetooth directo · cifrada").length).toBe(2);
    expect(sec.textContent?.split("Voz: Bluetooth · Vídeo: Bluetooth").length).toBe(2);
  });
  it("«Medio» con el motor: botones por flujo (sin menús nativos) que fuerzan el carril y vuelven a automático", () => {
    const forzar = vi.fn();
    const carriles = {
      carriles: () => [{ parId: "p", voz: "ble-l2cap", video: "ble-l2cap", pantalla: "ble-l2cap", senal: "ble-l2cap", datos: "ble-l2cap", forzados: {}, texto: "", director: true }],
      estado: () => ({ participantes: [] }),
      forzarCarril: forzar,
    };
    abrir(conectada(), { carriles });
    fireEvent.click(screen.getByRole("tab", { name: /Medio/ }));
    // LLA1112B: ningún <select>; cada flujo es un grupo de radios con «Automático» primero y marcado.
    expect(document.querySelectorAll("[data-carriles-flujo] select").length).toBe(0);
    const grupo = screen.getByRole("radiogroup", { name: "Carril de vídeo" });
    const radios = [...grupo.querySelectorAll('[role="radio"]')] as HTMLButtonElement[];
    expect(radios.map((r) => r.textContent)).toEqual(["Automático", "Bluetooth rápido"]);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(radios[1]);
    expect(forzar).toHaveBeenCalledWith("video", "ble-l2cap");
    fireEvent.click(radios[0]);
    expect(forzar).toHaveBeenLastCalledWith("video", null);
    // Teclado: la flecha mueve la elección.
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(forzar).toHaveBeenLastCalledWith("video", "ble-l2cap");
    fireEvent.keyDown(radios[1], { key: "Home" });
    expect(forzar).toHaveBeenLastCalledWith("video", null);
    expect(screen.getByRole("radiogroup", { name: "Carril de voz" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Carril de pantalla" })).toBeTruthy();
  });
  it("la ventana flotante lleva un alto máximo con las zonas seguras (nunca más alta que lo visible)", () => {
    abrir(conectada());
    const sec = screen.getByTestId("superficie-llamada");
    expect(sec.getAttribute("style") ?? "").toMatch(/max-height: calc\(100dvh/);
  });
});

describe("SuperficieLlamada · LLA1112B (botón de cámara y zona de la ventana)", () => {
  const conectada = (o: Partial<VistaLlamada> = {}) => base({ estado: "conectada", desde: Date.now(), ...o });
  const abrirPanel = () => fireEvent.keyDown(screen.getByTestId("superficie-llamada"), { key: "Enter" });

  it("con acción de cámara: dice lo que hace y funciona", () => {
    const a: AccionesLlamada = { alternarCamara: vi.fn() };
    render(<SuperficieLlamada vista={conectada({ tipo: "video", camara: true })} acciones={a} />);
    abrirPanel();
    fireEvent.click(screen.getByRole("button", { name: "Apagar cámara" }));
    expect(a.alternarCamara).toHaveBeenCalled();
  });
  it("sin acción de cámara en una llamada de voz: explica cómo añadir vídeo (no «no lleva cámara»)", () => {
    render(<SuperficieLlamada vista={conectada({ tipo: "voz" })} acciones={{}} />);
    abrirPanel();
    const b = screen.getByRole("button", { name: /cámara/i });
    expect(b.getAttribute("title") ?? "").toMatch(/para añadir vídeo pulsa «Vídeo» o «Encender cámara»/);
    expect(b.getAttribute("title") ?? "").not.toMatch(/no lleva cámara/);
  });
  it("la ventana se registra como zona de llamada mientras está montada", async () => {
    const { hayVentanaLlamada } = await import("@/lib/llamadas/superficie/zona-llamada");
    const { unmount } = render(<SuperficieLlamada vista={conectada()} acciones={{}} />);
    expect(hayVentanaLlamada()).toBe(true);
    expect(screen.getByTestId("superficie-llamada").hasAttribute("data-ventana-llamada")).toBe(true);
    unmount();
    expect(hayVentanaLlamada()).toBe(false);
  });
});
