/**
 * «Nueva estación» con fuente EN VIVO: el selector de fuente, el formulario de la entonación y lo
 * que se enseña al publicar (enlaces de escuchar e invitar, y de control). La creación real
 * (llaves, directorio) está probada en lib; aquí se simula.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceProvider } from "@/context/appearance-context";

const crear = vi.fn();
vi.mock("@/lib/estaciones/crear-sesion", () => ({ crearSesionEnVivo: (...a: unknown[]) => crear(...a) }));

import { NuevaEstacion } from "../nueva-estacion";

const wrap = (ui: React.ReactNode) => <AppearanceProvider>{ui}</AppearanceProvider>;

describe("NuevaEstacion · en vivo", () => {
  afterEach(cleanup);
  it("por defecto sigue siendo el formulario de enlace de siempre", () => {
    render(wrap(<NuevaEstacion abierto onCerrar={() => {}} />));
    expect(screen.getByRole("button", { name: /guardar/i })).toBeTruthy();
    expect(screen.queryByTestId("fuente-en-vivo")).toBeNull();
  });

  it("elige Omnifrecuencias en vivo, una frecuencia, y publica", async () => {
    const user = userEvent.setup();
    crear.mockResolvedValue({
      ok: true,
      ficha: { id: "abcdefghijklmnopqrstuv", privada: true },
      enlace: "/estaciones/vivo/abcdefghijklmnopqrstuv#f=x&k=y",
      enlaceControl: "/estaciones/vivo/abcdefghijklmnopqrstuv#f=x&k=y&c=z",
      estacion: null,
    });
    render(wrap(<NuevaEstacion abierto onCerrar={() => {}} />));
    await user.click(screen.getByRole("radio", { name: /omnifrecuencias en vivo/i }));
    expect(await screen.findByTestId("fuente-en-vivo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^guardar$/i })).toBeNull();

    await user.type(screen.getByLabelText(/título/i), "Círculo 432");
    await user.click(screen.getByRole("button", { name: /una frecuencia/i }));
    const hz = screen.getByLabelText(/frecuencia en hz/i);
    await user.clear(hz);
    await user.type(hz, "528");
    await user.click(screen.getByRole("radio", { name: /privada/i }));
    await user.click(screen.getByRole("button", { name: /publicar en vivo/i }));

    await waitFor(() => expect(crear).toHaveBeenCalled());
    const datos = crear.mock.calls[0][0];
    expect(datos).toMatchObject({ fuente: "omnifrecuencias", titulo: "Círculo 432", privada: true });
    expect(datos.params.entonacion.osciladores[0].f).toBe(528);
    expect(await screen.findByTestId("en-vivo-publicada")).toBeTruthy();
    expect(screen.getByRole("link", { name: /abrir la estación/i }).getAttribute("href")).toContain("/estaciones/vivo/");
    expect(screen.getByRole("button", { name: /copiar invitación/i })).toBeTruthy();
  });

  it("un JSON que no sirve no se publica y se dice por qué", async () => {
    const user = userEvent.setup();
    crear.mockClear();
    render(wrap(<NuevaEstacion abierto onCerrar={() => {}} modoInicial="omnifrecuencias" />));
    await user.type(await screen.findByLabelText(/título/i), "Prueba");
    await user.click(screen.getByRole("button", { name: /pegar json/i }));
    await user.type(screen.getByLabelText(/parámetros en json/i), "hola");
    await user.click(screen.getByRole("button", { name: /publicar en vivo/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(crear).not.toHaveBeenCalled();
  });
});
