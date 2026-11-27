/*
 * (TRM1125B) Cliente web de la terminal entre neuronas: validación, parámetros, frases y contrato con Rust.
 *   NODE_ENV=test npx vitest run src/lib/nativa/__tests__/terminal-cliente.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMANDO_TERMINAL_CANCELAR,
  COMANDO_TERMINAL_EJECUTAR,
  EVENTO_TERMINAL_STDERR,
  EVENTO_TERMINAL_STDOUT,
  ORDEN_MAX_CHARS,
  cancelarTerminal,
  ejecutarTerminal,
  fraseTerminal,
  motivoOrdenInvalida,
  paramsEjecutar,
  resumenResultado,
  type ResultadoTerminal,
} from "../terminal-cliente";
import type { Resultado } from "../tipos";

const rust = readFileSync(join(process.cwd(), "native/src-tauri/src/terminal_remota.rs"), "utf8");

const bien: ResultadoTerminal = { stdout: "hola", stderr: "", code: 0, success: true, truncada: false, tiempo_agotado: false };

describe("validación de la orden", () => {
  it("rechaza vacía o solo espacios (comprobación por longitud, sin isEmpty)", () => {
    expect(motivoOrdenInvalida("")).toMatch(/vacía/);
    expect(motivoOrdenInvalida("   \n\t")).toMatch(/vacía/);
  });
  it("rechaza la que pasa del tope y acepta la que cabe", () => {
    expect(motivoOrdenInvalida("a".repeat(ORDEN_MAX_CHARS + 1))).toMatch(/caracteres/);
    expect(motivoOrdenInvalida("a".repeat(ORDEN_MAX_CHARS))).toBeNull();
    expect(motivoOrdenInvalida("ls -la")).toBeNull();
  });
});

describe("parámetros", () => {
  it("usa nivel usuario por defecto y no manda topes sin pedirlos", () => {
    expect(paramsEjecutar("ls")).toEqual({ params: { orden: "ls", nivel: "usuario" } });
  });
  it("manda topes válidos y descarta los absurdos", () => {
    expect(paramsEjecutar("ls", { nivel: "administrador", tiempo_max_ms: 5000.9, salida_max_bytes: 10 })).toEqual({
      params: { orden: "ls", nivel: "administrador", tiempo_max_ms: 5000, salida_max_bytes: 10 },
    });
    expect(paramsEjecutar("ls", { tiempo_max_ms: -1, salida_max_bytes: Number.NaN })).toEqual({
      params: { orden: "ls", nivel: "usuario" },
    });
  });
  it("nunca lleva campos de contraseña", () => {
    expect(JSON.stringify(paramsEjecutar("ls"))).not.toMatch(/contrase|password|sudo/i);
  });
});

describe("ejecutar y cancelar", () => {
  it("no llama a la app con una orden vacía", async () => {
    let llamadas = 0;
    const r = await ejecutarTerminal(async () => { llamadas++; return { ok: true, valor: bien as never }; }, "  ");
    expect(r.ok).toBe(false);
    expect(llamadas).toBe(0);
  });
  it("llama al comando con los parámetros y devuelve el resultado", async () => {
    let visto: { cmd: string; args?: Record<string, unknown> } | null = null;
    const r = await ejecutarTerminal(async (cmd, args) => { visto = { cmd, args }; return { ok: true, valor: bien as never }; }, "echo hola");
    expect(r).toEqual({ ok: true, valor: bien });
    expect(visto).toEqual({ cmd: COMANDO_TERMINAL_EJECUTAR, args: { params: { orden: "echo hola", nivel: "usuario" } } });
  });
  it("traduce el rechazo de Rust a una frase", async () => {
    const r: Resultado<ResultadoTerminal> = await ejecutarTerminal(async () => ({ ok: false, motivo: "ocupado: ya hay una orden ejecutándose" }), "ls");
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/Terminar/) });
  });
  it("cancelar usa su comando", async () => {
    let cmd = "";
    await cancelarTerminal(async (c) => { cmd = c; return { ok: true, valor: null as never }; });
    expect(cmd).toBe(COMANDO_TERMINAL_CANCELAR);
  });
});

describe("frases y resumen", () => {
  it("reconoce los errores conocidos y deja pasar los demás", () => {
    expect(fraseTerminal("no-aplica")).toMatch(/ventana principal/);
    expect(fraseTerminal("acceso:sin-concesion · x")).toMatch(/acceso al equipo/);
    expect(fraseTerminal("otro fallo")).toBe("otro fallo");
    expect(fraseTerminal(null)).toMatch(/no respondió/);
  });
  it("resume tiempo agotado, código y recorte", () => {
    expect(resumenResultado({ ...bien, tiempo_agotado: true })).toMatch(/tiempo/);
    expect(resumenResultado(bien)).toBe("terminó bien.");
    expect(resumenResultado({ ...bien, success: false, code: 2, truncada: true })).toBe("terminó con código 2; la salida se recortó.");
    expect(resumenResultado({ ...bien, success: false, code: null })).toMatch(/desconocido/);
  });
});

describe("contrato con Rust", () => {
  it("los nombres de comandos y eventos existen en terminal_remota.rs", () => {
    expect(rust).toContain(`pub async fn ${COMANDO_TERMINAL_EJECUTAR}`);
    expect(rust).toContain(`pub fn ${COMANDO_TERMINAL_CANCELAR}`);
    expect(rust).toContain(`"${EVENTO_TERMINAL_STDOUT}"`);
    expect(rust).toContain(`"${EVENTO_TERMINAL_STDERR}"`);
  });
  it("los campos del resultado y de los parámetros coinciden", () => {
    for (const campo of Object.keys(bien)) expect(rust).toContain(`pub ${campo}:`);
    for (const campo of ["orden", "nivel", "tiempo_max_ms", "salida_max_bytes"]) expect(rust).toMatch(new RegExp(`\\b${campo}:`));
  });
});
