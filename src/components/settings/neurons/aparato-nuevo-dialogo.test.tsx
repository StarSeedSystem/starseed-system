/**
 * (NEU1125B · parte 1) Ventana «Este aparato es nuevo»: montaje, los dos caminos y posponer.
 * El modelo y el sistema detectados salen de `aparatoDeEsteMedio` (mockeado aquí, puro en el módulo).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const TABLET = "e0b9faf2-aaaa-4000-8000-000000000001";
const MOVIL = "659d5e03-bbbb-4000-8000-000000000002";
const mover = vi.hoisted(() => vi.fn(async () => ({ ok: true, anterior: "", nueva: "" })));
const aparatoMedio = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/neurons/neurons", () => ({
  NEURON_EVENT: "starseed:neurons",
  cambiarNeuronaDeEsteAparato: mover,
  nombreEsteAparato: () => "Tableta de Maggasukha",
  resolverAliasEsteMedio: () => TABLET,
  thisDeviceId: () => TABLET,
  listNeurons: vi.fn(async () => [
    { id: TABLET, name: "Maggaboard", capabilities: { aparato: { v: 1, equipo: "Samsung SM-X205" } } },
    { id: MOVIL, name: "Maggadroid", capabilities: { aparatos: { [MOVIL]: { ts: Date.now() - 90_000, n: "Móvil de Maggasukha" } } } },
  ]),
}));
vi.mock("@/lib/neurons/aparato-este-medio", () => ({ aparatoDeEsteMedio: aparatoMedio }));

import { AparatoNuevoDialogo, textoUltimaVez, nombrePropuesto, tipoAparato, NOMBRE_SO } from "./aparato-nuevo-dialogo";
import { AppearanceProvider } from "@/context/appearance-context";

const pintar = () => render(<AppearanceProvider><AparatoNuevoDialogo /></AppearanceProvider>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("lógica pura (exportada)", () => {
  it("textoUltimaVez: solo con visto real, nada inventado", () => {
    const ahora = 1_000_000_000_000;
    expect(textoUltimaVez(undefined, ahora)).toBe("");
    expect(textoUltimaVez(0, ahora)).toBe("");
    expect(textoUltimaVez(ahora + 5_000, ahora)).toBe("");
    expect(textoUltimaVez(ahora - 30_000, ahora)).toBe("vista hace 0 min");
    expect(textoUltimaVez(ahora - 3 * 60_000, ahora)).toBe("vista hace 3 min");
    expect(textoUltimaVez(ahora - 2 * 3_600_000, ahora)).toBe("vista hace 2 h");
    expect(textoUltimaVez(ahora - 3 * 86_400_000, ahora)).toBe("vista hace 3 d");
  });

  it("nombrePropuesto: el nombre del aparato, o uno neutro si no se conoce", () => {
    expect(nombrePropuesto("Tableta de Maggasukha")).toBe("Tableta de Maggasukha");
    expect(nombrePropuesto(" con   espacios ")).toBe("con espacios");
    expect(nombrePropuesto("")).toBe("Neurona nueva");
    expect(nombrePropuesto(null)).toBe("Neurona nueva");
    expect(nombrePropuesto(undefined)).toBe("Neurona nueva");
  });

  it("tipoAparato y NOMBRE_SO", () => {
    expect(tipoAparato("android")).toBe(true);
    expect(tipoAparato("")).toBe(false);
    expect(tipoAparato(null)).toBe(false);
    expect(NOMBRE_SO.android).toBe("Android");
  });
});

describe("AparatoNuevoDialogo (montaje)", () => {
  it("monta, enseña el camino recomendado con el nombre propuesto y crea la neurona al confirmar", async () => {
    pintar();
    await screen.findByText(/Este aparato es nuevo/);
    expect(screen.getByText(/Recomendado/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Crear una neurona nueva para este aparato/ }));
    const campo = await screen.findByLabelText("Nombre de la neurona nueva");
    expect(campo).toHaveValue("Tableta de Maggasukha");
    expect(mover).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Crear y usar en este aparato" }));
    await waitFor(() => expect(mover).toHaveBeenCalledWith(null, "Tableta de Maggasukha"));
    expect(await screen.findByRole("status")).toHaveTextContent(/propia neurona/);
  });

  it("unir a una existente: lista con aparato y última vez vista, y no mueve nada hasta confirmar", async () => {
    pintar();
    await screen.findByText(/Este aparato es nuevo/);
    await userEvent.click(screen.getByRole("button", { name: /Unirlo a una neurona existente/ }));
    expect(await screen.findByText(/Aparatos que ya la usan: Móvil de Maggasukha · vista hace 1 min/)).toBeInTheDocument();
    expect(mover).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Elegir esta neurona/ }));
    expect(mover).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Vincular este aparato a «Maggadroid»/ }));
    await waitFor(() => expect(mover).toHaveBeenCalledWith(MOVIL, undefined));
  });

  it("posponer no elige por la persona y deja el aviso visible", async () => {
    pintar();
    await screen.findByText(/Este aparato es nuevo/);
    await userEvent.click(screen.getByRole("button", { name: "Posponer" }));
    expect(mover).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(/Aviso pospuesto/);
  });
});
