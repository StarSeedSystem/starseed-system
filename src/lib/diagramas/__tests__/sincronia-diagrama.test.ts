import { describe, it, expect } from "vitest";
import { elementosDeEspecificacion, especificacionDeEstado } from "../sincronia-diagrama";
import { Nodo, Arista, Grupo, ResultadoDiagrama } from "./importar";

function nodo(id: string, etiqueta: string, forma?: string): Nodo {
  return { id, etiqueta, forma };
}

function arista(id: string, fuente: string, destino: string, etiqueta: string): Arista {
  return { id, fuente, destino, etiqueta };
}

function grupo(id: string, etiqueta: string, nodos: string[]): Grupo {
  return { id, etiqueta, nodos };
}

function espec(nodos: Nodo[], aristas: Arista[], grupos: Grupo[], textos: string[]): ResultadoDiagrama {
  return { nodos, aristas, grupos, textos };
}

describe("elementosDeEspecificacion", () => {
  it("convierte nodos en ElementoSala con tipo y datos", () => {
    const resultado = elementosDeEspecificacion(
      espec([nodo("n1", "Inicio"), nodo("n2", "Fin", "rect")], [], [], []),
      "usuario-1",
    );
    const nodos = resultado.filter((el) => el.tipo !== "arista" && el.tipo !== "grupo" && el.tipo !== "texto");
    expect(nodos.length).toBe(2);
    expect(nodos[0].id).toBe("n1");
    expect(nodos[0].tipo).toBe("rect");
    expect(nodos[0].datos).toEqual({ etiqueta: "Inicio", forma: undefined });
    expect(nodos[1].id).toBe("n2");
    expect(nodos[1].tipo).toBe("rect");
    expect(nodos[1].datos).toEqual({ etiqueta: "Fin", forma: "rect" });
  });

  it("convierte aristas en ElementoSala", () => {
    const resultado = elementosDeEspecificacion(
      espec([], [arista("a1", "n1", "n2", "Sí")], [], []),
      "usuario-1",
    );
    const aristas = resultado.filter((el) => el.tipo === "arista");
    expect(aristas.length).toBe(1);
    expect(aristas[0].id).toBe("a1");
    expect(aristas[0].tipo).toBe("arista");
    expect(aristas[0].datos).toEqual({ fuente: "n1", destino: "n2", etiqueta: "Sí" });
  });

  it("convierte grupos en ElementoSala", () => {
    const resultado = elementosDeEspecificacion(
      espec([], [], [grupo("g1", "Grupo 1", ["n1", "n2"])], []),
      "usuario-1",
    );
    const grupos = resultado.filter((el) => el.tipo === "grupo");
    expect(grupos.length).toBe(1);
    expect(grupos[0].id).toBe("g1");
    expect(grupos[0].tipo).toBe("grupo");
    expect(grupos[0].datos).toEqual({ etiqueta: "Grupo 1", nodos: ["n1", "n2"] });
  });

  it("convierte textos en ElementoSala", () => {
    const resultado = elementosDeEspecificacion(
      espec([], [], [], ["Etiqueta 1", "Etiqueta 2"]),
      "usuario-1",
    );
    const textos = resultado.filter((el) => el.tipo === "texto");
    expect(textos.length).toBe(2);
    expect(textos[0].id).toBe("t-0");
    expect(textos[0].datos).toEqual({ contenido: "Etiqueta 1" });
    expect(textos[1].id).toBe("t-1");
    expect(textos[1].datos).toEqual({ contenido: "Etiqueta 2" });
  });
});

describe("especificacionDeEstado", () => {
  it("recompone un ResultadoDiagrama simplificado desde un EstadoSala", () => {
    const estado: import("../salas/sincronia-sala").EstadoSala = {
      salaId: "sala-1",
      elementos: {
        "n1": { id: "n1", tipo: "rect", datos: { etiqueta: "Inicio", forma: "rect" }, actualizadoEn: Date.now(), porDispositivo: "user-1" },
        "a1": { id: "a1", tipo: "arista", datos: { fuente: "n1", destino: "n2", etiqueta: "Sí" }, actualizadoEn: Date.now(), porDispositivo: "user-1" },
        "t1": { id: "t1", tipo: "texto", datos: { contenido: "Etiqueta" }, actualizadoEn: Date.now(), porDispositivo: "user-1" },
      },
      reloj: 1000,
    };
    const resultado = especificacionDeEstado(estado);
    expect(resultado.nodos.length).toBeGreaterThan(0);
    expect(resultado.aristas.length).toBeGreaterThan(0);
    expect(resultado.textos.length).toBeGreaterThan(0);
  });

  it("maneja EstadoSala vacío", () => {
    const estado: import("../salas/sincronia-sala").EstadoSala = { salaId: "sala-1", elementos: {}, reloj: 0 };
    const resultado = especificacionDeEstado(estado);
    expect(resultado.nodos.length).toBe(0);
    expect(resultado.aristas.length).toBe(0);
    expect(resultado.textos.length).toBe(0);
  });
});