import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { PROTO_ORB_ABRIR_EVENT, PROTO_ORB_FAB_EVENT, PROTO_ORB_FAB_KEY, PROTO_ORB_POS_KEY } from "@/lib/protomolecula/orbe-bus";
import { PROTO_ORB_CERRAR_EVENT, PROTO_ORB_ESTADO_EVENT, PROTO_ORB_ESTILO_KEY } from "@/lib/protomolecula/orbe4d/eventos";

// El motor three.js no corre en jsdom: se sustituye por uno de mentira que apunta lo que le piden.
const motor = vi.hoisted(() => ({
  fijarEstilo: vi.fn(), fijarRegistro: vi.fn(), fijarModo: vi.fn(), fijarForma: vi.fn(), fijarProgreso: vi.fn(),
  transformarEn: vi.fn(async () => true), fijarAtencion: vi.fn(), fijarArrastre: vi.fn(), voz: vi.fn(), pulso: vi.fn(),
  apagar: vi.fn(async () => undefined), redimensionar: vi.fn(), formaActual: vi.fn(() => "merkaba"), destruir: vi.fn(),
}));
const crear = vi.hoisted(() => vi.fn((..._a: unknown[]) => motor));
vi.mock("@/lib/protomolecula/orbe4d/motor", () => ({ crearMotor: crear }));
vi.mock("@/lib/protomolecula/controlador-activo", () => ({ controladorActivo: () => null }));
vi.mock("@/components/protomolecula/panel-protomolecula", () => ({ PanelProtomoleculaAutonomo: () => <p>panel completo</p> }));
const empujar = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/escritorios", useRouter: () => ({ push: empujar }) }));

import { OrbeProtomolecula } from "../orbe-protomolecula";

const orbe = () => screen.getByRole("button", { name: /Protomolécula: orbe de creación/ });

async function montar() {
  const r = render(<OrbeProtomolecula />);
  await waitFor(() => expect(crear).toHaveBeenCalled());
  return r;
}

