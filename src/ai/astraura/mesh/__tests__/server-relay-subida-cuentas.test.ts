import { describe, it, expect } from "vitest";
// Pruebas de las ramas PURAS extraídas para el relevo entre cuentas (RC1013B):
// decisión de reintento sin la columna `recipient_owner` y el mapa device→cuenta
// (vacío antes de cualquier refreshIdentities).
import {
  cuentaPorDispositivo,
  faltaColumnaDestino,
  reintentaSinColumnaDestino,
} from "../server-relay";

const MI_CUENTA = "123e4567-e89b-12d3-a456-426614174000";
const OTRA_CUENTA = "987fc51a-2b3c-4d5e-6f7a-8b9c0d1e2f3a";

describe("faltaColumnaDestino", () => {
  it("null -> false", () => expect(faltaColumnaDestino(null)).toBe(false));
  it("error vacío -> false", () => expect(faltaColumnaDestino({})).toBe(false));
  it("código PGRST204 -> true", () => expect(faltaColumnaDestino({ code: "PGRST204" })).toBe(true));
  it("mensaje que menciona recipient_owner -> true", () =>
    expect(faltaColumnaDestino({ message: "column recipient_owner does not exist" })).toBe(true));
  it("otro código y otro mensaje -> false", () =>
    expect(faltaColumnaDestino({ code: "23505", message: "duplicate key" })).toBe(false));
});

describe("reintentaSinColumnaDestino", () => {
  const errColumna = { code: "PGRST204", message: "column recipient_owner does not exist" };
  it("sin error de columna -> false", () =>
    expect(reintentaSinColumnaDestino({ code: "23505" }, MI_CUENTA, null)).toBe(false));
  it("columna ausente y destino null -> true", () =>
    expect(reintentaSinColumnaDestino(errColumna, MI_CUENTA, null)).toBe(true));
  it("columna ausente y destino = mi cuenta -> true", () =>
    expect(reintentaSinColumnaDestino(errColumna, MI_CUENTA, MI_CUENTA)).toBe(true));
  it("columna ausente y destino = OTRA cuenta -> false (no se degrada)", () =>
    expect(reintentaSinColumnaDestino(errColumna, MI_CUENTA, OTRA_CUENTA)).toBe(false));
});

describe("cuentaPorDispositivo", () => {
  it("antes de refreshIdentities está vacío", () => {
    expect(cuentaPorDispositivo()).toEqual({});
  });
});
