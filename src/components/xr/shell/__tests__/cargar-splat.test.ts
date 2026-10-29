import { describe, it, expect } from "vitest";
import {
  puedeUsarSplat,
  presupuestoSplat,
  urlSplatSegura,
  cargarSplat,
} from "../cargar-splat";
import type { NivelCalidad } from "@/lib/xr/tipos";

describe("puedeUsarSplat", () => {
  it("solo alta y máxima permiten splat", () => {
    expect(puedeUsarSplat("alta" as NivelCalidad)).toBe(true);
    expect(puedeUsarSplat("maxima" as NivelCalidad)).toBe(true);
    expect(puedeUsarSplat("media" as NivelCalidad)).toBe(false);
    expect(puedeUsarSplat("baja" as NivelCalidad)).toBe(false);
    expect(puedeUsarSplat("minima" as NivelCalidad)).toBe(false);
  });
});

describe("presupuestoSplat", () => {
  it("presupuesto por nivel", () => {
    expect(presupuestoSplat("alta" as NivelCalidad)).toBe(1_500_000);
    expect(presupuestoSplat("maxima" as NivelCalidad)).toBe(3_000_000);
    expect(presupuestoSplat("media" as NivelCalidad)).toBe(0);
  });
});

describe("urlSplatSegura", () => {
  it("rechaza http", () => {
    expect(urlSplatSegura("http://ejemplo.com/splat.splat")).toBe(false);
  });
  it("rechaza https con credenciales", () => {
    expect(urlSplatSegura("https://usuario:clave@ejemplo.com/splat.splat")).toBe(false);
  });
  it("acepta https limpia", () => {
    expect(urlSplatSegura("https://ejemplo.com/splat.splat")).toBe(true);
  });
});

describe("cargarSplat", () => {
  it("archivo demasiado grande devuelve motivo", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("", {
        status: 200,
        headers: { "content-length": String(61 * 1024 * 1024) },
      }) as Response;
    const res = await cargarSplat("https://ejemplo.com/grande.splat");
    globalThis.fetch = originalFetch;
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("demasiado grande");
  });

  it("cargador falso que lanza devuelve ok:false", async () => {
    const falso = class {
      constructor() {
        throw new Error("falla simulada");
      }
    };
    const res = await cargarSplat("https://ejemplo.com/fallo.splat", { SplatMesh: falso as never });
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("falla");
  });

  it("url insegura devuelve motivo sin intentar carga", async () => {
    const res = await cargarSplat("http://inseguro.com/");
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("no segura");
  });
});
