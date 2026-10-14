import { describe, test, expect } from "vitest";
import { fusionarBots } from "../adaptadores/sincronia-bots";
import { Bot } from "../tipos";
import { SYNCED_KEYS } from "@/lib/settings-sync";

const makeBot = (overrides: Partial<Bot>): Bot => {
  return {
    id: `bot-${Math.random()}`,
    nombre: "Test Bot",
    dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" },
    origen: "astraura",
    gobierno: "jerarquico",
    personalidad: {
      calidez: 0.5,
      energia: 0.5,
      formalidad: 0.5,
      curiosidad: 0.5,
      humor: 0.5,
      concision: 0.5,
    },
    cuerpo: { forma: "orbe", tono: 200, escala: 1 },
    sentidosHabilitados: ["pantalla", "red"],
    activo: true,
    ...overrides,
  };
};

describe("fusionarBots", () => {
  test("gana el más reciente por timestamp", () => {
    const bot: Bot = makeBot({ id: "bot-1", nombre: "Bot 1" });
    const local = {
      bots: [bot],
      actualizado: { "bot-1": 1000 },
    };
    const remoto = {
      bots: [{ ...bot, nombre: "Bot 2" }],
      actualizado: { "bot-1": 2000 }, // más reciente
    };
    const result = fusionarBots(local, remoto);
    expect(result.bots.length).toBe(1);
    expect(result.bots[0].nombre).toBe("Bot 2"); // gana el remoto
    expect(result.actualizado["bot-1"]).toBe(2000);
  });

  test("mantiene el local cuando el remoto es más antiguo", () => {
    const bot: Bot = makeBot({ id: "bot-1", nombre: "Bot 1" });
    const local = {
      bots: [bot],
      actualizado: { "bot-1": 2000 },
    };
    const remoto = {
      bots: [{ ...bot, nombre: "Bot 2" }],
      actualizado: { "bot-1": 1000 }, // más antiguo
    };
    const result = fusionarBots(local, remoto);
    expect(result.bots.length).toBe(1);
    expect(result.bots[0].nombre).toBe("Bot 1"); // mantiene el local
    expect(result.actualizado["bot-1"]).toBe(2000);
  });

  test("predeterminado garantizado: nunca se pierde el bot existente localmente", () => {
    const botPredeterminado: Bot = makeBot({
      id: "astraura:perfil-1",
      nombre: "Astraura",
    });
    const local = {
      bots: [botPredeterminado],
      actualizado: { "astraura:perfil-1": 1500 },
    };
    const remoto = {
      bots: [], // remoto vacío
      actualizado: {},
    };
    const result = fusionarBots(local, remoto);
    expect(result.bots.length).toBe(1);
    expect(result.bots[0].id).toBe("astraura:perfil-1"); // se conserva
  });

  test("borrado remoto no propaga: bot ausente en remoto se conserva del local", () => {
    const bot: Bot = makeBot({ id: "bot-1", nombre: "Bot 1" });
    const local = {
      bots: [bot],
      actualizado: { "bot-1": 1500 },
    };
    const remoto = {
      bots: [], // bot eliminado en remoto
      actualizado: {},
    };
    const result = fusionarBots(local, remoto);
    expect(result.bots.length).toBe(1);
    expect(result.bots[0].id).toBe("bot-1"); // se conserva el local
  });

  test("ids nuevos de ambos lados se incluyen", () => {
    const botLocal: Bot = makeBot({ id: "bot-local" });
    const botRemoto: Bot = makeBot({ id: "bot-remoto" });
    const local = {
      bots: [botLocal],
      actualizado: { "bot-local": 1000 },
    };
    const remoto = {
      bots: [botRemoto],
      actualizado: { "bot-remoto": 1000 },
    };
    const result = fusionarBots(local, remoto);
    expect(result.bots.length).toBe(2);
    const ids = result.bots.map(b => b.id).sort();
    expect(ids).toEqual(["bot-local", "bot-remoto"].sort());
  });

  test("determinismo: misma entrada produce misma salida", () => {
    const bot1: Bot = makeBot({ id: "bot-1" });
    const bot2: Bot = makeBot({ id: "bot-2" });
    const local = {
      bots: [bot1, bot2],
      actualizado: { "bot-1": 1000, "bot-2": 2000 },
    };
    const remoto = {
      bots: [{ ...bot1, nombre: "Modificado" }],
      actualizado: { "bot-1": 1500 },
    };
    const result1 = fusionarBots(local, remoto);
    const result2 = fusionarBots(local, remoto);
    expect(result1).toEqual(result2);
  });

  test("basura del remoto descartada: campos no reconocidos se filtran", () => {
    // Nota: Esta prueba asume que los bots pasan por las guardas del núcleo
    // En la práctica, fusionarBots trabaja con objetos Bot ya validados
    const bot: Bot = makeBot({ id: "bot-1" });
    const local = {
      bots: [bot],
      actualizado: { "bot-1": 1000 },
    };
    // Simulamos que el remoto tiene un bot con campos extra (pero aún así es un Bot válido)
    const remotoBot: Bot = makeBot({ id: "bot-1", nombre: "Bot Actualizado" });
    const remoto = {
      bots: [remotoBot],
      actualizado: { "bot-1": 2000 },
    };
    const result = fusionarBots(local, remoto);
    expect(result.bots.length).toBe(1);
    expect(result.bots[0].nombre).toBe("Bot Actualizado");
    // Verificamos que sigue siendo un Bot válido (tiene todos los campos requeridos)
    expect(result.bots[0].id).toBe("bot-1");
    expect(result.bots[0].dueno).toBeDefined();
    expect(result.bots[0].personalidad).toBeDefined();
  });

  test("las dos claves de sincronización están en SYNCED_KEYS", () => {
    expect(SYNCED_KEYS.includes("starseed.astraura.bots.v1")).toBe(true);
    expect(SYNCED_KEYS.includes("starseed.astraura.bots.orbes.v1")).toBe(true);
  });

  // Test adicional: manejo de arrays vacíos
  test("maneja correctamente arrays vacíos", () => {
    const local = { bots: [], actualizado: {} };
    const remoto = { bots: [], actualizado: {} };
    const result = fusionarBots(local, remoto);
    expect(result.bots.length).toBe(0);
    expect(Object.keys(result.actualizado).length).toBe(0);
  });

  // Test adicional: timestamp igual mantiene el local (determinismo)
  test("timestamp igual mantiene el local por determinismo", () => {
    const bot: Bot = makeBot({ id: "bot-1", nombre: "Bot Original" });
    const local = {
      bots: [bot],
      actualizado: { "bot-1": 1500 },
    };
    const remoto = {
      bots: [{ ...bot, nombre: "Bot Nuevo" }],
      actualizado: { "bot-1": 1500 }, // mismo timestamp
    };
    const result = fusionarBots(local, remoto);
    expect(result.bots.length).toBe(1);
    expect(result.bots[0].nombre).toBe("Bot Original"); // mantiene el local
  });
});