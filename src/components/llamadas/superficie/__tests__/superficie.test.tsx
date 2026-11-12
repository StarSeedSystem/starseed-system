// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  it("«Medio» con el motor: un selector por flujo que fuerza el carril y vuelve a automático", () => {
    const forzar = vi.fn();
    const carriles = {
      carriles: () => [{ parId: "p", voz: "ble-l2cap", video: "ble-l2cap", pantalla: "ble-l2cap", senal: "ble-l2cap", datos: "ble-l2cap", forzados: {}, texto: "", director: true }],
      estado: () => ({ participantes: [] }),
      forzarCarril: forzar,
    };
    abrir(conectada(), { carriles });
    fireEvent.click(screen.getByRole("tab", { name: /Medio/ }));
    // Ahora usa radio buttons en lugar de select nativo
    const rgVideo = screen.getByRole("radiogroup", { name: /Carril de vídeo/ });
    expect(rgVideo).toBeTruthy();
    fireEvent.click(within(rgVideo).getByRole("radio", { name: /Bluetooth rápido/ }));
    expect(forzar).toHaveBeenCalledWith("video", "ble-l2cap");
    fireEvent.click(within(rgVideo).getByRole("radio", { name: /Automático/ }));
    expect(forzar).toHaveBeenLastCalledWith("video", null);
    expect(screen.getByRole("radiogroup", { name: /Carril de voz/ })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: /Carril de pantalla/ })).toBeTruthy();
  });
  it("la ventana flotante lleva un alto máximo con las zonas seguras (nunca más alta que lo visible)", () => {
    abrir(conectada());
    const sec = screen.getByTestId("superficie-llamada");
    expect(sec.getAttribute("style") ?? "").toMatch(/max-height: calc\(100dvh/);
  });

  it("el alto máximo descuenta la altura del dock para que los controles no queden tapados", () => {
    abrir(conectada());
    const sec = screen.getByTestId("superficie-llamada");
    const style = sec.getAttribute("style") ?? "";
    expect(style).toMatch(/max-height: calc\(100dvh/);
    expect(style).toMatch(/var\(--dock-height/);
  });

  it("el botón de cámara NO está deshabilitado en una videollamada conectada", () => {
    const a: AccionesLlamada = { colgar: vi.fn(), alternarCamara: vi.fn() };
    const v = base({ estado: "conectada", desde: Date.now(), tipo: "video", camara: true });
    render(<SuperficieLlamada vista={v} acciones={a} tamanoInicial="panel" />);
    const btnCamara = screen.getByRole("button", { name: /Apagar c.mara/ });
    expect(btnCamara.disabled).toBe(false);
  });

  it("el botón de cámara SÍ está deshabilitado cuando no hay cámara disponible en la llamada", () => {
    const a: AccionesLlamada = { colgar: vi.fn(), alternarCamara: vi.fn() };
    const v = base({ estado: "conectada", desde: Date.now(), tipo: "voz", camara: false, motivos: { camara: "esta llamada no lleva cámara" } });
    render(<SuperficieLlamada vista={v} acciones={a} tamanoInicial="panel" />);
    const btnCamara = screen.getByRole("button", { name: /Encender c.mara/ });
    expect(btnCamara.disabled).toBe(true);
  });

  it("muestra aviso cuando la cámara local está encendida pero no envía vídeo", () => {
    const a: AccionesLlamada = { colgar: vi.fn() };
    const mockTrack = {
      readyState: 'live',
      muted: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const localStream = { getVideoTracks: () => [mockTrack] } as unknown as MediaStream;
    const v = base({ estado: "conectada", desde: Date.now(), tipo: "video", camara: true, local: localStream });
    render(<SuperficieLlamada vista={v} acciones={a} tamanoInicial="panel" />);
    expect(screen.getByText(/C.mara encendida sin imagen/)).toBeTruthy();
  });

  it("la pestaña Medio usa selectores personalizados (no select nativo) para elegir carriles", () => {
    const forzar = vi.fn();
    const carriles = {
      carriles: () => [{ parId: "p", voz: "ble-l2cap", video: "ble-l2cap", pantalla: "ble-l2cap", senal: "ble-l2cap", datos: "ble-l2cap", forzados: {}, texto: "", director: true }],
      estado: () => ({ participantes: [] }),
      forzarCarril: forzar,
    };
    const v = base({ estado: "conectada", desde: Date.now(), tipo: "video", textoMedio: "Voz por Bluetooth directo · cifrada", textoCarriles: "Voz: Bluetooth · Vídeo: Bluetooth" });
    const a: AccionesLlamada = { colgar: vi.fn() };
    render(<SuperficieLlamada vista={v} acciones={a} tamanoInicial="panel" carriles={carriles} />);
    fireEvent.click(screen.getByRole("tab", { name: /Medio/ }));
    expect(screen.queryByRole("combobox")).toBeNull();
    const rgVideo = screen.getByRole("radiogroup", { name: /Carril de vídeo/ });
    expect(rgVideo).toBeTruthy();
    expect(within(rgVideo).getByRole("radio", { name: /Automático/ })).toBeTruthy();
    expect(within(rgVideo).getByRole("radio", { name: /Bluetooth rápido/ })).toBeTruthy();
  });
});
