import { describe, it, expect } from "vitest";
import { motoresPermitidos, type MotorInfo } from "../licencia-voz";

describe("motoresPermitidos", () => {
  const motores: MotorInfo[] = [
    { id: "omnivoice", claseLicencia: "personal" },
    { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
    { id: "kokoro", claseLicencia: "libre" },
    { id: "indextts", claseLicencia: "condicionada", condicionCumplida: false },
  ];

  it("contexto personal permite todos los motores", () => {
    const resultado = motoresPermitidos(motores, "personal", { persona: "personal", comunidad: "condicionada" });
    expect(resultado.permitidos.map((m) => m.id).sort()).toEqual(["kokoro", "omnivoice", "supertonic"].sort());
    expect(resultado.excluidos.map((e) => e.id)).toEqual(["indextts"]);
  });

  it("contexto grupo permite libres y condicionados cumplidos", () => {
    const resultado = motoresPermitidos(motores, "grupo", { comunidad: "condicionada" });
    expect(resultado.permitidos.map((m) => m.id).sort()).toEqual(["kokoro", "supertonic"].sort());
    expect(resultado.excluidos.map((e) => e.id)).toEqual(["omnivoice", "indextts"]);
  });

  it("contexto comunidad permite libres y condicionados cumplidos", () => {
    const resultado = motoresPermitidos(motores, "comunidad", { comunidad: "condicionada" });
    expect(resultado.permitidos.map((m) => m.id).sort()).toEqual(["kokoro", "supertonic"].sort());
  });

  it("contexto publico permite solo libres y condicionados cumplidos", () => {
    const resultado = motoresPermitidos(motores, "publico", { comunidad: "condicionada" });
    expect(resultado.permitidos.map((m) => m.id).sort()).toEqual(["kokoro", "supertonic"].sort());
    const motivos = resultado.excluidos.reduce((acc, e) => ({ ...acc, [e.id]: e.motivo }), {});
    expect(motivos.omnivoice).toContain("solo uso personal");
  });

  it("contexto comercial trata igual que publico sin uso personal", () => {
    const resultado = motoresPermitidos(motores, "comercial", { comunidad: "condicionada" });
    expect(resultado.permitidos.map((m) => m.id).sort()).toEqual(["kokoro", "supertonic"].sort());
  });

  it("niega motores condicionados cuando no se cumple la condición", () => {
    const resultado = motoresPermitidos(motores, "grupo", { comunidad: "condicionada" });
    const indextts = resultado.excluidos.find((e) => e.id === "indextts");
    expect(indextts).toBeDefined();
    expect(indextts?.motivo).toBe("Condición de uso no cumplida");
  });

  it("motivo legible para motores personales en contextos no personales", () => {
    const resultado = motoresPermitidos(motores, "publico", { comunidad: "condicionada" });
    const omni = resultado.excluidos.find((e) => e.id === "omnivoice");
    expect(omni?.motivo).toBe("pesos no comerciales: solo uso personal");
  });

  it("sin la capa persona, un motor personal no entra ni en lo personal", () => {
    const resultado = motoresPermitidos(motores, "personal", {});
    const ids = resultado.permitidos.map((m) => m.id);
    expect(ids).toEqual(["kokoro"]);
    const omni = resultado.excluidos.find((e) => e.id === "omnivoice");
    expect(omni?.motivo).toBe("pesos no comerciales: solo uso personal");
  });

  it("comercial y público devuelven el mismo conjunto", () => {
    const capas = { comunidad: "condicionada" as const };
    const comercial = motoresPermitidos(motores, "comercial", capas);
    const publico = motoresPermitidos(motores, "publico", capas);
    expect(comercial.permitidos.map((m) => m.id)).toEqual(publico.permitidos.map((m) => m.id));
    expect(comercial.excluidos.map((e) => e.motivo)).toEqual(publico.excluidos.map((e) => e.motivo));
  });

  it("es determinista: dos llamadas iguales devuelven el mismo resultado", () => {
    const capas = { persona: "personal" as const, comunidad: "condicionada" as const };
    const a = motoresPermitidos(motores, "personal", capas);
    const b = motoresPermitidos(motores, "personal", capas);
    expect(a.permitidos.map((m) => m.id)).toEqual(b.permitidos.map((m) => m.id));
    expect(a.excluidos).toEqual(b.excluidos);
  });
});
