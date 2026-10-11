import { describe, it, expect } from "vitest";
import { serializarBloque, leerBloque, avisosDePublicacion } from "../bloque-protomolecula";
import type { Molecula, Ambito, Capa, AtomoEnUso, ReferenciaEntidad, EstadoValores } from "../tipos";

// Helper to create a minimal molecule for testing
function crearMoleculaDePrueba(): Molecula {
  return {
    id: "mol-1",
    titulo: "Molécula de prueba",
    ambito: "personal",
    capas: [],
    atomos: [],
    valores: {},
    version: 1,
    creadaEn: Date.now(),
    actualizadaEn: Date.now()
  };
}

describe("bloque-protomolecula", () => {
  describe("serializarBloque", () => {
    it("debe serializar una molécula válida", () => {
      const m = crearMoleculaDePrueba();
      const resultado = serializarBloque(m);
      if (resultado.ok) {
        expect(typeof resultado.texto).toBe("string");
        const parsed = JSON.parse(resultado.texto);
        expect(parsed.pm).toBe(1);
        expect(parsed.molecula).toEqual(m);
      } else {
        fail((resultado as { ok: false; motivo: string }).motivo);
      }
    });

    it("debe rechazar una molécula inválida", () => {
      const mInvalida = {
        id: "mol-1",
        titulo: "Molécula de prueba"
      } as unknown as Molecula;
      const resultado = serializarBloque(mInvalida);
      expect(resultado.ok).toBe(false);
      expect((resultado as { ok: false; motivo: string }).motivo).toBe("molécula inválida");
    });

    it("debe rechazar cuando el tamaño excede 32 KB", () => {
      const m = crearMoleculaDePrueba();
      m.valores = { large: "x".repeat(40 * 1024) };
      const resultado = serializarBloque(m);
      expect(resultado.ok).toBe(false);
      expect((resultado as { ok: false; motivo: string }).motivo).toContain("tamaño excedido");
    });
  });

  describe("leerBloque", () => {
    it("debe deserializar una cadena válida", () => {
      const m = crearMoleculaDePrueba();
      const serialized = serializarBloque(m);
      expect(serialized.ok).toBe(true);
      const resultado = leerBloque((serialized as { ok: true; texto: string }).texto);
      expect((resultado as { ok: true; molecula: Molecula }).molecula).toEqual(m);
    });

    it("debe rechazar JSON no válido", () => {
      const resultado = leerBloque("{ no es JSON");
      expect(resultado.ok).toBe(false);
      expect((resultado as { ok: false; motivo: string }).motivo).toBe("JSON no válido");
    });

    it("debe rechazar estructura no esperada", () => {
      const resultado = leerBloque('["arreglo"]');
      expect(resultado.ok).toBe(false);
      expect((resultado as { ok: false; motivo: string }).motivo).toBe("estructura no esperada");
    });

    it("debe rechazar versión no soportada", () => {
      const resultado = leerBloque('{"pm": 2, "molecula": {}}');
      expect(resultado.ok).toBe(false);
      expect((resultado as { ok: false; motivo: string }).motivo).toBe("versión no soportada: 2");
    });

    it("debe rechazar molécula inválida dentro del JSON", () => {
      const resultado = leerBloque('{"pm": 1, "molecula": {}}');
      expect(resultado.ok).toBe(false);
      expect((resultado as { ok: false; motivo: string }).motivo).toBe("molécula inválida");
    });
  });

  describe("avisosDePublicacion", () => {
    it("debe devolver avisos cuando la molécula es más reservada que la publicación", () => {
      const m = crearMoleculaDePrueba();
      m.ambito = "perfil"; // more reserved than publica (personal(0) < perfil(1) < grupo(2) < publica(3))
      const ambitoPost: Ambito = "publica";
      const ambitoDe = (_tipo: string, _id: string): Ambito => "personal";
      const avisos = avisosDePublicacion(m, ambitoPost, ambitoDe);
      expect(avisos.length).toBeGreaterThan(0);
      expect(avisos[0]).toContain("La molécula es más reservada");
    });

    it("debe devolver avisos cuando una capa cita una entidad más reservada", () => {
      const m = crearMoleculaDePrueba();
      m.ambito = "personal";
      m.capas = [
        {
          id: "capa-1",
          tipo: "lienzo2d",
          titulo: "Capa de prueba",
          formato: "svg",
          referencia: { tipo: "page", id: "page-1", version: "1" },
          orden: 0,
          visible: true,
          bloqueada: false
        }
      ];
      m.atomos = [];
      m.valores = {};
      m.version = 1;
      m.creadaEn = Date.now();
      m.actualizadaEn = Date.now();
      const ambitoPost: Ambito = "grupo"; // publication ambito
      const ambitoDe = (tipo: string, id: string): Ambito => {
        if (tipo === "page" && id === "page-1") return "perfil"; // perfil (1) is less than grupo (2) -> more reservada
        return "personal";
      };
      const avisos = avisosDePublicacion(m, ambitoPost, ambitoDe);
      expect(avisos.length).toBeGreaterThan(0);
      expect(avisos.some(aviso => aviso.includes('La capa "Capa de prueba" cita una entidad más reservada'))).toBe(true);
    });

    it("debe devolver array vacío cuando no hay avisos", () => {
      const m = crearMoleculaDePrueba();
      m.ambito = "grupo";
      const ambitoPost: Ambito = "grupo";
      const ambitoDe = (_tipo: string, _id: string): Ambito => "grupo";
      const avisos = avisosDePublicacion(m, ambitoPost, ambitoDe);
      expect(avisos).toHaveLength(0);
    });
  });
});

function fail(message: string): never {
  throw new Error(message);
}