describe("Orbe 4D de la Protomolécula", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true, writable: true });
    Object.defineProperty(window, "innerHeight", { value: 600, configurable: true, writable: true });
    window.localStorage.setItem(PROTO_ORB_POS_KEY, JSON.stringify({ x: 400, y: 300 }));
  });
  afterEach(() => { cleanup(); window.localStorage.clear(); });

  it("apagada no pinta nada", () => {
    window.localStorage.setItem(PROTO_ORB_FAB_KEY, "false");
    const { container } = render(<OrbeProtomolecula />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(screen.queryByRole("button", { name: /Protomolécula/ })).toBeNull();
  });

  it("encendida monta el lienzo 4D y el registro del contexto", async () => {
    const { container } = await montar();
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(crear.mock.calls[0][1]).toMatchObject({ registro: "trinity", estilo: "expresiva", tamano: 112 });
  });

  it("un toque sin movimiento abre el panel; Escape lo cierra", async () => {
    await montar();
    fireEvent.pointerDown(orbe(), { pointerId: 1, button: 0, clientX: 420, clientY: 320 });
    fireEvent.pointerUp(orbe(), { pointerId: 1, button: 0, clientX: 421, clientY: 320 });
    expect(await screen.findByRole("dialog", { name: "Protomolécula" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("«abrir» de Astraura queda atendido (cancelado) y abre el panel; «cerrar» lo cierra", async () => {
    await montar();
    let atendido = false;
    act(() => { atendido = !window.dispatchEvent(new CustomEvent(PROTO_ORB_ABRIR_EVENT, { cancelable: true, detail: {} })); });
    expect(atendido).toBe(true);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    act(() => { window.dispatchEvent(new CustomEvent(PROTO_ORB_CERRAR_EVENT)); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("arrastrarla a SU zona del borde izquierdo la apaga (con siembra inversa) y se puede deshacer", async () => {
    await montar();
    fireEvent.pointerDown(orbe(), { pointerId: 2, button: 0, clientX: 420, clientY: 320 });
    fireEvent.pointerMove(orbe(), { pointerId: 2, clientX: 300, clientY: 310 });
    expect(screen.getByText("Arrastra aquí para apagar la Protomolécula")).toBeTruthy();
    fireEvent.pointerMove(orbe(), { pointerId: 2, clientX: 40, clientY: 300 });
    expect(screen.getByText("Suelta para apagar la Protomolécula")).toBeTruthy();
    fireEvent.pointerUp(orbe(), { pointerId: 2, clientX: 40, clientY: 300 });
    await waitFor(() => expect(motor.apagar).toHaveBeenCalled());
    expect(window.localStorage.getItem(PROTO_ORB_FAB_KEY)).toBe("false");
    await waitFor(() => expect(screen.queryByRole("button", { name: /orbe de creación/ })).toBeNull());
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    expect(window.localStorage.getItem(PROTO_ORB_FAB_KEY)).toBe("true");
    expect(await screen.findByRole("button", { name: /orbe de creación/ })).toBeTruthy();
  });

  it("si ya descansaba en la zona, recolocarla unos píxeles no la apaga", async () => {
    window.localStorage.setItem(PROTO_ORB_POS_KEY, JSON.stringify({ x: 20, y: 280 }));
    await montar();
    fireEvent.pointerDown(orbe(), { pointerId: 4, button: 0, clientX: 48, clientY: 308 });
    fireEvent.pointerMove(orbe(), { pointerId: 4, clientX: 60, clientY: 330 });
    expect(screen.getByText("Arrastra aquí para apagar la Protomolécula")).toBeTruthy();
    fireEvent.pointerUp(orbe(), { pointerId: 4, clientX: 60, clientY: 330 });
    expect(motor.apagar).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PROTO_ORB_FAB_KEY)).not.toBe("false");
  });

  it("soltarla fuera de la zona solo la mueve y guarda la posición", async () => {
    await montar();
    fireEvent.pointerDown(orbe(), { pointerId: 3, button: 0, clientX: 420, clientY: 320 });
    fireEvent.pointerMove(orbe(), { pointerId: 3, clientX: 520, clientY: 220 });
    fireEvent.pointerUp(orbe(), { pointerId: 3, clientX: 520, clientY: 220 });
    expect(motor.apagar).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(PROTO_ORB_POS_KEY) || "{}")).toEqual({ x: 500, y: 200 });
  });

  it("se apaga y se enciende desde fuera (botón del lienzo de creación o Astraura) por el evento", async () => {
    await montar();
    act(() => { window.dispatchEvent(new CustomEvent(PROTO_ORB_FAB_EVENT, { detail: { activada: false } })); });
    await waitFor(() => expect(screen.queryByRole("button", { name: /orbe de creación/ })).toBeNull());
    expect(motor.apagar).toHaveBeenCalled();
    act(() => { window.dispatchEvent(new CustomEvent(PROTO_ORB_FAB_EVENT, { detail: { activada: true } })); });
    expect(await screen.findByRole("button", { name: /orbe de creación/ })).toBeTruthy();
  });

  it("obedece a los estados del OS: forma, estilo, carga y transformación hacia un modelo", async () => {
    await montar();
    const avisar = (detail: unknown) => act(() => { window.dispatchEvent(new CustomEvent(PROTO_ORB_ESTADO_EVENT, { detail, cancelable: true })); });
    avisar({ estado: "forma", forma: "teseracto" });
    await waitFor(() => expect(motor.fijarForma).toHaveBeenCalledWith("teseracto"));
    avisar({ estado: "estilo", estilo: "experimental" });
    await waitFor(() => expect(motor.fijarEstilo).toHaveBeenCalledWith("experimental"));
    expect(window.localStorage.getItem(PROTO_ORB_ESTILO_KEY)).toBe("experimental");
    avisar({ estado: "cargando", progreso: 0.4 });
    expect(motor.fijarProgreso).toHaveBeenCalledWith(0.4);
    expect(motor.fijarModo).toHaveBeenCalledWith("cargando");
    const puntos = new Float32Array([0, 0, 1, 1, 0, 0, 0, 1, 0, -1, 0, 0]);
    avisar({ estado: "transformar", modelo: puntos });
    await waitFor(() => expect(motor.transformarEn).toHaveBeenCalledWith(puntos));
    avisar({ estado: "inventado" });
    avisar({ estado: "forma", forma: "../../etc" });
    await waitFor(() => expect(motor.fijarForma).toHaveBeenLastCalledWith(null));
  });

  it("con teclado: Enter abre el panel y Suprimir la apaga", async () => {
    await montar();
    fireEvent.keyDown(orbe(), { key: "Enter" });
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(orbe(), { key: "Delete" });
    await waitFor(() => expect(motor.apagar).toHaveBeenCalled());
  });
});
