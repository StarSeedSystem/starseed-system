/**
 * RECORDAR SEMÁNTICO DUO (LNN1028F-b, parte 1): Memvid y LEANN se consultan A LA VEZ
 * por cápsula, se funde con RRF y manda filtros de alcance y peso vectorial.
 * Módulo puro: la búsqueda se inyecta; sin red, sin disco, sin procesos.
 */
import { describe, expect, it, vi } from "vitest";
import {
  recordar,
  recordarDeCapsulas,
  type RecordarOpciones,
} from "@/ai/astraura/recuerdos-capsulas";
import { pesoVectorPara } from "@/lib/memorias/fusion-recuerdos";
import { type ContextoCapsulas } from "@/lib/memorias/capsulas";
import { type ActorMemoria } from "@/lib/nucleo/alcance-memoria";

const actorUsuario: ActorMemoria = { tipo: "usuario" };

const contexto: ContextoCapsulas & { actor: ActorMemoria } = {
  personalidadId: "aurora",
  actor: actorUsuario,
};

function buscarMemvid(texto: string) {
  return vi.fn().mockResolvedValue([{
    titulo: "Vida",
    texto,
    uri: "mv2://personalidad/aurora/1",
    ts: 100,
    alcance: "personal",
    sujeto: { tipo: "personalidad", id: "aurora" },
  }]);
}

function buscarSignificado(texto: string) {
  return vi.fn().mockResolvedValue([{
    id: "p17",
    texto,
    metadatos: { alcance: "personal" },
  }]);
}

describe("recordar (dúo Memvid + LEANN)", () => {
  it("los dos responden: funde los de Memvid y de LEANN en un bloque", async () => {
    const r = await recordar(contexto, "qué planes hay del café", {
      buscar: buscarMemvid("Planes del café con Aurora."),
      buscarLeann: buscarSignificado("Alex quiere cambiar la cafetera."),
    });
    expect(r).toContain("RECUERDOS (cápsulas Memvid):");
    expect(r).toContain("Planes del café con Aurora");
    expect(r).toContain("Alex quiere cambiar la cafetera");
  });

  it("solo Memvid: LEANN responde null (sin servidor) y el bloque sale igual", async () => {
    const r = await recordar(contexto, "qué planes hay del café", {
      buscar: buscarMemvid("Planes del café."),
      buscarLeann: vi.fn().mockResolvedValue(null),
    });
    expect(r).toContain("Planes del café.");
  });

  it("solo LEANN: Memvid no trae nada y el recuerdo de significado entra", async () => {
    const r = await recordar(contexto, "qué planes hay del café", {
      buscar: vi.fn().mockResolvedValue(null),
      buscarLeann: buscarSignificado("Alex quiere cambiar la cafetera."),
    });
    expect(r).toContain("Alex quiere cambiar la cafetera");
  });

  it("ninguno: bloque vacío", async () => {
    const r = await recordar(contexto, "qué planes hay del café", {
      buscar: vi.fn().mockResolvedValue(null),
      buscarLeann: vi.fn().mockResolvedValue(null),
    });
    expect(r).toBe("");
  });

  it("consulta de menos de 4 palabras y sin pregunta no busca (barato)", async () => {
    const buscar = vi.fn().mockResolvedValue(null);
    const buscarLeann = vi.fn().mockResolvedValue(null);
    const r = await recordar(contexto, "hola", { buscar, buscarLeann });
    expect(r).toBe("");
    expect(buscar).not.toHaveBeenCalled();
    expect(buscarLeann).not.toHaveBeenCalled();
  });

  it("consulta corta pero con pregunta sí busca", async () => {
    const buscar = vi.fn().mockResolvedValue(null);
    await recordar(contexto, "¿qué decimos?", {
      buscar,
      buscarLeann: vi.fn().mockResolvedValue(null),
    });
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("manda a LEANN el índice del sujeto, los alcances visibles y el peso de la consulta", async () => {
    const consulta = "qué dijo Alex del café"; // nombre propio → el peso manda palabras
    const buscarLeann = vi.fn().mockResolvedValue(null);
    await recordar(contexto, consulta, {
      buscar: vi.fn().mockResolvedValue(null),
      buscarLeann,
    });
    expect(buscarLeann.mock.calls[0][0]).toBe("personalidad-aurora-personal");
    expect(buscarLeann.mock.calls[0][1]).toBe(consulta);
    expect(buscarLeann.mock.calls[0][2]).toEqual({
      k: 4,
      filtros: { alcance: { in: ["personal", "perfil", "grupo", "publica"] } },
      pesoVector: pesoVectorPara(consulta),
    });
  });

  it("el alias recordarDeCapsulas sigue proponiendo resultados con la forma de opciones", async () => {
    const opts: RecordarOpciones = {
      consulta: "qué planes hay del café",
      contexto,
      buscar: buscarMemvid("Planes del café."),
    };
    await expect(recordarDeCapsulas(opts)).resolves.toContain("Planes del café.");
  });
});
