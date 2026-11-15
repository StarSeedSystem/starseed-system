/**
 * (NEU1115G) «Este aparato y su neurona»: la lista de neuronas con sus aparatos, y el caso del dueño
 * (el móvil elige «Maggadroid»; la tableta sigue siendo el único aparato de «Maggaboard»).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const TABLET = "e0b9faf2-aaaa-4000-8000-000000000001";
const MOVIL = "659d5e03-bbbb-4000-8000-000000000002";
const mover = vi.hoisted(() => vi.fn(async () => ({ ok: true, anterior: "", nueva: "" })));
vi.mock("@/lib/neurons/neurons", () => ({
  NEURON_EVENT: "starseed:neurons",
  cambiarNeuronaDeEsteAparato: mover,
  nombreEsteAparato: () => "",
  renombrarEsteAparato: vi.fn(async () => true),
  resolverAliasEsteMedio: () => TABLET,
  thisDeviceId: () => TABLET,
  listNeurons: vi.fn(async () => [
    { id: TABLET, name: "Maggaboard", capabilities: { aparato: { v: 1, equipo: "Samsung SM-X205" } } },
    { id: MOVIL, name: "Maggadroid", capabilities: { aparatos: { [MOVIL]: { ts: 5, n: "Móvil de Alex" } } } },
  ]),
}));

import { AparatoEnNeurona } from "./aparato-en-neurona";
import { AppearanceProvider } from "@/context/appearance-context";

afterEach(() => cleanup());

describe("AparatoEnNeurona", () => {
  it("lista cada neurona con sus aparatos y no mueve nada hasta que la persona elige y confirma", async () => {
    render(<AppearanceProvider><AparatoEnNeurona /></AppearanceProvider>);
    await screen.findByText(/Neurona de este aparato/);
    await userEvent.click(screen.getByRole("button", { name: /Vincularlo a otra neurona/ }));
    expect(await screen.findByText(/Aparatos que ya la usan: Móvil de Alex/)).toBeInTheDocument();
    expect(mover).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Elegir esta neurona/ }));
    expect(mover).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Vincular este aparato a «Maggadroid»/ }));
    await waitFor(() => expect(mover).toHaveBeenCalledWith(MOVIL, undefined));
  });

  it("desvincular está desactivado cuando el aparato es el único de su neurona", async () => {
    render(<AppearanceProvider><AparatoEnNeurona /></AppearanceProvider>);
    await screen.findByText(/Neurona de este aparato/);
    expect(screen.getByRole("button", { name: /Desvincular este aparato/ })).toBeDisabled();
  });
});
