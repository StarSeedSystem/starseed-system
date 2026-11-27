import { describe, it, expect } from "vitest";
import { crearGrafo, anadirNodo, Nodo } from "../modelo";
import { agruparPorJerarquia, colapsarGrupos, nivelDeDetalle, FacetaJerarquia } from "../agrupar";

function crearNodo(id: string, dueno: string, peso: number, overrides: Partial<Nodo> = {}): Nodo {
  return {
    id,
    tipo: "archivo",
    titulo: `Doc ${id}`,
    formato: "texto",
    ref: `ref-${id}`,
    alcance: "publico",
    dueno,
    capas: [],
    t_creado: 1000,
    t_actividad: 1000,
    peso,
    etiquetas: [],
    ...overrides,
  };
}

describe("agruparPorJerarquia", () => {
  it("debe agrupar nodos por dueño", () => {
    const grafo = crearGrafo();
    const nodo1 = crearNodo("n1", "usuario1", 0.1);
    const nodo2 = crearNodo("n2", "usuario1", 0.8);
    const nodo3 = crearNodo("n3", "usuario2", 0.1);
    anadirNodo(grafo, nodo1);
    anadirNodo(grafo, nodo2);
    anadirNodo(grafo, nodo3);

    const grupos = agruparPorJerarquia(grafo, "dueno");
    expect(grupos.size).toBe(2);
    expect(grupos.get("usuario1")).toHaveLength(2);
    expect(grupos.get("usuario2")).toHaveLength(1);

    const colapsados = colapsarGrupos(grafo, grupos, 0.5);
    expect(colapsados.has("colapsado-usuario1")).toBe(true);
    expect(colapsados.has("n2")).toBe(true);
    expect(colapsados.has("colapsado-usuario2")).toBe(true);
  });

  it("debe agrupar por diferentes facetas de jerarquía", () => {
    const grafo = crearGrafo();
    const nodo1 = crearNodo("n1", "u1", 0.5, { tema: "tema1", categoria: "cat1" });
    const nodo2 = crearNodo("n2", "u1", 0.5, { tema: "tema1", categoria: "cat2" });
    const nodo3 = crearNodo("n3", "u2", 0.5, { tema: "tema2", categoria: "cat1" });
    anadirNodo(grafo, nodo1);
    anadirNodo(grafo, nodo2);
    anadirNodo(grafo, nodo3);

    const porTema = agruparPorJerarquia(grafo, "tema");
    expect(porTema.size).toBe(2);
    expect(porTema.get("tema1")).toHaveLength(2);

    const porCategoria = agruparPorJerarquia(grafo, "categoria");
    expect(porCategoria.size).toBe(2);
    expect(porCategoria.get("cat1")).toHaveLength(2);
  });

  it("maneja nodos sin valor en la faceta (indefinido)", () => {
    const grafo = crearGrafo();
    const nodo1 = crearNodo("n1", "u1", 0.5, { tema: undefined as any });
    const nodo2 = crearNodo("n2", "u1", 0.5, { tema: "tema1" });
    anadirNodo(grafo, nodo1);
    anadirNodo(grafo, nodo2);

    const grupos = agruparPorJerarquia(grafo, "tema");
    expect(grupos.size).toBe(2);
    expect(grupos.has("indefinido")).toBe(true);
    expect(grupos.has("tema1")).toBe(true);
  });
});

describe("colapsarGrupos", () => {
  it("colapsa nodos por debajo del umbral y mantiene los que están por encima", () => {
    const grafo = crearGrafo();
    const nodo1 = crearNodo("n1", "u1", 0.1);
    const nodo2 = crearNodo("n2", "u1", 0.8);
    const nodo3 = crearNodo("n3", "u1", 0.2);
    const nodo4 = crearNodo("n4", "u2", 0.9);
    anadirNodo(grafo, nodo1);
    anadirNodo(grafo, nodo2);
    anadirNodo(grafo, nodo3);
    anadirNodo(grafo, nodo4);

    const grupos = agruparPorJerarquia(grafo, "dueno");
    const colapsados = colapsarGrupos(grafo, grupos, 0.5);

    expect(colapsados.has("colapsado-u1")).toBe(true);
    expect(colapsados.get("colapsado-u1")?.nodos).toEqual(["n1", "n3"]);
    expect(colapsados.get("colapsado-u1")?.pesoTotal).toBeCloseTo(0.3);
    expect(colapsados.has("n2")).toBe(true);
    expect(colapsados.has("n4")).toBe(true);
  });

  it("no crea grupo colapsado si todos los nodos superan el umbral", () => {
    const grafo = crearGrafo();
    const nodo1 = crearNodo("n1", "u1", 0.8);
    const nodo2 = crearNodo("n2", "u1", 0.9);
    anadirNodo(grafo, nodo1);
    anadirNodo(grafo, nodo2);

    const grupos = agruparPorJerarquia(grafo, "dueno");
    const colapsados = colapsarGrupos(grafo, grupos, 0.5);

    expect(colapsados.has("colapsado-u1")).toBe(false);
    expect(colapsados.has("n1")).toBe(true);
    expect(colapsados.has("n2")).toBe(true);
  });

  it("colapsa todos si todos están por debajo del umbral", () => {
    const grafo = crearGrafo();
    const nodo1 = crearNodo("n1", "u1", 0.1);
    const nodo2 = crearNodo("n2", "u1", 0.2);
    anadirNodo(grafo, nodo1);
    anadirNodo(grafo, nodo2);

    const grupos = agruparPorJerarquia(grafo, "dueno");
    const colapsados = colapsarGrupos(grafo, grupos, 0.5);

    expect(colapsados.has("colapsado-u1")).toBe(true);
    expect(colapsados.get("colapsado-u1")?.nodos).toEqual(["n1", "n2"]);
    expect(colapsados.size).toBe(1);
  });
});

