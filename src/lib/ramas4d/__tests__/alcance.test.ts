import { describe, it, expect } from "vitest";
import { visiblePara, podarGrafo, Nodo } from "../alcance";

describe("alcance.ts", () => {
  it("determina visibilidad según privacidad", () => {
    const observador = { id: "user1" };
    const nodoPublico: Nodo = { id: "n1", privacidad: "publico" };
    const nodoPrivado: Nodo = { id: "n2", privacidad: "privado", dueno: "user2" };
    const nodoContacto: Nodo = { id: "n3", privacidad: "contacto", dueno: "user2", contactos: ["user1"] };

    expect(visiblePara(nodoPublico, observador)).toBe(true);
    expect(visiblePara(nodoPrivado, observador)).toBe(false);
    expect(visiblePara(nodoContacto, observador)).toBe(true);
  });

  it("poda grafo eliminando nodos privados inaccesibles", () => {
    const observador = { id: "user1" };
    const grafo = {
      nodos: [
        { id: "n1", privacidad: "publico" },
        { id: "n2", privacidad: "privado", dueno: "user2" },
        { id: "n3", privacidad: "contacto", dueno: "user2", contactos: ["user1"] },
      ] as any[],
      aristas: [
        { origen: "n1", destino: "n2" },
        { origen: "n1", destino: "n3" },
      ],
    };
    const resultado = podarGrafo(grafo, observador);
    expect(resultado.nodos.find(n => n.id === "n1")).toBeDefined();
    expect(resultado.nodos.find(n => n.id === "n2")).toBeUndefined();
    expect(resultado.nodos.find(n => n.id === "n3")).toBeDefined();
    expect(resultado.aristas.length).toBe(1);
    expect(resultado.aristas[0].destino).toBe("n3");
  });
});
