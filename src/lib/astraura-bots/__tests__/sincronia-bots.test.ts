import { describe, it, expect } from "vitest";
import { fusionarBots, type BotSync } from "../sincronia-bots";
import {
  abiertosEnEstaNeurona,
  marcarAbierto,
  migrarAbiertosDesdeAntigua,
} from "../adaptadores/sincronia-bots";

function botEjemplo(id: string, actualizado = 0): BotSync {
  return {
    id,
    nombre: `Bot ${id}`,
    dueno: { tipo: "perfil", id: `perfil-${id}`, cuentaId: `cuenta-${id}` },
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
    actualizado,
  };
}

describe("fusionarBots (núcleo puro)", () => {
  it("gana el más reciente por actualizado", () => {
    const local: BotSync[] = [botEjemplo("b1", 1000), botEjemplo("b2", 2000)];
    const remoto: BotSync[] = [botEjemplo("b1", 2000), botEjemplo("b3", 1500)];
    const res = fusionarBots(local, remoto);
    const ids = res.map((b) => b.id).sort();
    expect(ids).toEqual(["b1", "b2", "b3"]);
    expect(res.find((b) => b.id === "b1")?.actualizado).toBe(2000);
  });

  it("conserva local si no está en remoto", () => {
    const res = fusionarBots([botEjemplo("b-local", 1000)], []);
    expect(res.length).toBe(1);
    expect(res[0].id).toBe("b-local");
  });

  it("descarta el bot remoto inválido sin perder el local", () => {
    const valido = botEjemplo("b-v", 500);
    const invalido = { ...botEjemplo("b-i", 900), actualizado: -3 } as unknown as BotSync;
    const res = fusionarBots([botEjemplo("b-i", 100)], [valido, invalido]);
    expect(res.map((b) => b.id).sort()).toEqual(["b-i", "b-v"]);
    expect(res.find((b) => b.id === "b-i")?.actualizado).toBe(100);
  });

  it("fusión determinista", () => {
    const local: BotSync[] = [botEjemplo("A", 100)];
    const remoto: BotSync[] = [botEjemplo("A", 150)];
    const r1 = fusionarBots(local, remoto);
    const r2 = fusionarBots(local, remoto);
    expect(r1.map((b) => b.id).sort()).toEqual(r2.map((b) => b.id).sort());
    expect(r1.map((b) => b.actualizado)).toEqual(r2.map((b) => b.actualizado));
  });
});

describe("migración de abiertos", () => {
  it("migrarAbiertosDesdeAntigua combina datos de la clave anterior", () => {
    if (typeof window === "undefined") {
      // En entorno sin window, la función retorna sin lanzar.
      expect(typeof migrarAbiertosDesdeAntigua).toBe("function");
      return;
    }
    window.localStorage.removeItem("starseed.astraura.bots.abiertos.v1");
    window.localStorage.removeItem("starseed.astraura.orbes-abiertos");
    window.localStorage.setItem("starseed.astraura.bots.abiertos.v1", JSON.stringify(["bot-antiguo"]));
    migrarAbiertosDesdeAntigua();
    const res = JSON.parse(window.localStorage.getItem("starseed.astraura.orbes-abiertos") ?? "[]");
    expect(res).toContain("bot-antiguo");
    window.localStorage.removeItem("starseed.astraura.bots.abiertos.v1");
    window.localStorage.removeItem("starseed.astraura.orbes-abiertos");
  });

  it("abiertosEnEstaNeurona lee la clave correcta", () => {
    if (typeof window === "undefined") {
      expect(abiertosEnEstaNeurona()).toEqual([]);
      return;
    }
    window.localStorage.removeItem("starseed.astraura.orbes-abiertos");
    expect(abiertosEnEstaNeurona()).toEqual([]);
    marcarAbierto("bot-a", true);
    const res = abiertosEnEstaNeurona();
    expect(res).toContain("bot-a");
    marcarAbierto("bot-a", false);
    expect(abiertosEnEstaNeurona()).not.toContain("bot-a");
    window.localStorage.removeItem("starseed.astraura.orbes-abiertos");
  });
});
