// @vitest-environment jsdom
/**
 * RoutersMallaPanel (Ola 1012Q §8 del contrato de la malla cristalina): el alta
 * de routers muestra el veredicto de compatibilidad al momento. Un router del
 * operador con tabla vacía debe aparecer «bloqueado-operador»; uno que no
 * consta en la tabla, «desconocido» con el enlace para buscarlo en OpenWrt.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoutersMallaPanel } from "../routers-malla-panel";

afterEach(() => {
  cleanup();
  window.localStorage.clear(); // cada prueba empieza sin routers guardados
});

describe("RoutersMallaPanel", () => {
  it("añadir un router de operador muestra 'bloqueado-operador'", async () => {
    render(<RoutersMallaPanel />); // sin tabla: se evalúa solo por ser del operador
    fireEvent.change(screen.getByPlaceholderText("fabricante (p. ej. TP-Link)"), { target: { value: "Vodafone" } });
    fireEvent.change(screen.getByPlaceholderText("modelo (p. ej. Archer C7)"), { target: { value: "EasyBox 804" } });
    fireEvent.click(screen.getByText("Es del operador").closest("label")!.querySelector("input")!);
    fireEvent.click(screen.getByText("Añadir router"));
    await waitFor(() => expect(screen.getByText("bloqueado-operador")).toBeTruthy());
  });

  it("sin tabla se muestra 'desconocido' con el enlace para buscar en OpenWrt", async () => {
    render(<RoutersMallaPanel />);
    fireEvent.change(screen.getByPlaceholderText("fabricante (p. ej. TP-Link)"), { target: { value: "TP-Link" } });
    fireEvent.change(screen.getByPlaceholderText("modelo (p. ej. Archer C7)"), { target: { value: "Archer C7" } });
    fireEvent.click(screen.getByText("Añadir router"));
    await waitFor(() => {
      expect(screen.getByText("desconocido")).toBeTruthy();
      const buscar = screen.getByText("Buscar en la tabla de OpenWrt").closest("a");
      expect(buscar?.getAttribute("href")).toBe("https://openwrt.org/toh/start");
    });
  });
});
