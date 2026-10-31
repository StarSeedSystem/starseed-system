import { describe, it, expect } from "vitest";
import { type Bot } from "@/lib/astraura-bots/tipos";
import { bloqueTono, preferenciasPersona } from "@/lib/astraura-bots/adaptadores/tono-chat";

describe("tono-chat.ts - módulo tono del bot", () => {
  const mockBot: Bot = {
    id: "astraura:test",
    nombre: "Astraura",
    dueno: { tipo: "perfil", id: "test", cuentaId: "test" },
    origen: "astraura",
    gobierno: "jerarquico",
    personalidad: { calidez: 0.8, energia: 0.5, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.5 },
    cuerpo: { forma: "orbe", tono: 200, escala: 1 },
    sentidosHabilitados: ["pantalla", "red"],
    activo: true,
    voz: undefined,
  };

  it("genera un bloque tono con el bot predeterminado sin agente", () => {
    const bloque = bloqueTono(mockBot);
    expect(bloque).toContain("TONO DEL BOT:");
    expect(bloque).toContain("Limites honestos:");
    expect(bloque).toContain("Calidez alta");
    expect(bloque).toContain("energía media");
    expect(bloque).toContain("formalidad baja");
    expect(bloque).toContain("Curiosidad alta");
    expect(bloque).toContain("humor media");
    expect(bloque).toContain("brevedad media");
  });

  it("aplica los rasgos de la persona a la mezcla", () => {
    const bloque = bloqueTono(mockBot);
    expect(bloque).toContain("Calidez alta");
    expect(bloque).toContain("energía media");
  });

  it("devuelve un bloque tono ≤ 6 líneas", () => {
    const bloque = bloqueTono(mockBot);
    const lineas = bloque.split("\n");
    expect(lineas.length).toBeLessThanOrEqual(6);
  });
});
