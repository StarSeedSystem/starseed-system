import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const TABLET = "e0b9faf2-aaaa-4000-8000-000000000001";
const MOVIL = "659d5e03-bbbb-4000-8000-000000000002";
const mover = vi.hoisted(() => vi.fn(async () => ({ ok: true, anterior: "", nueva: "" })));
const aparatoDeEsteMedio = vi.hoisted(() => vi.fn(async () => ({
  v: 1,
  equipo: "Samsung Galaxy Tab S9",
  so: "android",
  soV: "14",
})));

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
vi.mock("@/lib/neurons/aparato-este-medio", () => ({ aparatoDeEsteMedio }));

import { AparatoNuevoDialogo } from "../aparato-nuevo-dialogo";
import { AppearanceProvider } from "@/context/appearance-context";

const pintar = () => render(<AppearanceProvider><AparatoNuevoDialogo /></AppearanceProvider>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AparatoNuevoDialogo", () => {
  it("monta con el modelo y el sistema detectados, sin elegir por la persona", async () => {
    pintar();
    await screen.findByText(/Este aparato es nuevo/);
    expect(await screen.findByText(/Samsung Galaxy Tab S9/)).toBeInTheDocument();
    expect(await screen.findByText(/Android 14/)).toBeInTheDocument();
    expect(screen.getByText(/Recomendado/)).toBeInTheDocument();
    expect(mover).not.toHaveBeenCalled();
    expect(screen.getByText(/Este aparato es nuevo/)).toBeInTheDocument();
  });

  it("crea una neurona propia con el nombre propuesto y editable", async () => {
    pintar();
    await screen.findByText(/Este aparato es nuevo/);
    await userEvent.click(screen.getByRole("button", { name: /Crear una neurona nueva para este aparato/ }));
    const campo = await screen.findByLabelText("Nombre de la neurona nueva");
    expect(campo).toHaveValue("Tableta de Maggasukha");
    await userEvent.clear(campo);
    expect(screen.getByRole("button", { name: "Crear y usar en este aparato" })).toBeDisabled();
    await userEvent.type(campo, "Neurona de la tableta");
    expect(mover).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Crear y usar en este aparato" }));
    await waitFor(() => expect(mover).toHaveBeenCalledWith(null, "Neurona de la tableta"));
    expect(await screen.findByRole("status")).toHaveTextContent(/propia neurona/);
  });

  it("une a una neurona existente avisando del aparato que ya la usa", async () => {
    pintar();
    await screen.findByText(/Este aparato es nuevo/);
    await userEvent.click(screen.getByRole("button", { name: /Unirlo a una neurona existente/ }));
    expect(await screen.findByText(/Aparatos que ya la usan: Móvil de Maggasukha/)).toBeInTheDocument();
    expect(screen.getByText(/vista hace/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Elegir esta neurona/ }));
    expect(await screen.findByText(/ya la usa otro aparato/)).toBeInTheDocument();
    expect(mover).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Vincular este aparato a «Maggadroid»/ }));
    await waitFor(() => expect(mover).toHaveBeenCalledWith(MOVIL, undefined));
  });

  it("posponer deja el aviso visible sin mover el aparato", async () => {
    pintar();
    await screen.findByText(/Este aparato es nuevo/);
    await userEvent.click(screen.getByRole("button", { name: "Posponer" }));
    expect(mover).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(/Aviso pospuesto/);
    expect(screen.getByText(/Este aparato es nuevo/)).toBeInTheDocument();
  });
});
