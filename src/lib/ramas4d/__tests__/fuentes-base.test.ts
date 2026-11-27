import { describe, it, expect } from "vitest";
import { podarGrafo, visiblePara, type Observador } from "../alcance";
import { crearGrafo, anadirNodo, anadirArista, type Grafo4D, type Nodo } from "../modelo";
import type { Fuente } from "../fuentes/tipos";

function observadorMock(overrides: Partial<Observador> = {}): Observador {
  return {
    id: "user-1",
    contactos: ["user-2"],
    grupos: ["group-1"],
    comunidades: ["comm-1"],
    ...overrides,
  };
}

function nodoPublico(id: string, dueno: string): Nodo {
  return {
    id,
    tipo: "archivo",
    titulo: `Nodo ${id}`,
    formato: "texto",
    ref: `/${id}`,
    alcance: "publico",
    dueno,
    capas: [],
    t_creado: Date.now(),
    t_actividad: Date.now(),
    peso: 1.0,
    etiquetas: [],
  };
}

function nodoPrivado(id: string, dueno: string): Nodo {
  return { ...nodoPublico(id, dueno), alcance: "privado" };
}

function nodoContactos(id: string, dueno: string): Nodo {
  return { ...nodoPublico(id, dueno), alcance: "contactos" };
}

function nodoGrupo(id: string, dueno: string): Nodo {
  return { ...nodoPublico(id, dueno), alcance: "grupo" };
}

function nodoComunidad(id: string, dueno: string): Nodo {
  return { ...nodoPublico(id, dueno), alcance: "comunidad" };
}

describe("podarGrafo - visibilidad por alcance", () => {
  const obs = observadorMock();

  it("muestra nodos públicos para cualquier observador", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, nodoPublico("n1", "user-99"));
    const podado = podarGrafo(grafo, obs);
    expect(podado.nodos.has("n1")).toBe(true);
  });

  it("muestra nodos propios del observador aunque sean privados", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, nodoPrivado("n1", "user-1"));
    const podado = podarGrafo(grafo, obs);
    expect(podado.nodos.has("n1")).toBe(true);
  });

  it("oculta nodos privados de otros usuarios", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, nodoPrivado("n1", "user-2"));
    const podado = podarGrafo(grafo, obs);
    expect(podado.nodos.has("n1")).toBe(false);
  });

  it("muestra nodos contactos solo si el dueño está en contactos", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, nodoContactos("n1", "user-2"));
    anadirNodo(grafo, nodoContactos("n2", "user-3"));
    const podado = podarGrafo(grafo, obs);
    expect(podado.nodos.has("n1")).toBe(true);
    expect(podado.nodos.has("n2")).toBe(false);
  });

  it("muestra nodos grupo solo si el dueño está en grupos", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, nodoGrupo("n1", "group-1"));
    anadirNodo(grafo, nodoGrupo("n2", "group-2"));
    const podado = podarGrafo(grafo, obs);
    expect(podado.nodos.has("n1")).toBe(true);
    expect(podado.nodos.has("n2")).toBe(false);
  });

  it("muestra nodos comunidad solo si el dueño está en comunidades", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, nodoComunidad("n1", "comm-1"));
    anadirNodo(grafo, nodoComunidad("n2", "comm-2"));
    const podado = podarGrafo(grafo, obs);
    expect(podado.nodos.has("n1")).toBe(true);
    expect(podado.nodos.has("n2")).toBe(false);
  });

  it("filtra aristas donde alguno de los extremos no es visible", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, nodoPublico("n1", "user-1"));
    anadirNodo(grafo, nodoPrivado("n2", "user-2"));
    anadirArista(grafo, { de: "n1", a: "n2", tipo: "contiene", t: Date.now(), intensidad: 1.0 });
    const podado = podarGrafo(grafo, obs);
    expect(podado.nodos.has("n1")).toBe(true);
    expect(podado.nodos.has("n2")).toBe(false);
    expect(podado.aristas.length).toBe(0);
  });

  it("filtra ramas donde el padre o hijos no son visibles", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, nodoPublico("padre", "user-1"));
    anadirNodo(grafo, nodoPublico("hijo1", "user-1"));
    anadirNodo(grafo, nodoPrivado("hijo2", "user-2"));
    grafo.ramas.set("padre", ["hijo1", "hijo2"]);
    const podado = podarGrafo(grafo, obs);
    expect(podado.ramas.get("padre")).toEqual(["hijo1"]);
  });

  it("elimina rama completa si el padre no es visible", () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, nodoPrivado("padre", "user-2"));
    anadirNodo(grafo, nodoPublico("hijo", "user-1"));
    grafo.ramas.set("padre", ["hijo"]);
    const podado = podarGrafo(grafo, obs);
    expect(podado.ramas.has("padre")).toBe(false);
  });
});

