/**
 * RECUERDOS DE CÁPSULAS MULTIMODALES (LNN1028Fc):
 * pruebas de `recordar` con Memvid y LEANN (búsqueda por palabras y significado).
 * Módulo puro: la E/S real (fetch a /api/memorias/capsulas y LEANN) se inyecta como
 * dependencias (`buscarMemvid`/`buscarLeann`) para que sea testeable.
 *
 * Pruebas para:
 * - Dos respuestas (Memvid + LEANN) con consulta de 4+ palabras o con ?
 * - Una respuesta (Memvid solo)
 * - Ninguna respuesta (fallo en Memvid o LEANN)
 * - Early return para consultas < 4 palabras sin ?
 */

import { describe, expect, it, vi } from "vitest";
import {
  recordar,
  type RecordarMultimodalOpciones,
  type BuscarMemvidFn,
  type BuscarLeannFn,
  type AciertoMemvid,
  type AciertoLeann,
} from "@/ai/astraura/recuerdos-capsulas";

import {
  type ContextoCapsulas,
  type SujetoMemoria,
  type ActorMemoria,
} from "@/lib/memorias/capsulas";

import {
  type AlcanceMemoria,
  alcanceVisiblePara,
} from "@/lib/nucleo/alcance-memoria";

const actorUsuario: ActorMemoria = { tipo: "usuario" };

const contextoBase: ContextoCapsulas & { actor: ActorMemoria } = {
  personalidadId: "aurora",
  perfilId: "alex",
  actor: actorUsuario,
};

const sujetoPersonalidad: SujetoMemoria = { tipo: "personalidad", id: "aurora" };
const indiceLeannPersonal = "personalidad-aurora-perfil";

function crearBuscarFakeMemvid(aciertos: Map<string, AciertoMemvid[]>): BuscarMemvidFn {
  return async (sujeto, _consulta, k) => {
    const key = `${sujeto.tipo}-${sujeto.id}`;
    const lista = aciertos.get(key) ?? [];
    return lista.slice(0, k).map((a) => ({...a, sujeto}));
  };
}

function crearBuscarFakeLeann(aciertos: Map<string, AciertoLeann[]>): BuscarLeannFn {
  return async (_indice, _consulta, opciones) => {
    const lista = aciertos.get("test-indice") ?? [];
    return lista.slice(0, opciones.k ?? 4);
  };
}

