// Pruebas puras de la sincronía de la especificación de un diagrama (Ola 1018D, tarea N).
// Contrato: architecture/diagramas.md §3.6 y §4; fusión de salas/sincronia-sala.ts.
// Sin red, sin disco y sin navegador: solo estados que entran y especificaciones que salen.

import { describe, it, expect } from "vitest";
import {
  fusionarDiagramas,
  elementosDeEspecificacion,
  estadoDeEspecificacion,
  especificacionDeEstado,
  renombrarNodo,
  borrarElemento,
  type EspecificacionDiagrama,
} from "../sincronia-diagrama";

const BASE: EspecificacionDiagrama = {
  id: "sala-diagrama",
  tipo: "arquitectura",
  nodos: [
    { id: "n1", etiqueta: "Entrada", forma: "rect" },
    { id: "n2", etiqueta: "Cola", forma: "rect" },
    { id: "n3", etiqueta: "Salida", forma: "ellipse", color: "#007FFF" },
  ],
  aristas: [
    { id: "a1", fuente: "n1", destino: "n2", etiqueta: "petición" },
    { id: "a2", fuente: "n2", destino: "n3", etiqueta: "" },
  ],
  textos: [{ id: "tx1", contenido: "Sistema principal" }],
};

const base = (autor = "ana", t = 1000) => estadoDeEspecificacion(BASE, autor, t);

describe("sincronía de la especificación de un diagrama en grupo", () => {
  it("convierte nodos, aristas y textos en ElementoSala y los recompone sin pérdida", () => {
    const elementos = elementosDeEspecificacion(BASE, "ana", 1000);
    expect(elementos).toHaveLength(1 + BASE.nodos.length + BASE.aristas.length + BASE.textos.length);
    for (const el of elementos) {
      expect(el.actualizadoEn).toBe(1000);
      expect(el.porDispositivo).toBe("ana");
    }
    expect(especificacionDeEstado(base())).toEqual(BASE);
  });

  it("deja la arista borrada como lápida y no la dibuja al recomponer", () => {
    const borrado = borrarElemento(base(), "arista", "a1", "luis", 1010);
    expect(borrado.elementos["arista:a1"]?.borrado).toBe(true);
    expect(especificacionDeEstado(borrado).aristas.map((a) => a.id)).toEqual(["a2"]);
    expect(especificacionDeEstado(borrado).nodos.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("converge cuando ana renombra un nodo, luis renombra otro y borra una arista", () => {
    const cero = base();
    const ana = renombrarNodo(cero, "n1", "Entrada segura", "ana", 1010);
    const luis = borrarElemento(renombrarNodo(cero, "n2", "Cola de espera", "luis", 1020), "arista", "a1", "luis", 1030);

    const ab = fusionarDiagramas(ana, luis, "neurona-c");
    const ba = fusionarDiagramas(luis, ana, "neurona-c");
    expect(ab.especificacion).toEqual(ba.especificacion);

    const spec = ab.especificacion;
    expect(spec.tipo).toBe("arquitectura");
    expect(spec.nodos.find((n) => n.id === "n1")?.etiqueta).toBe("Entrada segura");
    expect(spec.nodos.find((n) => n.id === "n2")?.etiqueta).toBe("Cola de espera");
    expect(spec.nodos.find((n) => n.id === "n3")?.etiqueta).toBe("Salida");
    expect(spec.aristas.map((a) => a.id)).toEqual(["a2"]);
    expect(spec.textos).toEqual(BASE.textos);
  });

  it("la tercera neurona que no editó llega al mismo diagrama y la lápida no resucita", () => {
    const cero = base();
    const ana = renombrarNodo(cero, "n1", "Entrada segura", "ana", 1010);
    const luis = borrarElemento(renombrarNodo(cero, "n2", "Cola de espera", "luis", 1020), "arista", "a1", "luis", 1030);

    const conAna = fusionarDiagramas(cero, ana, "neurona-c").estado;
    const conLuis = fusionarDiagramas(conAna, luis, "neurona-c").estado;
    const desdeLuis = fusionarDiagramas(fusionarDiagramas(cero, luis, "neurona-c").estado, ana, "neurona-c").estado;

    expect(especificacionDeEstado(conLuis)).toEqual(especificacionDeEstado(desdeLuis));
    expect(conLuis.elementos["arista:a1"]?.borrado).toBe(true);

    const conCopiaVieja = fusionarDiagramas(conLuis, cero, "neurona-c").estado;
    expect(especificacionDeEstado(conCopiaVieja).aristas.map((a) => a.id)).toEqual(["a2"]);
  });

  it("no mezcla dos salas distintas y lo dice en los conflictos", () => {
    const otra = estadoDeEspecificacion({ ...BASE, id: "otra-sala" }, "ana", 1000);
    const r = fusionarDiagramas(base(), otra, "neurona-c");
    expect(r.conflictos).toContain("sala-distinta");
    expect(r.especificacion.id).toBe("sala-diagrama");
  });
});
