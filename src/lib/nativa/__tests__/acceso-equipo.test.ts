/*
 * (SEG1111U) «Acceso al equipo» desde la web: reconocer los rechazos de Rust, decirlos en palabras claras y pedir el
 * diálogo nativo una sola vez. Y el contrato con Rust (comandos, campos y códigos).
 *   NODE_ENV=test npx vitest run src/lib/nativa/__tests__/acceso-equipo.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  COMANDO_ACCESO_ESTADO,
  COMANDO_ACCESO_PEDIR,
  COMANDO_ACCESO_REVOCAR,
  codigoAcceso,
  conAccesoEquipo,
  fraseAcceso,
} from "../acceso-equipo";
import type { Resultado } from "../tipos";

const rust = (f: string) => readFileSync(join(process.cwd(), "native/src-tauri/src", f), "utf8");

describe("códigos de rechazo", () => {
  it("reconoce los de Rust y nada más", () => {
    expect(codigoAcceso("acceso:sin-concesion · hace falta")).toBe("sin-concesion");
    expect(codigoAcceso("acceso:espera-13 · dijiste que no")).toBe("espera");
    expect(codigoAcceso("acceso:no-confirmado · no")).toBe("no-confirmado");
    expect(codigoAcceso("prestamo:sin-sesion · x")).toBeNull();
    expect(codigoAcceso("acceso:inventado · x")).toBeNull();
    expect(codigoAcceso(undefined)).toBeNull();
  });
  it("las frases no enseñan códigos y dicen dónde se quita", () => {
    const f = fraseAcceso("sin-concesion", "abrir el instalador");
    expect(f).toMatch(/«acceso al equipo»/);
    expect(f).toMatch(/● Acceso al equipo/);
    expect(f).not.toMatch(/acceso:/);
  });
  it("todos los códigos que Rust puede devolver se entienden aquí", () => {
    const logica = rust("acceso_equipo_logica.rs");
    const bloque = logica.slice(logica.indexOf("pub fn codigo(&self)"), logica.indexOf("pub fn mensaje(&self)"));
    const codigos = [...bloque.matchAll(/=> "([a-z-]+)"\.into\(\)/g)].map((m) => m[1]);
    expect(codigos.length).toBeGreaterThanOrEqual(8);
    for (const c of codigos) expect(codigoAcceso(`acceso:${c} · x`), c).toBe(c);
    expect(codigoAcceso("acceso:espera-30 · x")).toBe("espera");
  });
});

describe("conAccesoEquipo", () => {
  const SIN = { ok: false as const, motivo: "acceso:sin-concesion · falta" };

  it("si ya está dado, no pide nada", async () => {
    const llamar = vi.fn();
    const r = await conAccesoEquipo(llamar as never, "x", async () => ({ ok: true, valor: 1 }));
    expect(r).toEqual({ ok: true, valor: 1 });
    expect(llamar).not.toHaveBeenCalled();
  });

  it("sin acceso: pide el diálogo nativo una vez y repite una vez", async () => {
    let dado = false;
    const accion = vi.fn(async (): Promise<Resultado<string>> => (dado ? { ok: true, valor: "hecho" } : SIN));
    const llamar = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      expect(cmd).toBe(COMANDO_ACCESO_PEDIR);
      expect(args).toEqual({ motivo: "abrir el instalador" });
      dado = true;
      return { ok: true, valor: { activo: true } };
    });
    const r = await conAccesoEquipo(llamar as never, "abrir el instalador", accion);
    expect(r).toEqual({ ok: true, valor: "hecho" });
    expect(llamar).toHaveBeenCalledTimes(1);
    expect(accion).toHaveBeenCalledTimes(2);
  });

  it("si la persona dice que no, no insiste y lo dice claro", async () => {
    const accion = vi.fn(async () => SIN);
    const llamar = vi.fn(async () => ({ ok: false, motivo: "acceso:no-confirmado · no" }));
    const r = await conAccesoEquipo(llamar as never, "ejecutar la orden", accion);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.acceso).toBe("sin-concesion");
      expect(r.motivo).toMatch(/Para ejecutar la orden, StarSeed OS necesita «acceso al equipo»/);
      expect(r.motivo).not.toMatch(/acceso:/);
    }
    expect(accion).toHaveBeenCalledTimes(1);
  });

  it("otros errores pasan tal cual; los de acceso, en palabras", async () => {
    const r1 = await conAccesoEquipo(vi.fn() as never, "x", async () => ({ ok: false, motivo: "No hay radio" }));
    expect(r1).toEqual({ ok: false, motivo: "No hay radio", acceso: null });
    const r2 = await conAccesoEquipo(vi.fn() as never, "x", async () => ({ ok: false, motivo: "acceso:no-confirmado · no" }));
    expect(r2.ok === false && r2.motivo).toMatch(/no lo confirmaste/);
  });
});

describe("contrato con Rust", () => {
  it("los tres comandos existen, solo en escritorio, con su permiso en acceso-equipo.json", () => {
    const pegamento = rust("acceso_equipo.rs");
    const lib = rust("lib.rs");
    const cap = JSON.parse(readFileSync(join(process.cwd(), "native/src-tauri/capabilities/acceso-equipo.json"), "utf8"));
    for (const c of [COMANDO_ACCESO_ESTADO, COMANDO_ACCESO_PEDIR, COMANDO_ACCESO_REVOCAR]) {
      expect(pegamento).toMatch(new RegExp(`pub (async )?fn ${c}\\(`));
      expect(lib).toContain(`acceso_equipo::${c},`);
      expect(cap.permissions).toContain(`allow-${c.replace(/_/g, "-")}`);
    }
    const m = pegamento.match(/pub struct EstadoAcceso \{([\s\S]*?)\n\}/)![1];
    expect([...m.matchAll(/pub (\w+):/g)].map((x) => x[1]).sort()).toEqual(["activo", "desde_ms", "disponible", "motivo", "registro_integro"]);
  });
});
