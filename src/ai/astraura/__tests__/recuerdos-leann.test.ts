/**
 * RECUERDO SEMÁNTICO (LNN1028F): `recordar` funde Memvid (palabras) y LEANN
 * (significado) por rango recíproco. Módulo puro: la E/S se inyecta (fake).
 */
import { describe, expect, it } from "vitest";
import {
  recordar,
  recordarDeCapsulas,
  type AciertoCapsula,
  type AciertoLeann,
  type BuscarCapsulaFn,
  type BuscarLeannFn,
} from "@/ai/astraura/recuerdos-capsulas";
import type { ContextoCapsulas, SujetoMemoria } from "@/lib/memorias/capsulas";
import { alcanceVisiblePara, type ActorMemoria } from "@/lib/nucleo/alcance-memoria";

const actor: ActorMemoria = { tipo: "usuario" };
const contexto: ContextoCapsulas & { actor: ActorMemoria } = {
  personalidadId: "aurora",
  actor,
};
const consulta = "¿qué dijimos ayer de la cafetería del barrio?";
const sujeto: SujetoMemoria = { tipo: "personalidad", id: "aurora" };
const aciertoMemvid = (texto: string): AciertoCapsula =>
  ({ titulo: "Memvid", texto, uri: "mv2://personalidad/aurora/1", ts: 1, alcance: "personal", sujeto });
const aciertoLeann = (texto: string, id = "leann-1"): AciertoLeann =>
  ({ id, puntuacion: 0.9, texto, metadatos: { alcance: "personal" } });
const buscarSiempre = (lista: AciertoCapsula[] | null): BuscarCapsulaFn => async () => lista;
const leannSiempre = (lista: AciertoLeann[] | null): BuscarLeannFn => async () => lista;

describe("recordar · fusión Memvid + LEANN", () => {
  it("con los dos respondiendo, funde ambos recuerdos", async () => {
    const r = await recordar(contexto, consulta, {
      buscar: buscarSiempre([aciertoMemvid("Quedamos en la cafetería a las diez.")]),
      buscarLeann: leannSiempre([aciertoLeann("Planes del café para el sábado.")]),
    });
    expect(r).toContain("RECUERDOS (memoria + significado):");
    expect(r).toContain("Quedamos en la cafetería a las diez.");
    expect(r).toContain("Planes del café para el sábado.");
  });

  it("con solo Memvid respondiendo, sigue funcionando", async () => {
    const r = await recordar(contexto, consulta, {
      buscar: buscarSiempre([aciertoMemvid("La cafetería cierra los lunes.")]),
      buscarLeann: leannSiempre(null),
    });
    expect(r).toContain("RECUERDOS (cápsulas Memvid):");
    expect(r).toContain("La cafetería cierra los lunes.");
  });

  it("con solo LEANN respondiendo, sigue funcionando", async () => {
    const r = await recordar(contexto, consulta, {
      buscar: buscarSiempre(null),
      buscarLeann: leannSiempre([aciertoLeann("El café de la esquina era el favorito.")]),
    });
    expect(r).toContain("El café de la esquina era el favorito.");
  });

  it("sin respuestas de ninguno devuelve cadena vacía", async () => {
    const r = await recordar(contexto, consulta, {
      buscar: buscarSiempre(null),
      buscarLeann: leannSiempre(null),
    });
    expect(r).toBe("");
  });
});
describe("recordar · juicio barato, filtros y tope", () => {
  it("una consulta de menos de 4 palabras sin pregunta no busca", async () => {
    let llamadas = 0;
    const buscar: BuscarCapsulaFn = async () => { llamadas += 1; return null; };
    const buscarLeann: BuscarLeannFn = async () => { llamadas += 1; return null; };
    expect(await recordar(contexto, "café", { buscar, buscarLeann })).toBe("");
    expect(llamadas).toBe(0);
  });

  it("una consulta corta con pregunta sí busca", async () => {
    const r = await recordar(contexto, "¿café?", {
      buscar: buscarSiempre([aciertoMemvid("Sí, café.")]),
    });
    expect(r).toContain("Sí, café.");
  });

  it("pasa a LEANN el filtro de alcance y el peso vectorial", async () => {
    let indice = ""; let opciones: { filtros?: unknown; pesoVector?: number } = {};
    const buscarLeann: BuscarLeannFn = async (i, _q, o) => {
      indice = i; opciones = o; return [aciertoLeann("Café por la tarde.")];
    };
    await recordar(contexto, consulta, { buscar: buscarSiempre(null), buscarLeann });
    expect(indice).toBe("personalidad-aurora-personal");
    expect(opciones.filtros).toEqual({ alcance: { in: alcanceVisiblePara(actor) } });
    expect(opciones.pesoVector).toBe(0.7);
  });

  it("lo que llega tarde no entra y lo rápido sí", async () => {
    const buscarLeann: BuscarLeannFn = async () => {
      await new Promise((r) => setTimeout(r, 80));
      return [aciertoLeann("Este recuerdo llega tarde y no debe entrar.")];
    };
    const r = await recordar(contexto, consulta, {
      buscar: buscarSiempre([aciertoMemvid("Este llegó a tiempo.")]),
      buscarLeann,
      timeoutMs: 20,
    });
    expect(r).toContain("Este llegó a tiempo.");
    expect(r).not.toContain("llega tarde");
  });

  it("marca fuga si el modelo es de la nube y hay texto personal", async () => {
    const secreto = "La contraseña del servidor es supersecreta123 y no se la digas a nadie.";
    const r = await recordar(contexto, consulta, {
      buscar: buscarSiempre([aciertoMemvid(secreto)]),
      esModeloNube: true,
    });
    expect(r).toContain("[FUGA DETECTADA]");
  });

  it("recordarDeCapsulas es alias del mismo recordar", () => {
    expect(recordarDeCapsulas).toBe(recordar);
  });
});
