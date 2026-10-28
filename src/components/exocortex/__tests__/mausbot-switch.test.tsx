import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { siguienteModoMausbot, MausbotSwitch } from "../mausbot-switch";
import { CLAVE_MAUSBOT, guardarConfigMausbot } from "@/lib/mausbot/config";
import { CLAVE_DISENOS } from "@/lib/mausbot/disenos";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("siguienteModoMausbot (puro)", () => {
  it("cicla cursor → acompañante → ambos → cursor", () => {
    expect(siguienteModoMausbot("cursor")).toBe("acompanante");
    expect(siguienteModoMausbot("acompanante")).toBe("ambos");
    expect(siguienteModoMausbot("ambos")).toBe("cursor");
  });
});

describe("MausbotSwitch (render)", () => {
  it("arranca apagado (sin nada guardado) y enciende al pulsar el interruptor", () => {
    render(<MausbotSwitch />);
    const interruptor = screen.getByRole("switch", { name: /Encender el Mausbot/ });
    expect(interruptor.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(interruptor);
    const encendido = screen.getByRole("switch", { name: /Apagar el Mausbot/ });
    expect(encendido.getAttribute("aria-checked")).toBe("true");
    const guardado = JSON.parse(localStorage.getItem(CLAVE_MAUSBOT) ?? "{}");
    expect(guardado.encendido).toBe(true);
  });

  it("encendido muestra el modo, lo cicla al pulsar y enlaza a Personalizar (Apariencia en /cuenta)", () => {
    guardarConfigMausbot({ encendido: true });
    render(<MausbotSwitch />);
    expect(screen.getAllByText(/Acompaña al cursor/).length).toBe(2);
    expect(screen.getByText("Puntero")).toBeTruthy();
    expect(screen.getAllByText(/Aurora/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Personalizar" }).getAttribute("href"))
      .toBe("/cuenta?section=personalizacion");
    fireEvent.click(screen.getByTitle("Cambiar el modo del Mausbot"));
    expect(screen.getAllByText(/Ambos/).length).toBe(2);
    const guardado = JSON.parse(localStorage.getItem(CLAVE_MAUSBOT) ?? "{}");
    expect(guardado.modo).toBe("ambos");
  });

  it("reacciona al evento starseed:mausbot que otra vista lance", () => {
    render(<MausbotSwitch />);
    expect(screen.getByRole("switch", { name: /Encender/ })).toBeTruthy();
    // guardarConfigMausbot emite el evento: la tarjeta debe refrescarse sola.
    act(() => { guardarConfigMausbot({ encendido: true }); });
    expect(screen.getByRole("switch", { name: /Apagar/ })).toBeTruthy();
    // Sin diseños propios tocados: sólo se leyeron, no se escribieron.
    expect(localStorage.getItem(CLAVE_DISENOS)).toBeNull();
  });
});
