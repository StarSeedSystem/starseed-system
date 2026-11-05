/**
 * RECUERDO SEMÁNTICO (LNN1028Fb, parte 2): pruebas de `recordar(contexto, consulta)` —
 * por cada cápsula pregunta A LA VEZ a Memvid (palabras) y a LEANN (significado), funde
 * por rango recíproco, filtra por el alcance del actor y decide barato antes de buscar.
 * Módulo puro: la E/S real se inyecta (fakes), ni red, ni disco, ni procesos.
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
import { alcanceVisiblePara, type AlcanceMemoria, type ActorMemoria } from "@/lib/nucleo/alcance-memoria";

const actorUsuario: ActorMemoria = { tipo: "usuario" };
const actorGrupo: ActorMemoria = { tipo: "agente-grupo", grupoId: "g1" };
const sujetoAurora: SujetoMemoria = { tipo: "personalidad", id: "aurora" };
const contextoBase: ContextoCapsulas & { actor: ActorMemoria } = {
  personalidadId: "aurora", perfilId: "alex", grupoId: "equipo", paginaId: "web",
  actor: actorUsuario,
};
const consulta = "¿qué dijimos ayer del café y del trabajo del equipo?";

const aciertoMemvid = (texto: string, alcance: AlcanceMemoria = "personal"): AciertoCapsula => ({
  titulo: "Memvid", texto, uri: "mv2://personalidad/aurora/1", ts: 1, alcance, sujeto: sujetoAurora,
});
const aciertoLeann = (texto: string, id = "leann-1"): AciertoLeann => ({
  id, puntuacion: 0.9, texto, metadatos: { alcance: "personal" },
});
/** Buscador de Memvid que contesta siempre lo mismo. */
const buscarQue = (lista: AciertoCapsula[] | null): BuscarCapsulaFn => async () => lista;
/** Buscador de LEANN que contesta siempre lo mismo. */
const leannQue = (lista: AciertoLeann[] | null): BuscarLeannFn => async () => lista;

describe("recordar · los dos, solo uno, ninguno", () => {
  it("con los dos respondiendo, funde Memvid + LEANN en un solo bloque", async () => {
    const r = await recordar(contextoBase, consulta, {
      buscar: buscarQue([aciertoMemvid("Quedamos en la cafetería a las diez.")]),
      buscarLeann: leannQue([aciertoLeann("El café de la esquina era el favorito.")]),
    });
    expect(r).toContain("RECUERDOS (memoria + significado):");
    expect(r).toContain("Quedamos en la cafetería a las diez.");
    expect(r).toContain("El café de la esquina era el favorito.");
  });

  it("con solo Memvid sigue funcionando (LEANN caído, nada falla)", async () => {
    const r = await recordar(contextoBase, consulta, {
      buscar: buscarQue([aciertoMemvid("La cafetería cierra los lunes.")]),
      buscarLeann: leannQue(null),
    });
    expect(r).toContain("RECUERDOS (cápsulas Memvid):");
    expect(r).toContain("La cafetería cierra los lunes.");
  });

  it("con solo LEANN respondiendo, su significado entra en el bloque", async () => {
    const r = await recordar(contextoBase, consulta, {
      buscar: buscarQue(null),
      buscarLeann: leannQue([aciertoLeann("El café de la esquina era el favorito.")]),
    });
    expect(r).toContain("El café de la esquina era el favorito.");
  });

  it("sin respuesta de ninguno devuelve cadena vacía", async () => {
    const r = await recordar(contextoBase, consulta, {
      buscar: buscarQue(null), buscarLeann: leannQue(null),
    });
    expect(r).toBe("");
  });
});

describe("recordar · juicio barato antes de buscar", () => {
  it("menos de 4 palabras y sin pregunta: no gasta búsquedas", async () => {
    let llamadas = 0;
    const buscar: BuscarCapsulaFn = async () => { llamadas += 1; return null; };
    const buscarLeann: BuscarLeannFn = async () => { llamadas += 1; return null; };
    const r = await recordar(contextoBase, "café", { buscar, buscarLeann });
    expect(r).toBe("");
    expect(llamadas).toBe(0);
  });

  it("corta pero con pregunta: sí busca", async () => {
    let llamadas = 0;
    const buscar: BuscarCapsulaFn = async () => { llamadas += 1; return [aciertoMemvid("Sí, café.")]; };
    const r = await recordar(contextoBase, "¿café?", { buscar });
    expect(llamadas).toBeGreaterThan(0);
    expect(r).toContain("Sí, café.");
  });
});

describe("recordar · lo que LEANN recibe", () => {
  it("índice del sujeto, filtro de alcance visible y el peso vectorial de la consulta", async () => {
    const contextoSolo = { personalidadId: "aurora", actor: actorUsuario };
    let indice = ""; let opcionesLeann: { filtros?: unknown; pesoVector?: number } = {};
    const buscarLeann: BuscarLeannFn = async (i, _c, o) => {
      indice = i; opcionesLeann = o; return [aciertoLeann("Un recuerdo leann.")];
    };
    await recordar(contextoSolo, consulta, { buscar: buscarQue(null), buscarLeann });
    expect(indice).toBe("personalidad-aurora-personal");
    expect(opcionesLeann.filtros).toEqual({ alcance: { in: alcanceVisiblePara(actorUsuario) } });
    expect(opcionesLeann.pesoVector).toBe(0.7); // por defecto manda el significado
  });

  it("con comillas la consulta va a por palabras literales: peso 0,4", async () => {
    let peso: number | undefined;
    const buscarLeann: BuscarLeannFn = async (_i, _c, o) => { peso = o.pesoVector; return null; };
    await recordar(contextoBase, `¿dónde leí "Aurora" ayer en el diario?`, {
      buscar: buscarQue(null), buscarLeann,
    });
    expect(peso).toBe(0.4);
  });
});

describe("recordar · alcance del actor y fusión", () => {
  it("un agente de grupo no ve lo personal de otros, sí lo del grupo", async () => {
    const r = await recordar({ ...contextoBase, actor: actorGrupo }, consulta, {
      buscar: buscarQue([
        aciertoMemvid("Secreto personal de Aurora.", "personal"),
        aciertoMemvid("Memos del equipo g1.", "grupo"),
      ]),
    });
    expect(r).toContain("Memos del equipo g1.");
    expect(r).not.toContain("Secreto personal");
  });

  it("un recuerdo que Memvid y LEANN traen con el mismo uri entra una sola vez", async () => {
    const texto = "Café a las diez con el equipo.";
    const r = await recordar(contextoBase, consulta, {
      buscar: buscarQue([aciertoMemvid(texto)]),
      buscarLeann: leannQue([aciertoLeann(texto, "mv2://personalidad/aurora/1")]),
    });
    expect((r.match(/Café a las diez con el equipo\./g) ?? []).length).toBe(1);
  });
});

describe("recordar · tope de tiempo y alias", () => {
  it("lo que llega tarde no entra; lo rápido sí", async () => {
    const buscarLeann: BuscarLeannFn = async () => {
      await new Promise((z) => setTimeout(z, 80));
      return [aciertoLeann("Este recuerdo llega tarde y no debe entrar.")];
    };
    const r = await recordar(contextoBase, consulta, {
      buscar: buscarQue([aciertoMemvid("Este llegó a tiempo.")]),
      buscarLeann, timeoutMs: 20,
    });
    expect(r).toContain("Este llegó a tiempo.");
    expect(r).not.toContain("llega tarde");
  });

  it("recordarDeCapsulas es el mismo recordar (alias histórico MVD1027F)", () => {
    expect(recordarDeCapsulas).toBe(recordar);
  });
});
