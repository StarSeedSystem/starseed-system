/**
 * (Ola 278 · OS1 · 2026-09-07) Tests de la función pura `interpretarPing`, que
 * decide si la fuente local de Astraura 1.58 está lista según la respuesta de
 * `/api/ping` (o, para backends anteriores, `/api/bitnet/estado`).
 */
import { describe, expect, it } from "vitest";
import { interpretarPing } from "@/ai/astraura/availability";

describe("interpretarPing", () => {
  it("ping ok ⇒ lista, sin motivo", () => {
    expect(
      interpretarPing({ ok: true, motor_local: true, dormido: false, vivo: true, version: "1.58", t: 1 })
    ).toEqual({ lista: true });
  });

  it("BitNet dormido (vivo:false && dormido:true) ⇒ lista con motivo", () => {
    const r = interpretarPing({ ok: true, dormido: true, vivo: false });
    expect(r.lista).toBe(true);
    expect(r.motivo).toMatch(/BitNet dormido/);
  });

  it("{ok:false} ⇒ no lista", () => {
    expect(interpretarPing({ ok: false })).toEqual({ lista: false });
  });

  it("basura (null, string, número, array, objeto vacío, ok no-booleano) ⇒ no lista", () => {
    expect(interpretarPing(null)).toEqual({ lista: false });
    expect(interpretarPing("hola")).toEqual({ lista: false });
    expect(interpretarPing(123)).toEqual({ lista: false });
    expect(interpretarPing([1, 2, 3])).toEqual({ lista: false });
    expect(interpretarPing({})).toEqual({ lista: false });
    expect(interpretarPing({ ok: "no" })).toEqual({ lista: false });
  });

  it("/api/bitnet/estado (sin campo ok) también se interpreta", () => {
    expect(interpretarPing({ dormido: false, vivo: true, puerto: 8000 }).lista).toBe(true);
    expect(interpretarPing({ dormido: true, vivo: false }).motivo).toMatch(/BitNet dormido/);
  });
});