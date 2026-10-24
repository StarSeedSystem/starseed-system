// Pruebas del panel ProtoGenesis (PG1013H). jsdom: sin red, sin disco.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AlmacenLocal, EstadoPaso } from "@/lib/protogenesis/almacen-encargos";
import type { Plan } from "@/lib/protogenesis/encargo";

import { PanelProtoGenesis, type PanelProtoGenesisProps } from "../panel-protogenesis";

/** Almacén en memoria para comprobar que el encargo se guarda de verdad. */
function almacenDeMemoria(): AlmacenLocal & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => { datos.set(k, v); },
    removeItem: (k) => { datos.delete(k); },
  };
}

const PLAN_DOS_NIVELES: Plan = {
  encargoId: "e1",
  pasos: [
    { id: "a", atomo: "atomo-a", titulo: "Fondo", entradas: [], salida: { formato: "glb" }, depende: [], criterios: [] },
    { id: "b", atomo: "atomo-b", titulo: "Escena", entradas: [], salida: { formato: "glb" }, depende: ["a"], criterios: [] },
  ],
};

const BASE: PanelProtoGenesisProps = {
  moleculaId: "m1",
  ambito: "personal",
  plan: null,
  estados: {},
  asignaciones: [],
  fallos: [],
  almacen: null,
};

function montar(extra?: Partial<PanelProtoGenesisProps>) {
  const almacen = almacenDeMemoria();
  const props: PanelProtoGenesisProps = { ...BASE, almacen, ...extra };
  render(<PanelProtoGenesis {...props} />);
  return { almacen };
}

function anadirCriterio(texto: string) {
  fireEvent.change(screen.getByLabelText("Comprobación del criterio"), { target: { value: texto } });
  fireEvent.click(screen.getByRole("button", { name: "Añadir criterio" }));
}

afterEach(cleanup);

describe("PanelProtoGenesis", () => {
  it("sin criterios no deja encargar y dice el motivo", () => {
    montar();
    const boton = screen.getByRole("button", { name: "Encargar" });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Sin criterios comprobables no hay encargo: añade al menos uno.")).not.toBeNull();
  });

  it("añadir criterios y encargar guarda el encargo en el almacén", () => {
    const { almacen } = montar();
    anadirCriterio("formato glb");
    fireEvent.change(screen.getByLabelText("Intención"), { target: { value: "una escena" } });
    fireEvent.click(screen.getByRole("button", { name: "Encargar" }));
    expect(screen.getByText("Encargo guardado.")).not.toBeNull();
    const guardados = [...almacen.datos.values()].filter((v) => v.includes('"moleculaId":"m1"'));
    expect(guardados).toHaveLength(1);
    const registro = JSON.parse(guardados[0]) as { encargo: { intencion: string; criterios: unknown[] } };
    expect(registro.encargo.intencion).toBe("una escena");
    expect(registro.encargo.criterios).toHaveLength(1);
  });

  it("quitar el criterio vuelve a desactivar Encargar", () => {
    montar();
    anadirCriterio("sin rutas del disco");
    expect(screen.getByText("sin rutas del disco")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Quitar criterio 1" }));
    expect((screen.getByRole("button", { name: "Encargar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("un plan de dos niveles pinta dos filas con estado, agente y progreso", () => {
    const estados: Record<string, EstadoPaso> = { a: "ok", b: "corriendo" };
    montar({ plan: PLAN_DOS_NIVELES, estados, asignaciones: [{ paso: "a", agente: "alfa" }] });
    expect(screen.getByText("Nivel 1")).not.toBeNull();
    expect(screen.getByText("Nivel 2")).not.toBeNull();
    expect(screen.getByText("agente alfa")).not.toBeNull();
    expect(screen.getByText("hecho")).not.toBeNull();
    expect(screen.getByText("en curso")).not.toBeNull();
    expect(screen.getByText(/1 de 2 pasos hechos/)).not.toBeNull();
  });

  it("pinta los fallos de verificación con su motivo", () => {
    montar({ fallos: ["criterio 0 (formato) no satisfecho"] });
    expect(screen.getByText("Fallo de verificación: criterio 0 (formato) no satisfecho")).not.toBeNull();
  });

  it("en personal, el dueño acepta en su molécula", () => {
    montar();
    expect(screen.getByRole("button", { name: "Aceptar en mi molécula" })).not.toBeNull();
  });

  it("en un grupo democrático el botón dice «Proponer al grupo»", () => {
    montar({ ambito: "grupo", rol: "colaborador", democratico: true, esDueno: false });
    expect(screen.getByRole("button", { name: "Proponer al grupo" })).not.toBeNull();
  });

  it("en un grupo jerárquico sin rol de gestión no hay botón de decisión", () => {
    montar({ ambito: "grupo", rol: "observador", democratico: false, esDueno: false });
    expect(screen.queryByRole("button", { name: "Proponer al grupo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aceptar en mi molécula" })).toBeNull();
    const estados = screen.getAllByRole("status").map((p) => p.textContent ?? "");
    expect(estados.some((t) => t.includes("rol de gestión"))).toBe(true);
  });

  it("un paso cuyo átomo está «próximamente» se pide a MetaGenesis", () => {
    const plan: Plan = {
      encargoId: "e2",
      pasos: [
        { id: "c", atomo: "solo-enlace", titulo: "Render de nube", entradas: [], salida: { formato: "glb" }, depende: [], criterios: [] },
      ],
    };
    montar({ plan });
    expect(screen.getByRole("button", { name: "Pedir a MetaGenesis" })).not.toBeNull();
  });
});
