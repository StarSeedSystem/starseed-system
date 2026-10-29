/**
 * Pruebas de la sincronía de la especificación de un diagrama (DGM1018N).
 * Solo funciones puras: sin red, disco ni navegador. La convergencia se
 * comprueba fusionando las tres neuronas en todos los órdenes y exigiendo el
 * MISMO resultado, la regla de `fusionarEstados`.
 */
import { describe, it, expect } from "vitest";
import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";
import {
  elementosDeEspecificacion, especificacionDeEstado, fusionarEspecificaciones,
  type AristaEspecificacion, type EspecificacionDiagrama, type NodoEspecificacion,
} from "../sincronia-diagrama";
const T0 = 1_757_000_000_000, T1 = T0 + 1_000, T2 = T0 + 2_000;
function nodo(id: string, etiqueta: string, t = T0, autor = "inicial"): NodoEspecificacion {
  return { id, etiqueta, forma: "rect", actualizadoEn: t, porDispositivo: autor };
}
function arista(): AristaEspecificacion {
  return { id: "e1", fuente: "n2", destino: "n1", etiqueta: "consulta", actualizadoEn: T0, porDispositivo: "inicial" };
}
function base(): EspecificacionDiagrama {
  return { id: "diag-planta", tipo: "architecture", actualizadoEn: T0, porDispositivo: "inicial",
    nodos: [nodo("n1", "Base de datos"), nodo("n2", "API")], aristas: [arista()],
    textos: ["Planta del servicio"], eliminados: [], colores: { fondo: "papel", acento: "coral" } };
}
function estado(espec: EspecificacionDiagrama, autor: string, t: number): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (const elemento of elementosDeEspecificacion(espec, autor, t)) elementos[elemento.id] = elemento;
  return { salaId: espec.id, elementos, reloj: t };
}
function fusionarEnOrden(estados: EstadoSala[]): EspecificacionDiagrama {
  const final = estados.reduce((acc, e) => fusionarEstados(acc, e, "neurona-observadora").resultado);
  return especificacionDeEstado(final);
}
function ana(): EspecificacionDiagrama {
  const e = base();
  e.nodos = [nodo("n1", "PostgreSQL", T1, "ana"), nodo("n2", "API")];
  e.actualizadoEn = T1; e.porDispositivo = "ana";
  return e;
}
function bruno(): EspecificacionDiagrama {
  const e = base();
  e.nodos = [nodo("n1", "Base de datos"), nodo("n2", "Gateway", T2, "bruno")];
  e.aristas = []; e.eliminados = ["arista:e1"]; e.actualizadoEn = T2; e.porDispositivo = "bruno";
  return e;
}
const carla = (): EspecificacionDiagrama => base();
describe("elementosDeEspecificacion", () => {
  it("convierte nodos, aristas y textos en elementos con id estable y su sello", () => {
    const elementos = elementosDeEspecificacion(base(), "ana", T1);
    expect(elementos.map((e) => e.id)).toEqual([
      "diagrama:diag-planta", "nodo:n1", "nodo:n2", "arista:e1", "texto:0",
    ]);
    expect(elementos.find((e) => e.id === "nodo:n1")).toMatchObject({
      tipo: "diagrama-nodo", actualizadoEn: T0, porDispositivo: "inicial",
      datos: { etiqueta: "Base de datos", forma: "rect" },
    });
    expect(elementos.find((e) => e.id === "texto:0")?.datos).toEqual({ contenido: "Planta del servicio" });
  });
  it("usa autor y t cuando el elemento no trae sello (importación)", () => {
    const espec = base();
    espec.nodos = [{ id: "n1", etiqueta: "Base de datos" }];
    const elemento = elementosDeEspecificacion(espec, "bruno", T2).find((e) => e.id === "nodo:n1");
    expect(elemento?.actualizadoEn).toBe(T2);
    expect(elemento?.porDispositivo).toBe("bruno");
  });
});
describe("especificacionDeEstado", () => {
  it("recompone la misma especificación con tipo, colores, nodos, aristas y textos", () => {
    const vuelta = especificacionDeEstado(estado(base(), "ana", T1));
    expect(vuelta).toMatchObject({
      id: "diag-planta", tipo: "architecture", textos: ["Planta del servicio"],
      colores: { fondo: "papel", acento: "coral" }, eliminados: [],
    });
    expect(vuelta.nodos.map((n) => [n.id, n.etiqueta])).toEqual([["n1", "Base de datos"], ["n2", "API"]]);
    expect(vuelta.aristas.map((a) => [a.id, a.fuente, a.destino, a.etiqueta]))
      .toEqual([["e1", "n2", "n1", "consulta"]]);
  });
  it("una lápida no reaparece y queda anotada en eliminados", () => {
    const espec = base();
    espec.eliminados = ["e1"];
    const vuelta = especificacionDeEstado(estado(espec, "bruno", T2));
    expect(vuelta.aristas).toEqual([]);
    expect(vuelta.eliminados).toEqual(["arista:e1"]);
  });
});
describe("tres neuronas · dos renombres y una arista borrada", () => {
  it("convergen en el mismo diagrama fusionen en el orden que fusionen", () => {
    const A = estado(ana(), "ana", T1);
    const B = estado(bruno(), "bruno", T2);
    const C = estado(carla(), "carla", T1);
    const ordenes = [[A, B, C], [A, C, B], [B, A, C], [B, C, A], [C, A, B], [C, B, A]];
    const salidas = ordenes.map((orden) => fusionarEnOrden(orden));
    for (const salida of salidas.slice(1)) expect(salida).toEqual(salidas[0]);
    expect(salidas[0].nodos.find((n) => n.id === "n1")).toMatchObject({ etiqueta: "PostgreSQL", porDispositivo: "ana" });
    expect(salidas[0].nodos.find((n) => n.id === "n2")).toMatchObject({ etiqueta: "Gateway", porDispositivo: "bruno" });
    expect(salidas[0].aristas).toEqual([]);
    expect(salidas[0].eliminados).toEqual(["arista:e1"]);
  });
  it("la lápida no resucita al fusionar con quien aún tenía la arista", () => {
    const conArista = estado(carla(), "carla", T1);
    const sinArista = estado(bruno(), "bruno", T2);
    const ida = fusionarEstados(conArista, sinArista, "neurona-observadora").resultado;
    const vuelta = fusionarEstados(sinArista, conArista, "neurona-observadora").resultado;
    expect(especificacionDeEstado(ida).aristas).toEqual([]);
    expect(especificacionDeEstado(vuelta).aristas).toEqual([]);
  });
  it("fusionarEspecificaciones funde los dos renombres en una sola pieza", () => {
    const { especificacion, conflictos } = fusionarEspecificaciones(ana(), bruno(), "neurona-observadora");
    expect(especificacion.nodos.find((n) => n.id === "n1")?.etiqueta).toBe("PostgreSQL");
    expect(especificacion.nodos.find((n) => n.id === "n2")?.etiqueta).toBe("Gateway");
    expect(especificacion.aristas).toEqual([]);
    expect(conflictos).toContain("arista:e1");
  });
  it("no mezcla dos diagramas distintos", () => {
    const otra = { ...base(), id: "diag-otra" };
    const { conflictos } = fusionarEstados(estado(base(), "ana", T1), estado(otra, "bruno", T2), "obs");
    expect(conflictos).toEqual(["sala-distinta"]);
  });
});
