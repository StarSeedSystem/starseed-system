import { describe, it, expect } from "vitest";
import { 
  Candidato, 
  proposer, 
  revisar, 
  diff, 
  aceptar, 
  Autor 
} from "../candidatos-codigo";

describe("Candidatos de código (pure module)", () => {
  const autor: Autor = { tipo: "persona", id: "usuario-1", nombre: "Usuario de prueba" };

  describe("proposer", () => {
    it("should add a candidate to the pendientes array", () => {
      const estadoInicial = { pendientes: [] as Candidato[] };
      const candidato: Candidato = {
        id: "c1",
        capaId: "capa-1",
        lenguajeOrigen: "typescript",
        propuesto: "console.log('hola');",
        original: "",
        autor,
        estado: "propuesto",
        avisos: []
      };

      const estadoFinal = proposer(estadoInicial, candidato);
      expect(estadoFinal.pendientes).toHaveLength(1);
      expect(estadoFinal.pendientes[0]).toBe(candidato);
    });
  });

  describe("revisar", () => {
    it("should detect a Stripe secret key and add an avisos", () => {
      const candidato: Candidato = {
        id: "c1",
        capaId: "capa-1",
        lenguajeOrigen: "javascript",
        propuesto: "const apiKey = 'sk_test_1234567890abcdef1234567890abcdef';",
        original: "",
        autor,
        estado: "propuesto",
        avisos: []
      };

      const candidatoRevisado = revisar(candidato);
      expect(candidatoRevisado.avisos).toContain("Secreto detectado en el código");
    });

    it("should detect a Bearer token and add an avisos", () => {
      const candidato: Candidato = {
        id: "c1",
        capaId: "capa-1",
        lenguajeOrigen: "javascript",
        propuesto: "const token = 'Bearer abc123def456';",
        original: "",
        autor,
        estado: "propuesto",
        avisos: []
      };

      const candidatoRevisado = revisar(candidato);
      expect(candidatoRevisado.avisos).toContain("Secreto detectado en el código");
    });

    it("should detect eval and add an avisos", () => {
      const candidato: Candidato = {
        id: "c1",
        capaId: "capa-1",
        lenguajeOrigen: "javascript",
        propuesto: "eval('algo');",
        original: "",
        autor,
        estado: "propuesto",
        avisos: []
      };

      const candidatoRevisado = revisar(candidato);
      expect(candidatoRevisado.avisos).toContain("Uso de funcionalidad prohibida (eval, new Function, import dinámico o node:*)");
    });

    it("should not add avisos for safe code", () => {
      const candidato: Candidato = {
        id: "c1",
        capaId: "capa-1",
        lenguajeOrigen: "typescript",
        propuesto: "const suma = (a: number, b: number) => a + b;",
        original: "",
        autor,
        estado: "propuesto",
        avisos: []
      };

      const candidatoRevisado = revisar(candidato);
      expect(candidatoRevisado.avisos).toHaveLength(0);
    });
  });

  describe("diff", () => {
    it("should return empty arrays for identical strings", () => {
      const resultado = diff("hola", "hola");
      expect(resultado.añadidas).toEqual([]);
      expect(resultado.eliminadas).toEqual([]);
    });

    it("should detect added lines", () => {
      const original = "linea1\nlinea2";
      const propuesto = "linea1\nlinea2\nlinea3";
      const resultado = diff(original, propuesto);
      expect(resultado.añadidas).toEqual(["linea3"]);
      expect(resultado.eliminadas).toEqual([]);
    });

    it("should detect removed lines", () => {
      const original = "linea1\nlinea2\nlinea3";
      const propuesto = "linea1\nlinea2";
      const resultado = diff(original, propuesto);
      expect(resultado.añadidas).toEqual([]);
      expect(resultado.eliminadas).toEqual(["linea3"]);
    });

    it("should detect changed lines", () => {
      const original = "linea1\nlinea2\nlinea3";
      const propuesto = "linea1\nlinea2 modificada\nlinea3";
      const resultado = diff(original, propuesto);
      // Our implementation treats a changed line as removal and addition
      expect(resultado.añadidas).toContain("linea2 modificada");
      expect(resultado.eliminadas).toContain("linea2");
    });
  });

  describe("aceptar", () => {
    const capaCodigo = {
      id: "capa-1",
      tipo: "codigo" as const,
      contenido: "console.log('original');"
    };

    const estadoInicial = {
      molecula: {
        capas: [capaCodigo]
      }
    };

    const candidato: Candidato = {
      id: "c1",
      capaId: "capa-1",
      lenguajeOrigen: "javascript",
      propuesto: "console.log('actualizado');",
      original: "console.log('original');",
      autor,
      estado: "propuesto",
      avisos: []
    };

    it("should update the layer content when the human decision is valid", () => {
      const ctx = {
        decidir: (accion: { accion: string; origen: string }) => {
          return accion.accion === "aplicar-codigo" && accion.origen === "mano";
        }
      };

      const resultado = aceptar(candidato, ctx, estadoInicial);
      expect(resultado.molecula.capas[0].contenido).toBe("console.log('actualizado');");
      expect(resultado.candidato.estado).toBe("aceptado");
    });

    it("should not update the layer content when the human decision is invalid", () => {
      const ctx = {
        decidir: (accion: { accion: string; origen: string }) => {
          return false; // Simulate rejection
        }
      };

      const resultado = aceptar(candidato, ctx, estadoInicial);
      expect(resultado.molecula.capas[0].contenido).toBe("console.log('original');");
      // The candidate state is unchanged? In our implementation, we return the candidate unchanged when decision fails.
      expect(resultado.candidato.estado).toBe("propuesto"); // We left it as proposed
    });

    it("should not update a non-code layer", () => {
      const capaNoCodigo = {
        id: "capa-2",
        tipo: "lienzo2d" as const,
        contenido: undefined // Other layers might not have contenido
      };

      const estadoConCapaNoCodigo = {
        molecula: {
          capas: [capaCodigo, capaNoCodigo]
        }
      };

      const candidatoParaOtraCapa: Candidato = {
        id: "c2",
        capaId: "capa-2", // This is the non-code layer
        lenguajeOrigen: "javascript",
        propuesto: "console.log('debería fallar');",
        original: "",
        autor,
        estado: "propuesto",
        avisos: []
      };

      const ctx = {
        decidir: (accion: { accion: string; origen: string }) => {
          return accion.accion === "aplicar-codigo" && accion.origen === "mano";
        }
      };

      const resultado = aceptar(candidatoParaOtraCapa, ctx, estadoConCapaNoCodigo);
      // The layer should remain unchanged
      expect(resultado.molecula.capas[1]).toBe(capaNoCodigo); // Same reference
      // The candidate state is unchanged
      expect(resultado.candidato.estado).toBe("propuesto");
    });
  });
});