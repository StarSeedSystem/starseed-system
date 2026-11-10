// @vitest-environment jsdom
/** PTA1110A · indicador global, panel «Actividad de la malla» y tarjeta de «Usar el internet de mis neuronas» (con migración). */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AJUSTES_PUERTA_POR_DEFECTO, interpretarAjustes, type AjustesPuerta } from "@/lib/malla/puerta/politica";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
vi.mock("next/dynamic", async () => {
  const mod = await import("@/components/malla/panel-actividad-malla");
  return { default: () => mod.PanelActividadMalla };
});

const h = vi.hoisted(() => ({
  s: null as unknown as Record<string, unknown>,
  cbs: new Set<() => void>(),
  llamadas: [] as string[],
}));
const avisar = (): void => h.cbs.forEach((c) => c());
vi.mock("@/lib/malla/puerta/servicio", () => ({
  estadoPuerta: () => h.s,
  suscribirPuerta: (cb: () => void) => {
    h.cbs.add(cb);
    return () => h.cbs.delete(cb);
  },
  cambiarAjustesPuerta: (f: (a: AjustesPuerta) => AjustesPuerta) => {
    h.s = { ...h.s, ajustes: f(h.s.ajustes as AjustesPuerta) };
    avisar();
  },
  pausarActividad: (id: string) => h.llamadas.push("pausar:" + id),
  reanudarActividad: (id: string) => h.llamadas.push("reanudar:" + id),
  cancelarActividad: (id: string) => h.llamadas.push("cancelar:" + id),
  responderUso: (v: boolean) => h.llamadas.push("uso:" + v),
  responderGrande: (e: string, r: boolean) => h.llamadas.push(`grande:${e}:${r}`),
}));

import { IndicadorRutaMalla } from "@/components/malla/indicador-ruta-malla";
import { PanelActividadMalla } from "@/components/malla/panel-actividad-malla";
import { AjusteUsoMalla } from "@/components/settings/neurons/ajuste-puerta-uso";

const proceso = (p: Record<string, unknown> = {}) => ({
  id: "t1", rol: "cliente", tipo: "descargas", host: "ejemplo.org", puerto: 443, bytes: 2 * 1024 * 1024, bytesPorSegundo: 30000, enlace: "Bluetooth directo",
  vecino: "n1", de: "yo", desde: 0, pausada: false, esperandoCarril: false, ...p,
});
function estado(p: Record<string, unknown> = {}) {
  h.s = {
    activo: true, nativo: true, conInternet: false, puertas: [], internetPor: null, compartiendo: [], auditoria: [], bytesHoy: { mias: 1024 * 1024, otras: 0 }, preguntas: [],
    ajustes: AJUSTES_PUERTA_POR_DEFECTO, proxyLocal: null, capasPropias: [], actividad: [], carriles: [], bytesPorSegundo: null, avisos: [], preguntaUso: null, preguntaGrande: null, iaPorMalla: [], ...p,
  };
  avisar();
}
beforeEach(() => {
  h.llamadas.length = 0;
  estado();
});
afterEach(() => cleanup());

describe("indicador global", () => {
  it("con internet propio no aparece", () => {
    estado({ conInternet: true });
    render(<IndicadorRutaMalla />);
    expect(screen.queryByTestId("indicador-ruta-boton")).toBeNull();
  });
  it("sale por otra neurona: «Internet por: MaggaBook · Bluetooth directo · 240 kb/s»", () => {
    estado({ internetPor: { nombre: "MaggaBook", enlace: "Bluetooth directo", saltos: 0 }, bytesPorSegundo: 30000 });
    render(<IndicadorRutaMalla />);
    expect(screen.getByTestId("indicador-ruta-boton").textContent).toContain("Internet por: MaggaBook · Bluetooth directo · 240 kb/s");
  });
  it("cada aviso se enseña una vez y no se repite al repintar", () => {
    estado({ internetPor: { nombre: "MaggaBook", enlace: "Bluetooth directo", saltos: 0 }, avisos: [{ id: "ruta-1", tipo: "por-malla", texto: "Sin Wi‑Fi: ahora por MaggaBook vía Bluetooth directo.", ts: 1 }] });
    render(<IndicadorRutaMalla />);
    expect(screen.getAllByTestId("aviso-ruta")).toHaveLength(1);
    act(() => estado({ ...h.s, bytesPorSegundo: 1000 })); // repinta con el MISMO aviso
    expect(screen.getAllByTestId("aviso-ruta")).toHaveLength(1);
  });
  it("al pulsarlo abre «Actividad de la malla»", () => {
    estado({ internetPor: { nombre: "MaggaBook", enlace: "Bluetooth directo", saltos: 0 }, bytesPorSegundo: 30000 });
    render(<IndicadorRutaMalla />);
    fireEvent.click(screen.getByTestId("indicador-ruta-boton"));
    expect(screen.getByText("Actividad de la malla")).toBeTruthy();
  });
});

