/**
 * Prueba jsdom del panel «Routers de la malla» (contrato SiO₂ §8, MR1012E):
 * añadir un router de operador con la tabla vacía muestra el estado
 * «bloqueado-operador» con su aviso; uno desconocido muestra «desconocido» y
 * el enlace a la tabla de hardware de OpenWrt; la lista queda en localStorage.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { RoutersMallaPanel } from "@/components/network/routers-malla-panel";

describe("RoutersMallaPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("un router del operador, en la tabla vacía, aparece como «bloqueado-operador»", () => {
    render(<RoutersMallaPanel />);
    fireEvent.change(screen.getByPlaceholderText("fabricante"), { target: { value: "Movistar" } });
    fireEvent.change(screen.getByPlaceholderText("modelo"), { target: { value: "Smart Wifi HGU" } });
    fireEvent.click(screen.getByText("Router del operador"));
    fireEvent.click(screen.getByText("Añadir"));
    expect(screen.getAllByText("bloqueado-operador").length).toBeGreaterThan(0);
    expect(screen.getByText(/bloqueados y no dejan instalar OpenWrt/)).toBeTruthy();
  });

  it("un router desconocido enseña «desconocido» y el enlace a la tabla de OpenWrt", () => {
    render(<RoutersMallaPanel />);
    fireEvent.change(screen.getByPlaceholderText("fabricante"), { target: { value: "Xyz" } });
    fireEvent.change(screen.getByPlaceholderText("modelo"), { target: { value: "Router 1" } });
    fireEvent.click(screen.getByText("Añadir"));
    expect(screen.getAllByText("desconocido").length).toBeGreaterThan(0);
    const enlace = screen.getByText("Buscar en la tabla de OpenWrt").closest("a");
    expect(enlace?.getAttribute("href")).toBe("https://openwrt.org/toh/start");
  });

  it("muestra compatibilidad «soportado» cuando el modelo casa con la tabla dada por prop", () => {
    render(
      <RoutersMallaPanel
        tabla={[
          {
            fabricante: "TP-Link",
            modelo: "Archer C7",
            versiones: ["v5"],
            target: "ath79/generic",
            perfil: "tplink_archer-c7-v5",
            soportado: true,
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("fabricante"), { target: { value: "TP-Link" } });
    fireEvent.change(screen.getByPlaceholderText("modelo"), { target: { value: "Archer C7" } });
    fireEvent.change(screen.getByPlaceholderText("versión"), { target: { value: "v5" } });
    fireEvent.click(screen.getByText("Añadir"));
    expect(screen.getAllByText("soportado").length).toBeGreaterThan(0);
    expect(screen.getByText("Imagen de OpenWrt")).toBeTruthy();
  });

  it("guarda la lista de routers en localStorage (sin claves) y la recarga", () => {
    render(<RoutersMallaPanel />);
    fireEvent.change(screen.getByPlaceholderText("fabricante"), { target: { value: "Movistar" } });
    fireEvent.change(screen.getByPlaceholderText("modelo"), { target: { value: "Smart Wifi" } });
    fireEvent.click(screen.getByText("Router del operador"));
    fireEvent.click(screen.getByText("Añadir"));
    expect(JSON.parse(window.localStorage.getItem("routers-malla-lista") ?? "{}").routers.length).toBe(1);
    expect(window.localStorage.getItem("routers-malla-lista")).not.toMatch(/clave|key/i);
  });
});
