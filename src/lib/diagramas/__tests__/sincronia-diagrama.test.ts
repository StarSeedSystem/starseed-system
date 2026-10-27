// Pruebas puras de la sincronía de diagramas (entrada → salida; sin red, sin
// disco ni navegador). Contrato: architecture/diagramas.md §3.6 y las reglas
// de fusión de salas/sincronia-sala.ts, deterministas en todas las neuronas.

import { describe, it, expect } from "vitest";
import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";
import {
  elementosDeEspecificacion,
  especificacionDeEstado,
  SALA_DIAGRAMAS,
  type EspecificacionDiagrama,
} from "../sincronia-diagrama";

const BASE: EspecificacionDiagrama = {
  tipo: "flujo",
  nodos: [
    { id: "n1", etiqueta: "Fuente", forma: "rect" },
    { id: "n2", etiqueta: "Cuenca", forma: "round" },
    { id: "n3", etiqueta: "Desembocadura" },
  ],
  aristas: [
    { id: "ar1", fuente: "n1", destino: "n2", etiqueta: "canal" },
    { id: "ar2", fuente: "n2", destino: "n3", etiqueta: "" },
  ],
  grupos: [{ id: "g1", etiqueta: "Caudal", nodos: ["n1", "n2"] }],
  textos: ["Canal principal"],
};

/** Estado de una neurona a partir de sus elementos ya registrados en la sala. */
function estadoDe(elementos: ElementoSala[]): EstadoSala {
  const mapa: Record<string, ElementoSala> = {};
  let reloj = 0;
  for (const el of elementos) {
    mapa[el.id] = el;
    if (el.actualizadoEn > reloj) reloj = el.actualizadoEn;
  }
  return { salaId: SALA_DIAGRAMAS, elementos: mapa, reloj };
}

/** La neurona abre el diagrama compartido: convierte SU copia tal como la tiene. */
function abrir(espec: EspecificacionDiagrama): EstadoSala {
  return estadoDe(elementosDeEspecificacion(espec, "origen", 1000));
}

/** Una neurona edita UNA sola pieza de su copia: solo esa pieza lleva su marca nueva. */
function editar(estado: EstadoSala, id: string, parche: Partial<ElementoSala>): EstadoSala {
  const el = estado.elementos[id];
  if (!el) return estado;
  return { ...estado, elementos: { ...estado.elementos, [id]: { ...el, ...parche } } };
}

describe("elementosDeEspecificacion", () => {
  it("convierte tipo, nodos, aristas, grupos y textos en sus ids canónicos", () => {
    const piezas = elementosDeEspecificacion(BASE, "origen", 55);
    expect(piezas.map((p) => p.id).sort()).toEqual([
      "arista:ar1",
      "arista:ar2",
      "diagrama:tipo",
      "grupo:g1",
      "nodo:n1",
      "nodo:n2",
      "nodo:n3",
      "texto:0",
    ]);
  });

  it("cada pieza lleva su tipo de sala, sus datos y el autor que la escribió", () => {
    const piezas = elementosDeEspecificacion(BASE, "origen", 55);
    const delTipo = piezas.find((p) => p.id === "diagrama:tipo");
    expect(delTipo && delTipo.tipo).toBe("diagrama");
    expect(delTipo && delTipo.datos).toEqual({ tipo: "flujo" });
    expect(delTipo && delTipo.porDispositivo).toBe("origen");
    const ar1 = piezas.find((p) => p.id === "arista:ar1");
    expect(ar1 && ar1.tipo).toBe("diagrama:arista");
    expect(ar1 && ar1.datos).toEqual({ fuente: "n1", destino: "n2", etiqueta: "canal" });
    const grupo = piezas.find((p) => p.id === "grupo:g1");
    expect(grupo && grupo.datos).toEqual({ etiqueta: "Caudal", nodos: ["n1", "n2"] });
    const texto0 = piezas.find((p) => p.id === "texto:0");
    expect(texto0 && texto0.datos).toEqual({ texto: "Canal principal" });
  });
});

describe("especificacionDeEstado", () => {
  it("recompone el estado de la sala en la misma especificación", () => {
    expect(especificacionDeEstado(abrir(BASE))).toEqual(BASE);
  });

  it("omite las lápidas y las piezas que no entiende", () => {
    const estado = abrir(BASE);
    const tapado: EstadoSala = {
      salaId: SALA_DIAGRAMAS,
      reloj: 10,
      elementos: {
        ...estado.elementos,
        "nodo:n2": { ...estado.elementos["nodo:n2"]!, borrado: true },
        "rafaga:señal": {
          id: "rafaga:señal", tipo: "rafaga", datos: { x: 1 }, actualizadoEn: 9, porDispositivo: "otra",
        },
        suelto: { id: "suelto", tipo: "suelto", datos: {}, actualizadoEn: 9, porDispositivo: "otra" },
      },
    };
    const espec = especificacionDeEstado(tapado);
    expect(espec.tipo).toBe("flujo");
    expect(espec.nodos.map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(espec.aristas.length).toBe(2);
    expect(espec.grupos.map((g) => g.id)).toEqual(["g1"]);
  });

  it("estado vacío sin lanzar", () => {
    const vacio: EstadoSala = { salaId: SALA_DIAGRAMAS, elementos: {}, reloj: 0 };
    expect(especificacionDeEstado(vacio)).toEqual({ tipo: "", nodos: [], aristas: [], grupos: [], textos: [] });
  });
});

describe("edición en grupo · tres neuronas", () => {
  it("dos renombran nodos distintos a la vez y una borra una arista: convergen", () => {
    const s1 = editar(abrir(BASE), "nodo:n1", {
      datos: { etiqueta: "Semilla", forma: "rect" },
      actualizadoEn: 2000,
      porDispositivo: "neurona-1",
    });
    const s2 = editar(abrir(BASE), "nodo:n2", {
      datos: { etiqueta: "Cristal", forma: "round" },
      actualizadoEn: 2000,
      porDispositivo: "neurona-2",
    });
    const s3 = editar(abrir(BASE), "arista:ar1", {
      borrado: true,
      actualizadoEn: 3000,
      porDispositivo: "neurona-3",
    });

    // Cada neurona fusiona las copias de las OTRAS con la suya, cada una en su orden.
    const f1 = fusionarEstados(fusionarEstados(s1, s2, "neurona-1").resultado, s3, "neurona-1").resultado;
    const f2 = fusionarEstados(fusionarEstados(s2, s3, "neurona-2").resultado, s1, "neurona-2").resultado;
    const f3 = fusionarEstados(fusionarEstados(s3, s1, "neurona-3").resultado, s2, "neurona-3").resultado;

    const e1 = especificacionDeEstado(f1);
    expect(e1).toEqual(especificacionDeEstado(f2));
    expect(e1).toEqual(especificacionDeEstado(f3));
    expect(e1.tipo).toBe("flujo");
    expect(e1.nodos.map((n) => [n.id, n.etiqueta])).toEqual([
      ["n1", "Semilla"],
      ["n2", "Cristal"],
      ["n3", "Desembocadura"],
    ]);
    expect(e1.aristas.map((a) => a.id)).toEqual(["ar2"]);
    expect(e1.textos).toEqual(["Canal principal"]);

    // Determinismo: el orden de llegada de los estados no cambia el mapa fusionado.
    const f1vuelta = fusionarEstados(fusionarEstados(s1, s3, "neurona-1").resultado, s2, "neurona-1").resultado;
    expect(f1vuelta.elementos).toEqual(f1.elementos);
  });
});
