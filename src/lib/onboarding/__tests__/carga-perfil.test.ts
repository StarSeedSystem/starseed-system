import { describe, it, expect } from "vitest";
import {
  AVISO_CARGA_PERFIL_INDISPONIBLE,
  AVISO_CARGA_PERFIL_RED,
  describirFalloCargaPerfil,
} from "@/lib/onboarding/carga-perfil";

describe("describirFalloCargaPerfil", () => {
  it("trata un error de transporte como red y deja editar desde cero", () => {
    const r = describirFalloCargaPerfil(new TypeError("Failed to fetch"));
    expect(r.tipo).toBe("red");
    expect(r.aviso).toBe(AVISO_CARGA_PERFIL_RED);
    expect(r.diagnostico).toContain("(red)");
    expect(r.diagnostico).toContain("Failed to fetch");
    expect(r.diagnostico).toContain("[perfil]");
  });

  it("trata una respuesta HTTP 5xx como indisponibilidad", () => {
    const error = Object.assign(new Error("Internal Server Error"), { status: 500 });
    const r = describirFalloCargaPerfil(error);
    expect(r.tipo).toBe("indisponible");
    expect(r.aviso).toBe(AVISO_CARGA_PERFIL_INDISPONIBLE);
    expect(r.diagnostico).toContain("(indisponible)");
  });

  it("trata un error de PostgREST (code, sin status) como indisponibilidad", () => {
    const r = describirFalloCargaPerfil({
      code: "PGRST301",
      message: "JWT expired",
      details: "",
      hint: "",
    });
    expect(r.tipo).toBe("indisponible");
    expect(r.aviso).toBe(AVISO_CARGA_PERFIL_INDISPONIBLE);
    expect(r.diagnostico).toContain("JWT expired");
  });

  it("acepta un error en texto plano sin romper el diagnóstico", () => {
    const r = describirFalloCargaPerfil("sin sesión");
    expect(r.tipo).toBe("red");
    expect(r.diagnostico).toContain("sin sesión");
  });

  it("no deja un separador colgando cuando el error no trae mensaje", () => {
    const r = describirFalloCargaPerfil(null);
    expect(r.tipo).toBe("red");
    expect(r.diagnostico).toBe("[perfil] no se pudo cargar el perfil (red)");
  });

  it("recorta mensajes larguísimos para no ensuciar la consola", () => {
    const r = describirFalloCargaPerfil(new Error("x".repeat(500)));
    expect(r.diagnostico.length).toBeLessThanOrEqual(260);
    expect(r.diagnostico).toContain("x".repeat(200));
    expect(r.diagnostico).not.toContain("x".repeat(201));
  });

  it("nunca deja el perfil bloqueado: el aviso siempre invita a rellenarlo", () => {
    for (const fallo of [new Error("boom"), { status: 503 }, { code: "PGRST000" }, null]) {
      const r = describirFalloCargaPerfil(fallo);
      expect(r.aviso).toContain("rellenarlo desde cero");
      expect(r.aviso.length).toBeGreaterThan(0);
    }
  });
});
