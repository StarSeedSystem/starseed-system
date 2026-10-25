// @vitest-environment jsdom
/**
 * Panel «Routers de la malla»: debe decir la verdad sobre la compatibilidad OpenWrt
 * (un router de operador sale como «bloqueado-operador», con su aviso y pasos) y,
 * tras «ya tiene OpenWrt», pedir región y troncales con sus botones por router.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoutersMallaPanel } from "@/components/network/routers-malla-panel";

const escribe = (marca: string, valor: string) => fireEvent.change(screen.getByPlaceholderText(marca), { target: { value: valor } });
const pulsa = (marca: string) => fireEvent.click(screen.getByLabelText(marca));
const botón = (texto: string) => fireEvent.click(screen.getByText(texto));
const añade = (fabricante: string, modelo: string) => {
  escribe("fabricante", fabricante);
  escribe("modelo (p. ej. Archer C7)", modelo);
  botón("Añadir router");
};

describe("RoutersMallaPanel", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(cleanup);

  it("un router de operador sale como bloqueado-operador, con aviso y pasos honestos", () => {
    render(<RoutersMallaPanel tabla={[]} />);
    pulsa("del operador");
    añade("Vodafone", "Sercomm SVG6580");
    expect(screen.getByText(/bloqueado-operador/)).toBeTruthy();
    expect(screen.getByText(/suelen ir bloqueados/)).toBeTruthy();
    expect(screen.getByText(/Alternativa/)).toBeTruthy();
  });

  it("sin tabla, un router propio sale como desconocido y enlaza la tabla de hardware de OpenWrt", () => {
    render(<RoutersMallaPanel />);
    añade("TP-Link", "Archer A9");
    expect(screen.getByText(/desconocido/)).toBeTruthy();
    const enlace = screen.getByText("buscar en la tabla de OpenWrt").closest("a");
    expect(enlace?.getAttribute("href")).toBe("https://openwrt.org/toh/start");
    expect(screen.queryByText("Copiar guion")).toBeNull();
  });

  it("tras «ya tiene OpenWrt» pide región y troncales, y ofrece copiar guion o descargar", () => {
    render(<RoutersMallaPanel />);
    añade("TP-Link", "Archer C6");
    pulsa("ya tiene OpenWrt");
    expect(screen.getByPlaceholderText("ES")).toBeTruthy();
    expect(screen.getByText("colgar de…")).toBeTruthy();
    expect(screen.getByText("conectar con…")).toBeTruthy();
    expect(screen.getByText("Añadir troncal")).toBeTruthy();
    expect(screen.getByText("Copiar guion")).toBeTruthy();
    expect(screen.getByText("Descargar configuración")).toBeTruthy();
  });

  it("la añade guardada en localStorage sin claves, y «Quitar» la borra", () => {
    render(<RoutersMallaPanel />);
    añade("TP-Link", "Archer A9");
    const guardado = localStorage.getItem("starseed.routers-malla.v1") ?? "";
    expect(guardado).toContain("Archer A9");
    expect(guardado.toLowerCase()).not.toContain("clave");
    botón("Quitar");
    expect(JSON.parse(localStorage.getItem("starseed.routers-malla.v1") ?? "[]")).toHaveLength(0);
  });
});
