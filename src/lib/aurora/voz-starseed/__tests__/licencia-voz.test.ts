import { describe, it, expect } from "vitest";
import {
  motoresPermitidos,
  type MotorVozLicencia,
  type PermisosVoz,
} from "../licencia-voz";

const MOTORES: MotorVozLicencia[] = [
  { id: "omnivoice", claseLicencia: "personal" },
  { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
  { id: "kokoro", claseLicencia: "libre" },
  { id: "indextts", claseLicencia: "condicionada", condicionCumplida: false },
];

const ids = (r: PermisosVoz): string[] => r.permitidos.map((m) => m.id);
const motivo = (r: PermisosVoz, id: string): string | undefined =>
  r.excluidos.find((e) => e.id === id)?.motivo;

describe("motoresPermitidos · licencia por contexto", () => {
  it("personal con capas persona y comunidad: entran personal, condicionada cumplida y libre", () => {
    const r = motoresPermitidos(MOTORES, "personal", {
      persona: "personal",
      comunidad: "condicionada",
    });
    expect(ids(r)).toEqual(["omnivoice", "supertonic", "kokoro"]);
    expect(r.excluidos).toEqual([
      { id: "indextts", motivo: "condición de uso no cumplida" },
    ]);
  });

  it("personal sin capa persona: los pesos personales no entran por defecto", () => {
    const r = motoresPermitidos(MOTORES, "personal", { comunidad: "condicionada" });
    expect(ids(r)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(r, "omnivoice")).toBe(
      "requiere autorización de la capa personal"
    );
  });

  it("grupo: libres y condicionadas cumplidas; nada personal", () => {
    const r = motoresPermitidos(MOTORES, "grupo", { grupo: "condicionada" });
    expect(ids(r)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(r, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
    expect(motivo(r, "indextts")).toBe("condición de uso no cumplida");
  });

  it("comunidad: libres y condicionadas cumplidas; nada personal", () => {
    const r = motoresPermitidos(MOTORES, "comunidad", { comunidad: "condicionada" });
    expect(ids(r)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(r, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
  });

  it("publico: libres y condicionadas cumplidas; nada personal", () => {
    const r = motoresPermitidos(MOTORES, "publico", { comunidad: "condicionada" });
    expect(ids(r)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(r, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
  });

  it("comercial se comporta igual que público aunque haya capa persona", () => {
    const capas = { persona: "personal", comunidad: "condicionada" } as const;
    const comercial = motoresPermitidos(MOTORES, "comercial", capas);
    const publico = motoresPermitidos(MOTORES, "publico", capas);
    expect(comercial).toEqual(publico);
    expect(ids(comercial)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(comercial, "omnivoice")).toBe(
      "pesos no comerciales: solo uso personal"
    );
  });

  it("sin capas: solo libre, nunca personal por defecto", () => {
    for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
      const r = motoresPermitidos(MOTORES, contexto, {});
      expect(ids(r)).toEqual(["kokoro"]);
      expect(motivo(r, "supertonic")).toContain("sin autorización");
    }
  });

  it("la capa neurona libre quita la condicionada aunque la comunidad la autorice", () => {
    const r = motoresPermitidos(MOTORES, "publico", {
      comunidad: "condicionada",
      neurona: "libre",
    });
    expect(ids(r)).toEqual(["kokoro"]);
    expect(motivo(r, "supertonic")).toContain("sin autorización");
  });

  it("la capa neurona libre quita el uso personal y el motivo lo dice", () => {
    const r = motoresPermitidos(MOTORES, "personal", {
      persona: "personal",
      neurona: "libre",
    });
    expect(ids(r)).toEqual(["kokoro"]);
    expect(motivo(r, "omnivoice")).toBe(
      "la capa de la neurona no admite pesos de uso personal"
    );
  });

  it("condición ausente equivale a no cumplida", () => {
    const r = motoresPermitidos(
      [{ id: "supertonic", claseLicencia: "condicionada" }],
      "personal",
      { persona: "personal", comunidad: "condicionada" }
    );
    expect(r.permitidos).toEqual([]);
    expect(motivo(r, "supertonic")).toBe("condición de uso no cumplida");
  });

  it("es determinista y conserva el orden de entrada", () => {
    const capas = { persona: "personal", comunidad: "condicionada" } as const;
    const a = motoresPermitidos(MOTORES, "personal", capas);
    const b = motoresPermitidos(MOTORES, "personal", capas);
    expect(a).toEqual(b);
    const inversos = motoresPermitidos([...MOTORES].reverse(), "personal", capas);
    expect(ids(inversos)).toEqual(["kokoro", "supertonic", "omnivoice"]);
  });
});