describe("recordar (multimodal: Memvid + LEANN)", () => {
  describe("cuando la consulta tiene menos de 4 palabras y no es pregunta", () => {
    it("devuelve cadena vacía (early return barato)", async () => {
      const buscarMemvid = vi.fn().mockResolvedValue(null);
      const buscarLeann = vi.fn().mockResolvedValue(null);
      const opts: RecordarMultimodalOpciones = {
        consulta: "hola",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
      expect(buscarMemvid).not.toHaveBeenCalled();
      expect(buscarLeann).not.toHaveBeenCalled();
    });
  });

  describe("cuando la consulta es pregunta o tiene 4+ palabras", () => {
    it("procede con la búsqueda cuando la consulta tiene 4+ palabras", async () => {
      const aciertosMemvid = new Map<string, AciertoMemvid>([[
        "personalidad-aurora",
        [
          {
            titulo: "Recuerdo 1",
            texto: "Aurora prefiere el café con leche.",
            alcance: "personal" as AlcanceMemoria,
          },
        ],
      ]]);

      const aciertosLeann = new Map<string, AciertoLeann>([[
        "test-indice",
        [
          {
            id: "leann-1",
            puntuacion: 0.9,
            texto: "Aurora y el café son temas recurrentes.",
            metadatos: { alcance: "personal" as AlcanceMemoria },
          },
        ],
      ]]);

      const buscarMemvid = crearBuscarFakeMemvid(aciertosMemvid);
      const buscarLeann = crearBuscarFakeLeann(aciertosLeann);

      const consultaLarga = "planes de la mañana de Aurora";
      const opts: RecordarMultimodalOpciones = {
        consulta: consultaLarga,
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };

      const r = await recordar(opts);
      // La consulta tiene 4+ palabras y no es pregunta, así que busca
      expect(r).toEqual(
        expect.objectContaining({
          memoria: expect.stringContaining("RECUERDOS (cápsulas Memvid)"),
          leann: expect.stringContaining("RECUERDOS (significado LEANN)"),
          combinado: expect.stringContaining("RECUERDOS (memoria + significado)"),
        }),
      );
    });

    it("devuelve bloque Memvid cuando LEANN retorna null", async () => {
      const aciertosMemvid = new Map<string, AciertoMemvid>([[
        "personalidad-aurora",
        [
          {
            titulo: "Recuerdo 1",
            texto: "Aurora prefiere el café con leche.",
            alcance: "personal" as AlcanceMemoria,
          },
        ],
      ]]);

      const buscarMemvid = crearBuscarFakeMemvid(aciertosMemvid);
      const buscarLeann = vi.fn().mockResolvedValue(null);

      const opts: RecordarMultimodalOpciones = {
        consulta: "planes de la mañana de Aurora",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };

      const r = await recordar(opts);
      expect(r).toEqual(
        expect.objectContaining({
          memoria: expect.stringContaining("RECUERDOS (cápsulas Memvid)"),
          leann: "",
          combinado: expect.stringContaining("RECUERDOS (memoria + significado)"),
        }),
      );
    });
  });

  describe("early return para consulta corta", () => {
    it("devuelve vacío para 1 palabra sin pregunta", async () => {
      const buscarMemvid = vi.fn();
      const buscarLeann = vi.fn();
      const opts: RecordarMultimodalOpciones = {
        consulta: "café",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
      expect(buscarMemvid).not.toHaveBeenCalled();
      expect(buscarLeann).not.toHaveBeenCalled();
    });

    it("devuelve vacío para 3 palabras sin pregunta", async () => {
      const buscarMemvid = vi.fn();
      const buscarLeann = vi.fn();
      const opts: RecordarMultimodalOpciones = {
        consulta: "que café",
        contexto: contextoBase,
        buscarMemviz,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
      expect(buscarMemvid).not.toHaveBeenCalled();
      expect(buscarLeann).not.toHaveBeenCalled();
    });
  });

  describe("con memoriaScope personal", () => {
    it("devuelve cadena vacía", async () => {
      const buscarMemvid = vi.fn().mockResolvedValue(null);
      const buscarLeann = vi.fn().mockResolvedValue(null);
      const opts: RecordarMultimodalOpciones = {
        consulta: "planes de la mañana de Aurora",
        contexto: contextoBase,
        buscarMemvid,
        buscarLeann,
        memoryScope: "personal",
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
    });
  });

  describe("con actor sin alcances visibles", () => {
    it("devuelve cadena vacía", async () => {
      const contextoSinAlcances: ContextoCapsulas & { actor: ActorMemoria } = {
        actor: { tipo: "agente-publico" },
      };
      const buscarMemvid = vi.fn().mockResolvedValue(null);
      const buscarLeann = vi.fn().mockResolvedValue(null);
      const opts: RecordarMultimodalOpciones = {
        consulta: "planes de la mañana de Aurora",
        contexto: contextoSinAlcances,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
    });
  });

  describe("cuando no hay cápsulas en el contexto", () => {
    it("devuelve cadena vacía", async () => {
      const contextoVacio: ContextoCapsulas & { actor: ActorMemoria } = {
        actor: actorUsuario,
      };
      const buscarMemvid = vi.fn().mockResolvedValue(null);
      const buscarLeann = vi.fn().mockResolvedValue(null);
      const opts: RecordarMultimodalOpciones = {
        consulta: "planes de la mañana de Aurora",
        contexto: contextoVacio,
        buscarMemvid,
        buscarLeann,
      };
      const r = await recordar(opts);
      expect(r).toEqual({ memoria: "", leann: "", combinado: "" });
    });
  });
});