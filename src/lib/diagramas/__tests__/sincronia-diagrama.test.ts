import { describe, it, expect } from "vitest";
import {
  EspecificacionDiagrama,
  elementosDeEspecificacion,
  especificacionDeEstado,
  estadoDeEspecificacion,
} from "../sincronia-diagrama";
import { fusionarEstados } from "../../salas/sincronia-sala";

describe("sincronia-diagrama", () => {
  it("dos neuronas renombrando nodos distintos y una borrando una arista convergen", () => {
    const base: EspecificacionDiagrama = {
      tipo: "flujo",
      nodos: {
        inicio: { id: "inicio", etiqueta: "Inicio", forma: "rect" },
        final: { id: "final", etiqueta: "Final", forma: "rect" },
      },
      aristas: {
        e1: { id: "e1", fuente: "inicio", destino: "final", etiqueta: "" },
      },
      textos: {},
    };

    // Tres estados locales que divergen del base: renombres y borrado.
    const ana = estadoDeEspecificacion(base, "ana", 2000, "sala-flujo");
    // Ana renombra "final" → "Salida"
    ana.elementos["nodo:final"] = {
      ...ana.elementos["nodo:final"],
      datos: { id: "final", etiqueta: "Salida", forma: "rect" },
      actualizadoEn: 2100,
      porDispositivo: "ana",
    };

    const boris = estadoDeEspecificacion({ ...base, nodos: { ...base.nodos, inicio: { ...base.nodos.inicio, etiqueta: "Comienzo", forma: "rect" } } }, "boris", 2100, "sala-flujo");
    // Boris renombra "inicio" → "Comienzo" (ya está en el base modificado)
    boris.elementos["nodo:inicio"] = {
      ...boris.elementos["nodo:inicio"],
      datos: { id: "inicio", etiqueta: "Comienzo", forma: "rect" },
      actualizadoEn: 2200,
      porDispositivo: "boris",
    };

    const carlos = estadoDeEspecificacion(base, "carlos", 1900, "sala-flujo");
    // Carlos borra la arista (lápida)
    carlos.elementos["arista:e1"] = {
      ...carlos.elementos["arista:e1"],
      borrado: true,
      actualizadoEn: 2400,
      porDispositivo: "carlos",
    };

    // Fusión en orden distinto: primero ana + boris, luego con carlos.
    const fusion1 = fusionarEstados(ana, boris, "ana");
    expect(fusion1.resultado.elementos["nodo:inicio"].datos.etiqueta).toBe("Comienzo");
    expect(fusion1.resultado.elementos["nodo:final"].datos.etiqueta).toBe("Salida");

    const fusion2 = fusionarEstados(fusion1.resultado, carlos, "boris");
    expect(fusion2.resultado.elementos["arista:e1"].borrado).toBe(true);
    expect(fusion2.resultado.elementos["nodo:inicio"].datos.etiqueta).toBe("Comienzo");
    expect(fusion2.resultado.elementos["nodo:final"].datos.etiqueta).toBe("Salida");

    // Recompone sin errores y refleja los tres cambios convergentes.
    const recompuesta = especificacionDeEstado(fusion2.resultado);
    expect(recompuesta.nodos.inicio.etiqueta).toBe("Comienzo");
    expect(recompuesta.nodos.final.etiqueta).toBe("Salida");
    expect(recompuesta.aristas.e1).toBeUndefined(); // borrado → no resucita
  });

  it("recompone desde un EstadoSala vacío", () => {
    const vacio = { salaId: "prueba", elementos: {}, reloj: 0 };
    const r = especificacionDeEstado(vacio);
    expect(r.tipo).toBe("diagrama");
    expect(Object.keys(r.nodos).length).toBe(0);
  });

  it("convierte una especificación a elementos y la recompone", () => {
    const espec: EspecificacionDiagrama = {
      tipo: "flujo",
      nodos: {
        a: { id: "a", etiqueta: "Inicio", forma: "rect" },
      },
      aristas: {
        ab: { id: "ab", fuente: "a", destino: "b", etiqueta: "sigue" },
      },
      textos: { nota1: "Nota libre" },
    };
    const el = elementosDeEspecificacion(espec, "ana", 1000);
    expect(el["nodo:a"]).toBeDefined();
    expect(el["arista:ab"]).toBeDefined();
    expect(el["texto:nota1"]).toBeDefined();
    expect(el["tipo:flujo"]).toBeDefined();
  });
});
