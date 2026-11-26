import { describe, it, expect } from "vitest";
import {
  Alcance,
  Formato,
  TipoNodo,
  TipoArista,
  Nodo,
  Arista,
  Evento,
  Rama,
  Grafo4D,
  crearGrafo,
  añadirNodo,
  añadirArista,
  aplicarEvento,
  hijos,
  ancestros,
  validarNodo,
  facetasDe,
  FORMATOS_CONOCIDOS,
} from "../modelo";

describe("Ramas 4D - Modelo", () => {
  describe("Tipos básicos", () => {
    it("Alcance tiene los valores esperados", () => {
      expect(Alcance.Privado).toBe("privado");
      expect(Alcance.Contactos).toBe("contactos");
      expect(Alcance.Grupo).toBe("grupo");
      expect(Alcance.Comunidad).toBe("comunidad");
      expect(Alcance.Publico).toBe("publico");
    });

    it("FORMATOS_CONOCIDOS incluye los formatos base", () => {
      expect(FORMATOS_CONOCIDOS).toContain("texto");
      expect(FORMATOS_CONOCIDOS).toContain("imagen");
      expect(FORMATOS_CONOCIDOS).toContain("video");
      expect(FORMATOS_CONOCIDOS).toContain("audio");
      expect(FORMATOS_CONOCIDOS).toContain("modelo3d");
      expect(FORMATOS_CONOCIDOS).toContain("app");
      expect(FORMATOS_CONOCIDOS).toContain("web");
      expect(FORMATOS_CONOCIDOS).toContain("documento");
      expect(FORMATOS_CONOCIDOS).toContain("tabla");
      expect(FORMATOS_CONOCIDOS).toContain("pizarra");
      expect(FORMATOS_CONOCIDOS).toContain("presentacion");
      expect(FORMATOS_CONOCIDOS).toContain("enlace");
      expect(FORMATOS_CONOCIDOS).toContain("flujo");
    });
  });

  describe("crearGrafo", () => {
    it("crea un grafo vacío con arrays vacíos", () => {
      const grafo = crearGrafo();
      expect(grafo.nodos).toEqual([]);
      expect(grafo.aristas).toEqual([]);
      expect(grafo.eventos).toEqual([]);
    });
  });

  describe("añadirNodo", () => {
    it("añade un nodo válido al grafo", () => {
      const grafo = crearGrafo();
      const nodo: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo de prueba",
        formato: "texto",
        ref: "ruta/al/nodo",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: ["capa1"],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
        tema: "tema1",
        categoria: "cat1",
        etiquetas: ["tag1", "tag2"],
      };
      const resultado = añadirNodo(grafo, nodo);
      expect(resultado.nodos).toHaveLength(1);
      expect(resultado.nodos[0]).toEqual(nodo);
    });

    it("rechaza nodo duplicado (mismo id)", () => {
      const grafo = crearGrafo();
      const nodo: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo de prueba",
        formato: "texto",
        ref: "ruta/al/nodo",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: ["capa1"],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const grafoConNodo = añadirNodo(grafo, nodo);
      const resultado = añadirNodo(grafoConNodo, nodo);
      expect(resultado.nodos).toHaveLength(1);
    });

    it("rechaza nodo sin ref", () => {
      const grafo = crearGrafo();
      const nodoInvalido = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo de prueba",
        formato: "texto",
        ref: "",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      } as Nodo;
      const resultado = añadirNodo(grafo, nodoInvalido);
      expect(resultado.nodos).toHaveLength(0);
    });

    it("rechaza nodo con campos de contenido privado", () => {
      const grafo = crearGrafo();
      const nodoConPrivado = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo de prueba",
        formato: "texto",
        ref: "ruta/al/nodo",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
        contenido: "contenido privado",
      } as Nodo & { contenido: string };
      const resultado = añadirNodo(grafo, nodoConPrivado);
      expect(resultado.nodos).toHaveLength(0);
    });

    it("rechaza nodo con campo cuerpo", () => {
      const grafo = crearGrafo();
      const nodoConCuerpo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo de prueba",
        formato: "texto",
        ref: "ruta/al/nodo",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
        cuerpo: "cuerpo privado",
      } as Nodo & { cuerpo: string };
      const resultado = añadirNodo(grafo, nodoConCuerpo);
      expect(resultado.nodos).toHaveLength(0);
    });

    it("rechaza nodo con campo texto_privado", () => {
      const grafo = crearGrafo();
      const nodoConTextoPrivado = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo de prueba",
        formato: "texto",
        ref: "ruta/al/nodo",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
        texto_privado: "texto privado",
      } as Nodo & { texto_privado: string };
      const resultado = añadirNodo(grafo, nodoConTextoPrivado);
      expect(resultado.nodos).toHaveLength(0);
    });
  });

  describe("añadirArista", () => {
    it("añade una arista válida entre nodos existentes", () => {
      const grafo = crearGrafo();
      const nodo1: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const nodo2: Nodo = {
        id: "n2",
        tipo: "archivo",
        titulo: "Nodo 2",
        formato: "documento",
        ref: "ruta/2",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const grafoConNodos = añadirNodo(añadirNodo(grafo, nodo1), nodo2);
      const arista: Arista = {
        de: "n1",
        a: "n2",
        tipo: "contiene",
        t: Date.now(),
        intensidad: 0.8,
      };
      const resultado = añadirArista(grafoConNodos, arista);
      expect(resultado.aristas).toHaveLength(1);
      expect(resultado.aristas[0]).toEqual(arista);
    });

    it("rechaza arista duplicada (mismo de, a, tipo)", () => {
      const grafo = crearGrafo();
      const nodo1: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const nodo2: Nodo = {
        id: "n2",
        tipo: "archivo",
        titulo: "Nodo 2",
        formato: "documento",
        ref: "ruta/2",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const grafoConNodos = añadirNodo(añadirNodo(grafo, nodo1), nodo2);
      const arista: Arista = {
        de: "n1",
        a: "n2",
        tipo: "contiene",
        t: Date.now(),
        intensidad: 0.8,
      };
      const grafoConArista = añadirArista(grafoConNodos, arista);
      const resultado = añadirArista(grafoConArista, arista);
      expect(resultado.aristas).toHaveLength(1);
    });

    it("rechaza arista hacia nodo inexistente", () => {
      const grafo = crearGrafo();
      const nodo1: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const grafoConNodo = añadirNodo(grafo, nodo1);
      const arista: Arista = {
        de: "n1",
        a: "n2",
        tipo: "contiene",
        t: Date.now(),
        intensidad: 0.8,
      };
      const resultado = añadirArista(grafoConNodo, arista);
      expect(resultado.aristas).toHaveLength(0);
    });

    it("rechaza arista desde nodo inexistente", () => {
      const grafo = crearGrafo();
      const nodo2: Nodo = {
        id: "n2",
        tipo: "archivo",
        titulo: "Nodo 2",
        formato: "documento",
        ref: "ruta/2",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const grafoConNodo = añadirNodo(grafo, nodo2);
      const arista: Arista = {
        de: "n1",
        a: "n2",
        tipo: "contiene",
        t: Date.now(),
        intensidad: 0.8,
      };
      const resultado = añadirArista(grafoConNodo, arista);
      expect(resultado.aristas).toHaveLength(0);
    });
  });

  describe("aplicarEvento", () => {
    it("actualiza t_actividad y peso del nodo afectado", () => {
      const grafo = crearGrafo();
      const nodo: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now() - 10000,
        t_actividad: Date.now() - 10000,
        peso: 1,
      };
      const grafoConNodo = añadirNodo(grafo, nodo);
      const evento: Evento = {
        t: Date.now(),
        tipo: "actividad",
        nodo: "n1",
        alcance: Alcance.Privado,
      };
      const resultado = aplicarEvento(grafoConNodo, evento);
      const nodoActualizado = resultado.nodos.find((n) => n.id === "n1");
      expect(nodoActualizado).toBeDefined();
      expect(nodoActualizado!.t_actividad).toBe(evento.t);
      expect(nodoActualizado!.peso).toBeGreaterThan(1);
    });

    it("añade el evento al historial del grafo", () => {
      const grafo = crearGrafo();
      const nodo: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const grafoConNodo = añadirNodo(grafo, nodo);
      const evento: Evento = {
        t: Date.now(),
        tipo: "actividad",
        nodo: "n1",
        alcance: Alcance.Privado,
      };
      const resultado = aplicarEvento(grafoConNodo, evento);
      expect(resultado.eventos).toHaveLength(1);
      expect(resultado.eventos[0]).toEqual(evento);
    });

    it("no modifica nodos inexistentes", () => {
      const grafo = crearGrafo();
      const evento: Evento = {
        t: Date.now(),
        tipo: "actividad",
        nodo: "n_inexistente",
        alcance: Alcance.Privado,
      };
      const resultado = aplicarEvento(grafo, evento);
      expect(resultado.nodos).toHaveLength(0);
      expect(resultado.eventos).toHaveLength(1);
    });
  });

  describe("hijos", () => {
    it("devuelve los hijos directos de un nodo", () => {
      const grafo = crearGrafo();
      const padre: Nodo = {
        id: "padre",
        tipo: "carpeta",
        titulo: "Padre",
        formato: "documento",
        ref: "ruta/padre",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const hijo1: Nodo = {
        id: "hijo1",
        tipo: "archivo",
        titulo: "Hijo 1",
        formato: "texto",
        ref: "ruta/hijo1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const hijo2: Nodo = {
        id: "hijo2",
        tipo: "archivo",
        titulo: "Hijo 2",
        formato: "imagen",
        ref: "ruta/hijo2",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      let grafoConNodos = añadirNodo(grafo, padre);
      grafoConNodos = añadirNodo(grafoConNodos, hijo1);
      grafoConNodos = añadirNodo(grafoConNodos, hijo2);
      grafoConNodos = añadirArista(grafoConNodos, {
        de: "padre",
        a: "hijo1",
        tipo: "contiene",
        t: Date.now(),
        intensidad: 1,
      });
      grafoConNodos = añadirArista(grafoConNodos, {
        de: "padre",
        a: "hijo2",
        tipo: "contiene",
        t: Date.now(),
        intensidad: 1,
      });
      const hijosPadre = hijos(grafoConNodos, "padre");
      expect(hijosPadre).toHaveLength(2);
      expect(hijosPadre.map((n) => n.id).sort()).toEqual(["hijo1", "hijo2"]);
    });

    it("devuelve array vacío para nodo sin hijos", () => {
      const grafo = crearGrafo();
      const nodo: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const grafoConNodo = añadirNodo(grafo, nodo);
      const hijosNodo = hijos(grafoConNodo, "n1");
      expect(hijosNodo).toEqual([]);
    });

    it("devuelve array vacío para nodo inexistente", () => {
      const grafo = crearGrafo();
      const hijosNodo = hijos(grafo, "inexistente");
      expect(hijosNodo).toEqual([]);
    });
  });

  describe("ancestros", () => {
    it("devuelve los ancestros directos de un nodo", () => {
      const grafo = crearGrafo();
      const abuelo: Nodo = {
        id: "abuelo",
        tipo: "carpeta",
        titulo: "Abuelo",
        formato: "documento",
        ref: "ruta/abuelo",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const padre: Nodo = {
        id: "padre",
        tipo: "carpeta",
        titulo: "Padre",
        formato: "documento",
        ref: "ruta/padre",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const hijo: Nodo = {
        id: "hijo",
        tipo: "archivo",
        titulo: "Hijo",
        formato: "texto",
        ref: "ruta/hijo",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      let grafoConNodos = añadirNodo(grafo, abuelo);
      grafoConNodos = añadirNodo(grafoConNodos, padre);
      grafoConNodos = añadirNodo(grafoConNodos, hijo);
      grafoConNodos = añadirArista(grafoConNodos, {
        de: "abuelo",
        a: "padre",
        tipo: "contiene",
        t: Date.now(),
        intensidad: 1,
      });
      grafoConNodos = añadirArista(grafoConNodos, {
        de: "padre",
        a: "hijo",
        tipo: "contiene",
        t: Date.now(),
        intensidad: 1,
      });
      const ancestrosHijo = ancestros(grafoConNodos, "hijo");
      expect(ancestrosHijo).toHaveLength(1);
      expect(ancestrosHijo[0].id).toBe("padre");
    });

    it("devuelve array vacío para nodo sin ancestros", () => {
      const grafo = crearGrafo();
      const nodo: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      const grafoConNodo = añadirNodo(grafo, nodo);
      const ancestrosNodo = ancestros(grafoConNodo, "n1");
      expect(ancestrosNodo).toEqual([]);
    });
  });

  describe("validarNodo", () => {
    it("valida un nodo correcto", () => {
      const nodo: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      expect(validarNodo(nodo)).toBe(true);
    });

    it("rechaza nodo sin ref", () => {
      const nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      } as Nodo;
      expect(validarNodo(nodo)).toBe(false);
    });

    it("rechaza nodo con campo contenido", () => {
      const nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
        contenido: "privado",
      } as Nodo & { contenido: string };
      expect(validarNodo(nodo)).toBe(false);
    });

    it("rechaza nodo con campo cuerpo", () => {
      const nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
        cuerpo: "privado",
      } as Nodo & { cuerpo: string };
      expect(validarNodo(nodo)).toBe(false);
    });

    it("rechaza nodo con campo texto_privado", () => {
      const nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
        texto_privado: "privado",
      } as Nodo & { texto_privado: string };
      expect(validarNodo(nodo)).toBe(false);
    });
  });

  describe("facetasDe", () => {
    it("devuelve todas las facetas del contrato para un nodo completo", () => {
      const nodo: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: ["capa1", "capa2"],
        t_creado: 1000,
        t_actividad: 2000,
        peso: 5,
        tema: "ciencia",
        categoria: "fisica",
        etiquetas: ["cuantica", "relatividad"],
      };
      const facetas = facetasDe(nodo);
      expect(facetas.tema).toBe("ciencia");
      expect(facetas.categoria).toBe("fisica");
      expect(facetas.etiquetas).toEqual(["cuantica", "relatividad"]);
      expect(facetas.tipo).toBe("neurona");
      expect(facetas.formato).toBe("texto");
      expect(facetas.alcance).toBe(Alcance.Privado);
      expect(facetas.dueno).toBe("usuario1");
      expect(facetas.sistema).toBeUndefined();
      expect(facetas.capa).toEqual(["capa1", "capa2"]);
      expect(facetas.fecha).toBe(1000);
      expect(facetas.estado).toBe("activo");
    });

    it("devuelve facetas con valores por defecto para nodo mínimo", () => {
      const nodo: Nodo = {
        id: "n1",
        tipo: "archivo",
        titulo: "Nodo mínimo",
        formato: "documento",
        ref: "ruta/minimo",
        alcance: Alcance.Publico,
        dueno: "usuario2",
        capas: [],
        t_creado: 3000,
        t_actividad: 3000,
        peso: 1,
      };
      const facetas = facetasDe(nodo);
      expect(facetas.tema).toBeUndefined();
      expect(facetas.categoria).toBeUndefined();
      expect(facetas.etiquetas).toEqual([]);
      expect(facetas.tipo).toBe("archivo");
      expect(facetas.formato).toBe("documento");
      expect(facetas.alcance).toBe(Alcance.Publico);
      expect(facetas.dueno).toBe("usuario2");
      expect(facetas.capa).toEqual([]);
      expect(facetas.fecha).toBe(3000);
      expect(facetas.estado).toBe("activo");
    });
  });

  describe("Invariantes del grafo", () => {
    it("mantiene consistencia al añadir múltiples nodos y aristas", () => {
      let grafo = crearGrafo();
      for (let i = 0; i < 5; i++) {
        grafo = añadirNodo(grafo, {
          id: `n${i}`,
          tipo: "neurona",
          titulo: `Nodo ${i}`,
          formato: "texto",
          ref: `ruta/${i}`,
          alcance: Alcance.Privado,
          dueno: "usuario1",
          capas: [],
          t_creado: Date.now(),
          t_actividad: Date.now(),
          peso: 1,
        });
      }
      for (let i = 0; i < 4; i++) {
        grafo = añadirArista(grafo, {
          de: `n${i}`,
          a: `n${i + 1}`,
          tipo: "deriva",
          t: Date.now(),
          intensidad: 0.5,
        });
      }
      expect(grafo.nodos).toHaveLength(5);
      expect(grafo.aristas).toHaveLength(4);
    });

    it("eventos se acumulan en el historial", () => {
      let grafo = crearGrafo();
      const nodo: Nodo = {
        id: "n1",
        tipo: "neurona",
        titulo: "Nodo 1",
        formato: "texto",
        ref: "ruta/1",
        alcance: Alcance.Privado,
        dueno: "usuario1",
        capas: [],
        t_creado: Date.now(),
        t_actividad: Date.now(),
        peso: 1,
      };
      grafo = añadirNodo(grafo, nodo);
      for (let i = 0; i < 3; i++) {
        grafo = aplicarEvento(grafo, {
          t: Date.now() + i,
          tipo: "actividad",
          nodo: "n1",
          alcance: Alcance.Privado,
        });
      }
      expect(grafo.eventos).toHaveLength(3);
    });
  });
});