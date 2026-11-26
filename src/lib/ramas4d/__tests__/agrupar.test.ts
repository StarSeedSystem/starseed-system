import { describe, it, expect } from "vitest";
import { crearGrafo, anadirNodo, Nodo } from "../modelo";
import { agruparPorJerarquia, colapsarGrupos } from "../agrupar";

describe("agruparPorJerarquia", () => {
  it("debe agrupar nodos por dueño", () => {
    const grafo = crearGrafo();
    const nodo1: Nodo = {
      id: "n1",
      tipo: "archivo",
      titulo: "Doc 1",
      formato: "texto",
      ref: "ref1",
      alcance: "publico",
      dueno: "usuario1",
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 0.1,
      etiquetas: [],
    };
    const nodo2: Nodo = {
      id: "n2",
      tipo: "archivo",
      titulo: "Doc 2",
      formato: "texto",
      ref: "ref2",
      alcance: "publico",
      dueno: "usuario1",
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 0.8,
      etiquetas: [],
    };
    const nodo3: Nodo = {
      id: "n3",
      tipo: "archivo",
      titulo: "Doc 3",
      formato: "texto",
      ref: "ref3",
      alcance: "publico",
      dueno: "usuario2",
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 0.1,
      etiquetas: [],
    };
    anadirNodo(grafo, nodo1);
    anadirNodo(grafo, nodo2);
    anadirNodo(grafo, nodo3);

    const grupos = agruparPorJerarquia(grafo, "dueno");
    expect(grupos.size).toBe(2);
    expect(grupos.get("usuario1")).toHaveLength(2);
    expect(grupos.get("usuario2")).toHaveLength(1);

    const colapsados = colapsarGrupos(grafo, grupos, 0.5);
    // n1 (0.1) colapsado, n2 (0.8) separado
    // n3 (0.1) colapsado
    expect(colapsados.has("colapsado-usuario1")).toBe(true);
    expect(colapsados.has("n2")).toBe(true);
    expect(colapsados.has("colapsado-usuario2")).toBe(true);
  });
});
