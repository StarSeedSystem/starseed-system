/**
 * (NEU1115G) «Este aparato y su neurona»: la lista de neuronas con sus aparatos, y el caso del dueño
 * (el móvil elige «Maggadroid»; la tableta sigue siendo el único aparato de «Maggaboard»).
 * (NEU1125B-d2) Ventana «Este aparato es nuevo» al detectar huella distinta.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const TABLET = "e0b9faf2-aaaa-4000-8000-000000000001";
const MOVIL = "659d5e03-bbbb-4000-8000-000000000002";
const CLAVE_HUELLA_REVISION = "starseed.neuron.huella-revision.v1";

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
  renombrarEsteAparato: vi.fn(async () => true),
  resolverAliasEsteMedio: () => TABLET,
  thisDeviceId: () => TABLET,
  listNeurons: vi.fn(async () => [
    { id: TABLET, name: "Maggaboard", capabilities: { aparato: { v: 1, equipo: "Samsung SM-X205" } } },
    { id: MOVIL, name: "Maggadroid", capabilities: { aparatos: { [MOVIL]: { ts: Date.now() - 90_000, n: "Móvil de Maggasukha" } } } },
  ]),
}));

vi.mock("@/lib/neurons/aparato-este-medio", () => ({ aparatoDeEsteMedio }));

import { AparatoEnNeurona } from "./aparato-en-neurona";
import { AppearanceProvider } from "@/context/appearance-context";

function pintar() {
  return render(<AppearanceProvider><AparatoEnNeurona /></AppearanceProvider>);
}

function setupHuellaRevision() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CLAVE_HUELLA_REVISION, JSON.stringify({ v: 1, ts: Date.now() }));
  }
}

function clearHuellaRevision() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CLAVE_HUELLA_REVISION);
  }
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  clearHuellaRevision();
});

describe("AparatoEnNeurona", () => {
  it("lista cada neurona con sus aparatos y no mueve nada hasta que la persona elige y confirma", async () => {
    pintar();
    await screen.findByText(/Neurona de este aparato/);
    await userEvent.click(screen.getByRole("button", { name: /Vincularlo a otra neurona/ }));
    expect(await screen.findByText(/Aparatos que ya la usan: Móvil de Maggasukha/)).toBeInTheDocument();
    expect(mover).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Elegir esta neurona/ }));
    expect(mover).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Vincular este aparato a «Maggadroid»/ }));
    await waitFor(() => expect(mover).toHaveBeenCalledWith(MOVIL, undefined));
  });

  it("desvincular está desactivado cuando el aparato es el único de su neurona", async () => {
    pintar();
    await screen.findByText(/Neurona de este aparato/);
    expect(screen.getByRole("button", { name: /Desvincular este aparato/ })).toBeDisabled();
  });

  describe("NEU1125B-d2 · Ventana «Este aparato es nuevo»", () => {
    beforeEach(() => {
      setupHuellaRevision();
    });

    it("aparece la sección «Este aparato es nuevo» con modelo y sistema detectados", async () => {
      pintar();
      await screen.findByText(/Este aparato es nuevo/);
      expect(screen.getByText(/Samsung Galaxy Tab S9/)).toBeInTheDocument();
      expect(screen.getByText(/Android 14/)).toBeInTheDocument();
    });

it("muestra el camino recomendado: crear neurona nueva con nombre propuesto editable", async () => {
      pintar();
      await screen.findByText(/Este aparato es nuevo/);
      expect(screen.getByText(/Recomendado/)).toBeInTheDocument();
      // Usar el botón dentro de la sección "Este aparato es nuevo" (el que tiene el badge Recomendado)
      const botonCrearNueva = screen.getAllByRole("button", { name: /Crear una neurona nueva para este aparato/ })[0];
      await userEvent.click(botonCrearNueva);
      const campo = await screen.findByLabelText("Nombre de la neurona nueva");
      expect(campo).toHaveValue("Tableta de Maggasukha");
      expect(mover).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Crear y usar en este aparato" }));
      await waitFor(() => expect(mover).toHaveBeenCalledWith(null, "Tableta de Maggasukha"));
      expect(await screen.findByRole("status")).toHaveTextContent(/propia neurona/);
    });

    it("crear neurona nueva llama a mover con el nombre editado", async () => {
      pintar();
      await screen.findByText(/Este aparato es nuevo/);
      const botonCrearNueva = screen.getAllByRole("button", { name: /Crear una neurona nueva para este aparato/ })[0];
      await userEvent.click(botonCrearNueva);
      const campo = await screen.findByLabelText("Nombre de la neurona nueva");
      await userEvent.clear(campo);
      await userEvent.type(campo, "Mi nueva neurona");
      await userEvent.click(screen.getByRole("button", { name: /Crear y usar en este aparato/ }));
      await waitFor(() => expect(mover).toHaveBeenCalledWith(null, "Mi nueva neurona"));
    });

    it("unir a existente muestra la lista con aparatos y última vez vista", async () => {
      pintar();
      await screen.findByText(/Este aparato es nuevo/);
      await userEvent.click(screen.getByRole("button", { name: /Unirlo a una neurona existente/ }));
      expect(await screen.findByText(/Aparatos que ya la usan: Móvil de Maggasukha/)).toBeInTheDocument();
      expect(await screen.findByText(/vista hace/)).toBeInTheDocument();
    });

    it("unir a existente no mueve hasta confirmar", async () => {
      pintar();
      await screen.findByText(/Este aparato es nuevo/);
      await userEvent.click(screen.getByRole("button", { name: /Unirlo a una neurona existente/ }));
      await userEvent.click(screen.getByRole("button", { name: /Elegir esta neurona/ }));
      expect(mover).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: /Vincular este aparato a «Maggadroid»/ }));
      await waitFor(() => expect(mover).toHaveBeenCalledWith(MOVIL, undefined));
    });

    it("posponer no elige por la persona y deja el aviso visible", async () => {
      pintar();
      await screen.findByText(/Este aparato es nuevo/);
      await userEvent.click(screen.getByRole("button", { name: /Posponer/ }));
      expect(mover).not.toHaveBeenCalled();
      expect(await screen.findByRole("status")).toHaveTextContent(/Aviso pospuesto/);
      // La sección sigue visible
      expect(screen.getByText(/Este aparato es nuevo/)).toBeInTheDocument();
    });

    it("sin marca de huella no muestra la sección de aparato nuevo", async () => {
      clearHuellaRevision();
      pintar();
      await screen.findByText(/Neurona de este aparato/);
      expect(screen.queryByText(/Este aparato es nuevo/)).not.toBeInTheDocument();
    });
  });
});
