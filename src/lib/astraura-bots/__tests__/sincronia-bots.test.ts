// jsdom: los adaptadores de abiertos/migración leen `window.localStorage`;
// en entorno `node` (el predeterminado de este repo) window no existe y sus
// pruebas se saltan el código real por la guardia `typeof window`.
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  fusionarBots,
  abiertosEnEstaNeurona,
  marcarAbierto,
  migrarAbiertosDesdeAntigua,
} from "../adaptadores/sincronia-bots";
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

const CLAVE_ANTIGUA = "starseed.astraura.bots.abiertos.v1";
const CLAVE_NUEVA = "starseed.astraura.orbes-abiertos";

function limpiarAbiertos(): void {
  window.localStorage.removeItem(CLAVE_ANTIGUA);
  window.localStorage.removeItem(CLAVE_NUEVA);
}

describe("abiertos y migración: casos rescatados de la rama de la nube", () => {
  it("devuelve un array vacío si lo guardado en la clave nueva no es un array", () => {
    limpiarAbiertos();
    window.localStorage.setItem(CLAVE_NUEVA, '{"no": "es un array"}');
    expect(abiertosEnEstaNeurona()).toEqual([]);
  });

  it("no añade el mismo bot dos veces", () => {
    limpiarAbiertos();
    marcarAbierto("bot-dup", true);
    marcarAbierto("bot-dup", true);
    expect(abiertosEnEstaNeurona()).toEqual(["bot-dup"]);
  });

  it("al quitar un bot conserva los demás abiertos", () => {
    limpiarAbiertos();
    marcarAbierto("bot-uno", true);
    marcarAbierto("bot-dos", true);
    marcarAbierto("bot-uno", false);
    expect(abiertosEnEstaNeurona()).toEqual(["bot-dos"]);
  });

  it("quitar un bot que no estaba abierto no rompe nada", () => {
    limpiarAbiertos();
    marcarAbierto("bot-ausente", false);
    expect(abiertosEnEstaNeurona()).toEqual([]);
  });

  it("migrar sin clave antigua no crea la clave nueva", () => {
    limpiarAbiertos();
    migrarAbiertosDesdeAntigua();
    expect(window.localStorage.getItem(CLAVE_NUEVA)).toBeNull();
  });

  it("migrar combina lo antiguo con lo que ya hay en la clave nueva", () => {
    limpiarAbiertos();
    window.localStorage.setItem(CLAVE_ANTIGUA, JSON.stringify(["antiguo-1", "antiguo-2"]));
    window.localStorage.setItem(CLAVE_NUEVA, JSON.stringify(["ya-abierto"]));
    migrarAbiertosDesdeAntigua();
    const res = JSON.parse(window.localStorage.getItem(CLAVE_NUEVA) ?? "[]");
    expect(res).toEqual(expect.arrayContaining(["ya-abierto", "antiguo-1", "antiguo-2"]));
    expect(res).toHaveLength(3);
  });

  it("migrar ignora una clave antigua que no es un array", () => {
    limpiarAbiertos();
    const basura = '{"no": "es un array"}';
    window.localStorage.setItem(CLAVE_ANTIGUA, basura);
    migrarAbiertosDesdeAntigua();
    expect(window.localStorage.getItem(CLAVE_ANTIGUA)).toBe(basura);
    expect(window.localStorage.getItem(CLAVE_NUEVA)).toBeNull();
  });
});
