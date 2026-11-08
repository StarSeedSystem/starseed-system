import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { PanelCapasRed, resumenEspejos } from "../panel-capas-red";
import { AppearanceProvider } from "@/context/appearance-context";
import { construirResumenRed, type CapaCatalogo, type FilaCapaRed } from "@/lib/mando/capas-red";
import type { CapacidadesNodo } from "@/lib/network/capacidades-nodo";

interface Propuesta {
  id: string;
  capa: string;
  description: string;
  archivos: string[];
  prompt_inicio: string;
  referencia_funcion: string;
  enviada?: boolean;
}

interface RespuestaCapas {
  filas?: FilaCapaRed[];
  ultimaNoche: null;
  propuestas: Array<{ fecha: string; origen: string; propuestas: Propuesta[] }>;
}

/** Filas REALES: las construye la misma función pura que usa la ruta. */
function filasDe(capas: Array<{ id: string; espejos: number; sha?: boolean }>, fichas: CapacidadesNodo[] = []): FilaCapaRed[] {
  const catalogo: CapaCatalogo[] = capas.map((c) => ({
    id: c.id,
    capa: c.id,
    modelo: c.id,
    version: "1.0",
    estado: "recomendado",
    espejos: Array.from({ length: c.espejos }, (_, i) => `espejo-${i}`),
    sha256: c.sha === false ? null : "abc",
  }));
  return construirResumenRed({ catalogo, fichas }).filas;
}

const DATOS: RespuestaCapas = {
  filas: filasDe([{ id: "reflejo", espejos: 2 }, { id: "memoria", espejos: 0, sha: false }]),
  ultimaNoche: null,
  propuestas: [],
};

function simularApi(datos: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(datos), { status: 200 })));
}

function celda(row: HTMLElement, i: number): string {
  return Array.from(row.querySelectorAll("td"))[i].textContent ?? "";
}

describe("PanelCapasRed", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("pinta las filas reales con su SHA y los valores sin medir", async () => {
    simularApi(DATOS);
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);

    expect(await screen.findByText(/Capas autoadaptables/)).toBeInTheDocument();
    const reflejo = screen.getByTestId("capa-reflejo");
    expect(celda(reflejo, 0)).toBe("reflejo");
    expect(celda(reflejo, 1)).toBe("1.0");
    expect(celda(reflejo, 2)).toBe("Recomendado");
    expect(celda(reflejo, 3)).toBe("verificado");
    expect(celda(reflejo, 4)).toBe("sin medir");
    expect(celda(reflejo, 5)).toBe("sin medir");
    expect(celda(reflejo, 6)).toBe("2");
    expect(celda(reflejo, 7)).toBe("sin datos");

    const memoria = screen.getByTestId("capa-memoria");
    expect(celda(memoria, 3)).toBe("sin SHA");
    expect(celda(memoria, 6)).toBe("sin espejo");
  });

  it("resume los espejos a partir de las filas, sin inventar sincronización", () => {
    expect(resumenEspejos(filasDe([{ id: "a", espejos: 1 }, { id: "b", espejos: 2 }]))).toEqual({
      ok: true,
      mensaje: "Las 2 capas tienen al menos un espejo",
    });
    const parcial = resumenEspejos(filasDe([{ id: "a", espejos: 1 }, { id: "memoria", espejos: 0 }]));
    expect(parcial.ok).toBe(false);
    expect(parcial.mensaje).toContain("memoria");
    expect(resumenEspejos([])).toEqual({ ok: false, mensaje: "Sin catálogo de capas" });
  });

  it("no revienta con una respuesta vieja sin filas y pinta la tabla vacía", async () => {
    simularApi({ catalogo: [], espejos: { ok: true, mensaje: "x" }, ultimaNoche: null, propuestas: [] });
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);
    expect(await screen.findByText(/Catálogo de capas/)).toBeInTheDocument();
    expect(screen.queryByTestId("capa-reflejo")).not.toBeInTheDocument();
    expect(screen.getByTestId("espejos-mensaje")).toHaveTextContent("Sin catálogo de capas");
  });

  it("lanza las acciones de comprobar y banco y recarga", async () => {
    simularApi(DATOS);
    const fetchMock = vi.mocked(fetch);
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);
    await screen.findByText(/Comprobar versiones/);

    await userEvent.click(screen.getByRole("button", { name: /comprobar versiones/i }));
    expect(fetchMock).toHaveBeenCalledWith("/api/mando/capas", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "comprobar" }),
    }));
    await userEvent.click(screen.getByRole("button", { name: /correr banco/i }));
    expect(fetchMock).toHaveBeenCalledWith("/api/mando/capas", expect.objectContaining({
      body: JSON.stringify({ accion: "banco" }),
    }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  });

  it("pinta las propuestas pendientes con la forma nueva", async () => {
    simularApi({
      filas: [],
      ultimaNoche: null,
      propuestas: [{
        fecha: "2026-11-07",
        origen: "noche",
        propuestas: [{
          id: "p1",
          capa: "reflejo",
          description: "Mejorar umbral",
          archivos: ["a.ts"],
          prompt_inicio: "hazlo",
          referencia_funcion: "umbral",
        }],
      }],
    });
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);
    const fila = await screen.findByTestId("propuesta-p1");
    expect(fila).toHaveTextContent("Pendiente");
    await userEvent.click(within(fila).getByTitle("Mandar al enjambre"));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/mando/capas", expect.objectContaining({
      body: JSON.stringify({ accion: "mandar-propuesta", archivo: "2026-11-07.json", id: "p1" }),
    }));
  });
});
