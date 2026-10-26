import { describe, expect, it } from "vitest";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { configPorDefecto } from "../config-agente";
import {
  MAX_RECUERDOS, MAX_TEXTO_RECUERDO, agregarRecuerdo, haceCuanto, memoriasRecientes, recuerdosVisibles, sanearRecuerdos, vistaDesarrollo,
} from "../desarrollo";
import { evolucionar } from "../percepcion";
import type { RecuerdoBot } from "@/lib/astraura-bots/memoria-bot";

const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);
const personal = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "aurora", nombre: "Aurora", dueno: { tipo: "perfil", id: "p1" } });
const deGrupo = crearAgenteMundoRef({ origen: "bot", idOrigen: "g", nombre: "Guía", dueno: { tipo: "grupo", id: "grupo-7" } });
const dePagina = crearAgenteMundoRef({ origen: "bot", idOrigen: "pg", nombre: "Voz", dueno: { tipo: "pagina", id: "pag-1" } });

const rec = (id: string, alcance: RecuerdoBot["alcance"], at: number, extra: Partial<RecuerdoBot> = {}): RecuerdoBot => ({
  id, botId: "x", alcance, texto: `texto ${id}`, origen: "conversación", at, bytes: 20, usos: 0, ...extra,
});

describe("sanearRecuerdos", () => {
  it("con basura da una lista vacía y no lanza", () => {
    for (const b of [null, undefined, 1, "x", {}, [null, 3, "z", [], { id: 1 }]]) expect(sanearRecuerdos(b, personal)).toEqual([]);
  });

  it("descarta alcance desconocido, repetidos y sin texto; atribuye al agente; calcula bytes", () => {
    const r = sanearRecuerdos([
      { id: "a", texto: "hola «mundo»", alcance: "personal", at: T0, usos: 2.6, origen: "chat" },
      { id: "a", texto: "repetido", alcance: "personal", at: T0 },
      { id: "b", texto: "alcance raro", alcance: "secreto", at: T0 },
      { id: "c", texto: "   ", alcance: "publica", at: T0 },
      { id: "d", texto: "sin fecha", alcance: "publica" },
    ], personal);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "a", botId: personal.id, texto: "hola mundo", usos: 3, origen: "chat" });
    expect(r[0].bytes).toBeGreaterThan(0);
  });

  it("limita largo de texto y cantidad", () => {
    const muchos = Array.from({ length: MAX_RECUERDOS + 50 }, (_, i) => ({ id: `r${i}`, texto: "x".repeat(900), alcance: "publica", at: T0 + i }));
    const r = sanearRecuerdos(muchos, personal);
    expect(r).toHaveLength(MAX_RECUERDOS);
    expect(r[0].texto.length).toBe(MAX_TEXTO_RECUERDO);
  });
});

describe("recuerdosVisibles (alcance de memoria)", () => {
  const todos = [rec("pe", "personal", T0), rec("pf", "perfil", T0), rec("g7", "grupo", T0, { grupoId: "grupo-7" }), rec("g8", "grupo", T0, { grupoId: "grupo-8" }), rec("pu", "publica", T0)];

  it("un agente de la cuenta ve toda su memoria", () => {
    expect(recuerdosVisibles(todos, personal).map((r) => r.id).sort()).toEqual(["g7", "g8", "pe", "pf", "pu"]);
  });

  it("un agente de grupo solo ve lo de SU grupo y lo público", () => {
    expect(recuerdosVisibles(todos, deGrupo).map((r) => r.id).sort()).toEqual(["g7", "pu"]);
  });

  it("un agente público (de página) solo ve lo público: jamás la memoria personal de su creador", () => {
    expect(recuerdosVisibles(todos, dePagina).map((r) => r.id)).toEqual(["pu"]);
  });

  it("memoriasRecientes ordena de más nueva a más vieja y respeta el límite", () => {
    const l = [rec("a", "publica", T0), rec("b", "publica", T0 + 5000), rec("c", "publica", T0 + 1000)];
    expect(memoriasRecientes(l, personal, 2).map((r) => r.id)).toEqual(["b", "c"]);
    expect(memoriasRecientes(l, personal, 0)).toEqual([]);
  });
});

