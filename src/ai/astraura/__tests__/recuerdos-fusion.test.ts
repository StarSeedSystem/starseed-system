/**
 * LNN1028F · `recordar` funde Memvid (palabras y tiempo) con LEANN (significado):
 * los dos responden, solo uno, ninguno; alcance, peso vectorial, fuga y tope.
 * Todo inyectado: sin red, sin disco, sin procesos.
 */
import { describe, expect, it, vi } from "vitest";
import {
  recordar,
  recordarDeCapsulas,
  type AciertoCapsula,
  type AciertoLeann,
  type BuscarCapsulaFn,
  type BuscarLeannFn,
} from "@/ai/astraura/recuerdos-capsulas";
import type { ActorMemoria } from "@/lib/nucleo/alcance-memoria";

const consulta = "¿qué recordamos del café de Madrid?";
const contexto = { personalidadId: "aurora", actor: { tipo: "usuario" } as ActorMemoria };
const deMemvid = (texto: string, uri: string): AciertoCapsula => ({
  titulo: "memvid", texto, uri, alcance: "personal", sujeto: { tipo: "personalidad", id: "aurora" },
});
const memvidFijo = (aciertos: AciertoCapsula[] | null): BuscarCapsulaFn => async () => aciertos;
const leannFijo = (aciertos: AciertoLeann[] | null): BuscarLeannFn => async () => aciertos;

describe("recordar · fusión Memvid + LEANN", () => {
  it("funde los dos cuando ambos responden", async () => {
    const r = await recordar({
      consulta, contexto,
      buscar: memvidFijo([deMemvid("Quedamos en el café de la esquina.", "mv2://a/1")]),
      buscarLeann: leannFijo([{ id: "n1", texto: "Plan del café para el martes.", metadatos: { uri: "mv2://b/1" } }]),
    });
    expect(r).toContain("RECUERDOS (memoria + significado):");
    expect(r).toContain("Quedamos en el café");
    expect(r).toContain("Plan del café");
  });

  it("sigue cuando solo responde Memvid", async () => {
    const r = await recordar({
      consulta, contexto,
      buscar: memvidFijo([deMemvid("Quedamos en el café de la esquina.", "mv2://a/1")]),
      buscarLeann: leannFijo(null),
    });
    expect(r).toContain("RECUERDOS (cápsulas Memvid):");
    expect(r).toContain("Quedamos en el café");
  });

  it("sigue cuando solo responde LEANN", async () => {
    const r = await recordar({
      consulta, contexto,
      buscar: memvidFijo(null),
      buscarLeann: leannFijo([{ id: "n1", texto: "Plan del café para el martes." }]),
    });
    expect(r).toContain("RECUERDOS (significado LEANN):");
    expect(r).toContain("Plan del café");
  });

  it("devuelve cadena vacía cuando no responde ninguno", async () => {
    const r = await recordar({ consulta, contexto, buscar: memvidFijo(null), buscarLeann: leannFijo(null) });
    expect(r).toBe("");
  });
});

describe("recordar · juicio barato y contratos de búsqueda", () => {
  it("no busca con menos de 4 palabras y sin pregunta", async () => {
    const buscar = vi.fn(async () => null);
    const buscarLeann = vi.fn(async () => null);
    const r = await recordar({ consulta: "hola", contexto, buscar, buscarLeann });
    expect(r).toBe("");
    expect(buscar).not.toHaveBeenCalled();
    expect(buscarLeann).not.toHaveBeenCalled();
  });

  it("pasa el alcance visible y el peso vectorial a LEANN", async () => {
    const llamadas: Array<{ indice: string; opciones: { filtros?: unknown; pesoVector?: number; k: number } }> = [];
    const buscarLeann: BuscarLeannFn = async (indice, _consulta, opciones) => {
      llamadas.push({ indice, opciones });
      return [];
    };
    await recordar({
      consulta: "¿qué recordamos del café de la esquina?", contexto,
      buscar: memvidFijo(null), buscarLeann,
    });
    expect(llamadas[0].indice).toBe("personalidad-aurora-personal");
    expect(llamadas[0].opciones.filtros).toEqual({
      alcance: { in: ["personal", "perfil", "grupo", "publica"] },
    });
    expect(llamadas[0].opciones.pesoVector).toBe(0.7);
    expect(llamadas[0].opciones.k).toBe(4);
  });
});

describe("recordar · tope de tiempo, fuga y alias", () => {
  it("lo que llega tarde no entra (tope configurable)", async () => {
    const buscarLeann: BuscarLeannFn = async () => {
      await new Promise((r) => setTimeout(r, 200));
      return [{ id: "tarde", texto: "Este recuerdo llega tarde." }];
    };
    const r = await recordar({
      consulta, contexto,
      buscar: memvidFijo([deMemvid("Este llegó a tiempo.", "mv2://a/1")]),
      buscarLeann, timeoutMs: 50,
    });
    expect(r).toContain("Este llegó a tiempo");
    expect(r).not.toContain("llega tarde");
  });

  it("marca la fuga si el modelo es de la nube y hay texto personal", async () => {
    const secreto = "La contraseña del servidor es supersecreta123 y no se la digas a nadie.";
    const r = await recordar({
      consulta, contexto, buscar: memvidFijo([deMemvid(secreto, "mv2://a/1")]), esModeloNube: true,
    });
    expect(r).toContain("[FUGA DETECTADA]");
  });

  it("recordarDeCapsulas es alias y acepta contexto y consulta posicionales", async () => {
    expect(recordarDeCapsulas).toBe(recordar);
    const r = await recordar(contexto, consulta, {
      buscar: memvidFijo([deMemvid("Quedamos en el café de la esquina.", "mv2://a/1")]),
    });
    expect(r).toContain("Quedamos en el café");
  });
});
