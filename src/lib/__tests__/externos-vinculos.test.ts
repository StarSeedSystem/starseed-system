/**
 * Pruebas de las funciones puras del vínculo externo (Ola 281 · E1B · 2026-09-08).
 * Solo se importan funciones de `vinculos.ts` (nada de Node, ni route, ni
 * parches de módulos): son pruebas de lógica, no de la capa HTTP.
 */

import { describe, expect, it } from "vitest";
import {
  PERMISOS_DEFECTO,
  crearVinculo,
  estaVigente,
  generarToken,
  validarPermisos,
} from "@/lib/externos/vinculos";

describe("generarToken", () => {
  it("devuelve un token con prefijo ssk_", () => {
    const { token } = generarToken();
    expect(token.startsWith("ssk_")).toBe(true);
  });

  it("el hash es distinto del token en claro", () => {
    const { token, hash } = generarToken();
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("dos llamadas nunca generan el mismo token", () => {
    const a = generarToken();
    const b = generarToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it("el prefijo visible aparece dentro del token", () => {
    const { token, prefijo } = generarToken();
    expect(token).toContain(prefijo);
  });
});

describe("validarPermisos", () => {
  it("devuelve los permisos por defecto cuando no llega nada", () => {
    expect(validarPermisos(undefined)).toEqual(PERMISOS_DEFECTO);
    expect(validarPermisos({})).toEqual(PERMISOS_DEFECTO);
    expect(validarPermisos(null)).toEqual(PERMISOS_DEFECTO);
  });

  it("respeta los booleanos que llegan", () => {
    const r = validarPermisos({ leer: false, escribir: true });
    expect(r.leer).toBe(false);
    expect(r.escribir).toBe(true);
    // El resto cae al valor por defecto.
    expect(r.hablar).toBe(PERMISOS_DEFECTO.hablar);
  });

  it("filtra claves inventadas y basura", () => {
    const r = validarPermisos({ leer: "sí", herramientas: true, hackear: true });
    // Un string no es booleano real → se queda el valor por defecto.
    expect(r.leer).toBe(PERMISOS_DEFECTO.leer);
    expect(r.herramientas).toBe(true);
    // `hackear` no es una clave conocida: se ignora sin romper.
    const claves = Object.keys(r);
    expect(claves).not.toContain("hackear");
  });
});

describe("estaVigente", () => {
  it("un vínculo con caducidad pasada NO está vigente", () => {
    const v = { revocado_en: null, expira_en: "2020-01-01T00:00:00Z" };
    expect(estaVigente(v, new Date("2026-09-08T00:00:00Z"))).toBe(false);
  });

  it("un vínculo con caducidad futura SÍ está vigente", () => {
    const v = { revocado_en: null, expira_en: "2030-01-01T00:00:00Z" };
    expect(estaVigente(v, new Date("2026-09-08T00:00:00Z"))).toBe(true);
  });

  it("sin caducidad siempre está vigente mientras no se revoque", () => {
    const v = { revocado_en: null, expira_en: null };
    expect(estaVigente(v)).toBe(true);
  });

  it("un vínculo revocado no está vigente aunque la caducidad sea futura", () => {
    const v = { revocado_en: "2026-09-07T00:00:00Z", expira_en: "2030-01-01T00:00:00Z" };
    expect(estaVigente(v, new Date("2026-09-08T00:00:00Z"))).toBe(false);
  });
});

describe("crearVinculo", () => {
  it("rechaza un ámbito no válido sin tocar la base", async () => {
    const falso = {} as never;
    await expect(
      crearVinculo(falso, "owner-1", {
        ambito_tipo: "no-existe" as never,
        nombre: "test",
      }),
    ).rejects.toThrow("Ámbito no válido");
  });

  it("rechaza un nombre vacío sin tocar la base", async () => {
    const falso = {} as never;
    await expect(
      crearVinculo(falso, "owner-1", {
        ambito_tipo: "chat",
        nombre: "   ",
      }),
    ).rejects.toThrow("nombre");
  });
});