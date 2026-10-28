import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  MausbotSwitch,
  RUTA_AJUSTES_MAUSBOT,
  etiquetaModoMausbot,
} from "@/components/exocortex/mausbot-switch";
import {
  CLAVE_MAUSBOT,
  CONFIG_MAUSBOT_DEFECTO,
  EVENTO_MAUSBOT,
  type ConfigMausbot,
} from "@/lib/mausbot/config";

const guardarEnAlmacen = (parche: Partial<ConfigMausbot>) => {
  localStorage.setItem(
    CLAVE_MAUSBOT,
    JSON.stringify({ ...CONFIG_MAUSBOT_DEFECTO, ...parche, v: 1 }),
  );
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("etiquetaModoMausbot", () => {
  it("traduce los tres modos del Mausbot", () => {
    expect(etiquetaModoMausbot("cursor")).toBe("Cursor");
    expect(etiquetaModoMausbot("acompanante")).toBe("Acompañante");
    expect(etiquetaModoMausbot("ambos")).toBe("Ambos");
  });
});

describe("MausbotSwitch", () => {
  beforeEach(() => localStorage.clear());

  it("arranca apagado y anuncia el diseño por defecto", () => {
    render(<MausbotSwitch />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Apagado")).not.toBeNull();
    expect(screen.getByText("Puntero")).not.toBeNull();
  });

  it("enciende y guarda la configuración al pulsar el interruptor", () => {
    render(<MausbotSwitch />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    const guardado = JSON.parse(localStorage.getItem(CLAVE_MAUSBOT) ?? "{}") as ConfigMausbot;
    expect(guardado.encendido).toBe(true);
  });

  it("reacciona al evento starseed:mausbot de otra pestaña", () => {
    render(<MausbotSwitch />);
    act(() => {
      guardarEnAlmacen({ encendido: true });
      window.dispatchEvent(new Event(EVENTO_MAUSBOT));
    });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Encendido")).not.toBeNull();
  });

  it("cambia el modo y lo persiste", () => {
    render(<MausbotSwitch />);
    fireEvent.change(screen.getByLabelText("Modo del Mausbot"), {
      target: { value: "cursor" },
    });
    const guardado = JSON.parse(localStorage.getItem(CLAVE_MAUSBOT) ?? "{}") as ConfigMausbot;
    expect(guardado.modo).toBe("cursor");
  });

  it("enlaza a los ajustes de personalización", () => {
    render(<MausbotSwitch />);
    const enlace = screen.getByRole("link", { name: /Personalizar/ });
    expect(enlace.getAttribute("href")).toBe(RUTA_AJUSTES_MAUSBOT);
  });
});
