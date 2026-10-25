import { describe, it, expect } from "vitest";
import { motorRecomendado } from "@/lib/aurora/catalogo-voces";
import { motoresPermitidos, type MotorInfo } from "../licencia-voz";

const MOTORES: MotorInfo[] = [
  { id: "omnivoice", claseLicencia: "personal" },
  { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
  { id: "kokoro", claseLicencia: "libre" },
  { id: "indextts", claseLicencia: "condicionada", condicionCumplida: false },
];

const ids = (r: ReturnType<typeof motoresPermitidos>) => r.permitidos.map((m) => m.id);
const motivo = (r: ReturnType<typeof motoresPermitidos>, id: string) =>
  r.excluidos.find((e) => e.id === id)?.motivo;

describe("motoresPermitidos", () => {
  it("personal con sus capas: entran personal, condicionada cumplida y libre", () => {
    const r = motoresPermitidos(MOTORES, "personal", {
      persona: "personal",
      comunidad: "condicionada",
    });
    expect(ids(r)).toEqual(["omnivoice", "supertonic", "kokoro"]);
    expect(r.excluidos).toEqual([{ id: "indextts", motivo: "condición de uso no cumplida" }]);
  });

  it("personal sin capa de condicionada: la condicionada no entra aunque se cumpla", () => {
    const r = motoresPermitidos(MOTORES, "personal", { persona: "personal" });
    expect(ids(r)).toEqual(["omnivoice", "kokoro"]);
    expect(motivo(r, "supertonic")).toBe(
      "licencia condicionada sin autorización en el contexto personal"
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

  it("público: libres y condicionadas cumplidas; nada personal", () => {
    const r = motoresPermitidos(MOTORES, "publico", { comunidad: "condicionada" });
    expect(ids(r)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(r, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
  });

  it("comercial se comporta igual que público, incluso con capa persona personal", () => {
    const capas = { persona: "personal", comunidad: "condicionada" } as const;
    const comercial = motoresPermitidos(MOTORES, "comercial", capas);
    const publico = motoresPermitidos(MOTORES, "publico", capas);
    expect(comercial).toEqual(publico);
    expect(ids(comercial)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(comercial, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
  });

  it("sin capas: solo libre, nunca personal por defecto", () => {
    for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
      const r = motoresPermitidos(MOTORES, contexto, {});
      expect(ids(r)).toEqual(["kokoro"]);
    }
  });

  it("la capa neurona restrictiva quita la condicionada aunque la comunidad la autorice", () => {
    const r = motoresPermitidos(MOTORES, "publico", {
      comunidad: "condicionada",
      neurona: "libre",
    });
    expect(ids(r)).toEqual(["kokoro"]);
    expect(motivo(r, "supertonic")).toContain("sin autorización");
  });

  it("la capa neurona puede quitar el uso personal y el motivo lo dice", () => {
    const r = motoresPermitidos(MOTORES, "personal", {
      persona: "personal",
      neurona: "libre",
    });
    expect(ids(r)).toEqual(["kokoro"]);
    expect(motivo(r, "omnivoice")).toBe(
      "la capa de la neurona no admite pesos de uso personal"
    );
  });

  it("condición ausente equivale a no cumplida (solo entra con true explícito)", () => {
    const r = motoresPermitidos(
      [{ id: "supertonic", claseLicencia: "condicionada" }],
      "grupo",
      { grupo: "condicionada" }
    );
    expect(r.permitidos).toEqual([]);
    expect(r.excluidos).toEqual([
      { id: "supertonic", motivo: "condición de uso no cumplida" },
    ]);
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

describe("motoresPermitidos aplicado en motorRecomendado", () => {
  it("la capa neurona libre quita los pesos personales también en contexto personal", () => {
    const motor = motorRecomendado("macos", 8, "personal", { neurona: "libre" });
    expect(motor.claseLicencia).toBe("libre");
    expect(motor.id).not.toBe("voicemorphic");
  });

  it("en lo personal, sin capas, sigue entrando la voz nativa", () => {
    expect(motorRecomendado("macos", 8, "personal").id).toBe("voicemorphic");
  });

  it("en grupo, comunidad, público y comercial nunca recomienda clase personal", () => {
    for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
      for (const plataforma of ["macos", "windows", "linux", "android", "ios", "web"] as const) {
        expect(motorRecomendado(plataforma, 16, contexto).claseLicencia).not.toBe("personal");
      }
    }
  });
});
