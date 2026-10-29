// DGM1018N · Pruebas puras de la sincronía de diagramas: sin red, sin disco, sin navegador.
import { describe, it, expect } from "vitest";
import {
  elementosDeEspecificacion,
  especificacionDeEstado,
  type EspecificacionDiagrama,
} from "../sincronia-diagrama";
import { fusionarEstados, type EstadoSala } from "../../salas/sincronia-sala";

const BASE: EspecificacionDiagrama = {
  tipo: "architecture",
  nodos: [
    { id: "n1", etiqueta: "Gateway", forma: "rect" },
    { id: "n2", etiqueta: "Base de datos", forma: "cylinder" },
  ],
  aristas: [
    { id: "e1", fuente: "n1", destino: "n2", etiqueta: "consulta" },
  ],
  grupos: [{ id: "g1", etiqueta: "Núcleo", nodos: ["n1", "n2"] }],
  textos: ["Figura 1", "Vista general"],
};

/** Estado de sala de UNA persona: todas sus piezas llevan su autor y su marca. */
function estadoDe(espec: EspecificacionDiagrama, autor: string, t: number): EstadoSala {
  return {
    salaId: "sala-diag",
    elementos: elementosDeEspecificacion(espec, autor, t),
    reloj: 1,
  };
}

describe("elementosDeEspecificacion", () => {
  it("compone una entidad de sala por pieza, referenciada por id", () => {
    const el = elementosDeEspecificacion(BASE, "A", 10);
    expect(el["nodo:n1"].datos.etiqueta).toBe("Gateway");
    expect(el["nodo:n1"].porDispositivo).toBe("A");
    expect(el["arista:e1"].datos.destino).toBe("n2");
    expect(el["grupo:g1"].datos.nodos).toEqual(["n1", "n2"]);
    expect(el["texto:0"].datos.valor).toBe("Figura 1");
    expect(el["diagrama:tipo"].datos.tipo).toBe("architecture");
  });
});

describe("especificacionDeEstado", () => {
  it("recompone la especificación ida y vuelta sin perder piezas", () => {
    const el = elementosDeEspecificacion(BASE, "A", 10);
    const vuelta = especificacionDeEstado({ salaId: "sala-diag", elementos: el, reloj: 1 });
    expect(vuelta).toEqual(BASE);
  });

  it("vacio: el tipo cae al defecto y no salen piezas", () => {
    const espec = especificacionDeEstado({ salaId: "sala-diag", elementos: {}, reloj: 3 });
    expect(espec.tipo).toBe("flowchart");
    expect(espec.nodos).toEqual([]);
    expect(espec.textos).toEqual([]);
  });
});

describe("edición en grupo", () => {
  /** Añade (o sobrescribe) una pieza editada por una persona en t. */
  function editada(estado: EstadoSala, id: string, datos: Record<string, unknown>, autor: string, t: number): EstadoSala {
    const base = estado.elementos[id];
    return {
      salaId: estado.salaId,
      reloj: estado.reloj,
      elementos: { ...estado.elementos, [id]: { ...base, datos, actualizadoEn: t, porDispositivo: autor } },
    };
  }

  it("A renombra n1, B renombra n2 y C borra e1: las tres neuronas convergen", () => {
    // Todos parten de la misma base en t = 10; cada quien edita en t = 50 (C borra, su lápida es lo que viaja).
    const eA = editada(estadoDe(BASE, "A", 10), "nodo:n1", { etiqueta: "Puerta de entrada", forma: "rect" }, "A", 50);
    const eB = editada(estadoDe(BASE, "B", 10), "nodo:n2", { etiqueta: "PostgreSQL", forma: "cylinder" }, "B", 50);
    const eC = elementosDeEspecificacion(BASE, "C", 10)["arista:e1"];
    const eCedida: EstadoSala = {
      salaId: "sala-diag",
      reloj: 1,
      elementos: { ...elementosDeEspecificacion(BASE, "C", 10), "arista:e1": { ...eC, actualizadoEn: 30, borrado: true } },
    };

    // Cada neurona fusiona las otras dos, cada una en su orden.
    const specA = especificacionDeEstado(fusionarEstados(eA, eB, "A").resultado, eCedida, "A");
    const specB = especificacionDeEstado(fusionarEstados(eB, eCedida, "B").resultado, eA, "B");
    const specC = especificacionDeEstado(fusionarEstados(eCedida, eA, "C").resultado, eB, "C");

    const esperado: EspecificacionDiagrama = {
      tipo: "architecture",
      nodos: [
        { id: "n1", etiqueta: "Puerta de entrada", forma: "rect" },
        { id: "n2", etiqueta: "PostgreSQL", forma: "cylinder" },
      ],
      aristas: [], // la arista borrada no resucita: la lápida manda.
      grupos: [{ id: "g1", etiqueta: "Núcleo", nodos: ["n1", "n2"] }],
      textos: ["Figura 1", "Vista general"],
    };
    expect(specA).toEqual(esperado);
    expect(specB).toEqual(esperado);
    expect(specC).toEqual(esperado);
  });

  it("dos personas renombran el MISMO nodo: gana la edición más nueva", () => {
    const eA = editada(estadoDe(BASE, "A", 10), "nodo:n1", { etiqueta: "Tardía", forma: "rect" }, "A", 50);
    const eB = editada(estadoDe(BASE, "B", 10), "nodo:n1", { etiqueta: "Nueva", forma: "rect" }, "B", 60);
    const espec = especificacionDeEstado(eA, eB, "A");
    expect(espec.nodos.find((n) => n.id === "n1")?.etiqueta).toBe("Nueva");
  });
});

