import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import {
  PROTO_ORB_FAB_EVENT,
  PROTO_ORB_FAB_KEY,
  PROTO_ORB_POS_KEY,
} from "@/lib/protomolecula/orbe-bus";
import { PROTO_ORB_ESTADO_EVENT, PROTO_ORB_ESTILO_KEY } from "@/lib/protomolecula/orbe4d/eventos";

// Se espían las dos funciones de la API de la orbe que tocan el almacén, conservando su comportamiento real.
vi.mock("@/lib/protomolecula/orbe-bus", async (original) => {
  const m = await original<typeof import("@/lib/protomolecula/orbe-bus")>();
  return { ...m, guardarActivada: vi.fn(m.guardarActivada) };
});
vi.mock("@/lib/protomolecula/orbe4d/eventos", async (original) => {
  const m = await original<typeof import("@/lib/protomolecula/orbe4d/eventos")>();
  return { ...m, guardarEstilo: vi.fn(m.guardarEstilo) };
});

import { guardarActivada } from "@/lib/protomolecula/orbe-bus";
import { guardarEstilo } from "@/lib/protomolecula/orbe4d/eventos";
import { TarjetaProtomolecula } from "../tarjeta-protomolecula";

const interruptor = () => screen.getByRole("switch", { name: "Orbe de la Protomolécula" });
const encendido = () => interruptor().getAttribute("aria-checked") === "true";

/** Escucha un evento de ventana y devuelve lo recibido. */
function escuchar<T = unknown>(nombre: string) {
  const recibidos: T[] = [];
  const fn = (e: Event) => recibidos.push((e as CustomEvent<T>).detail);
  window.addEventListener(nombre, fn);
  return { recibidos, quitar: () => window.removeEventListener(nombre, fn) };
}