describe("panel «Actividad de la malla»", () => {
  it("lista procesos con tipo, host, bytes y carril; pausa y cancela los grandes", () => {
    estado({ actividad: [proceso(), proceso({ id: "t2", tipo: "navegacion", host: "pequeño.org", bytes: 3000 })] });
    render(<PanelActividadMalla />);
    expect(screen.getAllByTestId("proceso")).toHaveLength(2);
    expect(screen.getByText("ejemplo.org:443")).toBeTruthy();
    expect(screen.getAllByLabelText("Pausar")).toHaveLength(1); // solo el grande
    fireEvent.click(screen.getByLabelText("Pausar"));
    fireEvent.click(screen.getByLabelText("Cancelar"));
    expect(h.llamadas).toEqual(["pausar:t1", "cancelar:t1"]);
  });
  it("uno en pausa ofrece reanudar", () => {
    estado({ actividad: [proceso({ pausada: true })] });
    render(<PanelActividadMalla />);
    fireEvent.click(screen.getByLabelText("Reanudar"));
    expect(h.llamadas).toEqual(["reanudar:t1"]);
  });
  it("sin procesos lo dice; «Compartiendo con» solo con hosts y volumen", () => {
    estado({ compartiendo: [{ de: "n9", nombre: "Maggaboard", grupo: "mia", rol: "puerta", host: "ejemplo.org", puerto: 443, bytes: 4096 }] });
    render(<PanelActividadMalla />);
    expect(screen.getByTestId("sin-procesos")).toBeTruthy();
    const c = screen.getByTestId("actividad-compartiendo").textContent ?? "";
    expect(c).toContain("Maggaboard");
    expect(c).toContain("ejemplo.org");
  });
  it("pregunta de descarga grande: continuar y recordar", () => {
    estado({ preguntaGrande: { nombre: "MaggaBook", host: "ejemplo.org", bytes: 1048576, kbps: 240 } });
    render(<PanelActividadMalla />);
    fireEvent.click(screen.getByText("Continuar"));
    fireEvent.click(screen.getByText("siempre solo Wi‑Fi"));
    expect(h.llamadas).toEqual(["grande:continuar:false", "grande:solo-wifi:true"]);
  });
  it("«Preguntar»: usar su internet / no", () => {
    estado({ preguntaUso: { nombre: "MaggaBook" } });
    render(<PanelActividadMalla />);
    fireEvent.click(screen.getByText("Usar su internet"));
    fireEvent.click(screen.getByText("No"));
    expect(h.llamadas).toEqual(["uso:true", "uso:false"]);
  });
});

describe("tarjeta «Usar el internet de mis neuronas»", () => {
  const pintar = () => {
    const r = render(<AjusteUsoMalla a={h.s.ajustes as AjustesPuerta} />);
    return r;
  };
  it("modo, usos y carriles cambian los ajustes", () => {
    pintar();
    fireEvent.click(document.querySelectorAll('input[name="puerta-modo-uso"]')[2]);
    expect((h.s.ajustes as AjustesPuerta).modoUso).toBe("nunca");
    cleanup();
    pintar();
    const ia = screen.getByTestId("usos-malla").querySelectorAll("input")[4] as HTMLInputElement;
    fireEvent.click(ia);
    expect((h.s.ajustes as AjustesPuerta).usos.ia).toBe(false);
    cleanup();
    pintar();
    fireEvent.click(screen.getByTestId("carriles-malla").querySelector("input") as HTMLInputElement);
    expect((h.s.ajustes as AjustesPuerta).carriles.bluetooth).toBe(false);
  });
  it("una configuración guardada antes (usarPuertas:false) llega como «Nunca» y los puertos web se conservan", () => {
    const a = interpretarAjustes(JSON.stringify({ usarPuertas: false }));
    estado({ ajustes: a });
    pintar();
    expect((document.querySelectorAll('input[name="puerta-modo-uso"]')[2] as HTMLInputElement).checked).toBe(true);
    expect(a.puertosWeb).toEqual(expect.arrayContaining([80, 443, 8080, 8443]));
  });
});
