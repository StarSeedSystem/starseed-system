import { describe, expect, it } from "vitest";
import { planInvitar, TEXTO_LIMITES } from "../grupo-invitar";

const u = (id: string) => ({ id, nombre: id, clase: "usuario" as const });

describe("invitar a una llamada (LLA1108C)", () => {
  it("de 1:1 a grupo, explicando los límites", () => {
    const p = planInvitar({ actuales: 2, conVideo: false, invitar: [u("a"), u("b")] });
    expect(p).toMatchObject({ total: 4, pasaAGrupo: true, degradaVideo: false });
    expect(p.texto).toContain(TEXTO_LIMITES);
  });
  it("con vídeo, más de 4 degrada a voz", () => {
    const p = planInvitar({ actuales: 2, conVideo: true, invitar: [u("a"), u("b"), u("c")] });
    expect(p.total).toBe(5);
    expect(p.degradaVideo).toBe(true);
    expect(p.texto).toMatch(/solo voz/);
  });
  it("tope de 6: el resto queda fuera con motivo; duplicados se ignoran", () => {
    const p = planInvitar({ actuales: 5, conVideo: false, invitar: [u("a"), u("a"), u("b")] });
    expect(p.entran.map((x) => x.id)).toEqual(["a"]);
    expect(p.fuera).toHaveLength(1);
    expect(p.total).toBe(6);
  });
  it("un grupo que no cabe entero no entra a medias", () => {
    const p = planInvitar({ actuales: 2, conVideo: false, invitar: [{ id: "g", nombre: "Equipo", clase: "grupo", miembros: 5 }, u("x")] });
    expect(p.entran.map((x) => x.id)).toEqual(["x"]);
    expect(p.fuera[0].motivo).toMatch(/Equipo/);
  });
});