describe("Fuente - contrato de interfaz", () => {
  it("define la estructura esperada para una fuente", () => {
    const fuente: Fuente = {
      id: "test",
      capa: "test",
      leer: async (obs) => ({ nodos: new Map(), aristas: [] }),
      suscribir: (cb) => () => {},
    };
    expect(typeof fuente.leer).toBe("function");
    expect(typeof fuente.suscribir).toBe("function");
  });
});

describe("fuentes con datos simulados - integración con podarGrafo", () => {
  const obs = observadorMock();

  it("cerebros: devuelve nodos y aristas que pasan el filtro de visibilidad", async () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, { ...nodoPublico("cerebro-1", "user-1"), tipo: "cerebro", titulo: "Mi Cerebro" });
    anadirNodo(grafo, { ...nodoPrivado("memoria-1", "user-2"), tipo: "memoria", titulo: "Memoria ajena" });
    anadirArista(grafo, { de: "cerebro-1", a: "memoria-1", tipo: "contiene", t: Date.now(), intensidad: 1.0 });
    const podado = podarGrafo(grafo, obs);
    expect(podado.nodos.size).toBe(1);
    expect(podado.nodos.has("cerebro-1")).toBe(true);
    expect(podado.aristas.length).toBe(0);
  });

  it("conocimiento: devuelve categorías y temas filtrados por visibilidad", async () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, { ...nodoPublico("cat-1", "user-1"), tipo: "carpeta", titulo: "Ciencia" });
    anadirNodo(grafo, { ...nodoContactos("top-1", "user-2"), tipo: "tema", titulo: "Física" });
    anadirNodo(grafo, { ...nodoPrivado("top-2", "user-3"), tipo: "tema", titulo: "Química" });
    anadirArista(grafo, { de: "cat-1", a: "top-1", tipo: "contiene", t: Date.now(), intensidad: 1.0 });
    anadirArista(grafo, { de: "cat-1", a: "top-2", tipo: "contiene", t: Date.now(), intensidad: 1.0 });
    const podado = podarGrafo(grafo, obs);
    expect(podado.nodos.size).toBe(2);
    expect(podado.nodos.has("cat-1")).toBe(true);
    expect(podado.nodos.has("top-1")).toBe(true);
    expect(podado.aristas.length).toBe(1);
  });

  it("educacion: devuelve currículum y progreso filtrados por visibilidad", async () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, { ...nodoPublico("cat-edu-1", "user-1"), tipo: "categoria", titulo: "Ciencia" });
    anadirNodo(grafo, { ...nodoGrupo("top-edu-1", "group-1"), tipo: "leccion", titulo: "Física Cuántica" });
    anadirNodo(grafo, { ...nodoPrivado("top-edu-2", "user-99"), tipo: "leccion", titulo: "Relatividad" });
    anadirArista(grafo, { de: "cat-edu-1", a: "top-edu-1", tipo: "prerrequisito", t: Date.now(), intensidad: 1.0 });
    anadirArista(grafo, { de: "cat-edu-1", a: "top-edu-2", tipo: "prerrequisito", t: Date.now(), intensidad: 1.0 });
    const podado = podarGrafo(grafo, obs);
    expect(podado.nodos.size).toBe(2);
    expect(podado.nodos.has("cat-edu-1")).toBe(true);
    expect(podado.nodos.has("top-edu-1")).toBe(true);
    expect(podado.aristas.length).toBe(1);
  });
});