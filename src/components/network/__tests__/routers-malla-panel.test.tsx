// @vitest-environment jsdom
/**
 * RoutersMallaPanel (§8 de architecture/malla-cristalina-sio2.md): añadir
 * un router de operador sin tabla de hardware se enseña como
 * «bloqueado-operador», con su aviso, sus pasos y el enlace para buscarlo
 * en la tabla de hardware de OpenWrt.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { RoutersMallaPanel } from "@/components/network/routers-malla-panel";

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* noop */
  }
});

describe("RoutersMallaPanel", () => {
  test("un router de operador se enseña como bloqueado-operador con aviso, pasos y enlace", () => {
    render(<RoutersMallaPanel />);
    expect(screen.getByText("Routers de la malla")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("fabricante (p. ej. TP-Link)"), { target: { value: "Vodafone" } });
    fireEvent.change(screen.getByPlaceholderText("modelo (p. ej. Archer C7)"), { target: { value: "Sercomm H500-s" } });
    fireEvent.click(screen.getByLabelText("Es el router que me dio mi operador"));
    fireEvent.click(screen.getByText("Añadir", { exact: true }));

    expect(screen.getByText("Estado: bloqueado-operador")).toBeTruthy();
    expect(screen.getByText(/Los routers del operador suelen ir bloqueados/)).toBeTruthy();
    expect(screen.getByText(/Alternativa: pon detrás un router compatible/)).toBeTruthy();
    expect(screen.getByText(/Flashear puede dejar el router inservible/)).toBeTruthy();
    expect(screen.getByText("Buscarlo en la tabla de hardware de OpenWrt").closest("a")?.getAttribute("href")).toBe(
      "https://openwrt.org/toh/start",
    );
  });

  test("la lista se guarda en localStorage con solo los datos, sin claves", () => {
    render(<RoutersMallaPanel />);
    fireEvent.change(screen.getByPlaceholderText("fabricante (p. ej. TP-Link)"), { target: { value: "TP-Link" } });
    fireEvent.change(screen.getByPlaceholderText("modelo (p. ej. Archer C7)"), { target: { value: "Archer C7" } });
    fireEvent.click(screen.getByText("Añadir", { exact: true }));

    const bruto = localStorage.getItem("starseed.routers-malla.v1");
    expect(bruto).toBeTruthy();
    const lista = JSON.parse(bruto ?? "[]") as Array<{ deOperador: boolean; openwrt: boolean; modelo: string }>;
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ fabricante: "TP-Link", modelo: "Archer C7", deOperador: false, openwrt: false });
    expect(Object.keys(lista[0]).some((k) => k.toLowerCase().includes("clave") || k.toLowerCase().includes("key"))).toBe(false);
  });
});