describe("Tarjeta «Protomolécula» · interruptor de la orbe", () => {
  const ir = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    // Olvida la forma fijada en la prueba (la tarjeta la recuerda mientras dura la sesión).
    window.dispatchEvent(new CustomEvent(PROTO_ORB_ESTADO_EVENT, { detail: { estado: "forma", forma: null } }));
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("refleja leerActivada: encendida por defecto y apagada si la preferencia es «false»", () => {
    const { unmount } = render(<TarjetaProtomolecula ir={ir} />);
    expect(encendido()).toBe(true);
    unmount();
    window.localStorage.setItem(PROTO_ORB_FAB_KEY, "false");
    render(<TarjetaProtomolecula ir={ir} />);
    expect(encendido()).toBe(false);
  });

  it("al apagarla llama a guardarActivada y emite PROTO_ORB_FAB_EVENT; al encenderla, igual", () => {
    const fab = escuchar<{ activada: boolean }>(PROTO_ORB_FAB_EVENT);
    render(<TarjetaProtomolecula ir={ir} />);
    fireEvent.click(interruptor());
    expect(guardarActivada).toHaveBeenLastCalledWith(window.localStorage, false);
    expect(window.localStorage.getItem(PROTO_ORB_FAB_KEY)).toBe("false");
    expect(fab.recibidos.at(-1)).toEqual({ activada: false });
    expect(encendido()).toBe(false);
    fireEvent.click(interruptor());
    expect(guardarActivada).toHaveBeenLastCalledWith(window.localStorage, true);
    expect(fab.recibidos.at(-1)).toEqual({ activada: true });
    expect(encendido()).toBe(true);
    fab.quitar();
  });

  it("reacciona al evento externo (arrastrada a su zona, Astraura): apaga y enciende el interruptor", () => {
    render(<TarjetaProtomolecula ir={ir} />);
    act(() => { window.dispatchEvent(new CustomEvent(PROTO_ORB_FAB_EVENT, { detail: { activada: false } })); });
    expect(encendido()).toBe(false);
    act(() => { window.dispatchEvent(new CustomEvent(PROTO_ORB_FAB_EVENT, { detail: { activada: true } })); });
    expect(encendido()).toBe(true);
  });

  it("sigue a otra pestaña (storage) y a la sincronía de cuenta (starseed:sync:apply)", () => {
    render(<TarjetaProtomolecula ir={ir} />);
    window.localStorage.setItem(PROTO_ORB_FAB_KEY, "false");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: PROTO_ORB_FAB_KEY, newValue: "false" })); });
    expect(encendido()).toBe(false);
    window.localStorage.setItem(PROTO_ORB_FAB_KEY, "true");
    window.localStorage.setItem(PROTO_ORB_ESTILO_KEY, "sobria");
    act(() => { window.dispatchEvent(new CustomEvent("starseed:sync:apply")); });
    expect(encendido()).toBe(true);
    expect(screen.getByRole("radio", { name: /Sobria/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("cambiar el estilo llama a guardarEstilo y avisa a la orbe", () => {
    const estado = escuchar<{ estado: string; estilo?: string }>(PROTO_ORB_ESTADO_EVENT);
    render(<TarjetaProtomolecula ir={ir} />);
    expect(screen.getByRole("radio", { name: /Expresiva/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: /Experimental/ }));
    expect(guardarEstilo).toHaveBeenCalledWith(window.localStorage, "experimental");
    expect(window.localStorage.getItem(PROTO_ORB_ESTILO_KEY)).toBe("experimental");
    expect(estado.recibidos.at(-1)).toEqual({ estado: "estilo", estilo: "experimental" });
    expect(screen.getByRole("radio", { name: /Experimental/ }).getAttribute("aria-checked")).toBe("true");
    estado.quitar();
  });

  it("el estilo que cambia desde fuera (Astraura) se refleja en la tarjeta", () => {
    render(<TarjetaProtomolecula ir={ir} />);
    act(() => { window.dispatchEvent(new CustomEvent(PROTO_ORB_ESTADO_EVENT, { detail: { estado: "estilo", estilo: "sobria" } })); });
    expect(screen.getByRole("radio", { name: /Sobria/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("fijar una forma avisa a la orbe; «Automática» la suelta; la tarjeta la recuerda al volver a abrirse", () => {
    const estado = escuchar<{ estado: string; forma?: string | null }>(PROTO_ORB_ESTADO_EVENT);
    const { unmount } = render(<TarjetaProtomolecula ir={ir} />);
    expect(screen.getByRole("button", { name: /Automática/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Teseracto" }));
    expect(estado.recibidos.at(-1)).toEqual({ estado: "forma", forma: "teseracto" });
    expect(screen.getByRole("button", { name: "Teseracto" }).getAttribute("aria-pressed")).toBe("true");
    unmount();
    render(<TarjetaProtomolecula ir={ir} />);
    expect(screen.getByRole("button", { name: "Teseracto" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Automática/ }));
    expect(estado.recibidos.at(-1)).toEqual({ estado: "forma", forma: null });
    estado.quitar();
  });

  it("apagada, estilo y forma se guardan y se le repiten a la orbe cuando se enciende", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(PROTO_ORB_FAB_KEY, "false");
    const estado = escuchar<{ estado: string; estilo?: string; forma?: string | null }>(PROTO_ORB_ESTADO_EVENT);
    render(<TarjetaProtomolecula ir={ir} />);
    expect(screen.getByRole("note").textContent).toMatch(/en cuanto la enciendas/);
    fireEvent.click(screen.getByRole("radio", { name: /Sobria/ }));
    fireEvent.click(screen.getByRole("button", { name: "Merkaba" }));
    const antes = estado.recibidos.length;
    fireEvent.click(interruptor());
    act(() => { vi.advanceTimersByTime(300); });
    const despues = estado.recibidos.slice(antes);
    expect(despues).toContainEqual({ estado: "estilo", estilo: "sobria" });
    expect(despues).toContainEqual({ estado: "forma", forma: "merkaba" });
    estado.quitar();
  });

  it("«Devolverla a su sitio» borra la posición guardada y avisa a la orbe con un evento storage", () => {
    window.localStorage.setItem(PROTO_ORB_POS_KEY, JSON.stringify({ x: 10, y: 20 }));
    const llegadas: Array<string | null> = [];
    const alAlmacen = (e: StorageEvent) => llegadas.push(e.key);
    window.addEventListener("storage", alAlmacen);
    render(<TarjetaProtomolecula ir={ir} />);
    fireEvent.click(screen.getByRole("button", { name: "Devolverla a su sitio" }));
    expect(window.localStorage.getItem(PROTO_ORB_POS_KEY)).toBeNull();
    expect(llegadas).toContain(PROTO_ORB_POS_KEY);
    window.removeEventListener("storage", alAlmacen);
  });

  it("«Abrir la Protomolécula» lleva a /protomolecula", () => {
    render(<TarjetaProtomolecula ir={ir} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir la Protomolécula" }));
    expect(ir).toHaveBeenCalledWith("/protomolecula");
  });

  it("los ajustes se pliegan y el interruptor sigue disponible", () => {
    render(<TarjetaProtomolecula ir={ir} />);
    const plegar = screen.getByRole("button", { name: /Ajustes de la orbe/ });
    expect(plegar.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(plegar);
    expect(plegar.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("radiogroup", { name: "Estilo de la orbe" })).toBeNull();
    expect(interruptor()).toBeTruthy();
  });
});
