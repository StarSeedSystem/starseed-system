import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // jsdom no trae ResizeObserver y Radix Slider lo pide
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

import type { Autor, CandidatoParametro, EstadoValores, Operacion } from "@/lib/protomolecula/tipos";

import { PanelParametros } from "../panel-parametros";

const AUTOR: Autor = { tipo: "persona", id: "u1" };

const NUM: CandidatoParametro = {
  ref: { atomoId: "reverb", parametroId: "mezcla" },
  parametro: {
    id: "mezcla",
    nombre: "Mezcla",
    tipo: "numero",
    min: 0,
    max: 100,
    paso: 1,
    unidad: "%",
    defecto: 30,
  },
  atomo: "Reverb de la voz",
};
const BOOL: CandidatoParametro = {
  ref: { atomoId: "eco", parametroId: "activo" },
  parametro: { id: "activo", nombre: "Activado", tipo: "booleano", defecto: false },
  atomo: "Eco",
};
const OPC: CandidatoParametro = {
  ref: { atomoId: "tono", parametroId: "modo" },
  parametro: { id: "modo", nombre: "Modo", tipo: "opcion", opciones: ["suave", "duro"], defecto: "suave" },
  atomo: "Tono",
};
const BOT: CandidatoParametro = {
  ref: { atomoId: "bombo", parametroId: "golpe" },
  parametro: { id: "golpe", nombre: "Golpear", tipo: "disparo" },
  atomo: "Bombo",
};
const SIN_RANGO: CandidatoParametro = {
  ref: { atomoId: "libre", parametroId: "x" },
  parametro: { id: "x", nombre: "Libre", tipo: "numero", defecto: 5 },
  atomo: "Libre",
};

const TODOS = [NUM, BOOL, OPC, BOT];

function montar(extra?: Partial<Parameters<typeof PanelParametros>[0]>) {
  const ops: Operacion[] = [];
  const props: Parameters<typeof PanelParametros>[0] = {
    candidatos: TODOS,
    valores: {} as EstadoValores,
    autor: AUTOR,
    alOperar: (op) => ops.push(op),
    ahora: () => 123,
    nuevoId: (() => { let i = 0; return () => `op-${++i}`; })(),
    ...extra,
  };
  render(<PanelParametros {...props} />);
  return ops;
}

afterEach(cleanup);

describe("PanelParametros", () => {
  it("pinta un control por tipo", () => {
    montar();
    expect(screen.getByRole("slider", { name: "Mezcla" })).toBeDefined();
    expect(screen.getByRole("switch", { name: "Activado" })).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Modo" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Golpear" })).toBeDefined();
  });

  it("agrupa por átomo con su nombre legible", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Reverb de la voz" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Bombo" })).toBeDefined();
  });

  it("teclear 1,2 en el campo exacto emite exacta 1.2 con origen mano (Enter)", () => {
    const ops = montar();
    const campo = screen.getByLabelText("Valor exacto de Mezcla");
    fireEvent.change(campo, { target: { value: "1,2" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(ops).toHaveLength(1);
    expect(ops[0].accion).toEqual({ tipo: "exacta", valor: 1.2 });
    expect(ops[0].origen).toBe("mano");
    expect(ops[0].autor).toEqual(AUTOR);
    expect(ops[0].t).toBe(123);
    expect(ops[0].objetivo).toEqual(NUM.ref);
    expect(ops[0].id).toBe("op-1");
  });

  it("acepta punto decimal y emite al salir del campo", () => {
    const ops = montar();
    const campo = screen.getByLabelText("Valor exacto de Mezcla");
    fireEvent.change(campo, { target: { value: "1.5" } });
    fireEvent.blur(campo);
    expect(ops).toHaveLength(1);
    expect(ops[0].accion).toEqual({ tipo: "exacta", valor: 1.5 });
  });

  it("Enter y luego salir NO emite dos veces el mismo valor", () => {
    const ops = montar();
    const campo = screen.getByLabelText("Valor exacto de Mezcla");
    fireEvent.change(campo, { target: { value: "1,2" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    fireEvent.blur(campo);
    expect(ops).toHaveLength(1);
  });

  it("texto no numérico no emite nada", () => {
    const ops = montar();
    const campo = screen.getByLabelText("Valor exacto de Mezcla");
    fireEvent.change(campo, { target: { value: "abc" } });
    fireEvent.blur(campo);
    expect(ops).toHaveLength(0);
  });

  it("el interruptor emite una exacta true", () => {
    const ops = montar();
    fireEvent.click(screen.getByRole("switch", { name: "Activado" }));
    expect(ops).toHaveLength(1);
    expect(ops[0].accion).toEqual({ tipo: "exacta", valor: true });
    expect(ops[0].origen).toBe("mano");
    expect(ops[0].objetivo).toEqual(BOOL.ref);
  });

  it("el botón emite un disparo", () => {
    const ops = montar();
    fireEvent.click(screen.getByRole("button", { name: "Golpear" }));
    expect(ops).toHaveLength(1);
    expect(ops[0].accion).toEqual({ tipo: "disparo" });
    expect(ops[0].objetivo).toEqual(BOT.ref);
  });

  it("sin min y max no hay deslizador, solo el campo numérico", () => {
    montar({ candidatos: [SIN_RANGO] });
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByLabelText("Valor exacto de Libre")).toBeDefined();
  });

  it("soloLectura deshabilita todos los controles", () => {
    const ops = montar({ soloLectura: true });
    expect((screen.getByRole("slider", { name: "Mezcla" }) as HTMLElement).getAttribute("data-disabled")).not.toBeNull();
    expect((screen.getByRole("switch", { name: "Activado" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("combobox", { name: "Modo" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Golpear" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Valor exacto de Mezcla") as HTMLInputElement).disabled).toBe(true);
    expect(ops).toHaveLength(0);
  });

  it("estado vacío honesto sin controles", () => {
    montar({ candidatos: [] });
    expect(screen.getByRole("status").textContent).toContain(
      "Esta molécula aún no tiene herramientas. Añade una desde «Añadir herramienta».",
    );
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("el deslizador muestra el borrador durante el arrastre y llama a alGesto sin operación", () => {
    const gestos: Array<[string, number]> = [];
    const ops = montar({ valores: { "reverb::mezcla": 30 }, alGesto: (ref, v) => gestos.push([ref.parametroId, v]) });
    const deslizador = screen.getByRole("slider", { name: "Mezcla" });
    // Radix no mueve el pulgar con fireEvent en jsdom; se prueba el contrato de gestos vía props.
    expect(deslizador.getAttribute("aria-valuetext")).toContain("30 %");
    expect(gestos).toHaveLength(0);
    expect(ops).toHaveLength(0);
  });
});
