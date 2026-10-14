/** Pruebas de la orbe gemela de la Protomolécula (PM1010F0L). jsdom, sin red. */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import OrbeProtomolecula from "../orbe-protomolecula";
import { PROTO_ORB_ABRIR_EVENT, PROTO_ORB_FAB_EVENT, PROTO_ORB_FAB_KEY, PROTO_ORB_POS_KEY } from "@/lib/protomolecula/orbe-bus";

afterEach(() => cleanup());
beforeEach(() => window.localStorage.clear());

const boton = () => screen.queryByRole("button", { name: "Protomolécula" });

describe("OrbeProtomolecula", () => {
  it("apagada (enabled=false) no pinta nada", () => {
    window.localStorage.setItem(PROTO_ORB_FAB_KEY, "false");
    render(<OrbeProtomolecula />);
    expect(boton()).toBeNull();
  });

  it("encendida por defecto: pinta la orbe con aria-expanded=false", () => {
    render(<OrbeProtomolecula />);
    expect(boton()).not.toBeNull();
    expect(boton()?.getAttribute("aria-expanded")).toBe("false");
  });

  it("un clic sin movimiento abre el panel", () => {
    render(<OrbeProtomolecula />);
    const b = boton()!;
    fireEvent.pointerDown(b, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(b, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(screen.getByRole("dialog", { name: "Protomolécula" })).toBeTruthy();
    expect(b.getAttribute("aria-expanded")).toBe("true");
  });

  it("un arrastre guarda la posición y NO abre el panel", () => {
    render(<OrbeProtomolecula />);
    const b = boton()!;
    fireEvent.pointerDown(b, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(b, { clientX: 180, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(b, { clientX: 180, clientY: 140, pointerId: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(window.localStorage.getItem(PROTO_ORB_POS_KEY)).not.toBeNull();
  });

  it("Escape cierra el panel", () => {
    render(<OrbeProtomolecula />);
    const b = boton()!;
    fireEvent.pointerDown(b, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(b, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("PROTO_ORB_ABRIR_EVENT abre el panel sin clic", () => {
    render(<OrbeProtomolecula />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => { window.dispatchEvent(new Event(PROTO_ORB_ABRIR_EVENT)); });
    expect(screen.getByRole("dialog", { name: "Protomolécula" })).toBeTruthy();
  });

  it("PROTO_ORB_FAB_EVENT con enabled=false desmonta la orbe", () => {
    render(<OrbeProtomolecula />);
    expect(boton()).not.toBeNull();
    window.localStorage.setItem(PROTO_ORB_FAB_KEY, "false");
    act(() => { window.dispatchEvent(new Event(PROTO_ORB_FAB_EVENT)); });
    expect(boton()).toBeNull();
  });

  it("el panel sin molécula activa lo dice con honestidad", () => {
    render(<OrbeProtomolecula />);
    const b = boton()!;
    fireEvent.pointerDown(b, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(b, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(screen.getByText(/aún no hay ninguna molécula abierta/i)).toBeTruthy();
  });
});
