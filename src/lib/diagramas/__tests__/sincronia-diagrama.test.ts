// Pruebas puras de la edición en grupo de diagramas (Ola 1018D).
// Contrato: architecture/diagramas.md §3.6; skill Diagram Design (MIT).
// Sin red, sin navegador real, sin `any`. La fusión concreta es la de
// `src/lib/salas/sincronia-sala.ts` (determinista y con lápidas).

import { describe, it, expect } from "vitest";
import {
  estadoDeEspecificacion,
  elementosDeEspecificacion,
  especificacionDeEstado,
  type EspecificacionDiagrama,
} from "../sincronia-diagrama";
import { fusionarEstados, type EstadoSala } from "@/lib/salas/sincronia-sala";

const base: EspecificacionDiagrama = {
  id: "sala-diagrama",
  tipo: "arquitectura",
  nodos: [
    { id: "n1", etiqueta: "Entrada", forma: "rect" },
    { id: "n2", etiqueta: "Salida", forma: "ellipse" },
  ],
  aristas: [{ id: "a1", fuente: "n1", destino: "n2", etiqueta: "flujo" }],
  textos: [{ id: "t1", contenido: "Sistema" }],
};

/** Fusiona un cambio concreto en el estado local, con anti-eco explícito. */
function fusionar(
  local: EstadoSala,
  cambio: EspecificacionDiagrama,
  autor: string,
  t: number,
  eco: string,
): EstadoSala {
  return fusionarEstados(
    local,
    estadoDeEspecificacion(cambio, autor, t),
    eco,
  ).resultado;
}

describe("sincronía de la especificación de diagrama", () => {
  it("convierte nodos, aristas y textos en ElementoSala con id de clase", () => {
    const elementos = elementosDeEspecificacion(base, "ana", 100);
    expect(elementos.map((e) => e.id)).toEqual([
      "arista::a1", "nodo::n1", "nodo::n2", "texto::t1",
    ]);
    expect(elementos.every((e) => e.porDispositivo === "ana")).toBe(true);
    expect(elementos.find((e) => e.id === "nodo::n1")?.datos).toMatchObject({
      tipo: "arquitectura", etiqueta: "Entrada", forma: "rect",
    });
  });

  it("recompone la misma especificación (ida y vuelta) ordenada por id", () => {
    const estado = estadoDeEspecificacion(base, "ana", 100);
    expect(especificacionDeEstado(estado)).toEqual(base);
  });

  it("un borrado es lápida: sale del diagrama pero sigue en el estado", () => {
    const cambio: EspecificacionDiagrama = {
      id: base.id, tipo: base.tipo, nodos: [], textos: [],
      aristas: [{ id: "a1", fuente: "n1", destino: "n2", borrado: true }],
    };
    const estado = fusionar(
      estadoDeEspecificacion(base, "base", 100), cambio, "carla", 300, "",
    );
    expect(estado.elementos["arista::a1"]?.borrado).toBe(true);
    expect(especificacionDeEstado(estado).aristas).toEqual([]);
  });

  it("dos renombrados distintos y un borrado convergen en las tres neuronas", () => {
    const renombraN1: EspecificacionDiagrama = {
      id: base.id, tipo: base.tipo, aristas: [], textos: [],
      nodos: [{ id: "n1", etiqueta: "Entrada principal", forma: "rect" }],
    };
    const renombraN2: EspecificacionDiagrama = {
      id: base.id, tipo: base.tipo, aristas: [], textos: [],
      nodos: [{ id: "n2", etiqueta: "Salida final", forma: "ellipse" }],
    };
    const borraArista: EspecificacionDiagrama = {
      id: base.id, tipo: base.tipo, nodos: [], textos: [],
      aristas: [{ id: "a1", fuente: "n1", destino: "n2", borrado: true }],
    };
    const baseEstado = estadoDeEspecificacion(base, "base", 100);

    // Cada neurona aplica primero lo suyo (eco vacío) y luego lo de las otras.
    const neuronaA = fusionar(
      fusionar(fusionar(baseEstado, renombraN1, "ana", 200, ""),
        renombraN2, "bruno", 201, "ana"),
      borraArista, "carla", 202, "ana",
    );
    const neuronaB = fusionar(
      fusionar(fusionar(baseEstado, renombraN2, "bruno", 201, ""),
        renombraN1, "ana", 200, "bruno"),
      borraArista, "carla", 202, "bruno",
    );
    const neuronaC = fusionar(
      fusionar(fusionar(baseEstado, borraArista, "carla", 202, ""),
        renombraN1, "ana", 200, "carla"),
      renombraN2, "bruno", 201, "carla",
    );

    const esperada: EspecificacionDiagrama = {
      id: base.id,
      tipo: base.tipo,
      nodos: [
        { id: "n1", etiqueta: "Entrada principal", forma: "rect" },
        { id: "n2", etiqueta: "Salida final", forma: "ellipse" },
      ],
      aristas: [],
      textos: base.textos,
    };
    expect(especificacionDeEstado(neuronaA)).toEqual(esperada);
    expect(especificacionDeEstado(neuronaB)).toEqual(esperada);
    expect(especificacionDeEstado(neuronaC)).toEqual(esperada);
  });
});
