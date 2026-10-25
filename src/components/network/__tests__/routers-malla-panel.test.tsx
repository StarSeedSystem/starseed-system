// @vitest-environment jsdom
/**
 * RoutersMallaPanel — la interfaz dice la verdad antes de flashear: un router
 * del operador sale como «bloqueado-operador», y uno desconocido enlaza a la
 * tabla de hardware de OpenWrt en vez de inventar compatibilidad.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoutersMallaPanel } from "@/components/network/routers-malla-panel";

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* sin localStorage no hay nada que limpiar */
  }
});

function anadir(fabricante: string, modelo: string) {
  fireEvent.change(screen.getByLabelText("Fabricante"), { target: { value: fabricante } });
  fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: modelo } });
}

describe("RoutersMallaPanel", () => {
  it("un router del operador sin tabla se muestra como bloqueado-operador", () => {
    render(<RoutersMallaPanel />);
    anadir("Movistar", "HGU Askey");
    fireEvent.click(screen.getByLabelText("¿Es del operador?"));
    fireEvent.click(screen.getByText("Añadir router"));

    expect(screen.getByText(/Estado: bloqueado-operador/)).toBeTruthy();
    expect(screen.getByText(/modo puente/)).toBeTruthy();
  });

  it("sin tabla, un router desconocido enlaza a la tabla de hardware de OpenWrt", () => {
    render(<RoutersMallaPanel />);
    anadir("D-Link", "DIR-615");
    fireEvent.click(screen.getByText("Añadir router"));

    expect(screen.getByText(/Estado: desconocido/)).toBeTruthy();
    const enlace = screen.getByText("Buscar este modelo en la tabla de OpenWrt").closest("a");
    expect(enlace?.getAttribute("href")).toBe("https://openwrt.org/toh/start");
  });
});
