import { describe, it, expect } from "vitest";
import {
  fusionarBots,
  abiertosEnEstaNeurona,
  marcarAbierto,
  migrarAbiertosDesdeAntigua,
} from "../adaptadores/sincronia-bots";
import { fusionarBots as fusionarNucleo, type BotSync } from "../sincronia-bots";
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

describe("adaptador: fusionarBots (sobre, delega en el núcleo)", () => {
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

describe("núcleo puro: fusionarBots (decisión de quién gana)", () => {
  const sync = (b: Bot, actualizado: number): BotSync => ({ ...b, actualizado });

  it("gana el más reciente por actualizado", () => {
    const local = [sync(botEjemplo("b1"), 1000), sync(botEjemplo("b2"), 2000)];
    const remoto = [sync(botEjemplo("b1"), 2000), sync(botEjemplo("b3"), 1500)];
    const res = fusionarNucleo(local, remoto);
    expect(res.map((b) => b.id).sort()).toEqual(["b1", "b2", "b3"]);
    expect(res.find((b) => b.id === "b1")?.actualizado).toBe(2000);
  });

  it("en empate de actualizado gana lo local", () => {
    const res = fusionarNucleo([sync(botEjemplo("a"), 100)], [sync(botEjemplo("a"), 100)]);
    expect(res.find((b) => b.id === "a")?.actualizado).toBe(100);
  });

  it("lo remoto inválido se descarta y nada local se pierde", () => {
    const vicio = botEjemplo("raro");
    vicio.personalidad.calidez = 5;
    const res = fusionarNucleo([sync(botEjemplo("local"), 10)], [sync(vicio, 20)]);
    expect(res.map((b) => b.id)).toEqual(["local"]);
  });

  it("un remoto válido que no está en lo local entra", () => {
    const res = fusionarNucleo([], [sync(botEjemplo("nuevo"), 50)]);
    expect(res.map((b) => b.id)).toEqual(["nuevo"]);
  });

  it("la fusión es determinista", () => {
    const local = [sync(botEjemplo("A"), 100)];
    const remoto = [sync(botEjemplo("A"), 150)];
    expect(fusionarNucleo(local, remoto)).toEqual(fusionarNucleo(local, remoto));
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
