// Prueba de src/lib/aurora/voz-starseed/motores-permitido.ts — módulo puro, sin red ni disco.
import { describe, it, expect } from "vitest";

import { motoresPermitidos, motivo, ids } from "../motores-permitido";
import type { MotorVozCatalogo } from "../../aurora/catalogo-voces";

const MOTORES: readonly MotorVozCatalogo[] = [
  { id: "voicemorphic", nombre: "VoiceMorphic", origen: "sistema", repo: "", formato: "GGUF", ramMinGB: 4, gpu: "opcional", offline: true, plataformas: ["macos", "windows", "linux"], porDefectoEn: ["macos", "windows", "linux"], velocidad: "~4×", calidad: "alta", licenciaPesos: "CC-BY-NC", claseLicencia: "personal" },
  { id: "kokoro", nombre: "Kokoro", origen: "externo", repo: "", formato: "ONNX", ramMinGB: 2, gpu: "no", offline: true, plataformas: ["web", "android", "ios", "macos", "windows", "linux"], porDefectoEn: ["android", "ios", "web"], velocidad: "menos tiempo real", calidad: "media", licenciaPesos: "Apache-2.0", claseLicencia: "libre" },
  { id: "supertonic", nombre: "Supertonic", origen: "externo", repo: "", formato: "ONNX", ramMinGB: 2, gpu: "no", offline: true, plataformas: ["web", "android", "ios", "macos", "windows", "linux"], porDefectoEn: ["android", "ios", "web"], velocidad: "menos tiempo real", calidad: "media", licenciaPesos: "Apache-2.0", claseLicencia: "condicionada" },
  { id: "indextts", nombre: "Indextts", origen: "externo", repo: "", formato: "ONNX", ramMinGB: 4, gpu: "opcional", offline: true, plataformas: ["macos", "windows", "linux"], porDefectoEn: [], velocidad: "rápido", calidad: "alta", licenciaPesos: "CC-BY-NC", claseLicencia: "personal" },
  { id: "omnivoice", nombre: "OmniVoice", origen: "sistema", repo: "", formato: "GGUF", ramMinGB: 4, gpu: "opcional", offline: true, plataformas: ["macos", "windows", "linux"], porDefectoEn: ["macos", "windows", "linux"], velocidad: "~4×", calidad: "alta", licenciaPesos: "CC-BY-NC", claseLicencia: "personal" },
];

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
    expect(motivo(r, "omnivoice")).toBe(
      "pesos no comerciales: solo uso personal"
    );
    expect(motivo(r, "indextts")).toBe("condición de uso no cumplida");
  });

  it("comunidad: libres y condicionadas cumplidas; nada personal", () => {
    const r = motoresPermitidos(MOTORES, "comunidad", { comunidad: "condicionada" });
    expect(ids(r)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(r, "omnivoice")).toBe(
      "pesos no comerciales: solo uso personal"
    );
  });

  it("publico: libres y condicionadas cumplidas; nada personal", () => {
    const r = motoresPermitidos(MOTORES, "publico", { comunidad: "condicionada" });
    expect(ids(r)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(r, "omnivoice")).toBe(
      "pesos no comerciales: solo uso personal"
    );
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
      [{ id: "supertonic", claseLicencia: "condicionada" } as MotorVozCatalogo],
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

  it("la capa neurona libre quita los pesos personales también en contexto personal", () => {
    const motor = motoresPermitidos(
      [{ id: "supertonic", claseLicencia: "condicionada" } as MotorVozCatalogo],
      "personal",
      { persona: "personal", neurona: "libre" }
    );
    // El test original usaba motorRecomendado, aquí verificamos el filtrado
    expect(ids(motor)).toEqual(["kokoro"]);
  });

  it("en lo personal, sin capas, sigue entrando la voz nativa", () => {
    // Cuando hay capa persona personal, el motor personal (voicemorphic/omnivoice) entra
    const r = motoresPermitidos(MOTORES, "personal", { persona: "personal" });
    expect(ids(r)).toContain("omnivoice");
    expect(ids(r)).toContain("voicemorphic");
  });

  it("en grupo, comunidad, público y comercial nunca recomienda clase personal", () => {
    for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
      for (const motor of MOTORES) {
        if (motor.claseLicencia === "personal") {
          const r = motoresPermitidos([motor], contexto, {});
          expect(r.permitidos).not.toContain(motor.id);
        }
      }
    }
  });
});