import { describe, it, expect } from "vitest";
import { decidirVeredicto, moderarPublicacion } from "../moderacion";
import type { Decision } from "../decisiones";

describe("decidirVeredicto", () => {
  it("limpio -> publicar", () => {
    const resp: Record<string, Decision> = {
      permitida: { tipo: "noul", valor: 0.95, probabilidades: {}, confianza: 0.95 },
    };
    const res = decidirVeredicto(resp);
    expect(res.veredicto).toBe("publicar");
    expect(res.motivos).toHaveLength(0);
    expect(res.probabilidades.permitida).toBe(0.95);
  });

  it("alta probabilidad de abuso -> rechazar", () => {
    const resp: Record<string, Decision> = {
      permitida: { tipo: "noul", valor: 0.1, probabilidades: {}, confianza: 0.9 },
    };
    const res = decidirVeredicto(resp);
    expect(res.veredicto).toBe("rechazar");
    expect(res.motivos[0]).toContain("incumplimiento");
  });

  it("zona intermedia -> revisar", () => {
    const resp: Record<string, Decision> = {
      permitida: { tipo: "noul", valor: 0.6, probabilidades: {}, confianza: 0.8 },
    };
    const res = decidirVeredicto(resp);
    expect(res.veredicto).toBe("revisar");
    expect(res.motivos[0]).toContain("revisión");
  });

  it("respuesta ilegible o incompleta -> revisar", () => {
    expect(decidirVeredicto(null).veredicto).toBe("revisar");
    expect(decidirVeredicto({}).veredicto).toBe("revisar");
    const respInvalida: Record<string, Decision> = {
      permitida: { tipo: "noul", valor: "invalido", probabilidades: {}, confianza: 0 },
    };
    expect(decidirVeredicto(respInvalida).veredicto).toBe("revisar");
  });

  it("respeta umbrales personalizados", () => {
    const resp: Record<string, Decision> = {
      permitida: { tipo: "noul", valor: 0.85, probabilidades: {}, confianza: 0.85 },
    };
    const res = decidirVeredicto(resp, { alto: 0.9, bajo: 0.3 });
    expect(res.veredicto).toBe("revisar");
  });
});

describe("moderarPublicacion (desactivado / sin red)", () => {
  it("devuelve 'revisar' con 'Jev no disponible' cuando se desactiva por env", async () => {
    const originalEnv = process.env.JEV_MODERACION;
    process.env.JEV_MODERACION = "0";
    const res = await moderarPublicacion("Hola mundo de prueba");
    expect(res.veredicto).toBe("revisar");
    expect(res.motivos).toContain("Jev no disponible");
    process.env.JEV_MODERACION = originalEnv;
  });

  it("devuelve 'revisar' si no hay texto válido", async () => {
    const res = await moderarPublicacion("");
    expect(res.veredicto).toBe("revisar");
    expect(res.motivos).toContain("Jev no disponible");
  });
});
