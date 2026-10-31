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

  test("al marcar Ya tiene OpenWrt, muestra 'entra en la retícula como titanio'", () => {
    render(<RoutersMallaPanel />);
    fireEvent.change(screen.getByPlaceholderText("fabricante (p. ej. TP-Link)"), { target: { value: "TP-Link" } });
    fireEvent.change(screen.getByPlaceholderText("modelo (p. ej. Archer C7)"), { target: { value: "Archer C7" } });
    fireEvent.click(screen.getByText("Añadir", { exact: true }));
    expect(screen.getByText("Ya tiene OpenWrt")).toBeTruthy();

    const checkbox = screen.getByLabelText("Ya tiene OpenWrt");
    fireEvent.click(checkbox);

    expect(screen.getByText("entra en la retícula como titanio")).toBeTruthy();
  });

  test("al marcar OpenWrt, muestra tesela de titanio con mensaje de troncales", () => {
    render(<RoutersMallaPanel />);
    fireEvent.change(screen.getByPlaceholderText("fabricante (p. ej. TP-Link)"), { target: { value: "TP-Link" } });
    fireEvent.change(screen.getByPlaceholderText("modelo (p. ej. Archer C7)"), { target: { value: "Archer C7" } });
    fireEvent.click(screen.getByText("Añadir", { exact: true }));

    fireEvent.click(screen.getByLabelText("Ya tiene OpenWrt"));

    expect(screen.getByText("Tesela de titanio generada desde los troncales del plan")).toBeTruthy();
    expect(screen.getByText("Sin troncales definidos")).toBeTruthy();
  });

  test("con una troncal del plan, la tesela se genera con teselaDeRouter (sin red)", async () => {
    render(<RoutersMallaPanel />);
    for (const fabricante of ["TP-Link", "Nexo"]) {
      fireEvent.change(screen.getByPlaceholderText("fabricante (p. ej. TP-Link)"), { target: { value: fabricante } });
      fireEvent.change(screen.getByPlaceholderText("modelo (p. ej. Archer C7)"), { target: { value: "Archer C7" } });
      fireEvent.click(screen.getByText("Añadir", { exact: true }));
      // Separación de milisegundos para que los id generados (rt-<base36>) no choquen.
      await new Promise((r) => setTimeout(r, 3));
    }
    const ids = (JSON.parse(localStorage.getItem("starseed.routers-malla.v1") ?? "[]") as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toHaveLength(2);

    fireEvent.click(screen.getAllByLabelText("Ya tiene OpenWrt")[0]);
    fireEvent.click(screen.getAllByLabelText("Ya tiene OpenWrt")[0]);

    const selects = document.querySelectorAll("select");
    expect(selects.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(selects[0], { target: { value: ids[0] } });
    fireEvent.change(selects[1], { target: { value: ids[1] } });
    fireEvent.click(screen.getByText("Añadir troncal"));

    // Dos cajas, una por router titanio, cada una con su tesela de 1 troncal wifi-mesh.
    const cajas = screen.getAllByText(/como Ti⁴⁺: 1 troncal · medio wifi-mesh/);
    expect(cajas).toHaveLength(2);
  });
});