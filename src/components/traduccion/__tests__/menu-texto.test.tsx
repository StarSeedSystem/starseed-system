import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MenuTexto, registrarEntradaMenuTexto, entradasRegistradas } from "../menu-texto";

function limpiarRegistros() {
  entradasRegistradas.length = 0;
}

beforeEach(() => {
  limpiarRegistros();
  document.body.innerHTML = "";
});

describe("MenuTexto", () => {
  it("renderiza sin lanzar error", () => {
    const { unmount } = render(<MenuTexto />);
    expect(() => unmount()).not.toThrow();
  });
});

describe("registrarEntradaMenuTexto", () => {
  it("registra una entrada nueva", () => {
    registrarEntradaMenuTexto({
      id: "nueva",
      etiqueta: "Nueva",
      visible: () => true,
      ejecutar: () => {},
    });
    expect(entradasRegistradas.length).toBe(1);
  });

  it("no registra duplicados", () => {
    registrarEntradaMenuTexto({
      id: "unico",
      etiqueta: "Único",
      visible: () => true,
      ejecutar: () => {},
    });
    registrarEntradaMenuTexto({
      id: "unico",
      etiqueta: "Único",
      visible: () => true,
      ejecutar: () => {},
    });
    expect(entradasRegistradas.length).toBe(1);
  });
});