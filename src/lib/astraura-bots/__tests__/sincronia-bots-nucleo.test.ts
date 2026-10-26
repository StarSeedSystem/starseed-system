import { describe, it, expect } from "vitest";
import { fusionarBots, type BotSync } from "../sincronia-bots";
import type { Bot } from "../tipos";

/** Bot de sincronía válido: el mismo contrato que valida `esBotValido` en el núcleo. */
function bot(id: string, actualizado: number, extra: Partial<BotSync> = {}): BotSync {
  const base: Bot = {
    id,
    nombre: `Bot ${id}`,
    dueno: { tipo: "grupo", id: `g-${id}`, cuentaId: "c1" },
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
    cuerpo: { forma: "orbe", tono: 180, escala: 1 },
    sentidosHabilitados: ["pantalla"],
    activo: true,
  };
  return { ...base, ...extra, actualizado };
}

describe("núcleo de sincronía de bots (BOT1011Y)", () => {
  it("al unir dos copias del mismo id gana la más reciente", () => {
    const local = [bot("a", 100)];
    const remota = [bot("a", 200, { nombre: "Copia nueva" })];
    const res = fusionarBots(local, remota);
    expect(res).toHaveLength(1);
    expect(res[0].nombre).toBe("Copia nueva");
    expect(res[0].actualizado).toBe(200);
  });

  it("el remoto inválido se descarta y la copia local válida se conserva", () => {
    // Sin `actualizado` numérico finito, lo remoto no es un BotSync legítimo.
    const remota = [{ ...bot("a", 1), actualizado: Number.NaN } as unknown as BotSync];
    const local = [bot("a", 50)];
    const res = fusionarBots(local, remota);
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual(local[0]);
  });

  it("el remoto inválido que no tiene copia local no entra en la fusión", () => {
    const remota = [{ ...bot("z", 1), gobierno: "tirania" } as unknown as BotSync];
    const local = [bot("a", 50)];
    expect(fusionarBots(local, remota).map((b) => b.id)).toEqual(["a"]);
  });

  it("un bot remoto nuevo y válido entra en la fusión", () => {
    const local = [bot("a", 100)];
    const remota = [bot("b", 200)];
    const res = fusionarBots(local, remota);
    expect(res.map((b) => b.id).sort()).toEqual(["a", "b"]);
  });

  it("nada válido se pierde: ids solo locales y solo remotos salen todos", () => {
    const local = [bot("l1", 1), bot("común", 10)];
    const remota = [bot("r1", 2), bot("común", 20)];
    const res = fusionarBots(local, remota);
    expect(res.map((b) => b.id).sort()).toEqual(["común", "l1", "r1"]);
    expect(res.find((b) => b.id === "común")?.actualizado).toBe(20);
  });

  it("la llegada de la misma copia es idempotente: fusionar dos veces no cambia nada", () => {
    const local = [bot("a", 100)];
    const remota = [bot("a", 100)];
    const una = fusionarBots(local, remota);
    expect(una).toEqual(fusionarBots(una, remota));
  });
});
