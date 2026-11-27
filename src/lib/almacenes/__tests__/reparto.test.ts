import { describe, it, expect } from "vitest";
import {
  UNIDAD_APORTE_BYTES,
  cupoPorReciprocidad,
  evaluarReparto,
  repararFragmentos,
  repartirFragmentos,
  type FragmentoColocado,
  type OfertaNodo,
} from "../reparto";

const TAMANO = BigInt(1024);

function oferta(cambios: Partial<OfertaNodo> & Pick<OfertaNodo, "nodoId">): OfertaNodo {
  return {
    aparatoId: `aparato-${cambios.nodoId}`,
    redId: `red-${cambios.nodoId}`,
    personaId: `persona-${cambios.nodoId}`,
    libreBytes: BigInt(1_000_000),
    aportadoBytes: BigInt(0),
    consumidoBytes: BigInt(0),
    cupoBase: 4,
    salud: "buena",
    enLinea: true,
    ...cambios,
  };
}

describe("reparto democrático de fragmentos", () => {
  it("da cupo extra por reciprocidad", () => {
    expect(cupoPorReciprocidad({ aportadoBytes: BigInt(0), consumidoBytes: BigInt(0), cupoBase: 1 })).toBe(1);
    const aportado = UNIDAD_APORTE_BYTES * BigInt(3);
    expect(cupoPorReciprocidad({ aportadoBytes: aportado, consumidoBytes: UNIDAD_APORTE_BYTES, cupoBase: 1 })).toBe(3);
    expect(cupoPorReciprocidad({ aportadoBytes: BigInt(0), consumidoBytes: UNIDAD_APORTE_BYTES, cupoBase: 2 })).toBe(2);
  });

  it("reparte cada fragmento por aparatos, redes y personas distintas", () => {
    const ofertas = ["a", "b", "c", "d", "e"].map((nodoId) => oferta({ nodoId }));
    const resultado = repartirFragmentos(ofertas, { k: 3, n: 5, tamanoFragmentoBytes: TAMANO });
    expect(resultado.ok).toBe(true);
    expect(resultado.colocaciones).toHaveLength(5);
    expect(new Set(resultado.colocaciones.map((c) => c.nodoId)).size).toBe(5);
    expect(resultado.diversidad).toEqual({ aparatos: 5, redes: 5, personas: 5, dominios: 5 });
    expect(resultado.diversidadSuficiente).toBe(true);
  });

  it("descarta ofertas caídas, críticas o sin espacio", () => {
    const ofertas = [
      oferta({ nodoId: "sana", cupoBase: 1 }),
      oferta({ nodoId: "caida", enLinea: false }),
      oferta({ nodoId: "critica", salud: "critica" }),
      oferta({ nodoId: "llena", libreBytes: BigInt(1) }),
    ];
    const resultado = repartirFragmentos(ofertas, { k: 2, n: 2, tamanoFragmentoBytes: TAMANO });
    expect(resultado.ok).toBe(false);
    expect(resultado.colocaciones.map((c) => c.nodoId)).toEqual(["sana"]);
    expect(resultado.errores[0]).toMatch(/Sin cupo/);
  });

  it("respeta el cupo por nodo y detecta cuándo falta capacidad", () => {
    const ofertas = [oferta({ nodoId: "uno", cupoBase: 1 })];
    const resultado = repartirFragmentos(ofertas, { k: 2, n: 3, tamanoFragmentoBytes: TAMANO });
    expect(resultado.ok).toBe(false);
    expect(resultado.colocaciones).toHaveLength(1);
    expect(resultado.errores).toHaveLength(1);
  });

  it("evalúa la salud cuando un nodo se va y repara solo lo perdido", () => {
    const ofertas = ["a", "b", "c", "d", "e", "f", "g"].map((nodoId) => oferta({ nodoId }));
    const reparto = repartirFragmentos(ofertas, { k: 3, n: 5, tamanoFragmentoBytes: TAMANO });
    const nodosVivos = reparto.colocaciones.slice(0, 3).map((c) => c.nodoId);

    const evaluacion = evaluarReparto(reparto.colocaciones, nodosVivos, 3);
    expect(evaluacion.vivos).toBe(3);
    expect(evaluacion.perdidos).toHaveLength(2);
    expect(evaluacion.recuperable).toBe(true);
    expect(evaluacion.necesitaReparacion).toBe(true);

    const reparacion = repararFragmentos(ofertas, { k: 3, n: 5, tamanoFragmentoBytes: TAMANO }, reparto.colocaciones, nodosVivos);
    expect(reparacion.ok).toBe(true);
    expect(reparacion.colocaciones.map((c) => c.indiceFragmento)).toEqual(evaluacion.perdidos);
    expect(reparacion.colocaciones.every((c) => nodosVivos.includes(c.nodoId))).toBe(false);
  });

  it("marca no recuperable cuando quedan menos de k fragmentos", () => {
    const colocaciones: FragmentoColocado[] = [
      { indiceFragmento: 0, nodoId: "a" },
      { indiceFragmento: 1, nodoId: "b" },
      { indiceFragmento: 2, nodoId: "c" },
    ];
    const evaluacion = evaluarReparto(colocaciones, ["a", "b"], 3);
    expect(evaluacion.vivos).toBe(2);
    expect(evaluacion.recuperable).toBe(false);
    expect(evaluacion.perdidos).toEqual([2]);
  });
});
