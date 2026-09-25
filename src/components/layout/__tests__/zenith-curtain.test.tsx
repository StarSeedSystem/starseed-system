import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ZenithCurtain } from "../zenith-curtain";
import { usePerimeter } from "@/context/perimeter-context";

vi.mock("@/context/perimeter-context", () => ({
  usePerimeter: vi.fn(),
}));

vi.mock("@/components/exocortex/aurora-chat-section", () => ({
  AuroraChatSection: () => (
    <div data-testid="aurora-chat-section-mock">
      <button type="button" onClick={() => (window as unknown as { __enviado?: boolean }).__enviado = true}>Enviar</button>
    </div>
  ),
}));

let reloj = 1000;
const avanzar = (ms: number) => { reloj += ms; };
const puntero = (tipo: "mouse" | "touch", x: number, y: number) =>
  ({ pointerId: 1, pointerType: tipo, isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true });

function arrastrar(el: Element, tipo: "mouse" | "touch", desde: [number, number], hasta: [number, number], pasos = 8) {
  fireEvent.pointerDown(el, puntero(tipo, desde[0], desde[1]));
  for (let i = 1; i <= pasos; i++) {
    avanzar(16);
    fireEvent.pointerMove(el, puntero(tipo, desde[0] + ((hasta[0] - desde[0]) * i) / pasos, desde[1] + ((hasta[1] - desde[1]) * i) / pasos));
  }
  avanzar(16);
  fireEvent.pointerUp(el, puntero(tipo, hasta[0], hasta[1]));
}

function simularMovimientoReducido(reducido: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduced-motion") ? reducido : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ZenithCurtain (cortina superior · Exocortex)", () => {
  const setActiveEdge = vi.fn();
  const capturar = vi.fn();

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    reloj = 1000;
    simularMovimientoReducido(true);
    vi.mocked(usePerimeter).mockReturnValue({ activeEdge: "zenith", setActiveEdge });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() { return (this as HTMLElement).hasAttribute("data-trinity-curtain") ? 700 : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, writable: true, value: capturar });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, writable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, writable: true, value: () => {} });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  });

  it("la X («Cerrar Exocortex») cierra con un clic real y no captura el puntero", () => {
    vi.spyOn(performance, "now").mockImplementation(() => reloj);
    render(<ZenithCurtain />);
    const x = screen.getByRole("button", { name: "Cerrar Exocortex" });
    fireEvent.pointerDown(x, puntero("mouse", 900, 40));
    fireEvent.pointerUp(x, puntero("mouse", 900, 40));
    fireEvent.click(x);
    expect(capturar).not.toHaveBeenCalled();
    expect(setActiveEdge).toHaveBeenCalledWith(null);
  });

  it("los botones del chat reciben su clic (antes la capa de arrastre se lo robaba)", () => {
    vi.spyOn(performance, "now").mockImplementation(() => reloj);
    render(<ZenithCurtain />);
    const enviar = screen.getByRole("button", { name: "Enviar" });
    fireEvent.pointerDown(enviar, puntero("mouse", 300, 500));
    fireEvent.pointerUp(enviar, puntero("mouse", 300, 500));
    fireEvent.click(enviar);
    expect((window as unknown as { __enviado?: boolean }).__enviado).toBe(true);
    expect(capturar).not.toHaveBeenCalled();
  });

  it("arrastrar la cabecera hacia arriba más de un tercio cierra", () => {
    vi.spyOn(performance, "now").mockImplementation(() => reloj);
    render(<ZenithCurtain />);
    const cabecera = screen.getByRole("heading", { name: "Exocortex" });
    arrastrar(cabecera, "touch", [200, 600], [200, 200]);
    expect(setActiveEdge).toHaveBeenCalledWith(null);
  });

  it("el cuerpo del chat NO arrastra la cortina: deslizar ahí es desplazar la conversación", () => {
    vi.spyOn(performance, "now").mockImplementation(() => reloj);
    render(<ZenithCurtain />);
    const chat = screen.getByTestId("aurora-chat-section-mock");
    arrastrar(chat, "touch", [200, 600], [200, 150]);
    expect(capturar).not.toHaveBeenCalled();
    expect(setActiveEdge).not.toHaveBeenCalled();
  });

  it("un arrastre corto de la cabecera vuelve a su sitio", () => {
    vi.spyOn(performance, "now").mockImplementation(() => reloj);
    render(<ZenithCurtain />);
    const cabecera = screen.getByRole("heading", { name: "Exocortex" });
    fireEvent.pointerDown(cabecera, puntero("touch", 200, 60));
    for (let i = 1; i <= 4; i++) {
      avanzar(80);
      fireEvent.pointerMove(cabecera, puntero("touch", 200, 60 - i * 10));
    }
    avanzar(250);
    fireEvent.pointerUp(cabecera, puntero("touch", 200, 20));
    expect(setActiveEdge).not.toHaveBeenCalled();
  });

  it("pointercancel (el sistema se queda el gesto) no cierra", () => {
    vi.spyOn(performance, "now").mockImplementation(() => reloj);
    render(<ZenithCurtain />);
    const cabecera = screen.getByRole("heading", { name: "Exocortex" });
    fireEvent.pointerDown(cabecera, puntero("touch", 200, 600));
    avanzar(16);
    fireEvent.pointerMove(cabecera, puntero("touch", 200, 400));
    fireEvent.pointerCancel(cabecera, puntero("touch", 200, 400));
    expect(setActiveEdge).not.toHaveBeenCalled();
  });

  it("con movimiento normal, la X cierra tras la animación de salida", async () => {
    simularMovimientoReducido(false);
    render(<ZenithCurtain />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar Exocortex" }));
    expect(setActiveEdge).not.toHaveBeenCalled(); // primero sube…
    await waitFor(() => expect(setActiveEdge).toHaveBeenCalledWith(null), { timeout: 3000 }); // …y luego se va
  });
});
