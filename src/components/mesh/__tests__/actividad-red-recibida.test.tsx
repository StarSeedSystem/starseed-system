/**
 * FEED1108A: el panel «Actividad de red recibida» de Señales pinta la bandeja de red completa
 * (tipo, insignia de firma verificada, cuerpo legible, enlaces) y marca los mensajes de
 * neurona con acceso a Mensajes › Neuronas. Plegable, filtrable y con «Vaciar».
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const estado = vi.hoisted(() => ({ items: [] as Array<Record<string, unknown>>, vaciar: vi.fn() }));

vi.mock("@/ai/astraura/mesh", () => ({
  useNetworkInbox: () => estado.items,
  clearNetworkInbox: estado.vaciar,
}));
vi.mock("@/components/auth/aviso-sesion", () => ({ AvisoSesion: () => <div>aviso-sesion</div> }));

import { ActividadRedRecibida, esMensajeDeNeurona, presentarCuerpo } from "../actividad-red-recibida";

const base = Date.now();
const lista = () => [
  { id: "a", type: "message", cls: "P1", body: { text: "hola desde la otra neurona", convId: "conv-1234567890" }, at: base, verified: true },
  { id: "b", type: "post", cls: "P2", body: { entity_slug: "mi-grupo", entity_type: "group", body: "Nueva asamblea" }, at: base, account: "cuenta-abcdef12" },
  { id: "c", type: "presence", cls: "P3", body: { name: "Neurona 7" }, at: base },
];

describe("ActividadRedRecibida", () => {
  beforeEach(() => { estado.items = lista(); estado.vaciar.mockClear(); window.history.replaceState({}, "", "/senales"); });
  afterEach(() => cleanup());

  it("está plegado por defecto y se despliega con el botón (aria-expanded)", () => {
    render(<ActividadRedRecibida />);
    const boton = screen.getByRole("button", { name: /Actividad de red recibida/ });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list")).toBeNull();
    fireEvent.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("?vista=llegadas lo abre solo", () => {
    window.history.replaceState({}, "", "/senales?vista=llegadas");
    render(<ActividadRedRecibida />);
    expect(screen.getByRole("button", { name: /Actividad de red recibida/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("muestra la insignia verificada, la cuenta y el enlace a la entidad", () => {
    render(<ActividadRedRecibida abiertoInicial />);
    const [msg, post] = screen.getAllByRole("listitem");
    expect(within(msg).getByText(/verificado/i)).toBeInTheDocument();
    expect(within(post).queryByText(/verificado/i)).toBeNull();
    expect(within(post).getByText(/cuenta cuenta-a/)).toBeInTheDocument();
    expect(within(post).getByRole("link", { name: /Abrir/ })).toHaveAttribute("href", "/grupo/mi-grupo");
  });

  it("marca los mensajes de neurona y ofrece «Abrir en Mensajes › Neuronas»", () => {
    render(<ActividadRedRecibida abiertoInicial />);
    const [msg, post] = screen.getAllByRole("listitem");
    expect(within(msg).getByText(/de neurona/i)).toBeInTheDocument();
    expect(within(msg).getByRole("link", { name: /Abrir en Mensajes › Neuronas/ })).toHaveAttribute("href", "/messages?vista=neuronas");
    expect(within(post).queryByRole("link", { name: /Mensajes/ })).toBeNull();
  });

  it("filtra por tipo y «Vaciar» limpia la bandeja", () => {
    render(<ActividadRedRecibida abiertoInicial />);
    fireEvent.click(screen.getByRole("button", { name: "Publicación" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Vaciar/ }));
    expect(estado.vaciar).toHaveBeenCalledTimes(1);
  });

  it("sin nada recibido lo dice con honestidad", () => {
    estado.items = [];
    render(<ActividadRedRecibida abiertoInicial />);
    expect(screen.getByText("Aún no ha llegado nada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Vaciar/ })).toBeNull();
  });
});

describe("helpers puros", () => {
  it("detecta mensajes de neurona y presenta cuerpos", () => {
    expect(esMensajeDeNeurona({ type: "message", body: null })).toBe(true);
    expect(esMensajeDeNeurona({ type: "x", body: { text: "t", convId: "c" } })).toBe(true);
    expect(esMensajeDeNeurona({ type: "post", body: { text: "t" } })).toBe(false);
    expect(presentarCuerpo({ entity_slug: "p", entity_type: "page" }).href).toBe("/pagina/p");
    expect(presentarCuerpo(null).title).toBe("(sin contenido)");
  });
});
