// Pruebas puras de la edición en grupo de diagramas (architecture/diagramas.md §3.6).
// Sin red, sin disco y sin navegador: especificación → ElementoSala → fusión → especificación.
// Skill MIT diagram-design (vendor/habilidades/diagram-design/).

import { describe, it, expect } from "vitest";
import {
  elementosDeEspecificacion,
  especificacionDeEstado,
  type EspecificacionDiagrama,
  type NodoDiagrama,
} from "@/lib/diagramas/sincronia-diagrama";
import { fusionarEstados, type ElementoSala, type EstadoSala } from "@/lib/salas/sincronia-sala";

const BASE: EspecificacionDiagrama = {
  tipo: "flujo",
  nodos: [
    { id: "n1", etiqueta: "Inicio", forma: "rect" },
    { id: "n2", etiqueta: "Fin", forma: "ellipse" },
  ],
  aristas: [{ id: "a1", fuente: "n1", destino: "n2", etiqueta: "sigue" }],
  textos: [{ id: "t1", contenido: "Flujo de ejemplo" }],
  colores: { fondo: "#fff", tinta: "#111" },
};

function estadoDe(elementos: ElementoSala[]): EstadoSala {
  const mapa: Record<string, ElementoSala> = {};
  for (const e of elementos) mapa[e.id] = e;
  return { salaId: "diagrama", elementos: mapa, reloj: 0 };
}

function fusionar(...estados: EstadoSala[]): EstadoSala {
  return estados.slice(1).reduce(
    (acc, e) => fusionarEstados(acc, e, "observador").resultado,
    estados[0],
  );
}

/** Recompone la semilla para que cada pieza conserve su propia revisión. */
const SEMILLA = especificacionDeEstado(estadoDe(elementosDeEspecificacion(BASE, "base", 1)));

function renombrar(
  espec: EspecificacionDiagrama, id: string, etiqueta: string, t: number, autor: string,
): EspecificacionDiagrama {
  return {
    ...espec,
    nodos: espec.nodos.map((n): NodoDiagrama =>
      n.id === id ? { ...n, etiqueta, actualizadoEn: t, porDispositivo: autor } : n),
  };
}

function specDe(espec: EspecificacionDiagrama, autor: string, t: number): EspecificacionDiagrama {
  return especificacionDeEstado(estadoDe(elementosDeEspecificacion(espec, autor, t)));
}

describe("elementosDeEspecificacion", () => {
  it("convierte cada nodo, arista y texto en un ElementoSala referenciado por id", () => {
    const elementos = elementosDeEspecificacion(BASE, "ana", 10);
    expect(elementos.map((e) => e.id).sort()).toEqual([
      "arista:a1", "diagrama", "nodo:n1", "nodo:n2", "texto:t1",
    ]);
    expect(elementos.find((e) => e.id === "nodo:n1")).toMatchObject({
      tipo: "nodo", porDispositivo: "ana", actualizadoEn: 10,
      datos: { id: "n1", etiqueta: "Inicio", forma: "rect", orden: 0 },
    });
  });

  it("recompone la especificación con tipo, colores y orden", () => {
    const spec = specDe(BASE, "ana", 10);
    expect(spec.tipo).toBe("flujo");
    expect(spec.colores).toEqual(BASE.colores);
    expect(spec.nodos.map((n) => [n.id, n.etiqueta, n.forma])).toEqual([
      ["n1", "Inicio", "rect"], ["n2", "Fin", "ellipse"],
    ]);
    expect(spec.aristas[0]).toMatchObject({
      id: "a1", fuente: "n1", destino: "n2", etiqueta: "sigue",
    });
    expect(spec.textos).toEqual([
      { id: "t1", contenido: "Flujo de ejemplo", actualizadoEn: 10, porDispositivo: "ana" },
    ]);
    expect(spec.borrados).toBeUndefined();
  });

  it("una lápida borra la arista y no la resucita al recomponer", () => {
    const sinArista: EspecificacionDiagrama = {
      ...BASE, aristas: [], borrados: ["arista:a1"],
    };
    const spec = specDe(sinArista, "eva", 50);
    expect(spec.aristas).toEqual([]);
    expect(spec.borrados).toEqual(["arista:a1"]);
  });
});

describe("edición en grupo", () => {
  it("dos renombrados distintos y un borrado convergen en las tres neuronas", () => {
    const estadoA = estadoDe(elementosDeEspecificacion(
      renombrar(SEMILLA, "n1", "Inicio A", 100, "ana"), "ana", 100,
    ));
    const estadoB = estadoDe(elementosDeEspecificacion(
      renombrar(SEMILLA, "n2", "Fin B", 110, "luis"), "luis", 110,
    ));
    const estadoC = estadoDe(elementosDeEspecificacion(
      { ...SEMILLA, aristas: [], borrados: ["arista:a1"] }, "eva", 120,
    ));

    const ordenes = [
      [estadoA, estadoB, estadoC],
      [estadoC, estadoA, estadoB],
      [estadoB, estadoC, estadoA],
    ];
    const specs = ordenes.map((orden) => especificacionDeEstado(fusionar(...orden)));

    expect(specs[1]).toEqual(specs[0]);
    expect(specs[2]).toEqual(specs[0]);
    expect(specs[0].nodos.map((n) => n.etiqueta)).toEqual(["Inicio A", "Fin B"]);
    expect(specs[0].aristas).toEqual([]);
    expect(specs[0].borrados).toEqual(["arista:a1"]);
  });
});
