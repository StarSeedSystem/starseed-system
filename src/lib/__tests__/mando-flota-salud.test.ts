import { describe, expect, it } from "vitest";
import { interpretarSalud } from "../mando/modelos-disponibles";

describe("interpretarSalud (Ola 269 · salud viva de revisores)", () => {
  it("extrae sin cupo futuro, último 429 y último revisor que respondió", () => {
    const salida = interpretarSalud({
      xkiro: {
        estado: "caido",
        t: "2026-09-07 10:00:00",
        sin_cupo_hasta: "2026-09-07 23:59:00",
        motivo: "cuota diaria agotada",
        ultimo_429: "2026-09-07 09:55:00",
      },
      nim: { estado: "vivo", t: "2026-09-07 10:00:00" },
      ultimo_revisor_ok: "aihubmix/coding-glm-5.3-free",
    });
    expect(salida.ultimoRevisorOk).toBe("aihubmix/coding-glm-5.3-free");
    expect(salida.porProveedor.xkiro).toEqual({
      estado: "caido",
      sinCupoHasta: "2026-09-07 23:59:00",
      motivo: "cuota diaria agotada",
      ultimo429: "2026-09-07 09:55:00",
    });
    expect(salida.porProveedor.nim).toEqual({
      estado: "vivo",
      sinCupoHasta: null,
      motivo: null,
      ultimo429: null,
    });
    // La clave global nunca aparece como si fuera un proveedor.
    expect(salida.porProveedor["ultimo_revisor_ok"]).toBeUndefined();
  });

  it("entrada vacía o deforme → todo a null sin lanzar", () => {
    const vacio = { porProveedor: {}, ultimoRevisorOk: null };
    expect(interpretarSalud(null)).toEqual(vacio);
    expect(interpretarSalud({})).toEqual(vacio);
    expect(interpretarSalud("no-es-json-valido")).toEqual(vacio);
    expect(interpretarSalud(42)).toEqual(vacio);
    // Proveedor con valor que no es objeto: se ignora.
    expect(interpretarSalud({ nim: "roto", ultimo_revisor_ok: 7 })).toEqual(vacio);
  });
});
