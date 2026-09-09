/**
 * (Ola 302 · zAU2) Tests de la capa de VIABILIDAD LOCAL del motor 1.58
 * (`src/ai/astraura/viabilidad-local.ts`), distinta de la salud: la medición
 * real de la Mac de Alex (8 GB, 59 MB libres, 11,5 GB de swap) daba health
 * «online» en 0,1 s mientras `/completion` no producía 32 tokens en 4 minutos.
 */
import { describe, expect, it } from "vitest";
import {
  evaluarViabilidad,
  presupuestoPrimerToken,
  type MedidaLocal,
  MEMORIA_MINIMA_MB,
  TPS_MINIMO,
} from "@/ai/astraura/viabilidad-local";

describe("evaluarViabilidad", () => {
  it("tok/s alto y memoria holgada ⇒ viable, sin enfriamiento", () => {
    // 40 tokens en 4 s = 10 tok/s, 2048 MB libres.
    const v = evaluarViabilidad({ tokens: 40, ms: 4000, memoriaLibreMb: 2048 });
    expect(v.viable).toBe(true);
    expect(v.enfriarMinutos).toBe(0);
    expect(v.tokensPorSegundo).toBeCloseTo(10, 5);
    expect(v.motivo).toContain("10 tokens/s");
  });

  it("tok/s bajo (medición real de la Mac: 32 tokens en 4 min) ⇒ NO viable, motivo honesto con la cifra, 10 min de enfriado", () => {
    // 32 tokens en 240 000 ms ≈ 0,133 tok/s.
    const v = evaluarViabilidad({ tokens: 32, ms: 240000, memoriaLibreMb: 2048 });
    expect(v.viable).toBe(false);
    expect(v.enfriarMinutos).toBe(10);
    expect(v.tokensPorSegundo).toBeCloseTo(32 / 240, 5);
    expect(v.motivo).toContain("tokens/s");
    expect(v.motivo).toMatch(/0[.,]1/);
  });

  it("justo por debajo del umbral (TPS_MINIMO − ε) ⇒ NO viable", () => {
    // 19 tokens en 10 000 ms = 1,9 tok/s < 2.
    const v = evaluarViabilidad({ tokens: 19, ms: 10000, memoriaLibreMb: 1024 });
    expect(v.viable).toBe(false);
    expect(v.enfriarMinutos).toBe(10);
  });

  it("exactamente TPS_MINIMO ⇒ viable (el umbral es inclusivo)", () => {
    const v = evaluarViabilidad({ tokens: 20, ms: 10000, memoriaLibreMb: 1024 });
    expect(v.viable).toBe(true);
    expect(v.tokensPorSegundo).toBeCloseTo(TPS_MINIMO, 5);
  });

  it("memoria ausente (null) NO bloquea: solo cuentan los tok/s", () => {
    const v = evaluarViabilidad({ tokens: 30, ms: 3000, memoriaLibreMb: null });
    expect(v.viable).toBe(true);
    expect(v.tokensPorSegundo).toBeCloseTo(10, 5);
    expect(v.enfriarMinutos).toBe(0);
    expect(v.motivo).toContain("RAM desconocida");
  });

  it("memoria bajísima (medición real: 59 MB) ⇒ NO viable aunque los tok/s digan que sí, y el motivo nombra la RAM", () => {
    const v = evaluarViabilidad({ tokens: 50, ms: 2000, memoriaLibreMb: 59 });
    expect(v.viable).toBe(false);
    expect(v.enfriarMinutos).toBe(10);
    expect(v.motivo).toContain("59 MB de RAM libre");
    expect(v.motivo).toContain("no cabe");
  });

  it("memoria justo en MEMORIA_MINIMA_MB ⇒ el umbral de RAM es inclusivo (no bloquea)", () => {
    const v = evaluarViabilidad({ tokens: 30, ms: 3000, memoriaLibreMb: MEMORIA_MINIMA_MB });
    expect(v.viable).toBe(true);
  });

  it("ms ≤ 0 (medición rota) ⇒ NO viable con tokensPorSegundo null y motivo honesto, sin lanzar", () => {
    const v = evaluarViabilidad({ tokens: 10, ms: 0, memoriaLibreMb: 1024 });
    expect(v.viable).toBe(false);
    expect(v.tokensPorSegundo).toBeNull();
    expect(v.enfriarMinutos).toBe(10);
    expect(v.motivo).toContain("no permite calcular");
  });
});

describe("presupuestoPrimerToken", () => {
  it("memoria holgada ⇒ 12 000 ms", () => {
    expect(presupuestoPrimerToken({ memoriaLibreMb: 2048 })).toBe(12000);
    expect(presupuestoPrimerToken({ memoriaLibreMb: 400 })).toBe(12000);
  });

  it("memoria por debajo de 400 MB ⇒ 6 000 ms (la máquina está paginando)", () => {
    expect(presupuestoPrimerToken({ memoriaLibreMb: 399 })).toBe(6000);
    expect(presupuestoPrimerToken({ memoriaLibreMb: 59 })).toBe(6000);
    expect(presupuestoPrimerToken({ memoriaLibreMb: 0 })).toBe(6000);
  });

  it("memoria null (desconocida) ⇒ presupuesto holgado de 12 000 ms, nunca bloquea", () => {
    expect(presupuestoPrimerToken({ memoriaLibreMb: null })).toBe(12000);
  });

  it("el resultado nunca baja de 3000 ms ni pasa de 20000 ms (topes)", () => {
    for (const mb of [-5000, -1, 0, 1, 100, 250, 299, 300, 399, 400, 401, 1000, 65536, 1e9]) {
      const p = presupuestoPrimerToken({ memoriaLibreMb: mb });
      expect(p).toBeGreaterThanOrEqual(3000);
      expect(p).toBeLessThanOrEqual(20000);
    }
  });
});
