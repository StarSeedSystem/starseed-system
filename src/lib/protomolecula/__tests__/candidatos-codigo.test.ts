import { describe, expect, it } from "vitest";
import type { Autor } from "../tipos";
import { aceptar, diff, proposer, revisar, type Candidato } from "../candidatos-codigo";

describe("candidatos-codigo", () => {
  const autorEjemplo: Autor = { tipo: "agente", id: "astraura", nombre: "Agente de Prueba" };

  describe("proponer", () => {
    it("crea un candidato con los valores proporcionados", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "console.log('hola');",
        original: "// código original",
        autor: autorEjemplo,
      });

      expect(candidato.id).toBe("c1");
      expect(candidato.capaId).toBe("capa1");
      expect(candidato.lenguajeOrigen).toBe("typescript");
      expect(candidato.propuesto).toBe("console.log('hola');");
      expect(candidato.original).toBe("// código original");
      expect(candidato.autor).toBe(autorEjemplo);
      expect(candidato.estado).toBe("propuesto");
      expect(candidato.avisos).toEqual([]);
    });
  });

  describe("revisar", () => {
    it("detecta claves de estilo sk-", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "const apiKey = 'sk-1234567890abcdef';",
        original: "const apiKey = '';",
        autor: autorEjemplo,
      });

      const revisado = revisar(candidato);
      expect(revisado.avisos).toContainEqual(
        expect.stringContaining("clave de API estilo «sk-»")
      );
    });

    it("detecta claves de estilo gsk_", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "const apiKey = 'gsk_abcdef123456';",
        original: "const apiKey = '';",
        autor: autorEjemplo,
      });

      const revisado = revisar(candidato);
      expect(revisado.avisos).toContainEqual(
        expect.stringContaining("clave de API estilo «gsk_»")
      );
    });

    it("detecta cabeceras Bearer", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "const auth = 'Bearer token123';",
        original: "const auth = '';",
        autor: autorEjemplo,
      });

      const revisado = revisar(candidato);
      expect(revisado.avisos).toContainEqual(
        expect.stringContaining("cabecera de autorización «Bearer»")
      );
    });

    it("detecta rutas absolutas de disco", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "const ruta = '/Users/usuario/documentos/archivo.txt';",
        original: "const ruta = '';",
        autor: autorEjemplo,
      });

      const revisado = revisar(candidato);
      expect(revisado.avisos).toContainEqual(
        expect.stringContaining("ruta absoluta de disco «/Users/…»")
      );
    });

    it("detecta eval", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "eval('console.log(\"hola\");');",
        original: "// código original",
        autor: autorEjemplo,
      });

      const revisado = revisar(candidato);
      expect(revisado.avisos).toContainEqual(
        expect.stringContaining("Patrón peligroso detectado: eval")
      );
    });

    it("detecta new Function", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "const func = new Function('return 10;');",
        original: "// código original",
        autor: autorEjemplo,
      });

      const revisado = revisar(candidato);
      expect(revisado.avisos).toContainEqual(
        expect.stringContaining("Patrón peligroso detectado: new Function")
      );
    });

    it("detecta import(", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "import('./modulo').then(m => m.hacerAlgo());",
        original: "// código original",
        autor: autorEjemplo,
      });

      const revisado = revisar(candidato);
      expect(revisado.avisos).toContainEqual(
        expect.stringContaining("Patrón peligroso detectado: import(")
      );
    });

    it("no marca avisos cuando no hay problemas", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "console.log('codigo seguro');",
        original: "// código original",
        autor: autorEjemplo,
      });

      const revisado = revisar(candidato);
      expect(revisado.avisos).toEqual([]);
    });
  });

  describe("diff", () => {
    it("devuelve diff vacío para strings idénticos", () => {
      const resultado = diff("linea1\nlinea2", "linea1\nlinea2");
      expect(resultado).toBe("  linea1\n  linea2");
    });

    it("muestra líneas eliminadas y añadidas", () => {
      const resultado = diff("linea1\nlinea2\nlinea3", "linea1\nlinea modificada\nlinea3");
      expect(resultado).toBe(
        "  linea1\n- linea2\n+ linea modificada\n  linea3"
      );
    });

    it("maneja strings vacíos", () => {
      const resultado = diff("", "linea1\nlinea2");
      expect(resultado).toBe("+ linea1\n+ linea2");
    });
  });

  describe("aceptar", () => {
    it("rechaza candidatos que no están en estado propuesto", () => {
      const candidato = {
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "console.log('hola');",
        original: "// código original",
        autor: autorEjemplo,
        estado: "aceptado",
        avisos: [],
      };

      const resultado = aceptar(candidato, {
        decidir: () => ({ permitido: true, confirmar: true, motivo: "OK" }),
        aplicarCambio: () => ({ ok: true }),
      });

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain("Solo se pueden aceptar candidatos en estado");
    });

    it("rechaza cuando decidir deniega el permiso", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "console.log('hola');",
        original: "// código original",
        autor: autorEjemplo,
      });

      const resultado = aceptar(candidato, {
        decidir: () => ({ permitido: false, confirmar: false, motivo: "No autorizado" }),
        aplicarCambio: () => ({ ok: true }),
      });

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain("No se puede aceptar");
    });

    it("rechaza cuando hay avisos en el candidato", () => {
      const candidato = {
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "const apiKey = 'sk-12345';",
        original: "// código original",
        autor: autorEjemplo,
        estado: "propuesto",
        avisos: ["clave de API estilo «sk-»"],
      };

      const resultado = aceptar(candidato, {
        decidir: () => ({ permitido: true, confirmar: true, motivo: "OK" }),
        aplicarCambio: () => ({ ok: true }),
      });

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain("No se puede aceptar candidato con avisos");
    });

    it("acepta un candidato válido", () => {
      const candidato = proposer({
        id: "c1",
        capaId: "capa1",
        lenguajeOrigen: "typescript",
        propuesto: "console.log('hola');",
        original: "// código original",
        autor: autorEjemplo,
      });

      let capaAplicada = "";
      const resultado = aceptar(candidato, {
        decidir: () => ({ permitido: true, confirmar: true, motivo: "OK" }),
        aplicarCambio: (capaId, nuevoContenido) => {
          capaAplicada = nuevoContenido;
          return { ok: true };
        },
      });

      expect(resultado.ok).toBe(true);
      expect(resultado.mensaje).toBe("Código aplicado correctamente");
      expect(capaAplicada).toBe("console.log('hola');");
    });
  });
});