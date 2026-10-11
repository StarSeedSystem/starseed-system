import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { PanelCapasRed } from "../panel-capas-red";
import { AppearanceProvider } from "@/context/appearance-context";

/** Datos de fábrica para las capas. */
function capa(parcial: Partial<RespuestaCapas["catalogo"][0]>): RespuestaCapas["catalogo"][0] {
  return {
    id: "reflejo",
    version: "1.0",
    estado: "recomendado",
    dispositivos: 5,
    servidores: 3,
    espejos: 2,
    banco: "Latencia: 10ms, Tok/s: 100",
    aprendizaje: "Último ciclo: 2026-10-10",
    ...parcial,
  };
}

const DATOS_FAKE: RespuestaCapas = {
  catalogo: [
    capa({ id: "reflejo", estado: "recomendado" }),
    capa({ id: "memoria", estado: "respaldo", dispositivos: 0, servidores: 0, banco: "pendiente" }),
    capa({ id: "palabra", estado: "nuevo", dispositivos: 0, servidores: 0, banco: "algo otro" }),
  ],
  espejos: {
    ok: true,
    mensaje: "Todos los espejos están sincronizados",
  },
};

/** Simula la API local con los datos dados. */
function simularApi(datos: RespuestaCapas) {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(datos), { status: 200 }),
  ));
}

/** Simula un error de red. */
function simularError() {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(null, { status: 500 }),
  ));
}

describe("PanelCapasRed", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra el estado de carga mientras se obtienen los datos", async () => {
    // No stubbeamos fetch para simular carga lenta
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);
    expect(await screen.findByText(/Leyendo el estado de las capas/)).toBeInTheDocument();
  });

  it("muestra el mensaje de solo local cuando la API devuelve 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(null, { status: 404 }),
    ));
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);
    expect(await screen.findByText(/El panel de capas solo funciona en tu máquina/)).toBeInTheDocument();
  });

  it("muestra un error cuando la API falla", async () => {
    simularError();
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);
    expect(await screen.findByText(/No se pudo leer el estado de las capas/)).toBeInTheDocument();
  });

  it("pinta el catálogo de capas con los datos correctos", async () => {
    simularApi(DATOS_FAKE);
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);

    // Espera a que se carguen los datos
    expect(await screen.findByText(/Capas autoadaptables/)).toBeInTheDocument();

    // Comprueba las filas de la tabla usando los testid
    const reflejoRow = screen.getByTestId("capa-reflejo");
    const reflejoCells = Array.from(reflejoRow.querySelectorAll("td"));
    expect(reflejoCells[0]).toHaveTextContent("reflejo");
    expect(reflejoCells[1]).toHaveTextContent("1.0");
    expect(reflejoCells[2]).toHaveTextContent("Recomendado");
    expect(reflejoCells[3]).toHaveTextContent("5"); // dispositivos
    expect(reflejoCells[4]).toHaveTextContent("3"); // servidores
    expect(reflejoCells[5]).toHaveTextContent("2"); // espejos
    expect(reflejoCells[6]).toHaveTextContent("Latencia: 10ms, Tok/s: 100");

    const memoriaRow = screen.getByTestId("capa-memoria");
    const memoriaCells = Array.from(memoriaRow.querySelectorAll("td"));
    console.log("memoriaCells:", memoriaCells.map(cell => cell.textContent));
    expect(memoriaCells[0]).toHaveTextContent("memoria");
    expect(memoriaCells[1]).toHaveTextContent("1.0");
    expect(memoriaCells[2]).toHaveTextContent("Respaldo");
    expect(memoriaCells[3]).toHaveTextContent("sin medir"); // dispositivos
    expect(memoriaCells[4]).toHaveTextContent("sin medir"); // servidores
    expect(memoriaCells[5]).toHaveTextContent("2"); // espejos
    expect(memoriaCells[6]).toHaveTextContent("pendiente"); // banco

    const palabraRow = screen.getByTestId("capa-palabra");
    const palabraCells = Array.from(palabraRow.querySelectorAll("td"));
    expect(palabraCells[0]).toHaveTextContent("palabra");
    expect(palabraCells[1]).toHaveTextContent("1.0");
    expect(palabraCells[2]).toHaveTextContent("Nuevo en banco");
    expect(palabraCells[3]).toHaveTextContent("sin medir"); // dispositivos
    expect(palabraCells[4]).toHaveTextContent("sin medir"); // servidores
    expect(palabraCells[5]).toHaveTextContent("2"); // espejos
    expect(palabraCells[6]).toHaveTextContent("algo otro"); // banco
  });

  it("muestra el estado de los espejos", async () => {
    simularApi(DATOS_FAKE);
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);
    expect(await screen.findByText(/Estado de los espejos/)).toBeInTheDocument();
    const mensaje = screen.getByTestId("espejos-mensaje");
    expect(mensaje).toHaveTextContent("Todos los espejos están sincronizados");
    expect(mensaje).toHaveClass("text-sm text-white/70");
    // Check that the success indicator is present (the span with the checkmark icon)
    // We can check that there is an element with the text and the class "text-emerald-200"
    expect(screen.getAllByText(/Todos los espejos están sincronizados/i)).toHaveLength(2);
    const successEl = screen.getAllByText(/Todos los espejos están sincronizados/i).find(el =>
      el.classList.contains("text-emerald-200")
    );
    expect(successEl).toBeInTheDocument();
  });

  it("lanza la acción de comprobar versiones al hacer clic en el botón", async () => {
    simularApi(DATOS_FAKE);
    const fetchMock = vi.mocked(fetch);
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);
    await waitFor(() => {
      expect(screen.getByText(/Comprobar versiones/)).toBeInTheDocument();
    });
    const botonComprobar = screen.getByRole("button", { name: /comprobar versiones/i } );
    await userEvent.click(botonComprobar);
    console.log('fetchMock calls:', fetchMock.mock.calls);
    // Espera a que se llame a fetch con el método POST y el cuerpo correcto
    expect(fetchMock).toHaveBeenCalledWith("/api/mando/capas", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "comprobar" }),
    }));
  });

  it("lanza la acción de correr banco al hacer clic en el botón", async () => {
    simularApi(DATOS_FAKE);
    const fetchMock = vi.mocked(fetch);
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);
    await waitFor(() => {
      expect(screen.getByText(/Correr banco/)).toBeInTheDocument();
    });
    const botonBanco = screen.getByRole("button", { name: /correr banco/i });
    await userEvent.click(botonBanco);
    expect(fetchMock).toHaveBeenCalledWith("/api/mando/capas", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "banco" }),
    }));
  });

  it("recarga los datos después de una acción", async () => {
    simularApi(DATOS_FAKE);
    const fetchMock = vi.mocked(fetch);
    render(<AppearanceProvider><PanelCapasRed /></AppearanceProvider>);
    await waitFor(() => {
      expect(screen.getByText(/Comprobar versiones/)).toBeInTheDocument();
    });
    const botonComprobar = screen.getByRole("button", { name: /comprobar versiones/i } );
    await userEvent.click(botonComprobar);
    // Debería haber tres llamadas: 
    // 1. carga inicial (GET)
    // 2. acción de comprobar (POST)
    // 3. recarga después de la acción (GET)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});