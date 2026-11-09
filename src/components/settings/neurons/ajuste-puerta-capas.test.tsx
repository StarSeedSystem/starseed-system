// @vitest-environment jsdom
/**
 * PTA1108C — «Internet compartido»: capas que ofrece cada puerta, capas que comparte esta neurona y sus interruptores.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
import type { CapaPuerta } from "@/lib/malla/puerta/capas";
import { AJUSTES_PUERTA_POR_DEFECTO, type AjustesPuerta } from "@/lib/malla/puerta/politica";

const SRV: CapaPuerta = { id: "srv:192.168.1.50:8443", tipo: "servidor-propio", etiqueta: "NAS", hosts: ["192.168.1.50"], cidrs: ["192.168.1.50/32"], puertos: [8443], latenciaMs: 9.4 };
const LAN: CapaPuerta = { id: "lan", tipo: "lan", etiqueta: "Red local", hosts: [], cidrs: ["192.168.1.0/24"], puertos: [] };

const almacen = vi.hoisted(() => ({ s: null as unknown as Record<string, unknown>, cbs: new Set<() => void>() }));
vi.mock("@/lib/malla/puerta/servicio", () => ({
  estadoPuerta: () => almacen.s,
  suscribirPuerta: (cb: () => void) => {
    almacen.cbs.add(cb);
    return () => almacen.cbs.delete(cb);
  },
  cambiarAjustesPuerta: (f: (a: AjustesPuerta) => AjustesPuerta) => {
    almacen.s = { ...almacen.s, ajustes: f(almacen.s.ajustes as AjustesPuerta) };
    almacen.cbs.forEach((c) => c());
  },
  permitirCapasANeurona: (id: string, tipos: string[]) => {
    const a = almacen.s.ajustes as AjustesPuerta;
    const r = { ...a.capasPorNeurona } as Record<string, string[]>;
    if (tipos.length) r[id] = tipos;
    else delete r[id];
    almacen.s = { ...almacen.s, ajustes: { ...a, capasPorNeurona: r } };
    almacen.cbs.forEach((c) => c());
  },
  pararDeCompartir: () => undefined,
  responderPregunta: () => undefined,
  revocarVecina: () => undefined,
}));

import { AjustePuertaInternet, resumenCapa } from "@/components/settings/neurons/ajuste-puerta-internet";

function estado(p: Record<string, unknown> = {}) {
  almacen.s = {
    activo: true, nativo: true, conInternet: true, puertas: [], internetPor: null, compartiendo: [], auditoria: [], bytesHoy: { mias: 0, otras: 0 }, preguntas: [],
    ajustes: AJUSTES_PUERTA_POR_DEFECTO, proxyLocal: null, capasPropias: [], ...p,
  };
}
beforeEach(() => estado());
afterEach(() => cleanup());

describe("resumenCapa", () => {
  it("dice tipo, dónde y calidad", () => {
    expect(resumenCapa(SRV)).toBe("Servidor propio · 192.168.1.50:8443 · 9 ms");
    expect(resumenCapa(LAN)).toBe("Red local · 192.168.1.0/24");
  });
});

describe("capas en «Internet compartido»", () => {
  it("por defecto: servidores propios compartidos (sí), red local (no)", () => {
    render(<AjustePuertaInternet />);
    expect((screen.getByLabelText(/Compartir mis servidores propios con mis neuronas/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Compartir mi red local con mis neuronas/) as HTMLInputElement).checked).toBe(false);
  });

  it("los interruptores cambian los ajustes de la política", () => {
    render(<AjustePuertaInternet />);
    fireEvent.click(screen.getByLabelText(/Compartir mi red local con mis neuronas/));
    expect((almacen.s.ajustes as AjustesPuerta).compartirRedLocal).toBe(true);
    fireEvent.click(screen.getByLabelText(/Compartir mis servidores propios con mis neuronas/));
    expect((almacen.s.ajustes as AjustesPuerta).compartirServidoresPropios).toBe(false);
  });

  it("lista las capas que alcanza esta neurona y si se comparten", () => {
    estado({ capasPropias: [SRV, LAN] });
    render(<AjustePuertaInternet />);
    const t = screen.getByTestId("capas-propias").textContent ?? "";
    expect(t).toContain("Servidor propio · 192.168.1.50:8443");
    expect(t).toContain("(compartida)");
    expect(t).toContain("Red local · 192.168.1.0/24 (no compartida)");
  });

  it("sin capas lo dice", () => {
    render(<AjustePuertaInternet />);
    expect(screen.getByTestId("capas-propias").textContent).toContain("no detecta servidores propios ni red local");
  });

  it("muestra las capas que ofrece cada puerta cercana, con su calidad", () => {
    estado({ conInternet: false, puertas: [{ id: "casa", nombre: "Mac de casa", enlace: "Wi‑Fi directo", saltos: 0, puntuacion: 80, medida: false, capas: [SRV] }, { id: "otra", nombre: "Tablet", enlace: "Bluetooth", saltos: 1, puntuacion: 40, medida: false, capas: [] }] });
    render(<AjustePuertaInternet />);
    const l = screen.getByTestId("capas-de-puertas");
    expect(l.textContent).toContain("Mac de casa");
    expect(l.textContent).toContain("Servidor propio · 192.168.1.50:8443 · 9 ms");
    expect(l.textContent).not.toContain("Tablet");
  });

  it("permisos explícitos a otra cuenta: se ofrecen al compartir y se retiran", () => {
    estado({ compartiendo: [{ id: "s1", de: "ajena-123456", nombre: "Ajena", vecino: "v", host: "example.com", grupo: "otras", rol: "puerta", bytes: 1, desde: 1 }] });
    const { unmount } = render(<AjustePuertaInternet />);
    fireEvent.click(screen.getByText("Permitir mis capas"));
    expect((almacen.s.ajustes as AjustesPuerta).capasPorNeurona).toEqual({ "ajena-123456": ["servidor-propio", "lan"] });
    unmount();
    render(<AjustePuertaInternet />);
    expect(screen.getByTestId("permisos-capas").textContent).toContain("ajena-12");
    fireEvent.click(screen.getByText("Retirar"));
    expect((almacen.s.ajustes as AjustesPuerta).capasPorNeurona).toEqual({});
  });

  it("accesible: el grupo de capas tiene nombre y los interruptores etiqueta", () => {
    render(<AjustePuertaInternet />);
    expect(screen.getByRole("group", { name: "Otras capas de red que comparte esta neurona" })).toBeTruthy();
  });
});
