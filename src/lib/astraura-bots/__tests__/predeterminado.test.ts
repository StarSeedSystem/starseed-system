import { describe, it, expect } from "vitest";
import {
  PERSONALIDAD_ASTRAURA,
  botPredeterminado,
  VERSION_BOTS,
  migrarBots,
} from "../predeterminado";

describe("predeterminado.ts", () => {
  it("PERSONALIDAD_ASTRAURA has correct values", () => {
    expect(PERSONALIDAD_ASTRAURA.calidez).toBe(0.7);
    expect(PERSONALIDAD_ASTRAURA.energia).toBe(0.55);
    expect(PERSONALIDAD_ASTRAURA.formalidad).toBe(0.4);
    expect(PERSONALIDAD_ASTRAURA.curiosidad).toBe(0.7);
    expect(PERSONALIDAD_ASTRAURA.humor).toBe(0.4);
    expect(PERSONALIDAD_ASTRAURA.concision).toBe(0.5);
  });

  it("botPredeterminado returns a Bot with expected values", () => {
    const perfilId = "perfil-123";
    const cuentaId = "cuenta-456";
    const bot = botPredeterminado(perfilId, cuentaId);
    expect(bot.id).toBe(`astraura:${perfilId}`);
    expect(bot.nombre).toBe("Astraura");
    expect(bot.origen).toBe("astraura");
    expect(bot.dueño).toEqual({ tipo: "perfil", id: perfilId });
    expect(bot.gobierno).toBe("jerarquico");
    expect(bot.cuerpo).toEqual({ forma: "orbe", tono: 200, escala: 1 });
    expect(bot.sentidosHabilitados).toEqual(["pantalla", "red"]);
    expect(bot.activo).toBe(true);
  });

  it("VERSION_BOTS is 1", () => {
    expect(VERSION_BOTS).toBe(1);
  });

  it("migrarBots returns default bot for undefined input", () => {
    const result = migrarBots(undefined, "perfil-1", "cuenta-1");
    expect(result).toEqual([botPredeterminado("perfil-1", "cuenta-1")]);
  });

  it("migrarBots returns default bot for null input", () => {
    const result = migrarBots(null, "perfil-1", "cuenta-1");
    expect(result).toEqual([botPredeterminado("perfil-1", "cuenta-1")]);
  });

  it("migrarBots handles old format array of bots", () => {
    const perfilId = "perfil-1";
    const cuentaId = "cuenta-1";
    const oldBot = {
      id: "old-bot",
      nombre: "Old Bot",
      origen: "old",
      dueño: { tipo: "perfil", id: "perfil-1" },
      gobierno: "jerarquico",
      cuerpo: { forma: "cubo", tono: 100, escala: 2 },
      sentidosHabilitados: ["pantalla"],
      activo: false,
    };
    const input = [oldBot];
    const result = migrarBots(input, perfilId, cuentaId);
    // We expect the default bot to be added and the old bot to be kept (if valid).
    // Since we don't have validation, we assume the old bot is valid.
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(botPredeterminado(perfilId, cuentaId));
    expect(result[1]).toEqual(oldBot);
  });

  it("migrarBots handles new format object with version and bots", () => {
    const perfilId = "perfil-1";
    const cuentaId = "cuenta-1";
    const oldBot = {
      id: "old-bot",
      nombre: "Old Bot",
      origen: "old",
      dueño: { tipo: "perfil", id: "perfil-1" },
      gobierno: "jerarquico",
      cuerpo: { forma: "cubo", tono: 100, escala: 2 },
      sentidosHabilitados: ["pantalla"],
      activo: false,
    };
    const input = {
      version: 1,
      bots: [oldBot],
    };
    const result = migrarBots(input, perfilId, cuentaId);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(botPredeterminado(perfilId, cuentaId));
    expect(result[1]).toEqual(oldBot);
  });

  it("migrarBots removes duplicate ids", () => {
    const perfilId = "perfil-1";
    const cuentaId = "cuenta-1";
    const bot1 = {
      id: "duplicate-id",
      nombre: "Bot 1",
      origen: "origin1",
      dueño: { tipo: "perfil", id: "perfil-1" },
      gobierno: "jerarquico",
      cuerpo: { forma: "forma1", tono: 100, escala: 1 },
      sentidosHabilitados: ["pantalla"],
      activo: true,
    };
    const bot2 = {
      id: "duplicate-id",
      nombre: "Bot 2",
      origen: "origin2",
      dueño: { tipo: "perfil", id: "perfil-1" },
      gobierno: "jerarquico",
      cuerpo: { forma: "forma2", tono: 200, escala: 2 },
      sentidosHabilitados: ["red"],
      activo: false,
    };
    const input = [bot1, bot2];
    const result = migrarBots(input, perfilId, cuentaId);
    // We expect the default bot to be added first, then the first occurrence of the duplicate id (bot1).
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(botPredeterminado(perfilId, cuentaId));
    expect(result[1]).toEqual(bot1);
  });

  it("migrarBots ensures the default bot exists", () => {
    const perfilId = "perfil-1";
    const cuentaId = "cuenta-1";
    // Input with no bots
    let result = migrarBots([], perfilId, cuentaId);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual(botPredeterminado(perfilId, cuentaId));

    // Input with bots but missing the default bot
    const otherBot = {
      id: "other-bot",
      nombre: "Other Bot",
      origen: "other",
      dueño: { tipo: "perfil", id: "perfil-2" }, // different perfilId
      gobierno: "jerarquico",
      cuerpo: { forma: "orbe", tono: 200, escala: 1 },
      sentidosHabilitados: ["pantalla", "red"],
      activo: true,
    };
    result = migrarBots([otherBot], perfilId, cuentaId);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(botPredeterminado(perfilId, cuentaId));
    expect(result[1]).toEqual(otherBot);
  });
});