describe("nivelDeDetalle", () => {
  it("devuelve todos los nodos expandidos a distancia 0 con tope alto", () => {
    const grafo = crearGrafo();
    for (let i = 0; i < 10; i++) {
      anadirNodo(grafo, crearNodo(`n${i}`, `u${i % 3}`, 0.5));
    }

    const resultado = nivelDeDetalle(grafo, { distancia: 0, maxCuerposVisibles: 100 });

    expect(resultado.cuerposVisibles).toBe(10);
    expect(resultado.gruposColapsados).toBe(0);
    expect(resultado.gruposExpandidos).toBe(10);
    expect(resultado.umbralPesoUsado).toBe(0.1);
  });

  it("colapsa grupos a distancia 1", () => {
    const grafo = crearGrafo();
    for (let i = 0; i < 10; i++) {
      anadirNodo(grafo, crearNodo(`n${i}`, `u${i % 3}`, 0.05));
    }

    const resultado = nivelDeDetalle(grafo, { distancia: 1, maxCuerposVisibles: 100, umbralBase: 0.1 });

    expect(resultado.cuerposVisibles).toBeLessThanOrEqual(10);
    expect(resultado.gruposColapsados).toBeGreaterThan(0);
    expect(resultado.umbralPesoUsado).toBeGreaterThan(0.1);
  });

  it("respeta el tope de cuerpos visibles aumentando el umbral", () => {
    const grafo = crearGrafo();
    for (let i = 0; i < 20; i++) {
      anadirNodo(grafo, crearNodo(`n${i}`, `u${i}`, 0.05));
    }

    const resultado = nivelDeDetalle(grafo, { distancia: 0.5, maxCuerposVisibles: 5, umbralBase: 0.1 });

    expect(resultado.cuerposVisibles).toBeLessThanOrEqual(5);
    expect(resultado.umbralPesoUsado).toBeGreaterThanOrEqual(0.1 * (1 + 0.5 * 9));
  });

  it("funciona con grafo de 10 nodos", () => {
    const grafo = crearGrafo();
    for (let i = 0; i < 10; i++) {
      anadirNodo(grafo, crearNodo(`n${i}`, `u${i % 4}`, 0.1 + (i % 3) * 0.2));
    }

    const cerca = nivelDeDetalle(grafo, { distancia: 0.1, maxCuerposVisibles: 100 });
    const lejos = nivelDeDetalle(grafo, { distancia: 0.9, maxCuerposVisibles: 100 });

    expect(cerca.cuerposVisibles).toBeGreaterThanOrEqual(lejos.cuerposVisibles);
    expect(lejos.gruposColapsados).toBeGreaterThanOrEqual(cerca.gruposColapsados);
  });

  it("funciona con grafo de 1000 nodos", () => {
    const grafo = crearGrafo();
    for (let i = 0; i < 1000; i++) {
      anadirNodo(grafo, crearNodo(`n${i}`, `u${i % 50}`, Math.random() * 0.5 + 0.05));
    }

    const resultado = nivelDeDetalle(grafo, { distancia: 0.5, maxCuerposVisibles: 200 });

    expect(resultado.cuerposVisibles).toBeLessThanOrEqual(200);
    expect(resultado.gruposColapsados + resultado.gruposExpandidos).toBe(resultado.cuerposVisibles);
  });

  it("funciona con grafo de 20000 nodos", () => {
    const grafo = crearGrafo();
    for (let i = 0; i < 20000; i++) {
      anadirNodo(grafo, crearNodo(`n${i}`, `u${i % 200}`, Math.random() * 0.5 + 0.05));
    }

    const resultado = nivelDeDetalle(grafo, { distancia: 0.7, maxCuerposVisibles: 500 });

    expect(resultado.cuerposVisibles).toBeLessThanOrEqual(500);
    expect(resultado.gruposColapsados + resultado.gruposExpandidos).toBe(resultado.cuerposVisibles);
  });

  it("usa la faceta especificada para agrupar", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, crearNodo("n1", "u1", 0.5, { tema: "tema1" }));
    anadirNodo(grafo, crearNodo("n2", "u2", 0.5, { tema: "tema1" }));
    anadirNodo(grafo, crearNodo("n3", "u3", 0.5, { tema: "tema2" }));

    const porTema = nivelDeDetalle(grafo, { distancia: 0, maxCuerposVisibles: 100, faceta: "tema" });
    const porDueno = nivelDeDetalle(grafo, { distancia: 0, maxCuerposVisibles: 100, faceta: "dueno" });

    expect(porTema.cuerposVisibles).toBe(3);
    expect(porDueno.cuerposVisibles).toBe(3);
  });

  it("clampa la distancia entre 0 y 1", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, crearNodo("n1", "u1", 0.1));
    anadirNodo(grafo, crearNodo("n2", "u1", 0.1));

    const negativo = nivelDeDetalle(grafo, { distancia: -1, maxCuerposVisibles: 100 });
    const mayor = nivelDeDetalle(grafo, { distancia: 2, maxCuerposVisibles: 100 });

    expect(negativo.umbralPesoUsado).toBe(0.1);
    expect(mayor.umbralPesoUsado).toBeGreaterThan(0.1);
  });
});