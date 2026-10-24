import { describe, it, expect } from "vitest";
import { fusionarBots, type BotSync } from "../sincronia-bots";

function botSyncEjemplo(id: string, actualizado: number, nombre = `Bot ${id}`): BotSync {
  return {
    id,
    nombre,
    dueno: { tipo: "perfil", id: `perfil-${id}`, cuentaId: `cuenta-${id}` },
    origen: "astraura",
    gobierno: "jerarquico",
    personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
    cuerpo: { forma: "orbe", tono: 200, escala: 1 },
    sentidosHabilitados: ["pantalla"],
    activo: true,
    actualizado,
  };
}

/** `(id, actualizado)` con un valor inválido (el validador del núcleo debe descartarlo). */
function botInvalido(id: string, actualizado: number): BotSync {
  const b = botSyncEjemplo(id, actualizado, `Roto ${id}`);
  return { ...b, personalidad: { ...b.personalidad, calidez: 5 } };
}

describe("núcleo · fusionarBots", () => {
  it("gana el más reciente: remoto posterior sustituye; empate conserva lo local", () => {
    const l = [botSyncEjemplo("b1", 100, "local"), botSyncEjemplo("b2", 300, "solo local")];
    const r = [botSyncEjemplo("b1", 200, "remoto"), botSyncEjemplo("b3", 50, "remoto nuevo")];
    const res = fusionarBots(l, r);
    const nombres = res.map((b) => b.nombre);
    expect(nombres).toContain("remoto");
    expect(nombres).toContain("solo local");
    expect(nombres).toContain("remoto nuevo");
    expect(nombres).not.toContain("local");
  });

  it("lo remoto inválido se descarta y nada local se pierde", () => {
    const l = [botSyncEjemplo("b2", 300, "solo local")];
    const r = [botInvalido("bx", 999), botSyncEjemplo("b3", 50, "remoto nuevo")];
    const res = fusionarBots(l, r);
    expect(res.map((b) => b.id).sort()).toEqual(["b2", "b3"]);
    expect(res.map((b) => b.nombre)).not.toContain("Roto bx");
  });

  it("la fusión es determinista y también descarta el remoto vacío o sin id", () => {
    const l = [botSyncEjemplo("b1", 100, "local")];
    const rotos: unknown[] = [null, { id: 3 }, { id: "b4" }, botSyncEjemplo("b5", Number.NaN)];
    const r1 = fusionarBots(l, rotos as BotSync[]);
    const r2 = fusionarBots(l, rotos as BotSync[]);
    expect(r1).toEqual(r2);
    expect(r1.map((b) => b.id)).toEqual(["b1"]);
  });
});
