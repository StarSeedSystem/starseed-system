/**
 * Pruebas de sincronía de diagramas: emisión de elementos con id
 * determinista, edición mínima con lápidas y CONVERGENCIA de tres neuronas
 * cuyo orden de fusión difiere (architecture/diagramas.md §3-6).
 */
import { describe, expect, it } from "vitest";
import {
  elementosDeEdicion,
  elementosDeEspecificacion,
  especificacionDeEstado,
  type EspecificacionDiagrama,
} from "@/lib/diagramas/sincronia-diagrama";
import {
  fusionarEstados,
  prioridadDeElemento,
  type ElementoSala,
  type EstadoSala,
} from "@/lib/salas/sincronia-sala";

const base: EspecificacionDiagrama = {
  id: "dgm-cafe",
  tipo: "flujo",
  titulo: "Cómo llega el café",
  nodos: [
    { id: "n1", etiqueta: "Almacén" },
    { id: "n2", etiqueta: "Cafetera" },
    { id: "n3", etiqueta: "Taza" },
  ],
  aristas: [{ id: "a1", fuente: "n1", destino: "n2", etiqueta: "molido" }],
  textos: ["Flujo principal", "sin prisa"],
};

/** Sala con piezas aplicadas encima de un estado previo (sala compartida). */
const estado = (previa: EstadoSala, piezas: ElementoSala[], t: number): EstadoSala => ({
  salaId: "sala-diagramas",
  elementos: { ...previa.elementos, ...Object.fromEntries(piezas.map((e) => [e.id, e])) },
  reloj: t,
});
/** Renombra UN nodo: el cambio más pequeño que puede hacer un editor. */
const conNodo = (espec: EspecificacionDiagrama, id: string, etiqueta: string): EspecificacionDiagrama => ({
  ...espec,
  nodos: espec.nodos.map((n) => (n.id === id ? { ...n, etiqueta } : n)),
});
const vacio: EstadoSala = { salaId: "sala-diagramas", elementos: {}, reloj: 0 };
const inicial = estado(vacio, elementosDeEspecificacion(base, "creador", 1_000), 1_000);

describe("sincronia-diagrama", () => {
  it("emite elementos deterministas y recompone la especificación intacta", () => {
    const piezas = elementosDeEspecificacion(base, "creador", 1_000);
    expect(piezas).toHaveLength(7);
    const n1 = piezas.find((e) => e.id === "dgm-cafe:nodo:n1");
    expect(n1?.tipo).toBe("diagrama:nodo");
    expect(n1?.actualizadoEn).toBe(1_000);
    expect(n1?.porDispositivo).toBe("creador");
    expect(n1?.datos["espec"]).toBe("dgm-cafe");
    for (const e of piezas) expect(prioridadDeElemento(e)).toBe(1);
    expect(especificacionDeEstado(inicial)).toEqual(base);
    expect(especificacionDeEstado(inicial, base.id)).toEqual(base);
    expect(especificacionDeEstado(inicial, "otra")).toBeNull();
    expect(especificacionDeEstado(vacio)).toBeNull();
  });

  it("cada especificación es entidad propia y sin id manda la cabecera nueva", () => {
    const otra: EspecificacionDiagrama = { ...base, id: "dgm-otra", titulo: "Otro café" };
    const sala = estado(inicial, elementosDeEspecificacion(otra, "vecino", 1_100), 1_100);
    expect(especificacionDeEstado(sala, "dgm-cafe")).toEqual(base);
    expect(especificacionDeEstado(sala, "dgm-otra")).toEqual({ ...base, id: "dgm-otra", titulo: "Otro café" });
    expect(especificacionDeEstado(sala)?.id).toBe("dgm-otra");
  });

  it("edita lo mínimo: lo tocado se reemite y lo intacto conserva su marca", () => {
    const salida = elementosDeEdicion(inicial, conNodo(base, "n1", "Despensa"), "neurona-a", 1_010);
    expect(salida).toHaveLength(7);
    const n1 = salida.find((e) => e.id === "dgm-cafe:nodo:n1");
    expect(n1?.actualizadoEn).toBe(1_010);
    expect(n1?.porDispositivo).toBe("neurona-a");
    expect(n1?.datos["valor"]).toEqual({ id: "n1", etiqueta: "Despensa" });
    const n2 = salida.find((e) => e.id === "dgm-cafe:nodo:n2");
    expect(n2?.actualizadoEn).toBe(1_000);
    expect(n2?.porDispositivo).toBe("creador");
  });

  it("converge: dos renombres y un borrado, igual con cualquier orden de fusión", () => {
    const especA = conNodo(base, "n1", "Despensa");
    const especB: EspecificacionDiagrama = {
      ...base,
      nodos: base.nodos.map((n) => (n.id === "n3" ? { ...n, etiqueta: "Vaso nuevo" } : n)),
      aristas: [],
    };
    const piezasA = elementosDeEdicion(inicial, especA, "neurona-a", 1_010);
    const piezasB = elementosDeEdicion(inicial, especB, "neurona-b", 1_020);
    const lapida = piezasB.find((e) => e.id === "dgm-cafe:arista:a1");
    expect(lapida?.borrado).toBe(true);
    // Tres neuronas que fusionan los mismos cambios en tres órdenes distintos.
    const fA = fusionarEstados(
      fusionarEstados(estado(inicial, piezasA, 1_010), estado(inicial, piezasB, 1_020), "neurona-a").resultado,
      inicial, "neurona-a",
    ).resultado;
    const fB = fusionarEstados(
      fusionarEstados(estado(inicial, piezasB, 1_020), inicial, "neurona-b").resultado,
      estado(inicial, piezasA, 1_010), "neurona-b",
    ).resultado;
    const fC = fusionarEstados(
      fusionarEstados(inicial, estado(inicial, piezasA, 1_010), "neurona-c").resultado,
      estado(inicial, piezasB, 1_020), "neurona-c",
    ).resultado;
    const eA = especificacionDeEstado(fA);
    const eB = especificacionDeEstado(fB);
    const eC = especificacionDeEstado(fC);
    expect(eA).toEqual(eB);
    expect(eB).toEqual(eC);
    expect(eA?.nodos.map((n) => n.etiqueta)).toEqual(["Despensa", "Cafetera", "Vaso nuevo"]);
    expect(eA?.aristas).toEqual([]);
  });
});
