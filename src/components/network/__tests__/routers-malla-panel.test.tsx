// @vitest-environment jsdom
/**
 * RoutersMallaPanel · la primera puerta honesta de §8: un router de operador
 * que no consta en la tabla de OpenWrt se señala como «bloqueado-operador»,
 * con su aviso y sus pasos, sin prometer que se puede flashear.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoutersMallaPanel } from "../routers-malla-panel";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("RoutersMallaPanel", () => {
  it("un router de operador muestra «bloqueado-operador»", () => {
    render(<RoutersMallaPanel />);

    fireEvent.change(screen.getByPlaceholderText(/fabricante/i), { target: { value: "Movistar" } });
    fireEvent.change(screen.getByPlaceholderText(/modelo/i), { target: { value: "HGU Askey" } });
    fireEvent.click(screen.getByLabelText(/¿Es del operador\?/i));
    fireEvent.click(screen.getByRole("button", { name: /añadir router/i }));

    expect(screen.getByText(/Estado: bloqueado-operador/)).toBeTruthy();
    expect(screen.getByText(/Los routers del operador suelen ir bloqueados/i)).toBeTruthy();
  });
});
