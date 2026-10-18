import { describe, expect, it } from "vitest";
import { fusionarBots } from "../sincronia-bots";

describe("fusionar-bots · adaptadores", () => {
  it("devuelve vacío con listas vacías", () => {
    const res = fusionarBots({ bots: [], actualizado: {} }, { bots: [], actualizado: {} });
    expect(res.bots).toEqual([]);
    expect(res.actualizado).toEqual({});
  });

  it("fusiona sin conflicto: remoto gana por timestamp", () => {
    const botLocal: Bot = { id: "a", nombre: "a1", dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" }, origen: "astraura", gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 180, escala: 1 }, sentidosHabilitados: ["pantalla"], activo: true };
    const local = { bots: [botLocal], actualizado: { a: 1 } };
    const botRemoto = { ...botLocal, nombre: "a2" };
    const remoto = { bots: [botRemoto], actualizado: { a: 2 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots.length).toBe(1);
    expect(res.bots[0].nombre).toBe("a2");
    expect(res.actualizado.a).toBe(2);
  });

  it("fusiona con conflicto: local gana si es más reciente", () => {
    const botLocal: Bot = { id: "b", nombre: "b1", dueno: { tipo: "grupo", id: "g1", cuentaId: "c1" }, origen: "astraura", gobierno: "democratico", personalidad: { calidez: 0.2, energia: 0.8, formalidad: 0.3, curiosidad: 0.7, humor: 0.4, concision: 0.6 }, cuerpo: { forma: "avatar-2d", tono: 200, escala: 1.2 }, sentidosHabilitados: ["red"], activo: false };
    const local = { bots: [botLocal], actualizado: { b: 10 } };
    const botRemoto = { ...botLocal, nombre: "b0" };
    const remoto = { bots: [botRemoto], actualizado: { b: 5 } };
    const res = fusionarBots(local, remoto);
    expect(res.bots[0].nombre).toBe("b1");
    expect(res.actualizado.b).toBe(10);
  });
});