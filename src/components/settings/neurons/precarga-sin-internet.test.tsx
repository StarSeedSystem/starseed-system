"use client";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { PrecargaSinInternet } from "./precarga-sin-internet";

const EVENTO_PRECARGA = "starseed:precarga";

function setPrecargaEstado(estado: unknown) {
  const win = window as unknown as { STARSEED_PRECARGA?: unknown };
  win.STARSEED_PRECARGA = estado;
  window.dispatchEvent(new CustomEvent(EVENTO_PRECARGA, { detail: estado }));
}

function clearPrecarga() {
  const win = window as unknown as { STARSEED_PRECARGA?: unknown; STARSEED_PRECARGAR?: unknown };
  win.STARSEED_PRECARGA = undefined;
  win.STARSEED_PRECARGAR = undefined;
}

function mockServiceWorker(exists = true) {
  const nav = global.navigator as unknown as { serviceWorker?: unknown };
  if (exists) {
    nav.serviceWorker = { controller: null, ready: Promise.resolve({ active: null }) };
  } else {
    delete nav.serviceWorker;
  }
}

describe("PrecargaSinInternet", () => {
  beforeEach(() => {
    clearPrecarga();
    mockServiceWorker(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("muestra 'Aún no hay datos de la precarga' sin estado", () => {
    render(<PrecargaSinInternet />);
    screen.getByText("Aún no hay datos de la precarga");
  });

  it("muestra estado parcial con cifras y motivo", () => {
    setPrecargaEstado({
      completo: false,
      guardados: 5,
      planificados: 10,
      bytes: 2_500_000,
      motivo: "ahorro-de-datos",
      fase: "precargando",
      nivel: "parcial",
      buildId: "abc",
      permanentes: 0,
      transitorios: 0,
      rutas: 3,
      rutasTotales: 8,
      terminado: Date.now(),
    });
    render(<PrecargaSinInternet />);
    screen.getByText(/Guardadas 5 de 10/);
    screen.getByText(/2\.5 MB/);
    screen.getByText(/ahorro-de-datos/);
  });

  it("actualiza al recibir el evento starseed:precarga", async () => {
    render(<PrecargaSinInternet />);
    screen.getByText("Aún no hay datos de la precarga");

    setPrecargaEstado({
      completo: true,
      guardados: 8,
      planificados: 8,
      bytes: 5_000_000,
      motivo: null,
      fase: "lista",
      nivel: "completo",
      buildId: "abc",
      permanentes: 0,
      transitorios: 0,
      rutas: 6,
      rutasTotales: 6,
      terminado: Date.now(),
    });

    await waitFor(() => {
      screen.getByText("Lista para usar sin internet");
    });
  });

  it("muestra 'Lista para usar sin internet' cuando completo es true", () => {
    setPrecargaEstado({
      completo: true,
      guardados: 8,
      planificados: 8,
      bytes: 5_000_000,
      motivo: null,
      fase: "lista",
      nivel: "completo",
      buildId: "abc",
      permanentes: 0,
      transitorios: 0,
      rutas: 6,
      rutasTotales: 6,
      terminado: Date.now(),
    });
    render(<PrecargaSinInternet />);
    screen.getByText("Lista para usar sin internet");
  });

  it("el botón llama a window.STARSEED_PRECARGAR(true)", () => {
    const win = window as unknown as { STARSEED_PRECARGAR?: (forzar?: boolean) => boolean };
    win.STARSEED_PRECARGAR = vi.fn();

    setPrecargaEstado({
      completo: false,
      guardados: 5,
      planificados: 10,
      bytes: 2_500_000,
      motivo: "ahorro-de-datos",
      fase: "precargando",
      nivel: "parcial",
      buildId: "abc",
      permanentes: 0,
      transitorios: 0,
      rutas: 3,
      rutasTotales: 8,
      terminado: Date.now(),
    });
    render(<PrecargaSinInternet />);
    const button = screen.getByRole("button", { name: /descargar la app para usarla sin internet/i });
    fireEvent.click(button);

    expect(win.STARSEED_PRECARGAR).toHaveBeenCalledWith(true);
  });

  it("deshabilita el botón y muestra aviso sin serviceWorker", () => {
    mockServiceWorker(false);
    setPrecargaEstado({
      completo: false,
      guardados: 5,
      planificados: 10,
      bytes: 2_500_000,
      motivo: "ahorro-de-datos",
      fase: "precargando",
      nivel: "parcial",
      buildId: "abc",
      permanentes: 0,
      transitorios: 0,
      rutas: 3,
      rutasTotales: 8,
      terminado: Date.now(),
    });
    render(<PrecargaSinInternet />);

    screen.getByText("Este navegador no puede guardar la app para usarla sin internet");
  });
});