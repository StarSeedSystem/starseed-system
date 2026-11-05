/**
 * Pruebas del cableado de peces (`revisar.ts`): textos REALES tal como los
 * contestan los modelos — con viñetas, mayúsculas, ruido y líneas sin gravedad —
 * y peces que callan. Puro: sin red, los peces son dobles honestos.
 */
import { describe, it, expect } from "vitest";
import { combinarObjeciones, revisarConPeces, type RevisorPez } from "../revisar";
import type { Objecion } from "../peces";

const o = (gravedad: Objecion["gravedad"], texto: string): Objecion => ({ gravedad, texto });

/** Un pez doble: devuelve la respuesta dada sin llamar a nada. */
const pezDoble = (nombre: string, respuesta: string | null | Error): RevisorPez => ({
  nombre,
  contestar: async () => (respuesta instanceof Error ? (() => { throw respuesta; })() : respuesta),
});

describe("revisarConPeces", () => {
  it("combina objeciones reales de dos peces, quita duplicados y ordena por gravedad", async () => {
    const castor = pezDoble("castor", [
      "bloquea: el botón Enviar no hace nada si te falta el correo.",
      "menor: el título aparece en minúscula.",
    ].join("\n"));
    const ciervo = pezDoble("ciervo", [
      "• IMPORTA: la lista de precios no dice la moneda.",
      "– bloquea: el botón enviar no hace nada si te falta el correo", // mismo hallazgo, otra forma
      "un comentario suelto sin gravedad, que se ignora",
    ].join("\n"));
    const r = await revisarConPeces("<form>…</form>", {
      tipo: "pagina",
      peces: [castor, ciervo],
    });
    expect(r.porPez).toHaveLength(2);
    expect(r.veredicto.pasa).toBe(false);
    expect(r.veredicto.bloqueantes).toEqual([
      "el botón Enviar no hace nada si te falta el correo.",
    ]); // un solo bloqueante, sin duplicar
    expect(r.objeciones.map((x) => x.gravedad)).toEqual(["bloquea", "importa", "menor"]);
    expect(r.pecesSilenciosos).toEqual([]);
  });

  it("un pez que calla o lanza no rompe la revisión y queda anotado", async () => {
    const r = await revisarConPeces("plan de la ola", {
      tipo: "plan",
      peces: [pezDoble("truena", new Error("HTTP 429")), pezDoble("callado", null), pezDoble("hablador", "menor: le falta sinopsis.")],
    });
    expect(r.porPez.map((p) => p.pez)).toEqual(["hablador"]);
    expect(r.pecesSilenciosos).toEqual(["truena", "callado"]);
    expect(r.veredicto.pasa).toBe(true);
  });

  it("el prompt que recibe el pez fija el formato y trae el artefacto acotado", async () => {
    let visto = "";
    const pez = {
      nombre: "memoria",
      contestar: async (prompt: string) => {
        visto = prompt;
        return "sin objeciones";
      },
    };
    const largo = "linea ".repeat(9000); // ≈ 54 000 caracteres
    const r = await revisarConPeces(largo, { tipo: "app", peces: [pez], maxCaracteres: 800 });
    expect(visto).toContain("tipo: app");
    expect(visto.length).toBeLessThanOrEqual(2_200);
    expect(r.objeciones).toEqual([]); // «sin objeciones» no es una objeción
    expect(r.porPez).toHaveLength(1); // «sin objeciones» también contestó
    expect(r.porPez[0].objeciones).toEqual([]);
    expect(r.pecesSilenciosos).toEqual([]);
    expect(r.veredicto.bloqueantes).toEqual([]);
  });
});

describe("combinarObjeciones", () => {
  it("deduplica por gravedad+texto y pone las bloqueantes primero", () => {
    const combinadas = combinarObjeciones([
      [o("menor", "El pie de página repite el año en dos formatos."), o("importa", "faltan los textos alternativos en las imágenes")],
      [o("importa", "faltan los textos alternativos en las imágenes"), o("bloquea", "borra la semana sin preguntar")],
    ]);
    expect(combinadas.map((x) => x.gravedad)).toEqual(["bloquea", "importa", "menor"]);
    expect(combinadas).toHaveLength(3);
  });
});