describe("agregarRecuerdo", () => {
  it("guarda con las reglas de escritura: un agente público no escribe en lo personal", () => {
    const no = agregarRecuerdo([], dePagina, { texto: "dato íntimo", alcance: "personal" }, T0);
    expect(no.ok).toBe(false);
    const si = agregarRecuerdo([], dePagina, { texto: "dato público", alcance: "publica" }, T0);
    expect(si.ok).toBe(true);
  });

  it("un agente de grupo escribe en la memoria de grupo con su grupo declarado", () => {
    const r = agregarRecuerdo([], deGrupo, { texto: "acuerdo del grupo", alcance: "grupo" }, T0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recuerdos[0]).toMatchObject({ alcance: "grupo", grupoId: "grupo-7", botId: deGrupo.id });
  });

  it("rechaza vacío y alcance desconocido", () => {
    expect(agregarRecuerdo([], personal, { texto: "  ", alcance: "personal" }, T0).ok).toBe(false);
    expect(agregarRecuerdo([], personal, { texto: "x", alcance: "otro" as never }, T0).ok).toBe(false);
  });

  it("la cuota olvida lo de menor puntuación pero nunca lo fijado", () => {
    const fijado = rec("fijo", "personal", T0 - 90 * 24 * 3600 * 1000, { fijado: true, bytes: 40 });
    const viejo = rec("viejo", "personal", T0 - 80 * 24 * 3600 * 1000, { bytes: 40 });
    const r = agregarRecuerdo([fijado, viejo], personal, { texto: "nuevo", alcance: "personal" }, T0, 60);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recuerdos.map((x) => x.id)).toContain("fijo");
    expect(r.recuerdos.map((x) => x.id)).not.toContain("viejo");
    expect(r.olvidados.map((x) => x.id)).toContain("viejo");
  });
});

describe("vistaDesarrollo", () => {
  it("sin recuerdos ni evolución dice que no hay datos y no inventa nada", () => {
    const v = vistaDesarrollo({ recuerdos: [], agente: personal, config: configPorDefecto(personal), ahora: T0 });
    expect(v.sinDatos).toBe(true);
    expect(v.memorias).toEqual([]);
    expect(v.pasos).toEqual([]);
    expect(v.hayEvolucion).toBe(false);
    expect(v.evolucion).toHaveLength(5);
    expect(v.evolucion.every((f) => f.deriva === 0 && f.usadoHoy === 0 && f.restanteHoy === 0.05)).toBe(true);
  });

  it("con evolución muestra base, deriva, efectivo y lo que queda de cupo hoy", () => {
    const c = configPorDefecto(personal);
    const r = evolucionar(c.desarrollo, c.percepcion.rasgos, { humor: 0.03 }, "chiste compartido", T0);
    const v = vistaDesarrollo({ recuerdos: [], agente: personal, config: { ...c, desarrollo: r.desarrollo }, ahora: T0 + 1000 });
    const humor = v.evolucion.find((f) => f.rasgo === "humor");
    expect(v.sinDatos).toBe(false);
    expect(humor).toMatchObject({ base: 0.4, deriva: 0.03, efectivo: 0.43, usadoHoy: 0.03, restanteHoy: 0.02 });
    expect(v.pasos[0].motivo).toBe("chiste compartido");
    // al día siguiente el cupo vuelve
    const manana = vistaDesarrollo({ recuerdos: [], agente: personal, config: { ...c, desarrollo: r.desarrollo }, ahora: T0 + 24 * 3600 * 1000 });
    expect(manana.evolucion.find((f) => f.rasgo === "humor")?.restanteHoy).toBe(0.05);
  });

  it("las memorias de la vista respetan el alcance del agente", () => {
    const v = vistaDesarrollo({ recuerdos: [rec("pe", "personal", T0), rec("pu", "publica", T0)], agente: dePagina, config: configPorDefecto(dePagina), ahora: T0 });
    expect(v.memorias.map((m) => m.id)).toEqual(["pu"]);
    expect(v.totalMemorias).toBe(1);
  });
});

describe("haceCuanto", () => {
  it("expresa el tiempo transcurrido sin inventar", () => {
    expect(haceCuanto(T0, T0 + 5000)).toBe("hace un momento");
    expect(haceCuanto(T0, T0 + 5 * 60000)).toBe("hace 5 min");
    expect(haceCuanto(T0, T0 + 3 * 3600000)).toBe("hace 3 h");
    expect(haceCuanto(T0, T0 + 5 * 24 * 3600000)).toBe("hace 5 días");
    expect(haceCuanto(T0 + 9999, T0)).toBe("hace un momento");
  });
});
