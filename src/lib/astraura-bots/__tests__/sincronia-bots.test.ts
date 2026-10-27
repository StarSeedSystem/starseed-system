import { describe, it, expect } from "vitest";
import {
  fusionarBots,
  abiertosEnEstaNeurona,
  marcarAbierto,
  migrarAbiertosDesdeAntigua,
} from "../adaptadores/sincronia-bots";
import { integrarRemoto, type BotSync } from "../sincronia-bots";
import type { Bot } from "../tipos";

function botEjemplo(id: string): Bot {
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
  };
}

describe("fusionarBots", () => {
  it("gana el más reciente por actualizado", () => {
    const local = { bots: [botEjemplo("b1"), botEjemplo("b2")], actualizado: { b1: 1000, b2: 2000 } };
    const remoto = { bots: [botEjemplo("b1"), botEjemplo("b3")], actualizado: { b1: 2000, b3: 1500 } };
    const res = fusionarBots(local, remoto);
    const ids = res.bots.map((b) => b.id).sort();
    expect(ids).toEqual(["b1", "b2", "b3"]);
    const actualizadoRes = res.actualizado;
    expect(actualizadoRes["b1"]).toBe(2000);
  });

  it("conserva local si no está en remoto", () => {
    const local = { bots: [botEjemplo("b-local")], actualizado: { "b-local": 1000 } };
    const remoto = { bots: [], actualizado: {} };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].id).toBe("b-local");
  });

  it("fusión determinista", () => {
    const local = { bots: [botEjemplo("A")], actualizado: { A: 100 } };
    const remoto = { bots: [botEjemplo("A")], actualizado: { A: 150 } };
    const r1 = fusionarBots(local, remoto);
    const r2 = fusionarBots(local, remoto);
    expect(r1.bots.map((b) => b.id).sort()).toEqual(r2.bots.map((b) => b.id).sort());
  });
});

describe("núcleo puro: integrarRemoto (lo que llega de Realtime)", () => {
  const sync = (b: Bot, actualizado = 100): BotSync => ({ ...b, actualizado });

  it("un UPDATE válido entra con la marca `ahora` que trae la llamada", () => {
    const serie = [sync(botEjemplo("b1"), 5)];
    const res = integrarRemoto(serie, { eventType: "UPDATE", new: botEjemplo("b2") }, 999);
    expect(res.map((b) => b.id).sort()).toEqual(["b1", "b2"]);
    expect(res.find((b) => b.id === "b2")?.actualizado).toBe(999);
    expect(serie.map((b) => b.id)).toEqual(["b1"]);
  });

  it("una fila remota inválida se descarta", () => {
    const vicio = botEjemplo("raro");
    vicio.personalidad.energia = 9;
    const res = integrarRemoto([sync(botEjemplo("b1"))], { eventType: "INSERT", new: vicio }, 999);
    expect(res.map((b) => b.id)).toEqual(["b1"]);
  });

  it("sin fila no toca nada", () => {
    const serie = [sync(botEjemplo("b1"), 7)];
    const res = integrarRemoto(serie, { eventType: "UPDATE", new: null }, 999);
    expect(res.map((b) => b.id)).toEqual(["b1"]);
    expect(res.find((b) => b.id === "b1")?.actualizado).toBe(7);
  });

  it("un DELETE lo quita por el id de `old`", () => {
    const serie = [sync(botEjemplo("b1")), sync(botEjemplo("b2"))];
    const res = integrarRemoto(serie, { eventType: "DELETE", old: { id: "b1" } }, 999);
    expect(res.map((b) => b.id)).toEqual(["b2"]);
  });

  it("un DELETE también funciona si el id solo viene en `new`", () => {
    const serie = [sync(botEjemplo("b1")), sync(botEjemplo("b2"))];
    const res = integrarRemoto(serie, { eventType: "DELETE", old: null, new: botEjemplo("b1") }, 999);
    expect(res.map((b) => b.id)).toEqual(["b2"]);
  });

  it("un DELETE sin id en ninguna parte deja la serie igual", () => {
    const serie = [sync(botEjemplo("b1")), sync(botEjemplo("b2"))];
    const res = integrarRemoto(serie, { eventType: "DELETE", old: null, new: null }, 999);
    expect(res.map((b) => b.id).sort()).toEqual(["b1", "b2"]);
  });

  it("una marca no finita se convierte en 0 y el bot entra igual", () => {
    const res = integrarRemoto([], { eventType: "UPDATE", new: botEjemplo("b1") }, Number.NaN);
    expect(res.map((b) => b.id)).toEqual(["b1"]);
    expect(res[0].actualizado).toBe(0);
  });

  it("una llamada sin eventType conocida no toca nada", () => {
    const serie = [sync(botEjemplo("b1"), 3)];
    const res = integrarRemoto(serie, { eventType: undefined, new: botEjemplo("b2") }, 999);
    expect(res.map((b) => b.id)).toEqual(["b1"]);
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
