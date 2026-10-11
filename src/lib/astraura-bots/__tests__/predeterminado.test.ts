/**
 * Pruebas de `predeterminado.ts` (BOT1011A): valores del bot predeterminado,
 * migración (array viejo, basura, rasgos acotados, ids duplicados,
 * predeterminado siempre presente) y versión escrita.
 */
import { describe, it, expect } from "vitest";
import {
  PERSONALIDAD_ASTRAURA,
  VERSION_BOTS,
  botPredeterminado,
  migrarBots,
} from "../predeterminado";
import type { Bot } from "../tipos";

const PERFIL = "perfil-1";
const CUENTA = "cuenta-1";

const botValido = (id: string): Bot => ({
  ...botPredeterminado(PERFIL, CUENTA),
  id,
  nombre: "Bot de prueba",
});

describe("botPredeterminado", () => {
  it("tiene los valores del contrato", () => {
    const b = botPredeterminado(PERFIL, CUENTA);
    expect(b).toMatchObject({
      id: "astraura:perfil-1",
      nombre: "Astraura",
      origen: "astraura",
      gobierno: "jerarquico",
      dueno: { tipo: "perfil", id: PERFIL, cuentaId: CUENTA },
      cuerpo: { forma: "orbe", tono: 200, escala: 1 },
      sentidosHabilitados: ["pantalla", "red"],
      activo: true,
    });
    expect(b.personalidad).toEqual(PERSONALIDAD_ASTRAURA);
  });

  it("la personalidad tiene sus rasgos exactos y es una copia", () => {
    expect(PERSONALIDAD_ASTRAURA).toEqual({
      calidez: 0.7, energia: 0.55, formalidad: 0.4,
      curiosidad: 0.7, humor: 0.4, concision: 0.5,
    });
    const b = botPredeterminado(PERFIL, CUENTA);
    b.personalidad.calidez = 0;
    expect(PERSONALIDAD_ASTRAURA.calidez).toBe(0.7);
  });
});

describe("migrarBots", () => {
  it("acepta un array viejo sin envoltorio", () => {
    const viejo = botValido("otro:1");
    const bots = migrarBots([viejo], PERFIL, CUENTA);
    expect(bots.some((b) => b.id === "otro:1")).toBe(true);
  });

  it("acepta { version, bots } y conserva versión exportada", () => {
    const bots = migrarBots({ version: VERSION_BOTS, bots: [botValido("otro:1")] }, PERFIL, CUENTA);
    expect(VERSION_BOTS).toBe(1);
    expect(bots.some((b) => b.id === "otro:1")).toBe(true);
  });

  it("descarta basura y lo que no pasa las guardas", () => {
    const bots = migrarBots(
      { bots: [null, 42, "x", { id: "" }, { id: "a", origen: "inventado", dueno: {} }] },
      PERFIL,
      CUENTA,
    );
    expect(bots.map((b) => b.id)).toEqual([`astraura:${PERFIL}`]);
  });

  it("acota rasgos fuera de rango", () => {
    const raro = { ...botValido("raro:1"), personalidad: { calidez: 5, energia: -2, formalidad: Number.NaN, curiosidad: 0.5, humor: 2, concision: 0.1 } };
    const poblado = migrarBots([raro], PERFIL, CUENTA).find((x) => x.id === "raro:1");
    expect(poblado?.personalidad).toEqual({ calidez: 1, energia: 0, formalidad: 0, curiosidad: 0.5, humor: 1, concision: 0.1 });
  });

  it("elimina ids duplicados conservando el primero", () => {
    const a = botValido("dup:1");
    const b = { ...botValido("dup:1"), nombre: "Segundo" };
    const bots = migrarBots([a, b], PERFIL, CUENTA);
    expect(bots.filter((x) => x.id === "dup:1")).toHaveLength(1);
    expect(bots.find((x) => x.id === "dup:1")?.nombre).toBe("Bot de prueba");
  });

  it("garantiza el predeterminado siempre presente y el primero", () => {
    expect(migrarBots(null, PERFIL, CUENTA)[0].id).toBe(`astraura:${PERFIL}`);
    expect(migrarBots(undefined, PERFIL, CUENTA)).toHaveLength(1);
    const enMedio = migrarBots([botValido("x:1"), botValido(`astraura:${PERFIL}`), botValido("y:2")], PERFIL, CUENTA);
    expect(enMedio[0].id).toBe(`astraura:${PERFIL}`);
  });

  it("filtra sentidos desconocidos y conserva los válidos", () => {
    const b = { ...botValido("s:1"), sentidosHabilitados: ["pantalla", "telepatia"] };
    const bots = migrarBots([b], PERFIL, CUENTA);
    expect(bots.find((x) => x.id === "s:1")?.sentidosHabilitados).toEqual(["pantalla"]);
  });
});
