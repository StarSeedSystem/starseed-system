import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { genomaBase, type Genoma } from "@/lib/laboratorio/genoma";

const confirmar = vi.hoisted(() => vi.fn());

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({
    config: { themeStore: { activeMode: "flat" }, styling: { crystalPreset: "none" } },
  }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => confirmar,
  usePrompt: () => vi.fn(),
}));
// El arrastre real necesita punteros y medidas que jsdom no tiene: este Slider de mentira separa
// las dos cosas que importan, un «tick» de arrastre (onValueChange) y el soltar (onValueCommit).
vi.mock("@/components/ui/slider", () => ({
  Slider: (props: {
    value: number[];
    onValueChange?: (v: number[]) => void;
    onValueCommit?: (v: number[]) => void;
    "aria-label"?: string;
  }) => (
    <div role="group" aria-label={props["aria-label"]}>
      <output data-testid="valor-del-deslizador">{props.value[0]}</output>
      <button type="button" onClick={() => props.onValueChange?.([0.3])}>
        arrastrar a 0.3
      </button>
      <button type="button" onClick={() => props.onValueChange?.([0.4])}>
        arrastrar a 0.4
      </button>
      <button type="button" onClick={() => props.onValueCommit?.([0.4])}>
        soltar en 0.4
      </button>
    </div>
  ),
}));

import { InspectorNodo } from "../inspector-nodo";

const NODO_LIBRE = "cre-temperatura"; // capa «creatividad» (mutabilidad 0.6), valor 0.8
const NODO_FUNDAMENTAL = "nuc-presupuesto"; // capa «nucleo» (mutabilidad 0.05), flopsMaximos 2e9

async function abrirParametros(genoma: Genoma, nodoId: string, onCambiar = vi.fn()) {
  const usuario = userEvent.setup();
  const vista = render(<InspectorNodo genoma={genoma} nodoId={nodoId} onCambiar={onCambiar} />);
  await usuario.click(screen.getByRole("tab", { name: "Parámetros" }));
  return { usuario, onCambiar, ...vista };
}

// Un nodo puede tener varios deslizadores (valor, minimo, maximo…): se acota por su etiqueta.
const deslizador = (clave: string) => within(screen.getByLabelText(`Alterar valor numérico de ${clave}`));
const valorMostrado = (clave: string) => deslizador(clave).getByTestId("valor-del-deslizador").textContent;
const boton = (clave: string, nombre: string) => deslizador(clave).getByRole("button", { name: nombre });

afterEach(() => {
  cleanup();
  confirmar.mockReset();
});

describe("InspectorNodo · deslizador de parámetros numéricos", () => {
  it("arrastrar solo mueve la previsualización: no aplica nada hasta soltar", async () => {
    const { usuario, onCambiar } = await abrirParametros(genomaBase(), NODO_LIBRE);
    expect(valorMostrado("valor")).toBe("0.8");

    await usuario.click(boton("valor", "arrastrar a 0.3"));
    await usuario.click(boton("valor", "arrastrar a 0.4"));

    expect(valorMostrado("valor")).toBe("0.4");
    expect(onCambiar).not.toHaveBeenCalled();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("al soltar aplica una sola vez el valor final al genoma", async () => {
    const { usuario, onCambiar } = await abrirParametros(genomaBase(), NODO_LIBRE);

    await usuario.click(boton("valor", "arrastrar a 0.3"));
    await usuario.click(boton("valor", "arrastrar a 0.4"));
    await usuario.click(boton("valor", "soltar en 0.4"));

    await waitFor(() => expect(onCambiar).toHaveBeenCalledTimes(1));
    const nuevo = onCambiar.mock.calls[0][0] as Genoma;
    expect(nuevo.nodos.find((n) => n.id === NODO_LIBRE)?.parametros.valor).toBe(0.4);
  });

  it("en una capa fundamental pide confirmación al soltar, no al empezar a arrastrar", async () => {
    confirmar.mockResolvedValue(true);
    const { usuario, onCambiar } = await abrirParametros(genomaBase(), NODO_FUNDAMENTAL);

    await usuario.click(boton("flopsMaximos", "arrastrar a 0.3"));
    await usuario.click(boton("flopsMaximos", "arrastrar a 0.4"));
    expect(confirmar).not.toHaveBeenCalled();
    expect(onCambiar).not.toHaveBeenCalled();

    await usuario.click(boton("flopsMaximos", "soltar en 0.4"));
    await waitFor(() => expect(onCambiar).toHaveBeenCalledTimes(1));
    expect(confirmar).toHaveBeenCalledTimes(1);
  });

  it("si se cancela la confirmación no cambia nada y el deslizador vuelve a su valor", async () => {
    confirmar.mockResolvedValue(false);
    const { usuario, onCambiar } = await abrirParametros(genomaBase(), NODO_FUNDAMENTAL);
    const original = valorMostrado("flopsMaximos");

    await usuario.click(boton("flopsMaximos", "arrastrar a 0.4"));
    expect(valorMostrado("flopsMaximos")).toBe("0.4");
    await usuario.click(boton("flopsMaximos", "soltar en 0.4"));

    await waitFor(() => expect(valorMostrado("flopsMaximos")).toBe(original));
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it("sigue al valor externo cuando cambia (restablecer, otro nodo, otra versión)", async () => {
    const genoma = genomaBase();
    const { rerender } = await abrirParametros(genoma, NODO_LIBRE);
    fireEvent.click(boton("valor", "arrastrar a 0.3"));
    expect(valorMostrado("valor")).toBe("0.3");

    const externo: Genoma = {
      ...genoma,
      nodos: genoma.nodos.map((n) =>
        n.id === NODO_LIBRE ? { ...n, parametros: { ...n.parametros, valor: 1.2 } } : n,
      ),
    };
    rerender(<InspectorNodo genoma={externo} nodoId={NODO_LIBRE} onCambiar={vi.fn()} />);
    expect(valorMostrado("valor")).toBe("1.2");
  });
});
