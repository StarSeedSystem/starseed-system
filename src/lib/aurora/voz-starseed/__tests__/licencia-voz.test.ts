import { describe, it, expect } from "vitest";
import {
  motoresPermitidos,
  type ContextoVoz,
  type MotorVozLicencia,
} from "../licencia-voz";
import type { CapasPrefs } from "@/lib/modelos/preferencias-capas";
import { motorRecomendado } from "@/lib/aurora/catalogo-voces";

const MOTORES: MotorVozLicencia[] = [
  { id: "omnivoice", claseLicencia: "personal" },
  { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
  { id: "kokoro", claseLicencia: "libre" },
  { id: "indextts", claseLicencia: "condicionada", condicionCumplida: false },
];

const CAPAS: Record<ContextoVoz, CapasPrefs> = {
  personal: { persona: "personal", comunidad: "condicionada" },
  grupo: { grupo: "condicionada" },
  comunidad: { comunidad: "condicionada" },
  publico: { comunidad: "condicionada" },
  comercial: { comunidad: "condicionada" },
};

function ids(resultado: ReturnType<typeof motoresPermitidos>): string[] {
  return resultado.permitidos.map((m) => m.id).sort();
}

function motivo(resultado: ReturnType<typeof motoresPermitidos>, id: string): string | undefined {
  return resultado.excluidos.find((e) => e.id === id)?.motivo;
}

describe("motoresPermitidos", () => {
  it("en lo personal permite libre, personal y condicionada cumplida", () => {
    const resultado = motoresPermitidos(MOTORES, "personal", CAPAS.personal);
    expect(ids(resultado)).toEqual(["kokoro", "omnivoice", "supertonic"]);
    expect(resultado.excluidos.map((e) => e.id)).toEqual(["indextts"]);
  });

  it("en grupo, comunidad, público y comercial deja fuera lo personal", () => {
    for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
      const resultado = motoresPermitidos(MOTORES, contexto, CAPAS[contexto]);
      expect(ids(resultado)).toEqual(["kokoro", "supertonic"]);
      expect(motivo(resultado, "omnivoice")).toBe(
        "pesos no comerciales: solo uso personal"
      );
    }
  });

  it("explica que una condicionada no cumplió su condición", () => {
    const resultado = motoresPermitidos(MOTORES, "grupo", CAPAS.grupo);
    expect(motivo(resultado, "indextts")).toBe("condición de uso no cumplida");
  });

  it("comercial no hereda el uso personal aunque la capa persona lo pida", () => {
    const capas: CapasPrefs = { persona: "personal", comunidad: "condicionada" };
    const comercial = motoresPermitidos(MOTORES, "comercial", capas);
    const publico = motoresPermitidos(MOTORES, "publico", capas);
    expect(ids(comercial)).toEqual(["kokoro", "supertonic"]);
    expect(ids(publico)).toEqual(["kokoro", "supertonic"]);
    expect(ids(comercial)).toEqual(ids(publico));
  });

  it("la capa neurona manda sobre la comunidad", () => {
    const capas: CapasPrefs = { comunidad: "condicionada", neurona: "libre" };
    const resultado = motoresPermitidos(MOTORES, "comunidad", capas);
    expect(ids(resultado)).toEqual(["kokoro"]);
    expect(motivo(resultado, "supertonic")).toContain("capas");
  });

  it("una condicionada sin condición explícita tampoco entra", () => {
    const motores: MotorVozLicencia[] = [
      { id: "dudosa", claseLicencia: "condicionada" },
    ];
    const resultado = motoresPermitidos(motores, "publico", CAPAS.publico);
    expect(ids(resultado)).toEqual([]);
    expect(motivo(resultado, "dudosa")).toBe("condición de uso no cumplida");
  });

  it("no habilita lo personal por defecto en contexto personal", () => {
    const resultado = motoresPermitidos(MOTORES, "personal", {});
    expect(ids(resultado)).toEqual(["kokoro"]);
    expect(motivo(resultado, "omnivoice")).toContain("capas");
    expect(motivo(resultado, "supertonic")).toContain("capas");
  });

  it("es determinista y respeta el orden de entrada", () => {
    const uno = motoresPermitidos(MOTORES, "publico", CAPAS.publico);
    const dos = motoresPermitidos(MOTORES, "publico", CAPAS.publico);
    expect(uno).toEqual(dos);
    expect(uno.permitidos.map((m) => m.id)).toEqual(["supertonic", "kokoro"]);
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

  it("sin contexto explícito tampoco recomienda un motor personal por defecto", () => {
    expect(motorRecomendado("macos", 8).claseLicencia).not.toBe("personal");
  });
});
