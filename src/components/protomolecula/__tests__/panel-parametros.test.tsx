/**
 * PanelParametros: un control por tipo de parámetro (deslizador + campo exacto, interruptor,
 * opciones, botón), cada cambio sale como `Operacion` con origen "mano", y en solo lectura o
 * sin herramientas se muestra un estado honesto.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Autor, CandidatoParametro, Operacion } from "@/lib/protomolecula/tipos";
import { claveDe } from "@/lib/protomolecula/parametros";
import { PanelParametros } from "../panel-parametros";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});
afterEach(cleanup);

const AUTOR: Autor = { tipo: "persona", id: "u1", nombre: "Alex" };

const base: Record<string, CandidatoParametro> = {
  volumen: {
    ref: { atomoId: "reverb", parametroId: "mezcla" },
    atomo: "Reverb",
    parametro: { id: "mezcla", nombre: "Mezcla", tipo: "numero", min: 0, max: 2, unidad: "%" },
  },
  libre: {
    ref: { atomoId: "reverb", parametroId: "densidad" },
    atomo: "Reverb",
    parametro: { id: "densidad", nombre: "Densidad", tipo: "numero" },
  },
  interruptor: {
    ref: { atomoId: "sint", parametroId: "activo" },
    atomo: "Sintetizador",
    parametro: { id: "activo", nombre: "Activo", tipo: "booleano" },
  },
  modo: {
    ref: { atomoId: "sint", parametroId: "onda" },
    atomo: "Sintetizador",
    parametro: { id: "onda", nombre: "Onda", tipo: "opcion", opciones: ["seno", "cuadrada"] },
  },
  golpe: {
    ref: { atomoId: "sint", parametroId: "disparar" },
    atomo: "Sintetizador",
    parametro: { id: "disparar", nombre: "Disparar", tipo: "disparo" },
  },
};

const montar = (candidatos: CandidatoParametro[], extra: Record<string, unknown> = {}) => {
  const alOperar = vi.fn();
  const utils = render(
    <PanelParametros
      candidatos={candidatos}
      valores={{ [claveDe(base.volumen.ref)]: 1, [claveDe(base.interruptor.ref)]: false }}
      autor={AUTOR}
      alOperar={alOperar}
      {...extra}
    />,
  );
  return { ...utils, alOperar };
};

const ultima = (alOperar: ReturnType<typeof vi.fn>): Operacion => alOperar.mock.calls.at(-1)![0] as Operacion;

describe("PanelParametros", () => {
  it("pinta un control por tipo: deslizador + campo exacto para un número", () => {
    montar([base.volumen]);
    expect(screen.getByRole("slider", { name: "Mezcla" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Mezcla (valor exacto)" })).toHaveValue("1");
  });
  it("un número sin rango solo ofrece el campo exacto", () => {
    montar([base.libre]);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Densidad (valor exacto)" })).toBeInTheDocument();
  });
  it("teclear 1,2 con Enter emite una operación exacta 1.2 con origen «mano»", () => {
    const { alOperar } = montar([base.volumen], { ahora: () => 42, nuevoId: () => "op-x" });
    const caja = screen.getByRole("textbox", { name: "Mezcla (valor exacto)" });
    fireEvent.change(caja, { target: { value: "1,2" } });
    fireEvent.keyDown(caja, { key: "Enter" });
    expect(ultima(alOperar)).toEqual({
      id: "op-x", objetivo: base.volumen.ref, autor: AUTOR, origen: "mano", t: 42,
      accion: { tipo: "exacta", valor: 1.2 },
    });
  });
  it("teclear 1.2 con punto y salir del campo también emite exacta 1.2", () => {
    const { alOperar } = montar([base.libre]);
    const caja = screen.getByRole("textbox", { name: "Densidad (valor exacto)" });
    fireEvent.change(caja, { target: { value: "1.2" } });
    fireEvent.blur(caja);
    expect(ultima(alOperar).accion).toEqual({ tipo: "exacta", valor: 1.2 });
  });
  it("el interruptor emite exacta true al activarlo", async () => {
    const { alOperar } = montar([base.interruptor]);
    await userEvent.click(screen.getByRole("switch", { name: "Activo" }));
    expect(ultima(alOperar).accion).toEqual({ tipo: "exacta", valor: true });
  });
  it("el selector emite la opción elegida", async () => {
    const { alOperar } = montar([base.modo]);
    await userEvent.click(screen.getByRole("combobox", { name: "Onda" }));
    await userEvent.click(screen.getByRole("option", { name: "cuadrada" }));
    expect(ultima(alOperar).accion).toEqual({ tipo: "exacta", valor: "cuadrada" });
  });
  it("el botón de disparo emite una acción de disparo", async () => {
    const { alOperar } = montar([base.golpe]);
    await userEvent.click(screen.getByRole("button", { name: "Disparar" }));
    expect(ultima(alOperar).accion).toEqual({ tipo: "disparo" });
  });
  it("agrupa por átomo y solo lectura lo deshabilita todo", () => {
    montar([base.volumen, base.interruptor, base.golpe], { soloLectura: true });
    expect(screen.getByRole("heading", { name: "Reverb" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Activo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Disparar" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Mezcla (valor exacto)" })).toBeDisabled();
  });
  it("sin herramientas enseña el estado vacío, sin controles", () => {
    montar([]);
    expect(screen.getByText(/Esta molécula aún no tiene herramientas/)).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});
