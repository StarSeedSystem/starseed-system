import { describe, it, expect } from "vitest";
import { elementosDeEspecificacion, especificacionDeEstado, type EspecificacionDiagrama } from "../sincronia-diagrama";
import { fusionarEstados, type EstadoSala } from "@/lib/salas/sincronia-sala";

function estadoDesdeEspec(salaId: string, espec: EspecificacionDiagrama, autor: string, t: number): EstadoSala {
  return {
    salaId,
    reloj: t,
    elementos: elementosDeEspecificacion(espec, autor, t),
  };
}

describe("sincronia-diagrama", () => {
  it("convierte especificación a elementos y vuelve", () => {
    const espec: EspecificacionDiagrama = {
      tipo: "flujo",
      nodos: [{ id: "n1", nombre: "A", x: 0, y: 0 }],
      aristas: [{ id: "a1", origen: "n1", destino: "n2" }],
      textos: [{ id: "t1", contenido: "Hola", x: 10, y: 10 }],
    };
    const elems = elementosDeEspecificacion(espec, "dev1", 1000);
    expect(Object.keys(elems)).toContain("meta");
    expect(Object.keys(elems)).toContain("nodo:n1");
    expect(Object.keys(elems)).toContain("arista:a1");
    expect(Object.keys(elems)).toContain("texto:t1");

    const estado: EstadoSala = { salaId: "s1", reloj: 1000, elementos: elems };
    const vuelta = especificacionDeEstado(estado);
    expect(vuelta.tipo).toBe("flujo");
    expect(vuelta.nodos).toHaveLength(1);
    expect(vuelta.nodos[0].nombre).toBe("A");
    expect(vuelta.aristas[0].id).toBe("a1");
    expect(vuelta.textos[0].contenido).toBe("Hola");
  });

  it("tres neuronas convergen con renombres simultáneos y borrado de arista", () => {
    const salaId = "diag-1";
    const base: EspecificacionDiagrama = {
      tipo: "flujo",
      nodos: [
        { id: "n1", nombre: "Inicio" },
        { id: "n2", nombre: "Proceso" },
        { id: "n3", nombre: "Fin" },
      ],
      aristas: [
        { id: "a1", origen: "n1", destino: "n2" },
        { id: "a2", origen: "n2", destino: "n3" },
      ],
      textos: [],
    };

    // Estado base inicial
    const estadoBase = estadoDesdeEspec(salaId, base, "base", 1000);

    // Autor A renombra solo n1
    const eA = estadoDesdeEspec(salaId, {
      tipo: "flujo",
      nodos: [{ id: "n1", nombre: "Inicio-A" }],
      aristas: [],
      textos: [],
    }, "devA", 1001);

    // Autor B renombra solo n2
    const eB = estadoDesdeEspec(salaId, {
      tipo: "flujo",
      nodos: [{ id: "n2", nombre: "Proceso-B" }],
      aristas: [],
      textos: [],
    }, "devB", 1002);

    // Autor C borra a2 a partir del estado base
    const eC0 = estadoDesdeEspec(salaId, base, "devC", 1001);
    delete eC0.elementos["arista:a2"];
    eC0.elementos["arista:a2"] = {
      id: "arista:a2",
      tipo: "diagrama:arista",
      datos: { id: "a2", origen: "n2", destino: "n3" },
      actualizadoEn: 1003,
      porDispositivo: "devC",
      borrado: true,
    };

    const f1 = fusionarEstados(estadoBase, eA, "devA");
    const f2 = fusionarEstados(fusionarEstados(estadoBase, eB, "devA").resultado, eA, "devA");
    const fA = fusionarEstados(f1.resultado, estadoBase, "devA");
    const fB = fusionarEstados(f2.resultado, estadoBase, "devA");
    // Simplificamos: fusionamos base + A + B + C
    const mergeAB = fusionarEstados(fusionarEstados(estadoBase, eA, "base").resultado, eB, "base");
    const mergeABC1 = fusionarEstados(mergeAB.resultado, eC0, "base");
    const mergeAB2 = fusionarEstados(fusionarEstados(estadoBase, eB, "base").resultado, eA, "base");
    const mergeABC2 = fusionarEstados(mergeAB2.resultado, eC0, "base");

    const spec1 = especificacionDeEstado(mergeABC1.resultado);
    const spec2 = especificacionDeEstado(mergeABC2.resultado);

    expect(spec1.nodos.find(n => n.id === "n1")?.nombre).toBe("Inicio-A");
    expect(spec1.nodos.find(n => n.id === "n2")?.nombre).toBe("Proceso-B");
    expect(spec1.aristas.find(a => a.id === "a2")).toBeUndefined();
    expect(spec1.aristas.find(a => a.id === "a1")).toBeDefined();

    expect(spec1).toEqual(spec2);
  });

  it("ignora lápidas al recomponer", () => {
    const elems = elementosDeEspecificacion(
      { tipo: "t", nodos: [{ id: "n1", nombre: "A" }], aristas: [], textos: [] },
      "dev", 1
    );
    elems["nodo:n1"].borrado = true;
    const estado: EstadoSala = { salaId: "s", reloj: 1, elementos: elems };
    const spec = especificacionDeEstado(estado);
    expect(spec.nodos).toHaveLength(0);
  });
});
