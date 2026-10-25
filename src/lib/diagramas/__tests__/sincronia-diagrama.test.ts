// Pruebas puras de la sincronía de diagramas (Ola 1018D-N; contracto
// architecture/diagramas.md §3.6): sin red ni navegador. La escena exige el
// caso del §3.6: dos personas renombran nodos distintos a la vez y una tercera
// borra una arista; las tres neuronas convergen al mismo diagrama.

import { describe, it, expect } from "vitest";
import type { EstadoSala } from "../../salas/sincronia-sala";
import {
  elementosDeEspecificacion, especificacionDeEstado, fusionarEspecificacion, ID_TIPO_DIAGRAMA,
  type EspecificacionDiagrama,
} from "../sincronia-diagrama";

/** Diagrama completo de partida (los tres lo ven al entrar en la sala). */
const BASE: EspecificacionDiagrama = {
  tipo: "arquitectura",
  nodos: [
    { id: "n1", etiqueta: "Entrada", forma: "rect", color: "#2e5aa8", x: 10, y: 20 },
    { id: "n2", etiqueta: "Proceso", forma: "rect" },
    { id: "n3", etiqueta: "Salida" },
  ],
  aristas: [
    { id: "a1", fuente: "n1", destino: "n2" },
    { id: "a2", fuente: "n2", destino: "n3", etiqueta: "sigue", color: "#bf4520" },
  ],
  textos: [{ id: "t1", texto: "Nota del equipo", color: "#111111" }],
};

/** Estado de sala novato con la especificación convertida en elementos. */
function estadoDe(espec: EspecificacionDiagrama, autor: string, t: number): EstadoSala {
  return { salaId: "sala-1018", elementos: elementosDeEspecificacion(espec, autor, t), reloj: t };
}
/** Edición PROPIA aplicada en local: sobreescribe tus elementos (sin fusión). */
function aplicarPropios(estado: EstadoSala, espec: EspecificacionDiagrama, autor: string, t: number): EstadoSala {
  return { salaId: estado.salaId,
    elementos: { ...estado.elementos, ...elementosDeEspecificacion(espec, autor, t) }, reloj: Math.max(estado.reloj, t) };
}

/** Deltas de la escena simultánea: A renombra n1, B renombra n2, C borra a1. */
const renA: EspecificacionDiagrama = { tipo: "",
  nodos: [{ id: "n1", etiqueta: "Renombrado por A", forma: "rect", color: "#2e5aa8", x: 10, y: 20 }], aristas: [], textos: [] };
const renB: EspecificacionDiagrama = { tipo: "",
  nodos: [{ id: "n2", etiqueta: "Renombrado por B", forma: "rect" }], aristas: [], textos: [] };
const borraA1: EspecificacionDiagrama = { tipo: "", nodos: [], aristas: [], textos: [], aristasEliminadas: ["a1"] };

describe("elementosDeEspecificacion y especificacionDeEstado", () => {
  it("convierte cada nodo, arista y texto en elemento y lo recompone íntegro", () => {
    const estado = estadoDe(BASE, "d0", 100);
    expect(especificacionDeEstado(estado)).toEqual(BASE);
    expect(estado.elementos[ID_TIPO_DIAGRAMA]?.tipo).toBe("diagrama:tipo");
  });
});

describe("edición en grupo: la escena del §3.6", () => {
  it("dos renombres simultáneos y un borrado: las tres neuronas convergen", () => {
    const base = estadoDe(BASE, "d0", 0);
    // Neurona A: edita n1 en local y recibe lo de B y lo de C.
    const pA1 = fusionarEspecificacion(aplicarPropios(base, renA, "dA", 1000), renB, "dB", 1000, "dA");
    const estadoA = fusionarEspecificacion(pA1.resultado, borraA1, "dC", 1000, "dA").resultado;
    // Neurona B: edita n2 en local y recibe lo de A y lo de C.
    const pB1 = fusionarEspecificacion(aplicarPropios(base, renB, "dB", 1000), renA, "dA", 1000, "dB");
    const estadoB = fusionarEspecificacion(pB1.resultado, borraA1, "dC", 1000, "dB").resultado;
    // Neurona C: borra a1 en local y recibe lo de A y lo de B.
    const pC1 = fusionarEspecificacion(aplicarPropios(base, borraA1, "dC", 1000), renA, "dA", 1000, "dC");
    const estadoC = fusionarEspecificacion(pC1.resultado, renB, "dB", 1000, "dC").resultado;

    const esperado: EspecificacionDiagrama = {
      tipo: "arquitectura",
      nodos: [
        { id: "n1", etiqueta: "Renombrado por A", forma: "rect", color: "#2e5aa8", x: 10, y: 20 },
        { id: "n2", etiqueta: "Renombrado por B", forma: "rect" },
        { id: "n3", etiqueta: "Salida" },
      ],
      aristas: [{ id: "a2", fuente: "n2", destino: "n3", etiqueta: "sigue", color: "#bf4520" }],
      textos: [{ id: "t1", texto: "Nota del equipo", color: "#111111" }],
    };
    expect(especificacionDeEstado(estadoA)).toEqual(esperado);
    expect(especificacionDeEstado(estadoB)).toEqual(esperado);
    expect(especificacionDeEstado(estadoC)).toEqual(esperado);
    // En ninguna neurona se perdió trabajo y nadie retrocedió el reloj.
    expect(estadoA.reloj).toBe(1000);
    // La lápida de la arista llegó viva y determinista a las tres neuronas.
    const a1A = estadoA.elementos["dg:arista:a1"], a1C = estadoC.elementos["dg:arista:a1"];
    expect(a1A?.borrado).toBe(true);
    expect(a1A?.porDispositivo).toBe("dC");
    expect(a1C?.porDispositivo).toBe(a1A?.porDispositivo);
  });
});

describe("lápidas y ecos", () => {
  it("un borrado no resucita al fusionar con un vecino atrasado", () => {
    const base = estadoDe(BASE, "d0", 0);
    const luegoDelBorrado = fusionarEspecificacion(
      fusionarEspecificacion(base, borraA1, "dC", 1000, "dX").resultado,
      BASE, // el vecino manda su estado completo, aún con a1 viva.
      "d0", 0, "dX",
    ).resultado;
    expect(especificacionDeEstado(luegoDelBorrado).aristas.map((a) => a.id)).toEqual(["a2"]);
    expect(luegoDelBorrado.elementos["dg:arista:a1"]?.borrado).toBe(true);
  });

  it("lo que el propio dispositivo emite y le vuelve no se aplica (anti-eco)", () => {
    const base = estadoDe(BASE, "d0", 0);
    const propio = fusionarEspecificacion(base, renA, "dA", 1000, "dA");
    expect(propio.conflictos).toEqual([]);
    expect(propio.resultado.elementos).toEqual(base.elementos);
    expect(especificacionDeEstado(propio.resultado)).toEqual(BASE);
  });

  it("los elementos ajenos a la escena y los huecos no se cuelan en el diagrama", () => {
    const estado: EstadoSala = {
      salaId: "sala-1018",
      elementos: {
        "dg:nodo:": { id: "dg:nodo:", tipo: "diagrama:nodo", datos: {}, actualizadoEn: 5, porDispositivo: "z" },
        "widget:7": { id: "widget:7", tipo: "cursor", datos: { x: 1 }, actualizadoEn: 5, porDispositivo: "z" },
      },
      reloj: 5,
    };
    expect(especificacionDeEstado(estado)).toEqual({ tipo: "", nodos: [], aristas: [], textos: [] });
  });
});
