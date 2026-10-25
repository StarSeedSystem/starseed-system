import { describe, it, expect } from "vitest";
import { motorRecomendado } from "@/lib/aurora/catalogo-voces";
import {
  motoresPermitidos,
  type ContextoLicenciaVoz,
  type MotorInfo,
  type ResultadoPermisos,
} from "../licencia-voz";

const MOTORES: MotorInfo[] = [
  { id: "omnivoice", claseLicencia: "personal" },
  { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
  { id: "kokoro", claseLicencia: "libre" },
  { id: "indextts", claseLicencia: "condicionada", condicionCumplida: false },
];

const CONTEXTOS: ContextoLicenciaVoz[] = ["personal", "grupo", "comunidad", "publico", "comercial"];

const ids = (r: ResultadoPermisos): string[] => r.permitidos.map((m) => m.id);
const motivos = (r: ResultadoPermisos): Record<string, string> =>
  Object.fromEntries(r.excluidos.map((e) => [e.id, e.motivo]));

describe("motoresPermitidos · regla por contexto", () => {
  it("en personal, con capa de persona, entran libre, personal y condicionada cumplida", () => {
    const r = motoresPermitidos(MOTORES, "personal", { persona: "personal", comunidad: "condicionada" });
    expect(ids(r)).toEqual(["omnivoice", "supertonic", "kokoro"]);
    expect(r.excluidos.map((e) => e.id)).toEqual(["indextts"]);
  });

  for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
    it(`en ${contexto} nunca suena lo personal ni una condicionada incumplida`, () => {
      const r = motoresPermitidos(MOTORES, contexto, { persona: "personal", comunidad: "condicionada" });
      expect(ids(r)).toEqual(["supertonic", "kokoro"]);
      expect(r.excluidos.map((e) => e.id)).toEqual(["omnivoice", "indextts"]);
    });
  }

  it("comercial se comporta como público: no hereda el uso personal de la capa persona", () => {
    const capas = { persona: "personal" as const, comunidad: "condicionada" as const };
    expect(motoresPermitidos(MOTORES, "comercial", capas)).toEqual(motoresPermitidos(MOTORES, "publico", capas));
  });
});

describe("motoresPermitidos · capas y condiciones", () => {
  it("sin capas solo entra lo libre, también en contexto personal", () => {
    for (const contexto of CONTEXTOS) {
      const r = motoresPermitidos(MOTORES, contexto, {});
      expect(ids(r)).toEqual(["kokoro"]);
      expect(r.excluidos).toHaveLength(3);
    }
  });

  it("una condicionada necesita capa que la habilite y su condición cumplida", () => {
    expect(ids(motoresPermitidos(MOTORES, "grupo", {}))).not.toContain("supertonic");
    expect(ids(motoresPermitidos(MOTORES, "grupo", { grupo: "condicionada" }))).toContain("supertonic");
    expect(ids(motoresPermitidos(MOTORES, "grupo", { grupo: "condicionada" }))).not.toContain("indextts");
  });

  it("la capa de neurona puede recortar hasta dejar solo lo libre", () => {
    const r = motoresPermitidos(MOTORES, "personal", {
      persona: "personal",
      comunidad: "condicionada",
      neurona: "libre",
    });
    expect(ids(r)).toEqual(["kokoro"]);
    expect(motivos(r).omnivoice).toContain("no habilitan pesos personales");
  });
});

describe("motoresPermitidos · motivos legibles y determinismo", () => {
  it("explica en español por qué se excluye cada motor", () => {
    const r = motoresPermitidos(MOTORES, "publico", { comunidad: "condicionada" });
    expect(motivos(r).omnivoice).toBe("pesos no comerciales: solo uso personal");
    expect(motivos(r).indextts).toBe("Condición de uso no cumplida");
  });

  it("en personal sin capa de persona no dice «solo uso personal»", () => {
    const r = motoresPermitidos(MOTORES, "personal", {});
    expect(motivos(r).omnivoice).toContain("capas");
    expect(motivos(r).omnivoice).not.toContain("solo uso personal");
  });

  it("es determinista y no muta la entrada", () => {
    const copia = MOTORES.map((m) => ({ ...m }));
    const capas = { persona: "personal" as const, comunidad: "condicionada" as const };
    expect(motoresPermitidos(MOTORES, "personal", capas)).toEqual(
      motoresPermitidos(MOTORES, "personal", capas),
    );
    expect(MOTORES).toEqual(copia);
  });
});

describe("motoresPermitidos aplicado en motorRecomendado", () => {
  it("el defecto general no es un motor personal", () => {
    expect(motorRecomendado("macos", 8).claseLicencia).not.toBe("personal");
  });

  it("la capa neurona libre quita los pesos personales también en contexto personal", () => {
    const motor = motorRecomendado("macos", 8, "personal", { neurona: "libre" });
    expect(motor.claseLicencia).toBe("libre");
    expect(motor.id).not.toBe("voicemorphic");
  });

  it("en lo personal, pedido a mano, sigue entrando la voz nativa", () => {
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
